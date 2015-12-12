#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
from io import BytesIO
from hashlib import sha256
from urllib.request import urlopen, Request

from flask import current_app


class BadImageError(Exception):
    pass


def download(url, maxlen=None, timeout=10):
    req = Request(url)
    req.add_header('User-Agent', 'smilepack/0.2.0')
    resp = urlopen(req, timeout=timeout)
    if maxlen is not None:
        return resp.read(maxlen)
    else:
        return resp.read()


def get_stream_and_hashsum(image_stream=None, url=None):
    if not image_stream and not url or image_stream and url:
        raise ValueError('Please set image_stream or url')

    if not image_stream:
        image_stream = BytesIO(download(url, current_app.config['MAX_CONTENT_LENGTH']))  # seek is unsupported for HTTPResponse

    hashsum = sha256(image_stream.read()).hexdigest()
    image_stream.seek(0)

    return image_stream, hashsum


def check_image_format(image_stream):
    from PIL import Image

    old_seek = image_stream.tell()

    try:
        image = Image.open(image_stream)
    except:
        raise BadImageError('Cannot decode image')
    else:
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
        image_stream.seek(old_seek)


def compress_image(image_stream, hashsum, compress_size=None):
    from PIL import Image

    image_stream.seek(0)
    if isinstance(image_stream, BytesIO):
        min_size = len(image_stream.getvalue())
    else:
        min_size = len(image_stream.read())
        image_stream.seek(0)

    # Если сжимать совсем нет смысла
    if min_size <= 4096:
        return image_stream, hashsum, None

    try:
        image = Image.open(image_stream)
    except:
        raise BadImageError('Cannot decode image')

    # Если сжимать не умеем
    if image.format not in ('PNG', 'JPEG'):
        image_stream.seek(0)
        return image_stream, hashsum, None

    # TODO: придумать, как защититься от вандализма загрузкой смайлов
    # по урлу с неадекватным изменением размера, и уже тогда включить
    # FIXME: слетает альфа-канал на PNG RGBA
    # if image.format == 'JPEG' or image.mode == 'RGB':
    #     if compress_size and compress_size[0] * compress_size[1] < image.size[0] * image.size[1]:
    #         image2 = image.resize(compress_size, Image.ANTIALIAS)
    #         image2.format = image.format
    #         image = image2
    #         del image2

    # Над не-PNG не работаем
    if image.format != 'PNG':
        test_stream = BytesIO()
        image.save(test_stream, image.format, quality=94, optimize=True)
        if min_size - len(test_stream.getvalue()) > 1024:
            new_hashsum = sha256(test_stream.getvalue()).hexdigest()
            test_stream.seek(0)
            return test_stream, new_hashsum, 'resave'
        else:
            image_stream.seek(0)
            return image_stream, hashsum, None

    # А PNG пробуем сжать разными методами
    test_stream, method = compress_png(image)

    # Сохраняем сжатие, только если оно существенно
    if test_stream and min_size - len(test_stream.getvalue()) > 1024:
        new_hashsum = sha256(test_stream.getvalue()).hexdigest()
        test_stream.seek(0)
        return test_stream, new_hashsum, method
    else:
        image_stream.seek(0)
        return image_stream, hashsum, None


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
        test_image = image.copy()
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

    return min_stream, method


def upload(image_stream=None, url=None, hashsum=None, disable_url_upload=False, image_format=None, compress=False, compress_size=None):
    """Загружает смайлик согласно настройкам и переданным аргументам.
    Возвращает словарь, содержащий filename (для SMILE_URL), url (для custom_url при необходимости), hashsum
    (может не совпадать с входным аргументом при включенном сжатии) и compression_method.

    * Если не передать image_stream, он будет автоматически получен из url. А если передать, то url необязателен.
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
    if not image_stream or not hashsum:
        image_stream, hashsum = get_stream_and_hashsum(image_stream, url)

    if not image_format:
        image_format = check_image_format(image_stream)

    if url and not compress and (disable_url_upload or not current_app.config['UPLOAD_METHOD'] or current_app.config['ALLOW_CUSTOM_URLS']):
        if '?' in url or url.endswith('/'):
            return {'filename': 'image', 'url': url, 'hashsum': hashsum, 'compression_method': None}
        else:
            return {'filename': url[url.rfind('/') + 1:], 'url': url, 'hashsum': hashsum, 'compression_method': None}

    if compress and current_app.config['UPLOAD_METHOD'] and current_app.config['COMPRESSION']:
        image_stream, hashsum, compression_method = compress_image(image_stream, hashsum, compress_size=compress_size)
    else:
        compression_method = None

    if current_app.config['UPLOAD_METHOD'] == 'imgur':
        result = upload_to_imgur(image_stream, hashsum)
        result['compression_method'] = compression_method
        return result
    elif current_app.config['UPLOAD_METHOD'] == 'directory':
        result = upload_to_directory(image_stream, hashsum, image_format)
        result['compression_method'] = compression_method
        return result
    else:
        raise RuntimeError('Unknown upload method setted in settings')


def upload_to_imgur(image_stream, hashsum):
    image_data = current_app.imgur.send_image(image_stream)
    if not image_data.get('success'):
        current_app.logger.error('Cannot upload image: %s', image_data)
        raise IOError('Cannot upload image')

    link = image_data['data']['link']
    data = download(link)
    new_hashsum = sha256(data).hexdigest()
    return {'filename': link[link.rfind('/') + 1:], 'url': link, 'hashsum': new_hashsum}


def upload_to_directory(image_stream, hashsum, image_format=None):
    upload_dir = current_app.config['SMILES_DIRECTORY']
    data = image_stream.read()

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
