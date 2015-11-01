# -*- coding: utf-8 -*-

import json

import jsonschema

from smilepack.models import Icon, Smile
from smilepack import schemas


class UserscriptParserError(ValueError):
    pass


def parse(data):
    i = data.find('var data = {\n    version: \'1.2', 0, 15000)
    if i < 0:
        raise UserscriptParserError('Not smilepack userscript')

    i = data.find('sections:', i, i + 150)
    if i < 0:
        raise UserscriptParserError('Not smilepack userscript')

    old_mode = data.find("version: '1.2'", i - 150, i) >= 0

    sections = data[i:data.find('\n', i)].strip()
    try:
        sections = json.loads(sections[sections.find('['):sections.rfind(']') + 1])
    except Exception as exc:
        raise UserscriptParserError('Invalid data ({})'.format(str(exc)))

    try:
        jsonschema.validate(sections, schemas.USERSCRIPT_COMPAT)
    except jsonschema.ValidationError as error:
        raise UserscriptParserError('Invalid data at sections {}: {}'.format(tuple(error.path), error.message))

    default_icon = Icon.select().first()
    default_icon = {
        'id': default_icon.id,
        'url': default_icon.url
    }

    categories = []
    cat_id = 0
    sm_id = 0
    missing = 0
    for section in sections:
        icon_ids = [x['iconId'] for x in section['categories'] if x.get('iconId') is not None]
        icons = {x.id: {'id': x.id, 'url': x.url} for x in Icon.select(lambda x: x.id in icon_ids)}

        for category in section['categories']:
            cat_id -= 1
            new_category = {
                'id': cat_id,
                'name': str(category.get('name') or category.get('code') or category.get('id') or cat_id),
                'description': '',
                'icon': icons.get(category.get('iconId'), default_icon),
                'smiles': []
            }

            urls_for_parse = []
            for smile in category['smiles']:
                if not smile.get('url') and not smile.get('id'):
                    continue

                if old_mode and smile.get('id'):
                    smile['url'] = 'http://smiles.smile-o-pack.net/{}.gif'.format(smile['id'])
                urls_for_parse.append(smile.get('url'))

            parsed_urls = Smile.bl.search_by_urls(urls_for_parse)

            i = -1
            for smile in category['smiles']:
                if not smile.get('url') and not smile.get('id'):
                    print('USERSCRIPT SMILE IGNORED', smile)
                    continue
                i += 1
                exist_smile = parsed_urls[i]

                if exist_smile is not None:
                    new_smile = {
                        'id': exist_smile.id,
                        'url': exist_smile.url,
                        'w': smile['w'],
                        'h': smile['h']
                    }
                elif smile.get('url'):
                    sm_id -= 1
                    new_smile = {
                        'id': sm_id,
                        'url': smile['url'],
                        'w': smile['w'],
                        'h': smile['h']
                    }
                else:
                    missing += 1
                new_category['smiles'].append(new_smile)

            categories.append(new_category)

    return categories, cat_id, sm_id, missing
