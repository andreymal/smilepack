#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import time
from io import BytesIO
from hashlib import sha256
from urllib.request import urlopen, Request

from flask import current_app


class BadImageError(Exception):
    pass


def download(url, maxlen=None, timeout=10, chunksize=16384):
    req = Request(url)
    req.add_header('User-Agent', 'smilepack/0.1.1')
    resp = urlopen(req, timeout=timeout)

    buf = []
    size = 0
    started_at = time.time()

    while True:
        d = resp.read(chunksize)
        if not d:
            break
        buf.append(d)
        size += len(d)
        if maxlen is not None and size > maxlen:
            raise IOError('Too long response')
        if time.time() - started_at >= timeout:
            raise IOError('Timeout')

    return b''.join(buf)


def calc_hashsum(data):
    return sha256(data).hexdigest()


def get_data_and_hashsum(stream=None, url=None):
    if not stream and not url or stream and url:
        raise ValueError('Please set stream or url')

    if stream:
        data = stream.read()
    else:
        data = download(url, current_app.config['MAX_CONTENT_LENGTH'])

    hashsum = calc_hashsum(data)

    return data, hashsum


def check_image_format(data=None, image=None):
    from PIL import Image

    if data:
        try:
            image = Image.open(BytesIO(data))
        except:
            raise BadImageError('Cannot decode image')

    try:
        if image.format not in ('JPEG', 'GIF', 'PNG'):
            raise BadImageError('Invalid image format')

        w, h = image.size
        min_size = current_app.config['MIN_SMILE_SIZE']
        max_size = current_app.config['MAX_SMILE_SIZE']
        if w < min_size[0] or h < min_size[1]:
            raise BadImageError('Too small size')
        if w > max_size[0] or h > max_size[1]:
            raise BadImageError('Too big size')

        return image.format
    finally:
        if data:
            image.close()


def compress_image(data, hashsum, image=None, compress_size=None):
    from PIL import Image

    min_size = len(data)

    # Если сжимать совсем нет смысла
    if min_size <= 4096:
        return data, hashsum, None

    image_local = not image
    if image_local:
        try:
            image = Image.open(BytesIO(data))
        except:
            raise BadImageError('Cannot decode image')

    try:
        # Если сжимать не умеем
        if image.format != 'PNG':
            return data, hashsum, None

        # TODO: придумать, как защититься от вандализма загрузкой смайлов
        # по урлу с неадекватным изменением размера, и уже тогда включить
        # FIXME: слетает альфа-канал на PNG RGBA
        # if image.format == 'JPEG' or image.mode == 'RGB':
        #     if compress_size and compress_size[0] * compress_size[1] < image.size[0] * image.size[1]:
        #         image2 = image.resize(compress_size, Image.ANTIALIAS)
        #         image2.format = image.format
        #         if image_local:
        #             image.close()
        #         image = image2
        #         del image2

        # А PNG пробуем сжать разными методами
        test_data, method = compress_png(image)
    finally:
        if image_local:
            image.close()
            image = None

    # Сохраняем сжатие, только если оно существенно
    if test_data and min_size - len(test_data) > 1024:
        new_hashsum = calc_hashsum(test_data)
        return test_data, new_hashsum, method
    else:
        return data, hashsum, None


