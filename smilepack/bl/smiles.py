#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import math
from urllib.request import urlopen

import jsonschema
from pony import orm
from flask import current_app

from smilepack import schemas
from smilepack.bl.utils import BaseBL
from smilepack.utils.urls import parse as parse_urls, hash_url, check_and_normalize
from smilepack.utils.exceptions import InternalError, BadRequestError, JSONValidationError


class SectionBL(BaseBL):
    def create(self, name, description=None):
        return self._model()(name=name, description=description or '')

    def as_json(self, with_subsections=False, with_categories=False):
        section = self._model()
        result = {
            'id': section.id,
            'name': section.name,
            'icon': {
                'id': section.icon.id,
                'url': section.icon.url,
            },
            'description': section.description,
        }
        if with_subsections:
            result['subsections'] = []
            for s in sorted(section.subsections, key=lambda x: (x.order, x.id)):
                result['subsections'].append(s.bl.as_json(with_categories=with_categories))
        return result

    def get_all_with_categories(self):
        from smilepack.models import SubSection
        raw_result = self._model().select().order_by(self._model().id).prefetch(self._model().subsections, SubSection.categories)
        raw_result = sorted(raw_result, key=lambda x: (x.order, x.id))

        result = []
        for section in raw_result:
            result.append(section.bl.as_json(with_subsections=True, with_categories=True))

        return result

    def search_by_tags(self, tags_list, preload=False, check_synonyms=True):
        # TODO: sphinx?
        # TODO: pagination
        section = self._model()
        from smilepack.models import Tag, Smile, Category, SubSection

        tags_list = set(str(x).lower() for x in tags_list if x)
        if check_synonyms:
            tags_list = self.check_tag_synonyms(tags_list)

        smiles = orm.select(x.smiles for x in Tag if x.section == section and x.name in tags_list)
        if preload:
            smiles = smiles.prefetch(Smile.category, Category.subsection, SubSection.section)
        return smiles[:]

    def get_tags(self, tags_list, check_synonyms=True):
        section = self._model()
        from smilepack.models import Tag
        tags_list = set(str(x).lower() for x in tags_list if x)
        if check_synonyms:
            tags_list = self.check_tag_synonyms(tags_list)

        return orm.select(x for x in Tag if x.section == section and x.name in tags_list)[:]

    def check_tag_synonyms(self, tags_list):
        section = self._model()
        from smilepack.models import TagSynonym

        tags_list = set(str(x).lower() for x in tags_list if x)
        synonym_tags = set(orm.select((x.name, x.tag_name) for x in TagSynonym if x.section == section and x.name in tags_list))
        tags_list = (tags_list - set(x[0] for x in synonym_tags)) | set(x[1] for x in synonym_tags)
        return tags_list


class SubSectionBL(BaseBL):
    def as_json(self, with_categories=False):
        subsection = self._model()
        result = {
            'id': subsection.id,
            'name': subsection.name,
            'icon': {
                'id': subsection.icon.id,
                'url': subsection.icon.url,
            },
            'description': subsection.description,
        }
        if with_categories:
            result['categories'] = [c.bl.as_json() for c in sorted(subsection.categories, key=lambda x: (x.order, x.id))]
        return result


