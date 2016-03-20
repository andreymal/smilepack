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

    item = {'key': 'compression', 'name': 'Compression', 'value': 'disabled', 'status': 'ok'}
    if app.config['COMPRESSION'] or app.config['ICON_COMPRESSION']:
        try:
            from PIL import Image
        except ImportError:
            item['status'] = 'fail'
            item['value'] = 'enabled, but Pillow is not available'
        else:
            item['value'] = 'enabled'
    items.append(item)

    item = {'key': 'processing_mode', 'name': 'Processing mode', 'value': 'None (but we recommend to enable it)', 'status': 'ok'}
    pmode = 'none'
    if app.config['SMILE_PROCESSING_MODE'] == 'required' or app.config['ICON_PROCESSING_MODE'] == 'required':
        pmode = 'required'
        item['value'] = 'Required'
    elif app.config['SMILE_PROCESSING_MODE'] == 'optional' or app.config['ICON_PROCESSING_MODE'] == 'optional':
        pmode = 'optional'
        item['value'] = 'Optional (but we recommend to require it)'

    if app.config['SMILE_PROCESSING_MODE'] not in ('required', 'optional', 'none'):
        item['status'] = 'fail'
        item['value'] = 'Invalid'
    if app.config['ICON_PROCESSING_MODE'] not in ('required', 'optional', 'none'):
        item['status'] = 'fail'
        item['value'] = 'Invalid'

    if pmode != 'none':
        try:
            from PIL import Image
        except ImportError:
            item['status'] = 'warn' if pmode == 'opional' else 'fail'
            item['value'] += ' (but Pillow is not available)'

    items.append(item)

    return items


def smilepacks_status(app):
    items = []
    with orm.db_session:
        items.append({'key': 'count', 'name': 'Count', 'value': str(models.SmilePack.select().count()), 'status': 'ok'})
        items.append({'key': 'count-non-expired', 'name': 'Non-expired', 'value': str(models.SmilePack.select(lambda x: x.delete_at is not None and x.delete_at > datetime.utcnow()).count()), 'status': 'ok'})
        items.append({'key': 'count-immortals', 'name': 'Immortals', 'value': str(models.SmilePack.select(lambda x: x.delete_at is None).count()), 'status': 'ok'})

        last_smp = models.SmilePack.select().order_by(models.SmilePack.id.desc()).first()
        if last_smp:
            items.append({'key': 'last_smp', 'name': 'Last', 'value': '{}/{}, {}'.format(last_smp.hid, last_smp.version, last_smp.created_at), 'status': 'ok'})
        else:
            items.append({'key': 'last_smp', 'name': 'Last', 'value': 'none', 'status': 'ok'})

        test_smp = models.SmilePack.bl.create({'categories': [], 'smiles': []}, '00', '::1')
        items.append({'key': 'sample_url', 'name': 'Sample URL', 'value': url_for('pages.generator', smp_hid=test_smp.hid), 'status': 'ok'})
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
        items.append({'key': 'published_count', 'name': 'Published', 'value': str(models.Smile.select(lambda x: x.category is not None and x.approved_at is not None).count()), 'status': 'ok'})
        items.append({'key': 'user_count', 'name': 'User smiles', 'value': str(models.Smile.select(lambda x: x.user_cookie is not None).count()), 'status': 'ok'})

        without_hashsums = models.Smile.select(lambda x: not x.hashsum).count()
        items.append({'key': 'nohash_count', 'name': 'Without hashsums', 'value': str(without_hashsums), 'status': 'warn' if without_hashsums > 0 else 'ok'})

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


