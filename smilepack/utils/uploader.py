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


class Uploader(object):
    def __init__(self, method, directory, maxbytes, minres, maxres, processing_mode, dirmode=0o755, filemode=0o644):
        '''Параметры загрузки:
        * method — None, 'imgur' или 'directory' — куда сохранять картинку (None означает отсутствие сохранения и требует url)
        * directory — каталог, в который будет сохранена картинка, для метода directory
        * maxbytes — максимальный размер картинки в байтах
        * minres — (длина, ширина) — минимальное разрешение картинки
        * maxres — (длина, ширина) — максимальное разрешение картинки
        * processing_mode — режим обработки картинки:
          - 'none' — не делать ничего, разрешние не проверяется и сжатие не делается
          - 'optional' — при отсутствии Pillow ничего не будет делаться
          - 'required' — при отсутствии Pillow будет выброшено исключение
        '''
        if method and method not in ('imgur', 'directory'):
            raise RuntimeError('Unknown upload method setted in settings')
        self.method = method
        self.directory = directory
        self.maxbytes = maxbytes
        self.minres = minres
        self.maxres = maxres
        if processing_mode not in ('none', 'required', 'optional'):
            raise ValueError('Invalid processing_mode')
        self.processing_mode = processing_mode
        self.dirmode = dirmode
        self.filemode = filemode

    def upload(self, data=None, url=None, compress=False, hashsum=None, image_format=None):
        '''Проверяет, обрабатывает и сохраняет картинку согласно параметрам.
        Если передать url, то при отсутствии изменений у картинки она пересохранена не будет.
        Если передать image_format (JPEG/PNG/GIF), то не будет проверяться валидность картинки.
        '''
        if data is None:
            data = get_data(None, url, self.maxbytes)

        if len(data) > self.maxbytes:
            raise BadImageError('Too big image size')

        if not hashsum:
            hashsum = calc_hashsum(data)

        image = None

        # Если нас просят обрабатывать картинку, проверяем её валидность
        if self.processing_mode != 'none':
            if not image_format:
                image, image_format = self.open_and_check(data, image_format)

        # Обработка картинки
        compression_method = None
        try:
            # Если нас просили её сжимать, сжимаем
            if  self.method and self.processing_mode != 'none':
                if compress:
                    data, compression_method = compress_image(data, image=image, optional=self.processing_mode == 'optional')
                    if compression_method:
                        hashsum = calc_hashsum(data)
        finally:
            if image:
                image.close()
                image = None

        # Если нам дали ссылку и картинку не сжали или мы не можем сохранять у себя, то больше ничего и не надо
        if url and not compression_method:
            if '?' in url or url.endswith('/'):
                return {'filename': 'image', 'url': url, 'hashsum': hashsum, 'compression_method': None}
            else:
                return {'filename': url[url.rfind('/') + 1:], 'url': url, 'hashsum': hashsum, 'compression_method': None}

        # Если картинку сохранять оказалось надо, а мы не можем, то облом
        if not self.method:
            raise RuntimeError('Uploading is not available')

        # Сохраняем
        if self.method == 'imgur':
            result = upload_to_imgur(data, hashsum)
        elif self.method == 'directory':
            result = upload_to_directory(
                self.directory,
                data,
                hashsum,
                image_format=image_format,
                dirmode=self.dirmode,
                filemode=self.filemode
            )
        else:
            raise NotImplementedError

        result['compression_method'] = compression_method
        return result

    def open_and_check(self, data, image_format=None):
        try:
            from PIL import Image
        except ImportError:
            if self.processing_mode == 'required':
                raise

            if data.startswith(b'\xff\xd8\xff\xe0'):
                image_format = 'JPEG'
            elif data.startswith(b'GIF8'):
                image_format = 'GIF'
            elif data.startswith(b'\x89PNG\r\n\x1a\n'):
                image_format = 'PNG'
            elif not image_format:
                raise BadImageError('image_format missing')

            return None, image_format

        try:
            image = Image.open(BytesIO(data))
        except:
            raise BadImageError('Cannot decode image')

        try:
            if image.format not in ('JPEG', 'GIF', 'PNG'):
                raise BadImageError('Invalid image format')

            w, h = image.size
            if w < self.minres[0] or h < self.minres[1]:
                raise BadImageError('Too small size')
            if w > self.maxres[0] or h > self.maxres[1]:
                raise BadImageError('Too big size')

            return image, image.format
        except:
            image.close()
            image = None
            raise


def download(url, maxlen=None, timeout=10, chunksize=16384):
    if not url.startswith('http://') and not url.startswith('https://'):
        raise IOError('Invalid URL protocol')

    req = Request(url)
    req.add_header('User-Agent', 'smilepack/0.2.0')
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


def get_data(stream=None, url=None, maxbytes=None):
    if not stream and not url or stream and url:
        raise ValueError('Please set stream or url')

    if stream and maxbytes is not None:
        data = stream.read(maxbytes + 1)
    elif stream:
        data = stream.read()
    else:
        data = download(url, maxbytes)
    if maxbytes is not None and len(data) > maxbytes:
        raise IOError('Too long response')

    return data


def compress_image(data, image=None, optional=False, compress_size=None):
    min_size = len(data)

    # Если сжимать совсем нет смысла
    if min_size <= 4096:
        return data, None

    image_local = False
    if not image:
        image_local = True
        try:
            from PIL import Image
        except ImportError:
            if not optional:
                raise
            return data, None
        try:
            image = Image.open(BytesIO(data))
        except:
            raise BadImageError('Cannot decode image')

    try:
        # Если сжимать не умеем
        if image.format != 'PNG':
            return data, None

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
        return test_data, method
    else:
        return data, None


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


def upload_to_imgur(data, hashsum):
    image_data = current_app.imgur.send_image(BytesIO(data))
    if not image_data.get('success'):
        current_app.logger.error('Cannot upload image: %s', image_data)
        raise IOError('Cannot upload image')

    link = image_data['data']['link']
    new_hashsum = calc_hashsum(download(link))  # Imgur имеет свойство пережимать большие картинки
    return {'filename': link[link.rfind('/') + 1:], 'url': link, 'hashsum': new_hashsum}


def upload_to_directory(upload_dir, data, hashsum, image_format=None, dirmode=0o755, filemode=0o644):
    if dirmode < 0 or dirmode > 0o777:
        raise ValueError('Invalid dirmode')
    if filemode < 0 or filemode > 0o777:
        raise ValueError('Invalid filemode')

    subdir = os.path.join(hashsum[:2], hashsum[2:4])
    filename = hashsum[4:10]
    if image_format == 'PNG':
        filename += '.png'
    elif image_format == 'JPEG':
        filename += '.jpg'
    elif image_format == 'GIF':
        filename += '.gif'
    else:
        current_app.logger.error('Saved image %s.wtf with unknown format %s', os.path.join(subdir, filename), image_format)
        filename += '.wtf'

    full_filename = os.path.join(subdir, filename)  # ab/cd/ef0123.ext
    upload_dir = os.path.join(upload_dir, subdir)  # /path/to/smiles/

    os.makedirs(upload_dir, mode=dirmode, exist_ok=True)

    full_path = os.path.join(upload_dir, filename)  # /path/to/smiles/ab/cd/ef0123.ext
    with open(full_path, 'wb') as fp:
        fp.write(data)
    os.chmod(full_path, filemode)
    return {'filename': full_filename.replace(os.path.sep, '/'), 'url': None, 'hashsum': hashsum}
