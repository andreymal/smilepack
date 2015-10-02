#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import jsonschema

from .utils import BaseBL
from ..db import orm
from .. import schemas


class SectionBL(BaseBL):
    def create(self, name, description=None):
        return self._model()(name=name, description=description or '')

    def get_with_categories(self):
        from ..models import SubSection
        raw_result = self._model().select().order_by(self._model().id).prefetch(self._model().subsections, SubSection.categories)
        raw_result = sorted(raw_result, key=lambda x: (x.order, x.id))

        result = []
        for section in raw_result:
            result.append({
                'id': section.id,
                'name': section.name,
                'icon': {
                    'id': section.icon.id,
                    'url': section.icon.url,
                },
                'description': section.description,
                'subsections': [],
            })
            for subsection in sorted(section.subsections, key=lambda x: (x.order, x.id)):
                result[-1]['subsections'].append({
                    'id': subsection.id,
                    'name': subsection.name,
                    'icon': {
                        'id': subsection.icon.id,
                        'url': subsection.icon.url,
                    },
                    'description': subsection.description,
                    'categories': [{
                        'id': c.id,
                        'name': c.name,
                        'icon': {
                            'id': c.icon.id,
                            'url': c.icon.url,
                        },
                        'description': c.description
                    } for c in sorted(subsection.categories, key=lambda x: (x.order, x.id))]
                })

        return result

    def search_by_tags(self, tags_list, preload=False):
        # TODO: sphinx?
        # TODO: pagination
        from ..models import SmileTag, Smile, Category, SubSection
        tags_list = set(str(x) for x in tags_list if x)
        section = self._model()
        smiles = orm.select(x.smiles for x in SmileTag if x.section == section and x.name in tags_list)
        if preload:
            smiles = smiles.prefetch(Smile.category, Category.subsection, SubSection.section)
        return smiles[:]


class CategoryBL(BaseBL):
    def get(self, i):
        return self._model().get(id=i)

    def get_smiles_as_json(self):
        return [{
            'id': x.id,
            'url': x.url,
            'tags': x.tags_list,
            'w': x.width,
            'h': x.height,
            'source_description': x.source_description,
            'source_url': x.source_url,
        } for x in sorted(self._model().smiles, key=lambda x: (x.order, x.id))]


class SmileBL(BaseBL):
    def add_tag(self, tag):
        from ..models import SmileTag

        tag = str(tag or '').strip().lower()  # TODO: recheck case sensitivity
        if not tag:
            raise ValueError('Empty tag')

        if ',' in tag or len(tag) > 48:
            raise ValueError('Invalid tag')

        smile = self._model()

        tag_obj = smile.tags.select(lambda x: x.name == tag).first()
        if tag_obj:
            return tag_obj

        section = smile.category.subsection.section  # FIXME: длинноваты цепочки
        tag_obj = SmileTag.select(lambda x: x.section == section and x.name == tag).first()
        if not tag_obj:
            tag_obj = SmileTag(section=section, name=tag)

        smile.tags.add(tag_obj)

        if not smile.tags_cache:
            smile.tags_cache = ','.join(x.name for x in smile.tags)
        else:
            smile.tags_cache = smile.tags_cache + ',' + tag
        smile.flush()

        tag_obj.smiles_count = tag_obj.smiles_count + 1
        tag_obj.flush()

        return tag_obj

    def remove_tag(self, tag):
        tag = str(tag or '').strip().lower()
        
        smile = self._model()
        tag_obj = smile.tags.select(lambda x: x.name == tag).first()
        if not tag_obj:
            return False
        smile.tags.remove(tag_obj)

        if not smile.tags_cache:
            smile.tags_cache = ','.join(x.name for x in smile.tags)
        else:
            tags_list = [x.strip() for x in smile.tags_cache.split(',')]
            if tag in tags_list:
                tags_list.remove(tag)
                smile.tags_cache = ','.join(tags_list)
        smile.flush()

        tag_obj.smiles_count = tag_obj.smiles_count - 1
        tag_obj.flush()
        return True

    def as_json(self, full_info=True):
        smile = self._model()
        result = {
            'id': smile.id,
            'url': smile.url,
            'tags': smile.tags_list,
            'w': smile.width,
            'h': smile.height
        }
        if full_info:
            result['category'] = [smile.category.id, smile.category.name]
            result['subsection'] = [smile.category.subsection.id, smile.category.subsection.name]
            result['section'] = [smile.category.subsection.section.id, smile.category.subsection.section.name]
        return result


class SmileSuggestionBL(BaseBL):
    def create(self, session_id, smile):
        # TODO: rewrite
        raise NotImplementedError

        from ..models import Category
        jsonschema.validate(smile, schemas.smile_suggestion_schema)

        category = Category.get(id=smile.get('category')) if smile.get('category') else None
        
        suggestion = self._model()(
            user_cookie=session_id,
            url=smile['url'],
            description=smile.get('description') or '',
            category=category
        )

        suggestion.flush()
        return suggestion
