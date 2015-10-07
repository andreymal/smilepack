#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# for debug=True
import sys
if '' not in sys.path:
    sys.path.insert(0, '')

from flask.ext.script import Manager

from smilepack import application

manager = Manager(application.create_app())


@manager.command
def bundle():
    if not manager.app.config['USE_BUNDLER']:
        print('Bundler is disabled.')
        return

    from smilepack.bundler import bundle_app
    bundle_app(manager.app, verbose=True)


@manager.command
def shell():
    import code
    import smilepack
    with smilepack.db.db_session:
        code.interact(local={'smilepack': smilepack, 'app': manager.app})


@manager.option('-h', '--host', dest='host', help='Server host (default 127.0.0.1)')
@manager.option('-p', '--port', dest='port', help='Server port (default 5000)')
def runserver(host, port):
    manager.app.run(host=host, port=int(port) if port is not None else None)


if __name__ == '__main__':
    manager.run()
