#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
from datetime import datetime

import jsonschema
from pony import orm
from flask import current_app

from smilepack import schemas
from smilepack.bl.utils import BaseBL
from smilepack.utils.exceptions import BadRequestError, InternalError
from smilepack.utils.urls import parse as parse_urls, hash_url, check_and_normalize


__all__ = ['IconBL']


class IconBL(BaseBL):
    def find_or_create(self, data, user_addr=None, session_id=None, compress=False):
        icon_file = data.pop('file', None)

        jsonschema.validate(data, schemas.ICON)

        from smilepack.models import IconUrl, IconHash

        # Ищем существующую иконку по урлу
        icon_by_url = None
        if data.get('url') and not icon_file:
            icon_by_url = self.search_by_url(check_and_normalize(data['url']))
            if icon_by_url:
                return False, icon_by_url
        del icon_by_url

        # Проверяем доступность загрузки файлов
        if icon_file and not current_app.config['ICON_UPLOAD_METHOD']:
            raise BadRequestError('Uploading is not available')

        from smilepack.utils import uploader

        # Качаем иконку и считаем хэш
        try:
            image_data = uploader.get_data(
                icon_file,
                data.get('url'),
                maxbytes=max(current_app.config['MAX_CONTENT_LENGTH'], current_app.config['MAX_ICON_BYTES'])
            )
        except ValueError as exc:
            raise BadRequestError(str(exc))
        except IOError as exc:
            raise BadRequestError('Cannot download icon')
        hashsum = uploader.calc_hashsum(image_data)

        # Ищем смайлик по хэшу
        icon_by_hashsum = self.search_by_hashsum(hashsum)
        if icon_by_hashsum:
            return False, icon_by_hashsum

        if current_app.config['DISABLE_THE_CREATION_OF_IMAGES']:
            raise BadRequestError('Creation of images is disabled')

        # Раз ничего не нашлось, сохраняем иконку себе
        icon_uploader = uploader.Uploader(
            method=current_app.config['ICON_UPLOAD_METHOD'],
            directory=current_app.config['ICONS_DIRECTORY'],
            maxbytes=max(current_app.config['MAX_CONTENT_LENGTH'], current_app.config['MAX_ICON_BYTES']),
            minres=current_app.config['ICON_SIZE'],
            maxres=current_app.config['ICON_SIZE'],
            processing_mode=current_app.config['ICON_PROCESSING_MODE'],
            dirmode=current_app.config['CHMOD_DIRECTORIES'],
            filemode=current_app.config['CHMOD_FILES'],
        )
        try:
            upload_info = icon_uploader.upload(
                image_data,
                data['url'] if data.get('url') and current_app.config['ALLOW_CUSTOM_URLS'] else None,
                compress=current_app.config['ICON_FORCE_COMPRESSION'] or (current_app.config['ICON_COMPRESSION'] and compress),
                hashsum=hashsum,
            )
        except uploader.BadImageError as exc:
            raise BadRequestError(str(exc))
        except OSError as exc:
            current_app.logger.error('Cannot upload image: %s', exc)
            raise InternalError('Upload error')

        icon = self._model()(
            user_addr=user_addr,
            user_cookie=session_id,
            filename=upload_info['filename'],
            custom_url=upload_info['url'] or '',
            hashsum=upload_info['hashsum'],
            approved_at=datetime.utcnow() if data.get('approved') else None,
        )
        icon.flush()

        # Сохраняем инфу о урле и хэшах, дабы не плодить дубликаты иконок

        # Если загружена новая иконка по урлу
        if data.get('url'):
            IconUrl(
                url=data['url'],
                icon=icon,
                url_hash=hash_url(data['url']),
            ).flush()

        # Если иконка перезалита на имгур
        if upload_info['url'] and upload_info['url'] != data.get('url'):
            IconUrl(
                url=upload_info['url'],
                icon=icon,
                url_hash=hash_url(upload_info['url']),
            ).flush()

        IconHash(
            hashsum=hashsum,
            icon=icon,
        ).flush()

        # Если иконку сжали, хэш может оказаться другим
        if hashsum != upload_info['hashsum']:
            IconHash(
                hashsum=upload_info['hashsum'],
                icon=icon,
            ).flush()

        current_app.logger.info(
            'Created icon %d (%s) with compression %s',
            icon.id,
            icon.url,
            upload_info.get('compression_method'),
        )
        return True, icon

    def edit(self, data):
        icon = self._model()
        if 'approved' in data:
            if data['approved'] and not icon.approved_at:
                icon.approved_at = datetime.utcnow()
            else:
                icon.approved_at = None
        return icon

    def search_by_hashsum(self, hashsum):
        from smilepack.models import IconHash
        return orm.select(x.icon for x in IconHash if x.hashsum == hashsum).first()

    def search_by_url(self, url):
        return self.search_by_urls((url,))[0]

    def search_by_urls(self, urls):
        from smilepack.models import Icon, IconUrl

        result_icons = [None] * len(urls)
        hashes = {url: hash_url(url) for url in urls}

        hash_values = tuple(hashes.values())
        if hash_values:
            icons = dict(orm.select((x.url, x.icon) for x in IconUrl if x.url_hash in hash_values))
        else:
            icons = {}

        for i, url in enumerate(urls):
            if url in icons:
                result_icons[i] = icons[url]

        return result_icons

    def select_published(self):
        return self._model().select(lambda x: x.approved_at is not None)

    def as_json(self, admin_info=False):
        icon = self._model()
        result = {'id': icon.id, 'url': icon.url}
        if admin_info:
            result['created_at'] = icon.created_at.strftime('%Y-%m-%dT%H:%M:%SZ')
            result['updated_at'] = icon.updated_at.strftime('%Y-%m-%dT%H:%M:%SZ')
            result['approved_at'] = icon.approved_at.strftime('%Y-%m-%dT%H:%M:%SZ') if icon.approved_at else None
        return result
