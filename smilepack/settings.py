#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import re
import logging


class Config(object):
    DEBUG = False
    TESTING = False
    SECRET_KEY = '43h9r7fhfdiu259fch106bxmlk23d7s'
    DATABASE_ENGINE = 'sqlite'
    DATABASE = {
        'filename': os.path.join(os.getcwd(), 'database.sqlite3'),
        'create_db': True
    }
    SQL_DEBUG = False
    JSON_AS_ASCII = False
    MEMCACHE_SERVERS = ['127.0.0.1:11211']
    CACHE_PREFIX = 'smp_'
    MAX_CONTENT_LENGTH = 4 * 1024 * 1024
    PROXIES_COUNT = 0
    LOGGER_LEVEL = logging.INFO
    LOGGER_STDERR = True

    RATELIMIT_STORAGE_URL = 'memcached://127.0.0.1:11211'
    RATELIMIT_GLOBAL = '9/3second'

    USE_BUNDLER = False
    BUNDLE_PATH = os.path.join(os.getcwd(), 'media', 'bundle')
    BUNDLES = {
        'generator': {
            'type': 'js',
            'files': ['js/dragdrop.js', 'js/widgets.js', 'js/dialogs.js', 'js/smp_ajax.js', 'js/generator.js', 'js/generator_dialogs.js'],
            'output': 'generator.js'
        }
    }

    BABEL_DEFAULT_LOCALE = 'ru'
    BABEL_DEFAULT_TIMEZONE = 'Europe/Moscow'

    API_ORIGIN = None
    API_ALLOW_CREDENTIALS = False

    SYMBOLS_FOR_HID = '0123456789abcdefghijklmnopqrstuvwxyz'
    HID_LENGTH = 6
    MAX_LIFETIME = 3600 * 7 * 24

    SMILE_URL = 'http://smiles.smile-o-pack.net/{filename}'
    ICON_URL = 'https://andreymal.org/files/ava.png'
    URL_PARSER_REGEX = [
        {
            're': re.compile(r'//smiles\.smile-o-pack\.net/(?P<id>[0-9]+)\.gif((\?)|($))', re.I),
        }
    ]


class Development(Config):
    DEBUG = True
    API_ORIGIN = 'http://localhost'
    API_ALLOW_CREDENTIALS = True
    SQL_DEBUG = True
    RATELIMIT_HEADERS_ENABLED = True
