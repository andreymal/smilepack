#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import random
from datetime import datetime, timedelta

from pony import orm
from flask import url_for
from flask_babel import format_timedelta

from smilepack.database import db
from smilepack import models


class ANSI:
    RESET = '\x1b[0m'
    BOLD = '\x1b[1m'
    RED = "\x1b[31m"
    GREEN = "\x1b[32m"
    YELLOW = "\x1b[33m"
    BLUE = "\x1b[34m"
    MAGENTA = "\x1b[35m"
    CYAN = "\x1b[36m"


def system_status(app):
    items = [
        {'key': 'python', 'name': 'Python', 'value': sys.version.replace('\n', ' '), 'status': 'ok'},
        {'key': 'env', 'name': 'Environment', 'value': os.getenv('SMILEPACK_SETTINGS') or 'default', 'status': 'ok'},
        {'key': 'db', 'name': 'DB Provider', 'value': str(db.provider), 'status': 'ok'},
    ]
    rv = 'enabled ({})'.format(app.config['RATELIMIT_GLOBAL']) if app.config['RATELIMIT_ENABLED'] else 'disabled'
    items.append({'key': 'ratelimit', 'name': 'Ratelimit', 'value': rv, 'status': 'ok'})

    item = {'key': 'sysencoding', 'name': 'Default encoding'}
    if sys.getdefaultencoding().lower() == 'utf-8':
        item['status'] = 'ok'
        item['value'] = sys.getdefaultencoding()
    else:
        item['status'] = 'warn'
        item['value'] = sys.getdefaultencoding() + ' (smilepack tested only with UTF-8)'
    items.append(item)

    item = {'key': 'stdoutencoding', 'name': 'stdout encoding'}
    if sys.stdout.encoding.lower() == 'utf-8':
        item['status'] = 'ok'
        item['value'] = sys.stdout.encoding
    else:
        item['status'] = 'warn'
        item['value'] = sys.stdout.encoding + ' (smilepack tested only with UTF-8)'
    items.append(item)

    return items


def project_status(app):
    items = []

    items.append({'key': 'cache', 'name': 'Cache', 'value': str(app.cache), 'status': 'ok'})
    k = ''.join(random.choice('abcdefghijklmnopqrstuvwxyz') for _ in range(10))
    app.cache.set('test_smilepack_status', k, timeout=30)
    if app.cache.get('test_smilepack_status') == k:
        items.append({'key': 'cache_working', 'name': 'Cache working', 'value': 'yes', 'status': 'ok'})
    else:
        items.append({'key': 'cache_working', 'name': 'Cache working', 'value': 'no', 'status': 'warn'})

    return items


def smilepacks_status(app):
    items = []
    with orm.db_session:
        items.append({'key': 'count', 'name': 'Count', 'value': str(models.SmilePack.select().count()), 'status': 'ok'})
        items.append({'key': 'count-non-expired', 'name': 'Non-expired', 'value': str(models.SmilePack.select(lambda x: x.delete_at is not None and x.delete_at > datetime.utcnow()).count()), 'status': 'ok'})
        items.append({'key': 'count-immortals', 'name': 'Immortals', 'value': str(models.SmilePack.select(lambda x: x.delete_at is None).count()), 'status': 'ok'})

        last_smp = models.SmilePack.select().order_by(models.SmilePack.id.desc()).first()
        if last_smp:
            items.append({'key': 'last_smp', 'name': 'Last', 'value': str(last_smp.hid) + ', ' + str(last_smp.created_at), 'status': 'ok'})
        else:
            items.append({'key': 'last_smp', 'name': 'Last', 'value': 'none', 'status': 'ok'})

        test_smp = models.SmilePack.bl.create('00', [], [], validate=False)
        items.append({'key': 'sample_url', 'name': 'Sample URL', 'value': url_for('pages.generator', smp_id=test_smp.hid), 'status': 'ok'})
        test_smp.delete()

        db.rollback()

    item = {'key': 'max_lifetime', 'name': 'Max lifetime', 'value': 'unlimited', 'status': 'ok'}
    if not isinstance(app.config['MAX_LIFETIME'], int):
        item['status'] = ['fail']
        item['value'] = 'invalid value'
    elif app.config['MAX_LIFETIME'] != 0:
        if app.config['MAX_LIFETIME'] < 0:
            item['status'] = 'fail'
        elif app.config['MAX_LIFETIME'] < 30:
            item['status'] = 'warn'
        item['value'] = '{} ({})'.format(
            format_timedelta(timedelta(0, app.config['MAX_LIFETIME'])),
            app.config['MAX_LIFETIME']
        )
    items.append(item)

    return items


