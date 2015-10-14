#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import jsonschema

from .utils import BaseBL
from ..utils.urls import parse as parse_urls, hash_url
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
        from ..models import Tag, TagSynonym, Smile, Category, SubSection

        tags_list = set(str(x).lower() for x in tags_list if x)
        synonym_tags = set(orm.select((x.name, x.tag_name) for x in TagSynonym if x.name in tags_list))
        tags_list = (tags_list - set(x[0] for x in synonym_tags)) | set(x[1] for x in synonym_tags)

        section = self._model()
        smiles = orm.select(x.smiles for x in Tag if x.section == section and x.name in tags_list)
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
            'description': x.description,
        } for x in sorted(self._model().smiles, key=lambda x: (x.order, x.id))]


class SmileBL(BaseBL):
    def search_by_url(self, url):
        return self.search_by_urls((url,))[0]

    def search_by_urls(self, urls):
        from ..models import Smile, SmileUrl
        # 1) Парсим ссылки, доставая из них то, что можно достать
        parsed_urls = parse_urls(urls)
        ids = parsed_urls['ids']
        filenames = parsed_urls['filenames']
        parsed_urls = parsed_urls['parsed_urls']

        result_smiles = [None] * len(urls)

        # 2) Распарсенные данные забираем из БД пачкой
        if ids:
            ids = orm.select(x for x in Smile if x.id in ids)
            ids = {x.id: x for x in ids}
        if filenames:
            filenames = reversed(orm.select(x for x in Smile if x.filename in filenames).order_by(Smile.id)[:])
            filenames = {x.filename: x for x in filenames}
        else:
            filenames = {}

        hashes = {}
        # 2.1) Разгребаем полученную из БД пачку
        for i in range(len(urls)):
            url = urls[i]
            data = parsed_urls[i]

            if data.get('id') in ids:
                result_smiles[i] = ids[data['id']]
            elif data.get('filename') in filenames:
                result_smiles[i] = filenames[data['filename']]
            else:
                hashes[url] = hash_url(url)

        # 3) Урлы, которые не распарсились, ищем в отдельной коллекции урлов
        # (url_hash в отдельной сущности, потому что у одного смайла может оказаться несколько урлов на разных хостингах)
        # FIXME: тут тоже where in вместо inner join, хотя наверно здесь не так критично
        hash_values = tuple(hashes.values())
        if hash_values:
            smiles = dict(orm.select((x.url, x.smile) for x in SmileUrl if x.url_hash in hash_values))
        else:
            smiles = {}

        for i, url in enumerate(urls):
            if url in smiles:
                result_smiles[i] = smiles[url]

        return result_smiles

    def add_tag(self, tag):
        from ..models import Tag, TagSynonym

        tag = str(tag or '').strip().lower()  # TODO: recheck case sensitivity
        if not tag:
            raise ValueError('Empty tag')

        if ',' in tag or len(tag) > 48:
            raise ValueError('Invalid tag')

        smile = self._model()

        synonym = orm.select(x.tag_name for x in TagSynonym if x.name == tag).first()
        if synonym:
            tag = synonym[0]

        tag_obj = smile.tags.select(lambda x: x.name == tag).first()
        if tag_obj:
            return tag_obj

        section = smile.category.subsection.section  # FIXME: длинноваты цепочки
        tag_obj = Tag.select(lambda x: x.section == section and x.name == tag).first()
        if not tag_obj:
            tag_obj = Tag(section=section, name=tag)

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
        from ..models import TagSynonym

        tag = str(tag or '').strip().lower()
        
        smile = self._model()
        tag_obj = smile.tags.select(lambda x: x.name == tag).first()
        if not tag_obj:
            tag_obj = orm.select(x.tag for x in TagSynonym if x.name == tag).first()
            tag_obj = smile.tags.select(lambda x: x.id == tag_obj.id).first()
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
