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
from smilepack.utils.exceptions import BadRequestError


class SmilePackBL(BaseBL):
    def get_by_user(self, session_id):
        packs = self._model().select(lambda x: x.user_cookie == session_id)[:]
        packs = [
            pack for pack in packs
            if not pack.delete_at or pack.delete_at >= datetime.utcnow()
        ]

        # find latest available versions
        lastpacks = {}
        pack_hids = []
        for pack in packs:
            if pack.hid not in lastpacks:
                lastpacks[pack.hid] = pack
                pack_hids.append(pack.hid)
            elif pack.version > lastpacks[pack.hid]:
                lastpacks[pack.hid] = pack

        return [lastpacks[i] for i in pack_hids]

    def create(self, data, session_id, user_addr):
        jsonschema.validate(data, schemas.SMILEPACK)

        if data.get('fork') is not None and data.get('edit') is not None:
            raise BadRequestError('Please set edit or fork')

        # Проверяем валидность родительского смайлопака при его наличии
        fork = False
        parent = None
        if data.get('fork') is not None:
            fork = True
            parent = self.get_by_hid(data['fork'])
            if not parent:
                raise BadRequestError('Parent not found')
        elif data.get('edit') is not None:
            parent = self.get_by_hid(data['edit'])
            if not parent:
                raise BadRequestError('Parent not found')
            if parent.user_cookie != session_id:
                raise BadRequestError('Access denied')

        # Проверяем и устанавливаем время жизни смайлопака
        try:
            lifetime = max(0, int(data['lifetime'])) if 'lifetime' in data else 0
        except ValueError:
            lifetime = 0

        if current_app.config['MAX_LIFETIME'] and (not lifetime or lifetime > current_app.config['MAX_LIFETIME']):
            lifetime = current_app.config['MAX_LIFETIME']

        from ..models import SmilePackCategory, Smile, Icon

        # Проверяем валидность категорий
        for s in data['smiles']:
            if s['category'] >= len(data['categories']):
                raise BadRequestError('Invalid category ids')

        # Загружаем имеющиеся смайлики
        smile_ids = set(s['id'] for s in data['smiles'])
        if len(smile_ids) != len(data['smiles']):
            raise BadRequestError('Non-unique smiles')
        db_smiles = {ds.id: ds for ds in Smile.select(lambda x: x.id in smile_ids)} if smile_ids else {}
        if len(db_smiles) != len(smile_ids):
            raise BadRequestError('Some smiles not found')
        del smile_ids

        # Загружаем имеющиеся иконки
        icon_ids = set(x['icon'] for x in data['categories'])
        db_icons = {di.id: di for di in Icon.select(lambda x: x.id in icon_ids)} if icon_ids else {}
        if len(db_icons) != len(icon_ids):
            raise BadRequestError('Some icons not found')
        del icon_ids

        if fork or not parent:
            # Если новый пак или форк, а не редактирование, то hid будет hid родителя
            hid = ''.join(
                random.choice(current_app.config['SYMBOLS_FOR_HID'])
                for _
                in range(current_app.config['HID_LENGTH'])
            )
            version = 1
        else:
            # Если редактирование, то hid будет hid родителя
            hid = parent.hid
            version = parent.version + 1

        # Создаём смайлопак
        pack = self._model()(
            hid=hid,
            version=version,
            parent=parent,
            user_cookie=session_id,
            name=data.get('name') or '',
            description=data.get('description') or '',
            delete_at=(datetime.utcnow() + timedelta(0, lifetime)) if lifetime else None,
            user_addr=user_addr,
        )
        if not data['smiles'] and not data['categories']:
            return pack
        pack.flush()  # for pack.id

        # Создаём категории смайлопака
        db_categories = []
        for x in data['categories']:
            c = SmilePackCategory(
                name=x.get('name') or '',
                icon=db_icons[x['icon']],
                description=x.get('description') or '',
                smilepack=pack,
            )
            c.flush()
            db_categories.append(c)

        # Добавляем смайлики
        smile_orders = [0] * len(db_categories)
        for x in data['smiles']:
            c = db_categories[x['category']]
            smile = db_smiles[x['id']]

            # FIXME: тут ОЧЕНЬ много insert-запросов
            c.smiles.create(
                smile=smile,
                order=smile_orders[x['category']],
                width=x['w'] if x.get('w') and x['w'] != smile.width else None,
                height=x['h'] if x.get('h') and x['h'] != smile.height else None,
            )
            smile_orders[x['category']] += 1
        db.flush()
        current_app.cache.set('smilepacks_count', None, timeout=1)
        current_app.logger.info(
            'Created smilepack %s/%d (%d smiles)',
            pack.hid,
            pack.version,
            sum(smile_orders)
        )

        return pack

    def add_view(self, remote_addr, session_id=None):
        smp = self._model()
        if session_id and session_id == smp.user_cookie:
            return smp.views_count

        ip_view_id = str(remote_addr).encode('utf-8') + b'\x00' + smp.hid.encode('utf-8')
        ip_key = 'smp_view_' + md5(ip_view_id).hexdigest()
        if session_id:
            session_view_id = (str(session_id).encode('utf-8') + b'\x00' + smp.hid.encode('utf-8'))
            session_key = 'smp_view_' + md5(session_view_id).hexdigest()
        else:
            session_view_id = None
            session_key = None

        if current_app.cache.get(ip_key) or (session_key and current_app.cache.get(session_key)):
            # already viewed
            return smp.views_count

        # Avoid optimistic check of Pony ORM
        smp_id = smp.id  # pylint: disable=W0612
        db.execute('update ' + smp._table_ + ' set views_count = views_count + 1 where id = $smp_id')  # pylint: disable=W0212

        current_app.cache.set(ip_key, str(smp.last_viewed_at), timeout=3600)
        if session_key:
            current_app.cache.set(session_key, str(smp.last_viewed_at), timeout=3600)

        return smp.views_count

    def get_by_hid(self, hid, version=None):
        if not hid or len(hid) > 16:
            return
        pack = self._model().select(lambda x: x.hid == hid)
        if version is None:
            pack = pack.order_by(self._model().version.desc()).first()
        else:
            pack = pack.filter(lambda x: x.version == version).first()

        if not pack or pack.delete_at and pack.delete_at < datetime.utcnow():
            return

        return pack

    def get_versions(self, hid):
        if not hid or len(hid) > 16:
            return []
        packs = self._model().select(lambda x: x.hid == hid)

        now = datetime.utcnow()
        return [x for x in packs if not x.delete_at or x.delete_at >= now]

    def available(self):
        pack = self._model()
        return not pack.delete_at or pack.delete_at >= datetime.utcnow()

    def as_json(self, with_smiles=False):
        smp = self._model()

        categories = []
        for cat in sorted(smp.categories, key=lambda x: (x.order, x.id)):
            categories.append(cat.bl.as_json(with_smiles=with_smiles))

        return {
            'hid': smp.hid,
            'version': smp.version,
            'parent': {
                'hid': smp.parent.hid,
                'version': smp.parent.version,
                'name': smp.parent.name
            } if smp.parent else None,
            'name': smp.name,
            'description': smp.description,
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
    def get_by_smilepack(self, hid, category_id, version=None):
        if category_id is None:
            return

        from ..models import SmilePack
        pack = SmilePack.bl.get_by_hid(hid=hid, version=version)
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