def smiles_status(app):
    items = []
    with orm.db_session:
        items.append({'key': 'count', 'name': 'Count', 'value': str(models.Smile.select().count()), 'status': 'ok'})
        items.append({'key': 'collection_count', 'name': 'In collection', 'value': str(models.Smile.select(lambda x: x.category is not None).count()), 'status': 'ok'})
        items.append({'key': 'user_count', 'name': 'User smiles', 'value': str(models.Smile.select(lambda x: x.user_cookie is not None).count()), 'status': 'ok'})
        items.append({'key': 'nohash_count', 'name': 'Without hashsums', 'value': str(models.Smile.select(lambda x: not x.hashsum).count()), 'status': 'ok'})

        item = {'key': 'duplicates_count', 'name': 'Duplicates', 'value': '0', 'status': 'ok'}
        duplicates = orm.select((x.hashsum, orm.count(x.id)) for x in models.Smile if x.hashsum and orm.count(x.id) > 1)[:]
        if duplicates:
            item['status'] = 'warn'
            cnt = sum(x[1] for x in duplicates)
            item['value'] = '{} (unique {})'.format(cnt, len(duplicates))
        items.append(item)

        last_sm = models.Smile.select().order_by(models.Smile.id.desc()).first()
        if last_sm:
            items.append({'key': 'last_sm', 'name': 'Last', 'value': str(last_sm.id) + ', ' + str(last_sm.created_at) + ', ' + last_sm.url, 'status': 'ok'})
        else:
            items.append({'key': 'last_sm', 'name': 'Last', 'value': 'none', 'status': 'ok'})

        db.rollback()

    item = {'key': 'uploading', 'name': 'Uploading', 'value': 'disabled', 'status': 'ok'}
    if app.config['UPLOAD_METHOD'] in ('directory', 'imgur'):
        item['value'] = app.config['UPLOAD_METHOD']
    elif app.config['UPLOAD_METHOD'] is not None:
        item['status'] = 'fail'
        item['value'] = 'invalid'
    items.append(item)

    item = {'key': 'smiles_dir', 'name': 'Smiles dir', 'value': 'not set', 'status': 'ok'}
    if app.config['SMILES_DIRECTORY'] is not None:
        abs_dir = os.path.abspath(app.config['SMILES_DIRECTORY'])
        if not os.path.isdir(abs_dir):
            item['status'] = 'fail' if app.config['UPLOAD_METHOD'] == 'directory' else 'ok'
            item['value'] = abs_dir + ' (not found)'
        elif not os.access(abs_dir, os.W_OK) or not os.access(abs_dir, os.R_OK):
            item['status'] = 'fail' if app.config['UPLOAD_METHOD'] == 'directory' else 'ok'
            item['value'] = abs_dir + ' (permission denied)'
        else:
            item['value'] = abs_dir

    elif app.config['UPLOAD_METHOD'] == 'directory':
        item['status'] = 'fail'

    items.append(item)

    return items


def status(app):
    return [
        {'key': 'system', 'name': 'System information', 'items': system_status(app)},
        {'key': 'project', 'name': 'Project configuration', 'items': project_status(app)},
        {'key': 'smilepacks', 'name': 'Smilepacks', 'items': smilepacks_status(app)},
        {'key': 'smiles', 'name': 'Smiles', 'items': smiles_status(app)},
    ]


def print_status(app, colored=True):
    if colored:
        c = lambda x, t: getattr(ANSI, x) + t + ANSI.RESET
    else:
        c = lambda x, t: t

    p_title = lambda x: print(c('YELLOW', x))
    p_item = lambda n, v: print((n + ':').ljust(17) + ' ' + v)

    if colored:
        print(ANSI.YELLOW + ANSI.BOLD + 'Smilepack' + ANSI.RESET)
    else:
        print('Smilepack')

    info = status(app)

    for category in info:
        print()
        p_title(category['name'])
        for item in category['items']:
            if item['status'] == 'ok':
                p_item(item['name'], item['value'])
            elif item['status'] == 'fail':
                p_item(item['name'], c('RED', item['value']))
            else:
                p_item(item['name'], c('YELLOW', item['value']))
