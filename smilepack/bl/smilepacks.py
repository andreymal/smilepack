#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# pylint: disable=E1120, E1123

import random
from hashlib import md5
from datetime import datetime, timedelta

import jsonschema
from pony import orm
from flask import current_app

from smilepack.bl.utils import BaseBL

from smilepack import schemas
from smilepack.database import db
from smilepack.utils.exceptions import JSONValidationError


class SmilePackBL(BaseBL):
    def get_by_user(self, session_id):
        packs = self._model().select(lambda x: x.user_cookie == session_id)[:]
        packs = [pack for pack in packs if not pack.delete_at or pack.delete_at >= datetime.utcnow()]
        return packs

    def create(self, session_id, smiles, categories, name=None, description=None, lifetime=None, user_addr=None, validate=True):
        if validate:
            try:
                jsonschema.validate(smiles, schemas.SMILEPACK_SMILE)
            except jsonschema.ValidationError as exc:
                raise JSONValidationError(exc)
            try:
                jsonschema.validate(categories, schemas.SMILEPACK_CATEGORIES)
            except jsonschema.ValidationError as exc:
                raise JSONValidationError(exc)

        try:
            lifetime = max(0, int(lifetime)) if lifetime is not None else 0
        except ValueError:
            lifetime = 0

        if current_app.config['MAX_LIFETIME'] and (not lifetime or lifetime > current_app.config['MAX_LIFETIME']):
            lifetime = current_app.config['MAX_LIFETIME']

        # Нормализуем данные
        smiles = [dict(x) for x in smiles]
        categories = [dict(x) for x in categories]
        category_names = [x['name'] for x in categories]

        # Добавляем несуществующие категории
        for x in smiles:
            if x['category_name'] not in category_names:
                categories.append({
                    'name': x['category_name'],
                    'icon': None
                })
                category_names.append(x['category_name'])

        from ..models import SmilePackCategory, Smile, Icon

        # Загружаем имеющиеся смайлики
        smile_ids = [s['id'] for s in smiles if s.get('id')]
        db_smiles = {ds.id: ds for ds in Smile.select(lambda x: x.id in smile_ids)} if smile_ids else {}

        # Загружаем имеющиеся иконки
        first_icon = Icon.select().first()
        icon_ids = set((x.get('icon') or {}).get('id', 0) for x in categories)
        db_icons = {di.id: di for di in Icon.select(lambda x: x.id in icon_ids)} if icon_ids else {}

        # Создаём смайлопак
        pack = self._model()(
            hid=''.join(
                random.choice(current_app.config['SYMBOLS_FOR_HID'])
                for _
                in range(current_app.config['HID_LENGTH'])
            ),
            user_cookie=session_id,
            name=str(name) if name else '',
            description=str(description) if description else '',
            delete_at=(datetime.utcnow() + timedelta(0, lifetime)) if lifetime else None,
            user_addr=user_addr,
        )
        if not smiles and not categories:
            return pack
        pack.flush()

        # Создаём категории смайлопака
        db_categories = {}
        for x in categories:
            c = SmilePackCategory(
                name=x['name'],
                icon=db_icons.get((x.get('icon') or {}).get('id'), first_icon),
                description=x.get('description') or '',
                smilepack=pack,
            )
            c.flush()
            db_categories[c.name] = c

        # Добавляем смайлики
        smile_ids = {x: [] for x in db_categories.keys()}
        for x in smiles:
            c = db_categories[x['category_name']]

            if x.get('id') in db_smiles:
                smile = db_smiles[x['id']]
            else:
                continue  # TODO: тоже сделать что-нибудь?

            if smile.id not in smile_ids[x['category_name']]:
                # FIXME: тут ОЧЕНЬ много insert-запросов
                c.smiles.create(
                    smile=smile,
                    order=len(smile_ids[x['category_name']]),
                    width=x['w'] if x.get('w') and x['w'] != smile.width else None,
                    height=x['h'] if x.get('h') and x['h'] != smile.height else None,
                )
                smile_ids[x['category_name']].append(smile.id)
        db.flush()
        current_app.cache.set('smilepacks_count', None, timeout=1)
        current_app.logger.info('Created smilepack %s (%d smiles)', pack.hid, sum(len(x) for x in smile_ids.values()))

        return pack

    def add_view(self, remote_addr, session_id=None):
        smp = self._model()
        if session_id and session_id == smp.user_cookie:
            return smp.views_count

        h = str(session_id or remote_addr).encode('utf-8') + b'\x00' + smp.hid.encode('utf-8')
        key = 'smp_view_' + md5(h).hexdigest()

        if current_app.cache.get(key) is not None:
            return smp.views_count

        smp.views_count += 1
        smp.last_viewed_at = datetime.utcnow()
        current_app.cache.set(key, str(smp.last_viewed_at), timeout=600)
        return smp.views_count

    def get_by_hid(self, hid):
        if not hid or len(hid) > 16:
            return
        pack = self._model().get(hid=hid)

        if not pack or pack.delete_at and pack.delete_at < datetime.utcnow():
            return

        return pack

    def as_json(self, with_smiles=False):
        categories = []
        for cat in sorted(self._model().categories, key=lambda x: (x.order, x.id)):
            categories.append(cat.bl.as_json(with_smiles=with_smiles))

        return {
            'name': self._model().name,
            'description': self._model().description,
            'categories': categories
        }

    def as_json_compat(self):
        sections = []
        jsect = {
            'id': 0,
            'name': 'Main',
            'code': 'Main',
            'icon': tuple(self._model().categories)[0].icon.url,
            'categories': []
        }

        for cat in sorted(self._model().categories, key=lambda x: (x.order, x.id)):
            jsect['categories'].append(cat.bl.as_json_compat(custom_id=len(jsect['categories'])))
        sections.append(jsect)
        return sections


