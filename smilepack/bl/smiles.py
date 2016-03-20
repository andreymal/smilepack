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
    def create(self, data):
        jsonschema.validate(data, schemas.SECTION)

        if not data.get('name'):
            raise BadRequestError('Name is required')
        if 'icon' not in data:
            raise BadRequestError('Icon is required')

        from smilepack.models import Icon
        icon = Icon.get(id=data['icon'])
        if not icon:
            raise BadRequestError('Icon not found')

        order = self._model().select().count()
        section = self._model()(
            name=data['name'],
            description=data.get('description') or '',
            icon=icon,
            order=order
        )
        section.flush()
        return section

    def edit(self, data):
        jsonschema.validate(data, schemas.SECTION)
        section = self._model()

        from smilepack.models import Icon

        icon = None
        if 'icon' in data:
            icon = Icon.get(id=data['icon'])
            if not icon:
                raise BadRequestError('Icon not found')

        if 'name' in data:
            section.name = data['name']
        if 'description' in data:
            section.description = data['description']
        if 'icon' in data:
            section.icon = icon
        return section

    def delete(self):
        if self._model().subsections.count() > 0:
            raise BadRequestError('Cannot delete section with subsections')
        self._model().delete()

        from smilepack.models import Section
        _normalize_order(Section.select().order_by(Section.order, Section.id))

    def reorder(self, before_section=None, **kwargs):
        from smilepack.models import Section

        section = self._model()
        sections = Section.select().order_by(Section.order, Section.id)[:]

        new_kwargs = {}
        if 'check_after_section_id' in kwargs:
            new_kwargs['after'] = kwargs['check_after_section_id']
        if 'check_order' in kwargs:
            new_kwargs['order'] = kwargs['check_order']

        return _reorder_entity(section, sections, before_section, **kwargs)

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
    def create(self, data):
        jsonschema.validate(data, schemas.SUBSECTION)

        if not data.get('name'):
            raise BadRequestError('Name is required')
        if 'icon' not in data:
            raise BadRequestError('Icon is required')
        if 'section' not in data:
            raise BadRequestError('Section is required')

        from smilepack.models import Icon, Section
        icon = Icon.get(id=data['icon'])
        if not icon:
            raise BadRequestError('Icon not found')
        section = Section.get(id=data['section'])
        if not section:
            raise BadRequestError('Section not found')

        order = section.subsections.count()
        subsection = self._model()(
            name=data['name'],
            description=data.get('description') or '',
            icon=icon,
            section=section,
            order=order
        )
        subsection.flush()
        return subsection

    def edit(self, data):
        jsonschema.validate(data, schemas.SUBSECTION)
        subsection = self._model()

        from smilepack.models import Icon, Section

        icon = None
        if 'icon' in data:
            icon = Icon.get(id=data['icon'])
            if not icon:
                raise BadRequestError('Icon not found')

        section = None
        if 'section' in data:
            section = Section.get(id=data['section'])
            if not section:
                raise BadRequestError('Section not found')
            if subsection.section.id != section.id:
                # Теги привязаны к разделам, пересчитывать их очень долго
                raise BadRequestError('Moving to another section is unavailable')

        if 'name' in data:
            subsection.name = data['name']
        if 'description' in data:
            subsection.description = data['description']
        if 'icon' in data:
            subsection.icon = icon
        # subsection.section = section бессмысленно =)
        return subsection

    def delete(self):
        if self._model().categories.count() > 0:
            raise BadRequestError('Cannot delete subsection with categories')
        self._model().delete()

        from smilepack.models import SubSection
        _normalize_order(SubSection.select().order_by(SubSection.order, SubSection.id))

    def reorder(self, before_subsection=None, **kwargs):
        from smilepack.models import SubSection

        subsection = self._model()
        if before_subsection:
            if before_subsection.section.id != subsection.section.id:
                raise BadRequestError('Cannot reorder subsection in other section')

        subsections = subsection.section.subsections.select().order_by(SubSection.order, SubSection.id)[:]

        new_kwargs = {}
        if 'check_after_subsection_id' in kwargs:
            new_kwargs['after'] = kwargs['check_after_subsection_id']
        if 'check_order' in kwargs:
            new_kwargs['order'] = kwargs['check_order']

        return _reorder_entity(subsection, subsections, before_subsection, **kwargs)

    def as_json(self, with_categories=False, with_parent=False):
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
        if with_parent:
            result['section'] = [subsection.section.id, subsection.section.name]
        return result


