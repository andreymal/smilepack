#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys

from pony import orm
from pony.orm import db_session

from flask_script import Manager
from smilepack import application

manager = Manager(application.create_app())


@manager.command
def shell():
    import code
    import smilepack
    with db_session:
        code.interact(local={'smilepack': smilepack, 'app': manager.app})


@manager.command
def status():
    from smilepack.utils.status import print_status
    orm.sql_debug(False)
    fails, warns = print_status(manager.app)
    if fails > 0:
        sys.exit(1)
    if warns > 0:
        sys.exit(2)


@manager.command
def rehash_custom_urls(start_id=None):
    from smilepack.utils import urls
    orm.sql_debug(False)
    with db_session:
        urls.rehash_custom_smiles(start_id)


@manager.option('-s', '--store', dest='store', help='Path to hashsums store with format "id sha256sum"')
def rehash_smiles(store=None):
    from smilepack.utils import smiles
    orm.sql_debug(False)
    with db_session:
        smiles.calc_hashsums_if_needed(store_path=store)


@manager.command
def recalc_counts():
    from smilepack.models import Category
    orm.sql_debug(False)
    with db_session:
        for cat in Category.select().order_by(Category.subsection, Category.order, Category.id):
            new_count = cat.select_approved_smiles().count()
            print('{} ({}): {} -> {}'.format(cat.id, cat.name, cat.smiles_count, new_count))
            cat.smiles_count = new_count


@manager.option('-t', '--type', dest='typ', help='Type of object for recalc childrens (root, section, subsection, category)')
@manager.option('-i', '--id', dest='target_id', help='ID of object for recalc childrens (only with --type) (all except root type)')
def recalc_orders(typ=None, target_id=None):
    if typ not in (None, 'root', 'section', 'subsection', 'category'):
        raise ValueError('Invalid type')
    if target_id is not None and (not typ or typ == 'root'):
        raise ValueError('ID can be used only with type')
    target_id = int(target_id) if target_id is not None else None

    from smilepack import models

    orm.sql_debug(False)

    if typ is None or typ == 'root':
        with db_session:
            for new_order, item in enumerate(models.Section.select().order_by(models.Section.order, models.Section.id)):
                print('Section {} ({}): {} -> {}'.format(item.id, item.name, item.order, new_order))
                item.order = new_order

    if typ is None or typ == 'section':
        with db_session:
            parents = models.Section.select()
            if target_id is not None:
                parents = parents.filter(lambda x: x.id == target_id)
            for parent in parents[:]:
                items = parent.subsections.select().order_by(models.SubSection.order, models.SubSection.id)
                for new_order, item in enumerate(items):
                    print('SubSection {} ({}): {} -> {}'.format(item.id, item.name, item.order, new_order))
                    item.order = new_order

    if typ is None or typ == 'subsection':
        with db_session:
            parents = models.SubSection.select()
            if target_id is not None:
                parents = parents.filter(lambda x: x.id == target_id)
            for parent in parents[:]:
                items = parent.categories.select().order_by(models.Category.order, models.Category.id)
                for new_order, item in enumerate(items):
                    print('Category {} ({}): {} -> {}'.format(item.id, item.name, item.order, new_order))
                    item.order = new_order

    if typ is None or typ == 'category':
        with db_session:
            parents = models.Category.select()
            if target_id is not None:
                parents = parents.filter(lambda x: x.id == target_id)
            for parent in parents[:]:
                items = parent.select_approved_smiles().order_by(models.Smile.order, models.Smile.id)
                for new_order, item in enumerate(items):
                    print('Smile {} ({}): {} -> {}'.format(item.id, item.filename, item.order, new_order))
                    item.order = new_order


@manager.command
def createsuperuser():
    from getpass import getpass
    import jsonschema
    from smilepack.models import User
    from smilepack.utils.exceptions import BadRequestError

    username = input('Username: ')
    while True:
        password = getpass('Password: ')
        password2 = getpass('Password again: ')
        if password == password2:
            break
        print('Passwords do not match')
    orm.sql_debug(False)
    try:
        with db_session:
            user = User.bl.create({
                'username': username,
                'password': password,
                'is_active': True,
                'is_admin': True,
                'is_superadmin': True,
            })
    except jsonschema.ValidationError as exc:
        print(exc.message)
    except BadRequestError as exc:
        print(exc)
    else:
        print('Created superuser {} (id={}), enjoy!'.format(user.username, user.id))


@manager.option('-h', '--host', dest='host', help='Server host (default 127.0.0.1)')
@manager.option('-p', '--port', dest='port', help='Server port (default 5000)', type=int)
@manager.option('-t', '--threaded', dest='threaded', help='Threaded mode', action='store_true')
def runserver(host, port=None, threaded=False):
    manager.app.run(
        host=host,
        port=port,
        threaded=threaded,
        extra_files=[manager.app.config["WEBPACK_MANIFEST_PATH"]]
    )


def run():
    manager.run()

if __name__ == "__main__":
    run()