class CategoryBL(BaseBL):
    def get(self, i):
        return self._model().get(id=i)

    def as_json(self):
        c = self._model()
        return {
            'id': c.id,
            'name': c.name,
            'icon': {
                'id': c.icon.id,
                'url': c.icon.url,
            },
            'description': c.description
        }

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
    def create(self, data, category=None, user_addr=None, session_id=None, disable_url_upload=False, compress=False):
        smile_file = data.pop('file', None)

        try:
            jsonschema.validate(data, schemas.SMILE)
        except jsonschema.ValidationError as exc:
            raise JSONValidationError(exc)

        # Ищем существующий смайлик по урлу
        smile_by_url = None
        if data.get('url') and not smile_file:
            smile_by_url = self.search_by_url(check_and_normalize(data['url']))
            if smile_by_url:
                return smile_by_url

        # Проверяем доступность загрузки файлов
        if smile_file and not current_app.config['UPLOAD_METHOD']:
            raise BadRequestError('Uploading is not available')

        from ..utils import uploader

        # Качаем смайлик и считаем хэш
        try:
            image_data, hashsum = uploader.get_data_and_hashsum(smile_file, data.get('url'))
        except ValueError as exc:
            raise BadRequestError(str(exc))
        except IOError as exc:
            raise BadRequestError('Cannot download smile')

        # Ищем смайлик по хэшу
        smile_by_hashsum = self.search_by_hashsum(hashsum)
        if smile_by_hashsum:
            return smile_by_hashsum

        # Раз ничего не нашлось, сохраняем смайлик себе
        try:
            upload_info = uploader.upload(
                image_data,
                data.get('url') if not smile_file else None,
                hashsum,
                disable_url_upload,
                compress=compress,
                compress_size=(data['w'], data['h']),
            )
        except uploader.BadImageError as exc:
            raise BadRequestError(str(exc))
        except OSError as exc:
            current_app.logger.error('Cannot upload image: %s', exc)
            raise InternalError('Upload error')

        smile = self._model()(
            category=category,
            user_addr=user_addr,
            user_cookie=session_id,
            filename=upload_info['filename'],
            width=data['w'],
            height=data['h'],
            custom_url=upload_info['url'] or '',
            tags_cache='',
            hashsum=upload_info['hashsum'],
        )
        smile.flush()

        # Сохраняем инфу о урле и хэшах, дабы не плодить дубликаты смайликов
        from smilepack.models import SmileUrl, SmileHash

        # Если загружен новый смайлик по урлу
        if data.get('url') and not smile_by_url:
            SmileUrl(
                url=data['url'],
                smile=smile,
                url_hash=hash_url(data['url']),
            ).flush()

        # Если смайлик перезалит на имгур
        if upload_info['url'] and upload_info['url'] != data.get('url'):
            SmileUrl(
                url=upload_info['url'],
                smile=smile,
                url_hash=hash_url(upload_info['url']),
            ).flush()

        SmileHash(
            hashsum=hashsum,
            smile=smile,
        ).flush()

        # Если смайлик сжали, хэш может оказаться другим
        if hashsum != upload_info['hashsum']:
            SmileHash(
                hashsum=upload_info['hashsum'],
                smile=smile,
            ).flush()

        current_app.logger.info(
            'Created smile %d (%s %dx%d) with compression %s',
            smile.id,
            smile.url,
            smile.width,
            smile.height,
            upload_info.get('compression_method'),
        )
        return smile

    def get_all_collection_smiles_count(self):
        smiles_count = current_app.cache.get('smiles_count')
        if smiles_count is None:
            smiles_count = self._model().select(lambda x: x.category is not None and x.approved_at is not None).count()
            current_app.cache.set('smiles_count', smiles_count, timeout=300)
        return smiles_count

    def get_last_approved(self, count=100):
        Smile = self._model()
        return Smile.select(lambda x: x.category is not None and x.approved_at is not None).order_by(Smile.approved_at.desc(), Smile.id.desc())[:count]

    def get_last_approved_as_json(self, count=100):
        if count <= 0:
            return []

        query_count = count if count > 100 else 100
        query_count = math.ceil(query_count // 25) * 25

        smiles = current_app.cache.get('last_smiles_{}'.format(query_count))
        if smiles is not None:
            return smiles[:count]

        smiles = self.get_last_approved(query_count)
        if query_count > 1000:
            return [x.as_json(full_info=True) for x in smiles[:count]]

        smiles = [x.bl.as_json(full_info=True) for x in smiles]
        current_app.cache.set('last_smiles_{}'.format(query_count), smiles, timeout=300)
        return smiles[:count]

    def search_by_hashsum(self, hashsum):
        from smilepack.models import SmileHash
        return orm.select(x.smile for x in SmileHash if x.hashsum == hashsum).first()

    def search_by_url(self, url):
        return self.search_by_urls((url,))[0]

    def search_by_urls(self, urls):
        from smilepack.models import Smile, SmileUrl
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
        from smilepack.models import Tag, TagSynonym

        tag = str(tag or '').strip().lower()  # TODO: recheck case sensitivity
        if not tag:
            raise ValueError('Empty tag')

        if ',' in tag or len(tag) > 48:
            raise ValueError('Invalid tag')

        smile = self._model()

        # FIXME: smile.category.subsection.section??!
        synonym = orm.select(x.tag_name for x in TagSynonym if x.section == smile.category.subsection.section and x.name == tag).first()
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

        tag_obj.smiles_count += 1
        tag_obj.flush()

        return tag_obj

    def remove_tag(self, tag):
        from smilepack.models import TagSynonym

        tag = str(tag or '').strip().lower()

        smile = self._model()
        tag_obj = smile.tags.select(lambda x: x.name == tag).first()
        if not tag_obj:
            tag_obj = orm.select(x.tag for x in TagSynonym if x.section == smile.category.subsection.section and x.name == tag).first()
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

        tag_obj.smiles_count -= 1
        tag_obj.flush()
        return True

    def as_json(self, full_info=True):
        smile = self._model()
        result = {
            'id': smile.id,
            'url': smile.url,
            'tags': smile.tags_list,
            'w': smile.width,
            'h': smile.height,
            'description': smile.description,
        }
        if full_info:
            result['category'] = [smile.category.id, smile.category.name] if smile.category else None
            result['subsection'] = [smile.category.subsection.id, smile.category.subsection.name] if smile.category else None
            result['section'] = [smile.category.subsection.section.id, smile.category.subsection.section.name] if smile.category else None
        return result

    def get_system_path(self):
        if not current_app.config['SMILES_DIRECTORY']:
            return None

        smile = self._model()
        if smile.custom_url:
            return None

        return os.path.abspath(os.path.join(current_app.config['SMILES_DIRECTORY'], smile.filename))

    def open(self):
        smile = self._model()
        if smile.custom_url:
            return urlopen(smile.custom_url, timeout=10)
        path = self.get_system_path()
        if not path:
            return None
        return open(path, 'rb')


class TagBL(BaseBL):
    def as_json(self):
        tag = self._model()
        return {
            'section': tag.section.id,
            'name': tag.name,
            'description': tag.description,
            'icon': {
                'id': tag.icon.id,
                'url': tag.icon.url
            } if tag.icon else None,
            'smiles': tag.smiles_count,
        }
