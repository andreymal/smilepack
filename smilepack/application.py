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

        if app.config['USE_BUNDLER']:
            from .views.bundler import bundle as bp_bundle
            from .bundler import get_bundle_url
            app.register_blueprint(bp_bundle, url_prefix='/bundle')
            app.jinja_env.globals.update(get_bundle_url=get_bundle_url)

    app.babel = Babel(app)

    return app
