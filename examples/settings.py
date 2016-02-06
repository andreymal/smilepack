# -*- coding: utf-8 -*-
"""
Configuration file for Smilepack
Place it in /opt/smile/settings.py
"""

import re
from smilepack import settings


class Production(settings.Config):
    DATABASE_ENGINE = 'mysql'
    DATABASE = {
        'host': '127.0.0.1',
        'port': 3306,
        'user': 'smilepack',
        'passwd': '123456',
        'db': 'smilepack',
    }

    RATELIMIT_ENABLED = True

    URL_PARSER_REGEX = [
        {
            're': re.compile(r'//my-cool-smilepack\.tk/smiles/images/(?P<filename>[^\?]+)((\?)|($))', re.I),
        }
    ]

    # API_ORIGINS = ['*']
    API_ORIGINS = ['http://my-cool-spa.com', 'http://great-friend-site.net']
    API_ALLOW_CREDENTIALS_FOR = ['*']

    MAX_LIFETIME = 3600 * 7 * 24
    # ALLOW_LIFETIME_SELECT = False

    # If you want reupload smiles to Imgur:
    # IMGUR_ID = '0123456789abcde'

    UPLOAD_METHOD = 'directory'
    SMILES_DIRECTORY = '/path/to/project/smilepack/media/smiles/'
    # also COMPRESSION = False or FORCE_COMPRESSION = True
    SMILE_PROCESSING_MODE = 'required'  # for installed Pillow

    ICON_UPLOAD_METHOD = 'directory'
    ICONS_DIRECTORY = '/path/to/project/smilepack/media/icons/'
    # also ICON_COMPRESSION = False or ICON_FORCE_COMPRESSION = True
    MAX_ICON_BYTES = 32 * 1024
    ICON_PROCESSING_MODE = 'required'  # for installed Pillow

    # Error notifications
    ADMINS = ['webmaster@my-cool-smilepack.tk']
    ERROR_EMAIL_FROM = 'smilepack@my-cool-smilepack.tk'
