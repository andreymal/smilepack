#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# pylint: disable=E1120, E1123

from datetime import datetime, timedelta

import jsonschema
from flask import current_app

from .utils import BaseBL
from .. import schemas, db


class SmilePackBL(BaseBL):
    # symbols_for_encode = shuffled string.ascii_uppercase + string.digits + string.ascii_lowercase - '0OoIli'
    symbols_for_encode = 'Vc6yfEN2PreSTMbvndkJt41jqUDZQHgpGhL7uXK35BAamFY8x9sWCwRz'
    default_offset = 3136
    default_rnd = (106, 1283, 6075)

    def get_deletion_date(self):
        if not self._model().lifetime:
            return
        return self._model().created_at + timedelta(0, self._model().lifetime)

    def get_by_user(self, session_id):
        packs = self._model().select(lambda x: x.user_cookie == session_id).order_by('-1')[:]
        packs = [pack for pack in packs if not pack.lifetime or pack.created_at + timedelta(0, pack.lifetime) >= datetime.utcnow()]
        return packs

    def encode_id(self, i=None, symbols_for_encode=None, id_offset=None, origin=None, rnd=None):
        symbols_for_encode = symbols_for_encode or current_app.config.get('SYMBOLS_FOR_ENCODE', self.symbols_for_encode)
        id_offset = id_offset if id_offset is not None else int(current_app.config.get('ENCODE_OFFSET', self.default_offset))
        rnd = rnd if rnd else current_app.config.get('RND', self.default_rnd)

        i = int(i if i is not None else self._model().id) + id_offset  # смещённый айдишник – кодируем его
        base = len(symbols_for_encode)  # используемая система счисления для кодирования

        if i < id_offset:
            raise ValueError('Negative id')

        # origin = int(origin) if origin is not None else int((self._model()).created_at.replace(tzinfo=timezone.utc).timestamp())
        origin = int(origin) if origin is not None else i

        # Да, это Lehmer RNG
        for _ in range(i % base + 3):
            origin = (origin * rnd[0] + rnd[1]) % rnd[2]
        origin = origin % base  # смещение по symbols_for_encode
        dsum = 0  # сумма цифр

        result = symbols_for_encode[origin]

        while i >= base:
            n = i % base + origin  # смещаем каждую цифру в отдельности
            if n >= base:
                n -= base
            result += symbols_for_encode[n]
            dsum += n
            i = i // base

        # Кодирование самого левого числа
        i = i + origin
        if i >= base:
            i -= base
        dsum += i
        result += symbols_for_encode[i]

        result += symbols_for_encode[(dsum + origin) % base]

        # Получаем: [сдвиг по цезарю][число в системе счисления base справа налево][остаток от деления суммы цифр на base]
        return result

    def decode_id(self, i, symbols_for_encode=None, id_offset=None, rnd=None):
        symbols_for_encode = symbols_for_encode or current_app.config.get('SYMBOLS_FOR_ENCODE', self.symbols_for_encode)
        id_offset = id_offset if id_offset is not None else int(current_app.config.get('ENCODE_OFFSET', self.default_offset))
        rnd = rnd if rnd else current_app.config.get('RND', self.default_rnd)

        base = len(symbols_for_encode)  # используемая система счисления

        if not i or len(i) < 3 or i[0] not in symbols_for_encode:
            return

        origin = symbols_for_encode.index(i[0])  # смещение по symbols_for_encode
        result = 0

        # Типа контрольная сумма
        dsum = 0
        checkid = i[-1]
        i = i[:-1]
        if checkid not in symbols_for_encode:
            return
        checkid = symbols_for_encode.index(checkid) - origin
        if checkid < 0:
            checkid += base

        # Читаем числа справа налево
        for x in i[::-1][:-1]:
            result *= base
            if x not in symbols_for_encode:
                return
            n = symbols_for_encode.index(x)
            dsum += n
            n -= origin
            if n < 0:
                n += base
            result += n

        result -= id_offset
        # Проверяем совпадение «контрольной суммы»
        if result < 0 or dsum % base != checkid:
            return

        # Проверяем правильность origin
        need_origin = result + id_offset
        for _ in range(result % base + 3):
            need_origin = (need_origin * rnd[0] + rnd[1]) % rnd[2]
        need_origin = need_origin % base

        if origin != need_origin:
            return

        return result

    def create(self, session_id, smiles, categories, name=None, description=None, lifetime=None):
        jsonschema.validate(smiles, schemas.smilepack_smiles_schema)
        jsonschema.validate(categories, schemas.smilepack_categories_schema)

        try:
            lifetime = max(0, int(lifetime))
        except:
            lifetime = None

        if not lifetime or lifetime > 3600 * 24 * 7:
            lifetime = 3600 * 24 * 7

        smiles = [dict(x) for x in smiles]
        categories = [dict(x) for x in categories]

        category_names = [x['name'] for x in categories]

        from ..models import SmilePackCategory, SmilePackSmile, Smile, Icon

        smile_ids = [s['id'] for s in smiles if s.get('id')]
        db_smiles = {ds.id: ds for ds in Smile.select(lambda x: x.id in smile_ids)}

        first_icon = Icon.select().first()
        icon_ids = set(x.get('icon', {}).get('id', 0) for x in categories)
        db_icons = {di.id: di for di in Icon.select(lambda x: x.id in icon_ids)}

        for x in smiles:
            if x['category_name'] not in category_names:
                categories.append({
                    'name': x['category_name'],
                    'icon': None
                })
                category_names.append(x['category_name'])

        pack = self._model()(
            user_cookie=session_id,
            name=str(name) if name else '',
            description=str(description) if description else '',
            lifetime=lifetime or None,
        )
        pack.flush()

        db_categories = {}
        for x in categories:
            c = SmilePackCategory(
                name=x['name'],
                icon=db_icons.get(x.get('icon', {}).get('id'), first_icon),
                description=x.get('description') or '',
                smilepack=pack,
            )
            c.flush()
            db_categories[c.name] = c

        # TODO: вот это надо оптимизировать
        smp_smiles = {x: [] for x in db_categories.keys()}
        for x in smiles:
            c = db_categories[x['category_name']]
            c_smiles = smp_smiles[x['category_name']]
            if x.get('id') and x['id'] in db_smiles:
                sm = SmilePackSmile(
                    order=len(c_smiles),
                    category=c,
                    internal_smile=db_smiles[x['id']],
                    width=x.get('w'),
                    height=x.get('h'),
                )
            else:
                sm = SmilePackSmile(
                    order=len(c_smiles),
                    category=c,
                    custom_url=x['url'],
                    width=x.get('w'),
                    height=x.get('h'),
                )
            c_smiles.append(sm)
        db.flush()

        return pack

    def get_by_encoded_id(self, smp_id, preload=False):
        smp_id = self.decode_id(smp_id)
        if not smp_id:
            return
        if preload:
            from ..models import SmilePack, SmilePackCategory, SmilePackSmile
            pack = self._model().select(lambda x: x.id == smp_id).prefetch(
                SmilePack.categories,
                SmilePackCategory.smiles,
                SmilePackSmile.internal_smile,
            ).first()
        else:
            pack = self._model().get(id=smp_id)

        if not pack or pack.lifetime and pack.created_at + timedelta(0, pack.lifetime) < datetime.utcnow():
            return

        return pack

    def as_json(self):
        from ..models import SmilePackSmile
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
            for smile in sorted(cat.smiles, key=lambda x: (x.order, x.id)):
                if smile.internal_smile:
                    jcat['smiles'].append({
                        'id': smile.id,
                        'url': smile.url,
                        'internal_id': smile.internal_smile.id,
                        'w': smile.width or smile.internal_smile.width,
                        'h': smile.height or smile.internal_smile.height,
                    })
                else:
                    jcat['smiles'].append({
                        'id': smile.id,
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
            for smile in sorted(cat.smiles, key=lambda x: (x.order, x.id)):
                if smile.internal_smile:
                    jcat['smiles'].append({
                        'id': 0,
                        'url': smile.url,
                        'w': smile.width or smile.internal_smile.width,
                        'h': smile.height or smile.internal_smile.height,
                    })
                else:
                    jcat['smiles'].append({
                        'id': 0,
                        'url': smile.url,
                        'w': smile.width,
                        'h': smile.height,
                    })
            jsect['categories'].append(jcat)
        sections.append(jsect)
        return sections
