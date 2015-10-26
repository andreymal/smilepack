#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from smilepack import settings


class Local(settings.Development):
    DATABASE_ENGINE = 'mysql'
    DATABASE = {
        'host': '127.0.0.1',
        'port': 3306,
        'user': 'smilepack',
        'passwd': '123456',
        'db': 'smilepack',
    }

    RATELIMIT_ENABLED = True  # требует memcached

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

    UPLOAD_METHOD = 'directory'
    SMILES_DIRECTORY = '/path/to/project/smilepack/media/smiles/'
    # IMGUR_ID = '538bd2a48c13f9e'  # для метода imgur
