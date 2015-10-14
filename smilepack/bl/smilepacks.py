#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# pylint: disable=E1120, E1123

import random
from datetime import datetime, timedelta

import jsonschema
from flask import current_app

from .utils import BaseBL
from ..utils.urls import hash_url
from .. import schemas, db


class SmilePackBL(BaseBL):
    def get_deletion_date(self):
        if not self._model().lifetime:
            return
        return self._model().created_at + timedelta(0, self._model().lifetime)

    def get_by_user(self, session_id):
        packs = self._model().select(lambda x: x.user_cookie == session_id)[:]
        packs = [pack for pack in packs if not pack.lifetime or pack.created_at + timedelta(0, pack.lifetime) >= datetime.utcnow()]
        return packs

    def create(self, session_id, smiles, categories, name=None, description=None, lifetime=None):
        jsonschema.validate(smiles, schemas.smilepack_smiles_schema)
        jsonschema.validate(categories, schemas.smilepack_categories_schema)

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

        from ..models import SmilePackCategory, Smile, SmilePackSmile, SmileUrl, Icon

        # Загружаем имеющиеся смайлики
        smile_ids = [s['id'] for s in smiles if s.get('id')]
        db_smiles = {ds.id: ds for ds in Smile.select(lambda x: x.id in smile_ids)}

        # Загружаем имеющиеся иконки
        first_icon = Icon.select().first()
        icon_ids = set((x.get('icon') or {}).get('id', 0) for x in categories)
        db_icons = {di.id: di for di in Icon.select(lambda x: x.id in icon_ids)}

        # Загружаем смайлики по урлам, если таковые имеются
        urls = [x['url'] for x in smiles if x.get('id') is None and x.get('url')]
        smile_urls = dict(zip(urls, Smile.bl.search_by_urls(urls)))

        # Создаём смайлопак
        pack = self._model()(
            hid=''.join(random.choice(current_app.config['SYMBOLS_FOR_HID']) for _ in range(current_app.config['HID_LENGTH'])),
            user_cookie=session_id,
            name=str(name) if name else '',
            description=str(description) if description else '',
            lifetime=lifetime or None,
        )
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

        # Добавляем или создаём смайлики
        smiles_count = {x: 0 for x in db_categories.keys()}
        new_smiles = []
        for x in smiles:
            c = db_categories[x['category_name']]

            if x.get('id') in db_smiles:
                smile = db_smiles[x['id']]
            elif smile_urls.get(x.get('url')):
                smile = smile_urls[x['url']]
            else:
                if not x.get('url') or (not x['url'].startswith('http://') and not x['url'].startswith('https://')):
                    continue  # TODO: сделать что-нибудь?
                # TODO: перезалив урла себе
                smile = Smile(
                    category=None,
                    user_addr=None,  # TODO:
                    user_cookie=session_id,
                    filename=x['url'].rstrip('/').rsplit('/', 1)[-1],
                    width=x['w'],
                    height=x['h'],
                    custom_url=x['url'],
                    tags_cache='',
                )
                smile.flush()

                # Сохраняем инфу о урле, дабы не плодить дубликаты смайликов
                SmileUrl(
                    url=x['url'],
                    smile=smile,
                    url_hash=hash_url(x['url'])
                ).flush()
                new_smiles.append(smile)

            # FIXME: тут ОЧЕНЬ много insert-запросов
            c.smiles.create(
                smile=smile,
                order=smiles_count[x['category_name']]
            )
            smiles_count[x['category_name']] += 1
        db.flush()
        current_app.cache.set('smilepacks_count', None, timeout=1)
        current_app.logger.info('Created smilepack %s with %d new smiles', pack.hid, len(new_smiles))

        return pack

    def get_by_hid(self, hid):
        if not hid or len(hid) > 16:
            return
        pack = self._model().get(hid=hid)

        if not pack or pack.lifetime and pack.created_at + timedelta(0, pack.lifetime) < datetime.utcnow():
            return

        return pack

    def as_json(self, with_smiles=False):
        from ..models import SmilePackSmile

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
        if not pack or pack.lifetime and pack.created_at + timedelta(0, pack.lifetime) < datetime.utcnow():
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
            for cat_order, cat_id, smile_id, custom_url, width, height, filename in db.orm.select(
                (c.order, c.id, c.smile.id, c.smile.custom_url, c.smile.width, c.smile.height, c.smile.filename)
                for c in SmilePackSmile
                if c.category == cat
            ).order_by(1):
                jcat['smiles'].append({
                    'id': smile_id,
                    'relId': cat_id,
                    # FIXME: дублирует логику из сущности Smile; нужно как-то придумать запрос
                    # с получением этой самой сущности, не похерив джойн (аналогично в as_json_compat)
                    'url': custom_url or current_app.config['SMILE_URL'].format(id=smile_id, filename=filename),
                    'w': width,
                    'h': height
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

        for cat_order, cat_id, smile_id, custom_url, width, height, filename in db.orm.select(
            (c.order, c.id, c.smile.id, c.smile.custom_url, c.smile.width, c.smile.height, c.smile.filename)
            for c in SmilePackSmile
            if c.category == cat
        ).order_by(1):
            jcat['smiles'].append({
                'id': smile_id,
                'url': custom_url or current_app.config['SMILE_URL'].format(id=smile_id, filename=filename),
                'w': width,
                'h': height
            })

        return jcat
