#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os

from flask import Flask
from flask.ext.babel import Babel
from werkzeug.contrib import cache

from .models import db


__all__ = ['create_app']


def create_app(minimal=False):
    app = Flask(__name__)
    # FIXME: not working with DEBUG=True
    app.config.from_object(os.getenv('SMILEPACK_SETTINGS', 'smilepack.settings.Development'))

    db.bind(
        app.config['DATABASE_ENGINE'],
        **app.config['DATABASE']
    )
    db.generate_mapping(create_tables=True)

    if not minimal:
        from . import views, utils

        app.register_blueprint(views.bp_pages)
        app.register_blueprint(views.bp_smiles, url_prefix='/smiles')
        app.register_blueprint(views.bp_smilepacks, url_prefix='/smilepack')

        utils.register_errorhandlers(app)
        utils.disable_cache(app)

        if app.config.get('MEMCACHE_SERVERS'):
            app.cache = cache.MemcachedCache(app.config['MEMCACHE_SERVERS'], key_prefix=app.config.get('CACHE_PREFIX', ''))
        else:
            app.cache = cache.NullCache()

    app.babel = Babel(app)

    return app


if __name__ == "__main__":
    a = create_app()
    a.run(host=a.config.get('HOST', '127.0.0.1'))