def icons_status(app):
    items = []
    with orm.db_session:
        icons_count = models.Icon.select().count()
        if icons_count == 0 and (not app.config['ICON_UPLOAD_METHOD'] and not app.config['ALLOW_CUSTOM_URLS']):
            istatus = 'fail'
            imsg = '0 (and uploading is disabled; website will not work without icons)'
        elif icons_count == 0 and not app.config['NO_ICONS_IS_THE_NORM']:
            istatus = 'warn'
            imsg = '0 (but we strongly recommend to create it in administration page)'
        else:
            istatus = 'ok'
            imsg = str(icons_count)
        items.append({'key': 'count', 'name': 'Count', 'value': imsg, 'status': istatus})
        items.append({'key': 'published_count', 'name': 'Published', 'value': str(models.Icon.select(lambda x: x.approved_at is not None).count()), 'status': 'ok'})
        items.append({'key': 'user_count', 'name': 'User icons', 'value': str(models.Icon.select(lambda x: x.user_cookie is not None).count()), 'status': 'ok'})

        without_hashsums = models.Icon.select(lambda x: not x.hashsum).count()
        items.append({'key': 'nohash_count', 'name': 'Without hashsums', 'value': str(without_hashsums), 'status': 'warn' if without_hashsums > 0 else 'ok'})

        item = {'key': 'duplicates_count', 'name': 'Duplicates', 'value': '0', 'status': 'ok'}
        duplicates = orm.select((x.hashsum, orm.count(x.id)) for x in models.Icon if x.hashsum and orm.count(x.id) > 1)[:]
        if duplicates:
            item['status'] = 'warn'
            cnt = sum(x[1] for x in duplicates)
            item['value'] = '{} (unique {})'.format(cnt, len(duplicates))
        items.append(item)

        db.rollback()

    item = {'key': 'uploading', 'name': 'Uploading', 'value': 'disabled', 'status': 'ok'}
    if app.config['ICON_UPLOAD_METHOD'] in ('directory', 'imgur'):
        item['value'] = app.config['ICON_UPLOAD_METHOD']
    elif app.config['ICON_UPLOAD_METHOD'] is not None:
        item['status'] = 'fail'
        item['value'] = 'invalid'
    items.append(item)

    item = {'key': 'icons_dir', 'name': 'Icons dir', 'value': 'not set', 'status': 'ok'}
    if app.config['ICONS_DIRECTORY'] is not None:
        abs_dir = os.path.abspath(app.config['ICONS_DIRECTORY'])
        if not os.path.isdir(abs_dir):
            item['status'] = 'fail' if app.config['ICON_UPLOAD_METHOD'] == 'directory' else 'ok'
            item['value'] = abs_dir + ' (not found)'
        elif not os.access(abs_dir, os.W_OK) or not os.access(abs_dir, os.R_OK):
            item['status'] = 'fail' if app.config['ICON_UPLOAD_METHOD'] == 'directory' else 'ok'
            item['value'] = abs_dir + ' (permission denied)'
        else:
            item['value'] = abs_dir

    elif app.config['ICON_UPLOAD_METHOD'] == 'directory':
        item['status'] = 'fail'

    items.append(item)

    return items


def users_status(app):
    items = []
    with orm.db_session:
        last_user = models.User.select().order_by(models.User.id.desc()).first()
        if last_user:
            items.append({'key': 'last_user', 'name': 'Last', 'value': str(last_user.username) + ', ' + str(last_user.created_at), 'status': 'ok'})
        else:
            items.append({'key': 'last_user', 'name': 'Last', 'value': 'none', 'status': 'ok'})

        items.append({'key': 'count', 'name': 'Count', 'value': str(models.User.select().count()), 'status': 'ok'})
        items.append({'key': 'active_count', 'name': 'Active', 'value': str(models.User.select(lambda x: x.is_active).count()), 'status': 'ok'})
        items.append({'key': 'admins_count', 'name': 'Admins', 'value': str(models.User.select(lambda x: x.is_admin).count()), 'status': 'ok'})
        superadmins_count = models.User.select(lambda x: x.is_admin and x.is_superadmin).count()
        snoadmins_count = models.User.select(lambda x: not x.is_admin and x.is_superadmin).count()
        if superadmins_count == 0:
            items.append({'key': 'superadmins_count', 'name': 'Superadmins', 'value': "0 (you can create superadmin by 'smilepack createsuperuser')", 'status': 'warn'})
        elif snoadmins_count > 0:
            items.append({'key': 'superadmins_count', 'name': 'Superadmins', 'value': "{} (and {} superadmins are not admins, maybe fix it?)".format(superadmins_count, snoadmins_count), 'status': 'warn'})
        else:
            items.append({'key': 'superadmins_count', 'name': 'Superadmins', 'value': str(superadmins_count), 'status': 'ok'})

    return items


def status(app):
    yield {'key': 'system', 'name': 'System information', 'items': system_status(app)}
    yield {'key': 'project', 'name': 'Project configuration', 'items': project_status(app)}
    yield {'key': 'smilepacks', 'name': 'Smilepacks', 'items': smilepacks_status(app)}
    yield {'key': 'smiles', 'name': 'Smiles', 'items': smiles_status(app)}
    yield {'key': 'icons', 'name': 'Icons', 'items': icons_status(app)}
    yield {'key': 'users', 'name': 'Users', 'items': users_status(app)}


def print_status(app, colored=True):
    if colored:
        c = lambda x, t: getattr(ANSI, x) + t + ANSI.RESET
    else:
        c = lambda x, t: t

    p_title = lambda x: print(c('GREEN', x))
    p_item = lambda n, v: print((n + ':').ljust(17) + ' ' + v)

    if colored:
        print(ANSI.GREEN + ANSI.BOLD + 'Smilepack' + ANSI.RESET)
    else:
        print('Smilepack')

    fails = 0
    warns = 0
    for category in status(app):
        print()
        p_title(category['name'])
        for item in category['items']:
            if item['status'] == 'ok':
                p_item(item['name'], item['value'])
            elif item['status'] == 'fail':
                fails += 1
                p_item(item['name'], c('RED', item['value']))
            else:
                warns += 1
                p_item(item['name'], c('YELLOW', item['value']))

    if fails > 0:
        print(ANSI.RED + 'Found {} errors, please fix it before using Smilepack'.format(fails) + ANSI.RESET)
    if warns > 0:
        print(ANSI.YELLOW + 'Found {} warnings, we recommend to fix it'.format(warns) + ANSI.RESET)

    return fails, warns
