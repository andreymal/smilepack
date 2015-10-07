#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os


class Config(object):
    DEBUG = False
    TESTING = False
    SECRET_KEY = '43h9r7fhfdiu259fch106bxmlk23d7s'
    DATABASE_ENGINE = 'sqlite'
    DATABASE = {
        'filename': os.path.join(os.getcwd(), 'database.sqlite3'),
        'create_db': True
    }
    JSON_AS_ASCII = False
    MEMCACHE_SERVERS = ['127.0.0.1:11211']
    CACHE_PREFIX = 'smp_'

    USE_BUNDLER = False
    BUNDLE_PATH = os.path.join(os.getcwd(), 'media', 'bundle')
    BUNDLES = {
        'generator': {
            'type': 'js',
            'files': ['dragdrop.js', 'widgets.js', 'dialogs.js', 'smp_ajax.js', 'generator.js'],
            'output': 'generator.js'
        }
    }

    BABEL_DEFAULT_LOCALE = 'ru'
    BABEL_DEFAULT_TIMEZONE = 'Europe/Moscow'

    API_ORIGIN = None
    API_ALLOW_CREDENTIALS = False

    SYMBOLS_FOR_HID = '0123456789abcdefghijklmnopqrstuvwxyz'
    HID_LENGTH = 6
    SMILE_URL = 'http://smiles.smile-o-pack.net/{filename}'
    ICON_URL = 'https://andreymal.org/files/ava.png'
    MAX_LIFETIME = 3600 * 7 * 24


class Development(Config):
    DEBUG = True
    API_ORIGIN = 'http://localhost'
    API_ALLOW_CREDENTIALS = True
