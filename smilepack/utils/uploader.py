#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
from io import BytesIO
from hashlib import sha256
from urllib.request import urlopen, Request

from flask import current_app


def get_stream_and_hashsum(image_stream=None, url=None):
    if not image_stream and not url or image_stream and url:
        raise ValueError('Please set image_stream or url')

    if not image_stream:
        req = Request(url)
        req.add_header('User-Agent', 'smilepack/0.0')
        image_stream = BytesIO(urlopen(req, timeout=10).read(current_app.config['MAX_CONTENT_LENGTH']))  # seek is unsupported for HTTPResponse

    hashsum = sha256(image_stream.read()).hexdigest()
    image_stream.seek(0)

    return image_stream, hashsum


def check_image_format(image_stream):
    from PIL import Image

    old_seek = image_stream.tell()

    try:
        image = Image.open(image_stream)
    except:
        raise ValueError('Cannot decode image')
    else:
        if image.format not in ('JPEG', 'GIF', 'PNG'):
            raise ValueError('Invalid image format')

        w, h = image.size
        min_size = current_app.config['MIN_SMILE_SIZE']
        max_size = current_app.config['MAX_SMILE_SIZE']
        if w < min_size[0] or h < min_size[1]:
            raise ValueError('Too small size')
        if w > max_size[0] or h > max_size[1]:
            raise ValueError('Too big size')

        return image.format
    finally:
        image_stream.seek(old_seek)


def upload(image_stream=None, url=None, hashsum=None, disable_url_upload=False, image_format=None):
    if not image_stream or not hashsum:
        image_stream, hashsum = get_stream_and_hashsum(image_stream, url)

    if url and (disable_url_upload or not current_app.config['UPLOAD_METHOD'] or current_app.config['ALLOW_CUSTOM_URLS']):
        if '?' in url or url.endswith('/'):
            return {'filename': 'image', 'url': url, 'hashsum': hashsum}
        else:
            return {'filename': url[url.rfind('/') + 1:], 'url': url, 'hashsum': hashsum}

    if current_app.config['UPLOAD_METHOD'] == 'imgur':
        return upload_to_imgur(image_stream, hashsum)
    elif current_app.config['UPLOAD_METHOD'] == 'directory':
        return upload_to_directory(image_stream, hashsum, image_format)
    else:
        raise RuntimeError('Unknown upload method setted in settings')


def upload_to_imgur(image_stream, hashsum):
    image_data = current_app.imgur.send_image(image_stream)
    if not image_data.get('success'):
        current_app.logger.error('Cannot upload image: %s', image_data)
        raise IOError('Cannot upload image')

    link = image_data['data']['link']
    return {'filename': link[link.rfind('/') + 1:], 'url': link, 'hashsum': hashsum}


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