class SmilePackCategoryBL(BaseBL):
    def get_by_smilepack(self, hid, category_id):
        if not hid or category_id is None or len(hid) > 16:
            return

        from ..models import SmilePack
        pack = SmilePack.get(hid=hid)
        if not pack or pack.delete_at and pack.delete_at < datetime.utcnow():
            return
        return pack.categories.select(lambda x: x.id == category_id).first()

    def as_json(self, with_smiles=False):
        cat = self._model()

        jcat = {
            'id': cat.id,
            'name': cat.name,
            'description': cat.description,
            'icon': {
                'id': cat.icon.id,
                'url': cat.icon.url,
            },
        }

        if with_smiles:
            from ..models import SmilePackSmile
            jcat['smiles'] = []
            for cat_order, cat_id, smile_id, custom_url, width, height, custom_width, custom_height, filename, tags_cache in orm.select(
                (c.order, c.id, c.smile.id, c.smile.custom_url, c.smile.width, c.smile.height, c.width, c.height, c.smile.filename, c.smile.tags_cache)
                for c in SmilePackSmile
                if c.category == cat
            ).order_by(1):
                jcat['smiles'].append({
                    'id': smile_id,
                    'relId': cat_id,
                    # FIXME: дублирует логику из сущности Smile; нужно как-то придумать запрос
                    # с получением этой самой сущности, не похерив джойн (аналогично в as_json_compat)
                    'url': custom_url or current_app.config['SMILE_URL'].format(id=smile_id, filename=filename),
                    'w': custom_width or width,
                    'h': custom_height or height,
                    'tags': tags_cache.split(',') if tags_cache else [],
                })

        return jcat

    def as_json_compat(self, custom_id=None):
        from ..models import SmilePackSmile

        cat = self._model()
        jcat = {
            'id': custom_id if custom_id is not None else cat.id,
            'name': cat.name,
            'code': cat.name,
            'icon': cat.icon.url,
            'iconId': cat.icon.id,
            'smiles': []
        }

        for cat_order, cat_id, smile_id, custom_url, width, height, custom_width, custom_height, filename in orm.select(
            (c.order, c.id, c.smile.id, c.smile.custom_url, c.smile.width, c.smile.height, c.width, c.height, c.smile.filename)
            for c in SmilePackSmile
            if c.category == cat
        ).order_by(1):
            jcat['smiles'].append({
                'id': smile_id,
                'url': custom_url or current_app.config['SMILE_URL'].format(id=smile_id, filename=filename),
                'w': custom_width or width,
                'h': custom_height or height,
            })

        return jcat