def compress_png(image):
    # 0) Пробуем просто пересохранить
    min_stream = BytesIO()
    image.save(min_stream, 'PNG', optimize=True)
    min_size = len(min_stream.getvalue())
    method = 'resave'

    # 1) Пробуем пересохранить с zlib (иногда почему-то меньше, чем optimize=True)
    test_stream = BytesIO()
    image.save(test_stream, 'PNG', compress_level=9)
    test_size = len(test_stream.getvalue())
    if test_size < min_size:
        min_stream = test_stream
        min_size = test_size
        method = 'zlib'

    # 2) Пробуем закрасить чёрным невидимое
    if image.mode == 'RGBA':
        from PIL import ImageDraw
        with image.copy() as test_image:
            w = test_image.size[0]
            draw = None
            for i, pixel in enumerate(test_image.getdata()):
                if pixel[3] < 1:
                    if draw is None:
                        draw = ImageDraw.Draw(test_image)
                    draw.point([(i % w, i // w)], (0, 0, 0, 0))
            if draw is not None:
                test_stream = BytesIO()
                test_image.save(test_stream, 'PNG', optimize=True)
                test_size = len(test_stream.getvalue())
                if test_size < min_size:
                    min_stream = test_stream
                    min_size = test_size
                    method = 'zeroalpha'
            del draw

    return min_stream.getvalue(), method


def upload(data=None, url=None, hashsum=None, disable_url_upload=False, image_format=None, compress=False, compress_size=None):
    """Загружает смайлик согласно настройкам и переданным аргументам.
    Возвращает словарь, содержащий filename (для SMILE_URL), url (для custom_url при необходимости), hashsum
    (может не совпадать с входным аргументом при включенном сжатии) и compression_method.

    * Если не передать содержимое файла (data), оно будет автоматически загружено по url. А если передать, то url необязателен.
    * disable_url_upload=True отключает перезалив смайлика при переданном url и отключенном сжатии (compress).
    * image_format — "JPEG", "GIF" или "PNG" — позволяет пропустить проверку формата изображения (в т.ч. проверку
      размера). Если не задано, проверка будет проведена и формат установлен, при проблемах выбрасывается
      BadImageError.
    * compress=True — сжимает изображение по возможности (без изменения разрешения и без потери качества, если не
      указан compress_size).
    * compress_size — кортеж из двух чисел; если задан вместе с compress, то уменьшает изображение до указанного
      разрешения, сохраняя расширение (если в итоге оно станет весить меньше, что, например, не всегда верно для
      PNG).
    """
    from PIL import Image

    if not data:
        data, hashsum = get_data_and_hashsum(None, url)
    elif not hashsum:
        hashsum = calc_hashsum(data)

    try:
        image = Image.open(BytesIO(data))
    except:
        raise BadImageError('Cannot decode image')

    with image:
        if not image_format:
            image_format = check_image_format(image=image)

        if url and not compress and (disable_url_upload or not current_app.config['UPLOAD_METHOD'] or current_app.config['ALLOW_CUSTOM_URLS']):
            if '?' in url or url.endswith('/'):
                return {'filename': 'image', 'url': url, 'hashsum': hashsum, 'compression_method': None}
            else:
                return {'filename': url[url.rfind('/') + 1:], 'url': url, 'hashsum': hashsum, 'compression_method': None}

        if compress and current_app.config['UPLOAD_METHOD']:
            data, hashsum, compression_method = compress_image(data, hashsum, image=image, compress_size=compress_size)
        else:
            compression_method = None

        if current_app.config['UPLOAD_METHOD'] == 'imgur':
            result = upload_to_imgur(data, hashsum)
            result['compression_method'] = compression_method
            return result
        elif current_app.config['UPLOAD_METHOD'] == 'directory':
            result = upload_to_directory(data, hashsum, image_format)
            result['compression_method'] = compression_method
            return result
        else:
            raise RuntimeError('Unknown upload method setted in settings')


def upload_to_imgur(data, hashsum):
    image_data = current_app.imgur.send_image(BytesIO(data))
    if not image_data.get('success'):
        current_app.logger.error('Cannot upload image: %s', image_data)
        raise IOError('Cannot upload image')

    link = image_data['data']['link']
    new_hashsum = calc_hashsum(download(link))
    return {'filename': link[link.rfind('/') + 1:], 'url': link, 'hashsum': new_hashsum}


def upload_to_directory(data, hashsum, image_format=None):
    upload_dir = current_app.config['SMILES_DIRECTORY']

    subdir = os.path.join(hashsum[:2], hashsum[2:4])
    filename = hashsum[4:10]
    if image_format == 'PNG':
        filename += '.png'
    elif image_format == 'JPEG':
        filename += '.jpg'
    elif image_format == 'GIF':
        filename += '.gif'

    full_filename = os.path.join(subdir, filename)
    upload_dir = os.path.join(upload_dir, subdir)

    if not os.path.isdir(upload_dir):
        os.makedirs(upload_dir)

    full_path = os.path.join(upload_dir, filename)
    with open(full_path, 'wb') as fp:
        fp.write(data)
    return {'filename': full_filename.replace(os.path.sep, '/'), 'url': None, 'hashsum': hashsum}
