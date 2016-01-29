#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import math
from datetime import datetime
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

    def get_smiles_as_json(self, admin_info=False):
        smiles = sorted(self._model().select_approved_smiles(), key=lambda x: (x.order, x.id))
        return [x.bl.as_json(full_info=admin_info, admin_info=admin_info) for x in smiles]


class SmileBL(BaseBL):
    def find_or_create(self, data, user_addr=None, session_id=None, disable_url_upload=False, compress=False):
        smile_file = data.pop('file', None)

        try:
            jsonschema.validate(data, schemas.SMILE)
        except jsonschema.ValidationError as exc:
            raise JSONValidationError(exc)

        if 'w' not in data or 'h' not in data:
            raise BadRequestError('Please set width and height')

        from smilepack.models import SmileUrl, SmileHash, Category

        # Ищем категорию, в которую добавляется смайлик
        category_id = data.pop('category', None)
        if category_id is not None:
            category = Category.get(id=category_id)
            if category is None:
                raise BadRequestError('Category not found')
        else:
            category = None

        # Ищем существующий смайлик по урлу
        smile_by_url = None
        if data.get('url') and not smile_file:
            smile_by_url = self.search_by_url(check_and_normalize(data['url']))
            if smile_by_url:
                return False, smile_by_url

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
            return False, smile_by_hashsum

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
            description=data.get('description', ''),
            tags_cache='',
            hashsum=upload_info['hashsum'],
            approved_at=datetime.utcnow() if data.get('approved') else None,
        )
        smile.flush()
        if 'tags' in data:
            try:
                smile.bl.set_tags(data['tags'])
            except ValueError as exc:
                raise BadRequestError(str(exc))

        # Сохраняем инфу о урле и хэшах, дабы не плодить дубликаты смайликов

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
        return True, smile

    def edit(self, data):
        smile = self._model()

        try:
            jsonschema.validate(data, schemas.SMILE)
        except jsonschema.ValidationError as exc:
            raise JSONValidationError(exc)

        from smilepack.models import Category

        # Ищем категорию, в которую переносится смайлик
        category_id = data.get('category')
        if category_id is not None:
            category = Category.get(id=category_id)
            if category is None:
                raise BadRequestError('Category not found')
        else:
            category = None

        # Немного возни из-за сложности тегов
        old_tags = smile.tags_list
        reset_tags = False
        if 'category' in data:
            reset_tags = smile.category and not category
            reset_tags = reset_tags or (not smile.category and category)
            if smile.category and category and not reset_tags:
                reset_tags = smile.category.subsection.section.id != category.subsection.section.id

        if 'approved' in data and not reset_tags:
            reset_tags = bool(data['approved']) != (smile.approved_at is not None)

        if reset_tags and old_tags:
            # Чистим связи с объектами Tag (возвращая ниже tags_cache на место)
            # Потому что теги привязаны к разделам
            # И потому что неопубликованных смайликов не должно быть в поиске
            self.set_tags([])

        # Редактируем смайлик

        # При публикации добавляем смайлик в конец категории
        if category and (data.get('approved') and not smile.approved_at or not smile.category or category.id != smile.category.id):
            smile.order = category.select_approved_smiles().count()

        if 'w' in data:
            smile.width = data['w']
        if 'h' in data:
            smile.height = data['h']
        if 'category' in data:
            smile.category = category
        if 'description' in data:
            smile.description = data.get('description', '')
        if 'approved' in data:
            smile.approved_at = (smile.approved_at or datetime.utcnow()) if data['approved'] else None
        if 'tags' in data:
            try:
                self.set_tags(data['tags'])
            except ValueError as exc:
                raise BadRequestError(str(exc))
        elif reset_tags:
            self.set_tags(old_tags)
        if 'add_tags' in data:
            norm_tags = [x.strip().lower() for x in data['add_tags'] if x and x.strip()]
            try:
                self.set_tags(old_tags + [x for x in norm_tags if x not in old_tags])
            except ValueError as exc:
                raise BadRequestError(str(exc))
            del norm_tags
        if 'remove_tags' in data:
            norm_tags = [x.strip().lower() for x in data['remove_tags'] if x and x.strip()]
            if norm_tags:
                try:
                    self.set_tags([x for x in old_tags if x not in norm_tags])
                except ValueError as exc:
                    raise BadRequestError(str(exc))
            del norm_tags

        return smile

    def get_all_collection_smiles_count(self):
        smiles_count = current_app.cache.get('smiles_count')
        if smiles_count is None:
            smiles_count = self._model().select(lambda x: x.category is not None and x.approved_at is not None).count()
            current_app.cache.set('smiles_count', smiles_count, timeout=300)
        return smiles_count

    def get_last_approved(self, offset=0, count=100):
        offset = max(0, offset)
        count = max(0, count)
        Smile = self._model()
        return Smile.select(lambda x: x.category is not None and x.approved_at is not None).order_by(Smile.approved_at.desc(), Smile.id.desc())[offset:offset + count]

    def get_last_approved_as_json(self, offset=0, count=100):
        if count <= 0:
            return []
        offset = max(0, offset)
        count = min(2000, count)

        # Для эффективного использования кэша
        query_count = math.ceil((offset + count) / 100) * 100

        if query_count > 1000:
            smiles = self.get_last_approved(offset, count)
            return [x.bl.as_json(full_info=True) for x in smiles]

        smiles = current_app.cache.get('last_smiles_{}'.format(query_count))
        if smiles is not None:
            return smiles[offset:offset + count]

        smiles = self.get_last_approved(0, query_count)

        smiles = [x.bl.as_json(full_info=True) for x in smiles]
        current_app.cache.set('last_smiles_{}'.format(query_count), smiles, timeout=300)
        return smiles[offset:offset + count]

    def get_last_unpublished(self, filt='all', older=None, offset=0, count=100):
        offset = max(0, offset)
        count = max(0, count)
        Smile = self._model()

        if filt == 'all':
            result = Smile.select(lambda x: x.category is None or x.approved_at is None)
        elif filt == 'suggestions':
            result = Smile.select(lambda x: x.category is not None and x.approved_at is None)
        elif filt == 'nocategories':
            result = Smile.select(lambda x: x.category is None)
        else:
            raise ValueError('Unknown filter {}'.format(filt))

        if older is not None:
            result = result.filter(lambda x: x.id < older)

        return result.order_by(Smile.id.desc())[offset:offset + count]

    def get_last_unpublished_as_json(self, filt='all', older=None, offset=0, count=100):
        if count <= 0:
            return []
        offset = max(0, offset)
        count = min(2000, count)

        smiles = self.get_last_unpublished(filt, older, offset, count)
        smiles = [x.bl.as_json(full_info=True, admin_info=True) for x in smiles]
        return smiles[offset:offset + count]

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
        tag = str(tag or '').strip().lower()  # TODO: recheck case sensitivity
        if not tag:
            raise ValueError('Empty tag')

        if ',' in tag or len(tag) > 48:
            raise ValueError('Invalid tag')

        from smilepack.models import TagSynonym
        smile = self._model()
        if smile.category:
            synonym = orm.select(x.tag_name for x in TagSynonym if x.section == smile.category.subsection.section and x.name == tag).first()
            if synonym:
                tag = synonym

        if tag not in smile.tags_list:
            if smile.is_published:
                self._apply_tags_raw({tag}, set())
            smile.tags_cache = ','.join(smile.tags_list + [tag])
        return smile

    def remove_tag(self, tag):
        tag = str(tag or '').strip().lower()
        if not tag:
            raise ValueError('Empty tag')

        if ',' in tag or len(tag) > 48:
            raise ValueError('Invalid tag')

        from smilepack.models import TagSynonym
        smile = self._model()
        if smile.category:
            synonym = orm.select(x.tag_name for x in TagSynonym if x.section == smile.category.subsection.section and x.name == tag).first()
            if synonym:
                tag = synonym

        if tag in smile.tags_list:
            if smile.is_published:
                self._apply_tags_raw(set(), {tag})
            smile.tags_cache = ','.join([x for x in smile.tags_list if x != tag])
        return smile

    def set_tags(self, tags):
        from smilepack.models import Tag, TagSynonym

        # validate
        clean_tags = []
        for tag in tags:
            tag = tag.strip().lower()
            if not tag:
                raise ValueError('Empty tag')
            if len(tag) > 48:
                raise ValueError('Invalid tag')
            if tag not in clean_tags:
                clean_tags.append(tag)

        smile = self._model()

        if smile.category:
            section = smile.category.subsection.section

            # normalize
            synonym_tags = orm.select((x.name, x.tag_name) for x in TagSynonym if x.section == section and x.name in clean_tags)[:]
            synonym_tags = dict(synonym_tags)
            clean_tags = [synonym_tags.get(x, x) for x in clean_tags]

        # calculate
        add_tags = set(clean_tags) - set(smile.tags_list)
        rm_tags = set(smile.tags_list) - set(clean_tags)

        # apply
        if smile.is_published:
            self._apply_tags_raw(add_tags, rm_tags)
        smile.tags_cache = ','.join(clean_tags)
        return smile

    def _apply_tags_raw(self, add_tags, rm_tags):
        from smilepack.models import Tag, TagSynonym

        smile = self._model()
        section = smile.category.subsection.section

        add_tags_objs = {x.name: x for x in Tag.select(lambda x: x.section == section and x.name in add_tags)[:]}

        tag_objs = list(smile.tags.select())
        if len(tag_objs) + len(add_tags) - len(rm_tags) > 50:
            raise BadRequestError('Too many tags')

        for x in tag_objs:
            if x.name in rm_tags:
                smile.tags.remove(x)
                x.smiles_count -= 1

        for tag in add_tags:
            tag_obj = add_tags_objs.get(tag)
            if not tag_obj:
                tag_obj = Tag(section=section, name=tag)
                tag_obj.flush()
            smile.tags.add(tag_obj)
            tag_obj.smiles_count += 1

    def reorder(self, before_smile=None, **kwargs):
        from smilepack.models import Category, Smile

        smile = self._model()
        if not smile.category or before_smile and not before_smile.category:
            raise BadRequestError('Cannot reorder smile without category')

        if before_smile:
            if before_smile.category.id != smile.category.id:
                raise BadRequestError('Cannot reorder smile in other category')
            if before_smile.id == smile.id:
                return

        # TODO: write more effective implementation
        smiles = smile.category.select_approved_smiles().order_by(Smile.order, Smile.id)[:]
        smile_ids = [x.id for x in smiles]

        i = smile_ids.index(smile.id)
        del smile_ids[i]
        del smiles[i]

        if before_smile:
            try:
                i = smile_ids.index(before_smile.id)
            except ValueError:
                i = -1
            smile_ids.insert(i, smile.id)
            smiles.insert(i, smile)
        else:
            i = len(smiles)
            smile_ids.append(smile.id)
            smiles.append(smile)

        if 'check_after_smile_id' in kwargs:
            if i == 0 and kwargs['check_after_smile_id'] is not None:
                raise BadRequestError('Result checking failed')
            elif i != 0 and kwargs['check_after_smile_id'] != smile_ids[i - 1]:
                raise BadRequestError('Result checking failed')

        if 'check_order' in kwargs and kwargs['check_order'] != i:
            raise BadRequestError('Result checking failed')

        for o, sm in enumerate(smiles):
            if sm.order != o:
                sm.order = o

    def as_json(self, full_info=True, admin_info=False):
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
        if admin_info:
            result['created_at'] = smile.created_at.strftime('%Y-%m-%dT%H:%M:%SZ')
            result['updated_at'] = smile.updated_at.strftime('%Y-%m-%dT%H:%M:%SZ')
            result['approved_at'] = smile.approved_at.strftime('%Y-%m-%dT%H:%M:%SZ') if smile.approved_at else None
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
