#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os


class Config(object):
    DEBUG = False
    TESTING = False
    SECRET_KEY = '43h9r7fhfdiu259fch106bxmlk23d7s'
    DATABASE_ENGINE = 'sqlite'
    DATABASE = {
        'host': os.path.join(os.getcwd(), 'database.sqlite3'),
        'create_db': True
    }
    JSON_AS_ASCII = False
    SMILE_URL = 'http://smiles.smile-o-pack.net/{filename}'
    ICON_URL = 'https://andreymal.org/files/ava.png'
    MEMCACHE_SERVERS = ['127.0.0.1:11211']
    CACHE_PREFIX = 'smp_'

    BABEL_DEFAULT_LOCALE = 'ru'
    BABEL_DEFAULT_TIMEZONE = 'Europe/Moscow'

    API_ORIGIN = None
    API_ALLOW_CREDENTIALS = False


class Development(Config):
    DEBUG = True
    API_ORIGIN = 'http://localhost'
    API_ALLOW_CREDENTIALS = True
