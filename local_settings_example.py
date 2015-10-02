#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from smilepack.settings import Development


class Local(Development):
    HOST = '0.0.0.0'
    DATABASE_ENGINE = 'mysql'
    DATABASE = {
        'host': '127.0.0.1',
        'port': 3306,
        'user': 'smilepack',
        'passwd': '123456',
        'db': 'smilepack',
    }
