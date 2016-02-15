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