class CategoryBL(BaseBL):
    def create(self, data):
        jsonschema.validate(data, schemas.CATEGORY)

        if not data.get('name'):
            raise BadRequestError('Name is required')
        if 'icon' not in data:
            raise BadRequestError('Icon is required')
        if 'subsection' not in data:
            raise BadRequestError('Subsection is required')

        from smilepack.models import Icon, SubSection
        icon = Icon.get(id=data['icon'])
        if not icon:
            raise BadRequestError('Icon not found')
        subsection = SubSection.get(id=data['subsection'])
        if not subsection:
            raise BadRequestError('Subection not found')

        order = subsection.categories.count()  # TODO: normalize order in old subsection
        category = self._model()(
            name=data['name'],
            description=data.get('description') or '',
            icon=icon,
            subsection=subsection,
            order=order
        )
        category.flush()
        return category

    def edit(self, data):
        jsonschema.validate(data, schemas.CATEGORY)
        category = self._model()

        from smilepack.models import Icon, SubSection

        icon = None
        if 'icon' in data:
            icon = Icon.get(id=data['icon'])
            if not icon:
                raise BadRequestError('Icon not found')

        subsection = None
        if 'subsection' in data:
            subsection = SubSection.get(id=data['subsection'])
            if not subsection:
                raise BadRequestError('Subsection not found')
            if category.subsection.section.id != subsection.section.id:
                # Теги привязаны к разделам, пересчитывать их очень долго
                raise BadRequestError('Moving to another section is unavailable')

        if 'name' in data:
            category.name = data['name']
        if 'description' in data:
            category.description = data['description']
        if 'icon' in data:
            category.icon = icon
        if 'subsection' in data and subsection.id != category.subsection.id:
            category.order = subsection.categories.count()
            category.subsection = subsection
        return category

    def delete(self):
        if self._model().select_approved_smiles().count() > 0:
            raise BadRequestError('Cannot delete category with smiles')
        smiles_count = 0
        for smile in self._model().smiles:  # suggestions
            smile.category = None
            smiles_count += 1
        self._model().delete()

        from smilepack.models import Category
        _normalize_order(Category.select().order_by(Category.order, Category.id))

        return smiles_count

    def reorder(self, before_category=None, **kwargs):
        from smilepack.models import Category

        category = self._model()
        if before_category:
            if before_category.subsection.id != category.subsection.id:
                raise BadRequestError('Cannot reorder category in other subsection')

        categories = category.subsection.categories.select().order_by(Category.order, Category.id)[:]

        new_kwargs = {}
        if 'check_after_category_id' in kwargs:
            new_kwargs['after'] = kwargs['check_after_category_id']
        if 'check_order' in kwargs:
            new_kwargs['order'] = kwargs['check_order']

        return _reorder_entity(category, categories, before_category, **kwargs)

    def get(self, i):
        return self._model().get(id=i)

    def as_json(self, with_parent=False):
        c = self._model()
        result = {
            'id': c.id,
            'name': c.name,
            'icon': {
                'id': c.icon.id,
                'url': c.icon.url,
            },
            'description': c.description,
            'smiles_count': c.smiles_count,
        }
        if with_parent:
            result['subsection'] = [c.subsection.id, c.subsection.name]
        return result

    def get_smiles_as_json(self, admin_info=False):
        smiles = sorted(self._model().select_approved_smiles(), key=lambda x: (x.order, x.id))
        return [x.bl.as_json(full_info=admin_info, admin_info=admin_info) for x in smiles]


