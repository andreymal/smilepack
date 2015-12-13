# -*- coding: utf-8 -*-

import os
import re
import logging


class Config(object):
    LOCALES = {
        'en': 'English',
        'ru': 'Русский',
    }
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

    ADMINS = []
    ERROR_EMAIL_FROM = 'smilepack@localhost.com',
    ERROR_EMAIL_SUBJECT = 'Smilepack error'
    ERROR_EMAIL_HANDLER_PARAMS = {'mailhost': '127.0.0.1'}

    RATELIMIT_ENABLED = False
    RATELIMIT_STORAGE_URL = 'memcached://127.0.0.1:11211'
    RATELIMIT_GLOBAL = '9/3second'

    BABEL_DEFAULT_LOCALE = 'ru'
    BABEL_DEFAULT_TIMEZONE = 'Europe/Moscow'

    API_ORIGINS = ['*']
    API_ALLOW_CREDENTIALS_FOR = []

    SYMBOLS_FOR_HID = '0123456789abcdefghijklmnopqrstuvwxyz'
    HID_LENGTH = 6
    MAX_LIFETIME = 0
    ALLOW_LIFETIME_SELECT = True

    SMILE_URL = '/smiles/images/{filename}'
    ICON_URL = '/smiles/images/{filename}'

    URL_PARSER_REGEX = [
        {
            're': re.compile(r'//smiles\.smile-o-pack\.net/(?P<id>[0-9]+)\.gif((\?)|($))', re.I),
        },
        {
            're': re.compile(r'//localhost\:5000/smiles/images/(?P<filename>[^\?]+)((\?)|($))', re.I),
        }
    ]

    UPLOAD_METHOD = None
    COMPRESSION = True
    FORCE_COMPRESSION = False
    SMILES_DIRECTORY = None
    IMGUR_ID = None

    ALLOW_CUSTOM_URLS = True
    MIN_SMILE_SIZE = (4, 4)
    MAX_SMILE_SIZE = (1024, 1024)

    ISSUE_REPORT_LINK = None


class Development(Config):
    DEBUG = True
    API_ORIGINS = ['http://localhost']
    API_ALLOW_CREDENTIALS_FOR = ['*']
    SQL_DEBUG = True
    RATELIMIT_HEADERS_ENABLED = True
