#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# pylint: disable=E1120, E1123

import random
from hashlib import md5
from datetime import datetime, timedelta

import jsonschema
from flask import current_app

from .utils import BaseBL
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
        # FIXME: смайлики из коллекции без custom_url всё-таки будут дублироваться
        urls = {x['url']: md5(x['url'].encode('utf-8')).hexdigest() for x in smiles if not x.get('id') and x.get('url')}
        hashes = urls.values()
        if hashes:
            smile_urls = SmileUrl.select(lambda x: x.url_hash in hashes).prefetch(SmileUrl.smile)[:]
            smile_urls = {x.url: x.smile for x in smile_urls}
        else:
            smile_urls = {}

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
        smp_smiles = {x: [] for x in db_categories.keys()}
        for x in smiles:
            c = db_categories[x['category_name']]
            c_smiles = smp_smiles[x['category_name']]

            if x.get('id') in db_smiles:
                smile = db_smiles[x['id']]
            elif x.get('url') in smile_urls:
                smile = smile_urls[x.get('url')]
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
                    url_hash=urls[x['url']]
                ).flush()

            cat_smile = SmilePackSmile(
                category=c,
                smile=smile,
                order=len(c_smiles)
            )

            c_smiles.append(cat_smile)
        db.flush()

        return pack

    def get_by_hid(self, hid, preload=False):
        if not hid:
            return
        if preload:
            from ..models import SmilePack, SmilePackCategory, SmilePackSmile
            pack = self._model().select(lambda x: x.hid == hid).prefetch(
                SmilePack.categories,
                SmilePackCategory.smiles,
                SmilePackSmile.smile
            ).first()
        else:
            pack = self._model().get(hid=hid)

        if not pack or pack.lifetime and pack.created_at + timedelta(0, pack.lifetime) < datetime.utcnow():
            return

        return pack

    def as_json(self):
        categories = []
        for cat in sorted(self._model().categories, key=lambda x: (x.order, x.id)):
            jcat = {
                'id': cat.id,
                'name': cat.name,
                'description': cat.description,
                'icon': {
                    'id': cat.icon.id,
                    'url': cat.icon.url,
                },
                'smiles': [],
            }
            for cat_smile in sorted(cat.smiles, key=lambda x: (x.order, x.id)):
                smile = cat_smile.smile
                jcat['smiles'].append({
                    'id': smile.id,
                    'relId': cat_smile.id,
                    'url': smile.url,
                    'w': smile.width,
                    'h': smile.height,
                })
            categories.append(jcat)

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
            jcat = {
                'id': len(jsect['categories']),
                'name': cat.name,
                'code': cat.name,
                'icon': cat.icon.url,
                'smiles': []
            }
            for cat_smile in sorted(cat.smiles, key=lambda x: (x.order, x.id)):
                smile = cat_smile.smile
                jcat['smiles'].append({
                    'id': smile.id,
                    'url': smile.url,
                    'w': smile.width,
                    'h': smile.height,
                })
            jsect['categories'].append(jcat)
        sections.append(jsect)
        return sections