class SmileBL(BaseBL):
    def find_or_create(self, data, user_addr=None, session_id=None, compress=False):
        smile_file = data.pop('file', None)

        jsonschema.validate(data, schemas.SMILE)

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
        del smile_by_url

        # Проверяем доступность загрузки файлов
        if smile_file and not current_app.config['UPLOAD_METHOD']:
            raise BadRequestError('Uploading is not available')

        from smilepack.utils import uploader

        # Качаем смайлик и считаем хэш
        try:
            image_data = uploader.get_data(smile_file, data.get('url'), maxbytes=current_app.config['MAX_CONTENT_LENGTH'])
        except ValueError as exc:
            raise BadRequestError(str(exc))
        except IOError as exc:
            raise BadRequestError('Cannot download smile')
        hashsum = uploader.calc_hashsum(image_data)

        # Ищем смайлик по хэшу
        smile_by_hashsum = self.search_by_hashsum(hashsum)
        if smile_by_hashsum:
            return False, smile_by_hashsum

        if current_app.config['DISABLE_THE_CREATION_OF_IMAGES']:
            raise BadRequestError('Creation of images is disabled')

        # Раз ничего не нашлось, сохраняем смайлик себе
        smile_uploader = uploader.Uploader(
            method=current_app.config['UPLOAD_METHOD'],
            directory=current_app.config['SMILES_DIRECTORY'],
            maxbytes=current_app.config['MAX_CONTENT_LENGTH'],
            minres=current_app.config['MIN_SMILE_SIZE'],
            maxres=current_app.config['MAX_SMILE_SIZE'],
            processing_mode=current_app.config['SMILE_PROCESSING_MODE'],
            dirmode=current_app.config['CHMOD_DIRECTORIES'],
            filemode=current_app.config['CHMOD_FILES'],
        )
        try:
            upload_info = smile_uploader.upload(
                image_data,
                data['url'] if data.get('url') and current_app.config['ALLOW_CUSTOM_URLS'] else None,
                compress=current_app.config['FORCE_COMPRESSION'] or (current_app.config['COMPRESSION'] and compress),
                hashsum=hashsum,
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
        if data.get('tags'):
            try:
                smile.bl.set_tags(data['tags'])
            except ValueError as exc:
                raise BadRequestError(str(exc))

        # Сохраняем инфу о урле и хэшах, дабы не плодить дубликаты смайликов

        # Если загружен новый смайлик по урлу
        if data.get('url'):
            url_hash = hash_url(data['url'])
            SmileUrl(
                url=data['url'],
                smile=smile,
                url_hash=url_hash,
            ).flush()
            current_app.cache.set('smile_by_url_{}'.format(url_hash), None, timeout=1)

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

        from smilepack.models import Category, Smile

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

        # Для последующих манипуляций с smiles_count
        old_category = smile.category
        old_published = smile.is_published

        if data.get('approved') and not smile.approved_at and (category or smile.category):
            # При публикации добавляем смайлик в конец категории
            smile.order = (category or smile.category).select_approved_smiles().count()
        elif category and (not smile.category or smile.category.id != category.id):
            # При перемещении в другую категорию тоже
            smile.order = category.select_approved_smiles().count()

        if 'w' in data:
            smile.width = data['w']

        if 'h' in data:
            smile.height = data['h']

        if 'category' in data:
            old_category = smile.category
            smile.category = category
            if old_category and (not category or category.id != old_category.id):
                # При вытаскивании смайлика из категории стоит привести порядок в порядок (простите за каламбур)
                _normalize_order(old_category.select_approved_smiles().order_by(Smile.order, Smile.id))

        if 'description' in data:
            smile.description = data.get('description', '')

        if 'approved' in data and data['approved'] != (smile.approved_at is not None):
            smile.approved_at = (smile.approved_at or datetime.utcnow()) if data['approved'] else None
            if not smile.approved_at and smile.category:
                # При вытаскивании смайлика из опубликованных порядок в категории тоже стоит навести
                _normalize_order(smile.category.select_approved_smiles().order_by(Smile.order, Smile.id))

        if 'is_suggestion' in data and data['is_suggestion'] != smile.is_suggestion:
            smile.is_suggestion = not smile.is_suggestion

        if 'hidden' in data and data['hidden'] != smile.hidden:
            smile.hidden = not smile.hidden

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

        # В зависимости от того, что натворили выше, считаем, что нам делать с smiles_count
        if old_category and old_published:
            old_category.smiles_count -= 1
        if smile.category and smile.is_published:
            smile.category.smiles_count += 1

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
        elif filt == 'categories':
            result = Smile.select(lambda x: x.category is not None and x.approved_at is None and x.is_suggestion)
        elif filt == 'nocategories':
            result = Smile.select(lambda x: x.category is None and x.is_suggestion)
        elif filt == 'nonsuggestions':
            result = Smile.select(lambda x: (x.category is None or x.approved_at is None) and not x.is_suggestion)
        elif filt == 'hidden':
            result = Smile.select(lambda x: (x.category is None or x.approved_at is None) and x.hidden)
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

    def full_search_by_url(self, url):
        if not url:
            return
        smile = self.search_by_url(url)
        if smile:
            return smile

        from smilepack.models import SmileUrl
        from smilepack.utils import uploader

        try:
            print('try download')
            data = uploader.download(url)
        except IOError as exc:
            print('IOError', exc)
            smile = None
        else:
            hashsum = uploader.calc_hashsum(data)
            smile = self.search_by_hashsum(hashsum)

        if smile:
            SmileUrl(
                url=url,
                smile=smile,
                url_hash=hash_url(url),
            ).flush()

        return smile

    def search_by_url(self, url):
        if not url:
            return
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
        from smilepack.models import Smile

        smile = self._model()
        if not smile.category or before_smile and not before_smile.category:
            raise BadRequestError('Cannot reorder smile without category')

        if before_smile:
            if before_smile.category.id != smile.category.id:
                raise BadRequestError('Cannot reorder smile in other category')

        smiles = smile.category.select_approved_smiles().order_by(Smile.order, Smile.id)[:]

        new_kwargs = {}
        if 'check_after_smile_id' in kwargs:
            new_kwargs['after'] = kwargs['check_after_smile_id']
        if 'check_order' in kwargs:
            new_kwargs['order'] = kwargs['check_order']

        return _reorder_entity(smile, smiles, before_smile, **kwargs)

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
            result['hidden'] = smile.hidden
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


def _reorder_entity(obj, obj_list, before, **kwargs):
    # TODO: write more effective implementation
    obj_list = list(obj_list)
    obj_ids = [x.id for x in obj_list]

    old_order = obj_ids.index(obj.id)
    if before and before.id == obj.id:
        return False, obj_list
    elif old_order < len(obj_ids) - 1 and before and before.id == obj_ids[old_order + 1]:
        return False, obj_list
    elif old_order == len(obj_ids) - 1 and not before:
        return False, obj_list

    del obj_list[old_order]
    del obj_ids[old_order]

    if before:
        order = obj_ids.index(before.id)
        obj_list.insert(order, obj)
        obj_ids.insert(order, obj.id)
    else:
        order = len(obj_ids)
        obj_list.append(obj)
        obj_ids.append(obj.id)

    if 'after' in kwargs:
        if order < 0 or order == 0 and kwargs['after'] is not None:
            raise BadRequestError('Result checking failed')
        elif order > 0 and kwargs['after'] != obj_ids[order - 1]:
            raise BadRequestError('Result checking failed')

    if 'order' in kwargs and kwargs['order'] != order:
        raise BadRequestError('Result checking failed')

    _normalize_order(obj_list)

    return True, obj_list


def _normalize_order(obj_list):
    for o, item in enumerate(obj_list):
        if item.order != o:
            item.order = o
