#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import logging

from flask import Flask
from flask_limiter import Limiter
from flask.ext.babel import Babel
from werkzeug.contrib import cache
from werkzeug.contrib.fixers import ProxyFix

from . import db


__all__ = ['create_app']


def create_app(minimal=False):
    app = Flask(__name__)
    app.env = os.getenv('SMILEPACK_SETTINGS', None) or 'smilepack.settings.Development'
    app.config.from_object(app.env)
    db.configure_for_app(app)

    app.limiter = Limiter(app)
    app.logger.setLevel(app.config['LOGGER_LEVEL'])
    if not app.debug and app.config['LOGGER_STDERR']:
        app.logger.addHandler(logging.StreamHandler(sys.stderr))

    if app.config['UPLOAD_METHOD'] == 'imgur':
        try:
            from flask_imgur import Imgur
        except ImportError:
            from flask_imgur.flask_imgur import Imgur  # https://github.com/exaroth/flask-imgur/issues/2
        app.imgur = Imgur(app)
    else:
        app.imgur = None

    if not minimal:
        from . import views
        from .views import utils

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

        if app.config['PROXIES_COUNT'] > 0:
            app.wsgi_app = ProxyFix(app.wsgi_app, app.config['PROXIES_COUNT'])

    app.babel = Babel(app)

    return app
