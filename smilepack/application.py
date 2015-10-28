#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import logging
from logging.handlers import SMTPHandler

from flask import Flask, send_from_directory
from flask_limiter import Limiter
from flask_webpack import Webpack
from flask.ext.babel import Babel
from werkzeug.contrib import cache
from werkzeug.contrib.fixers import ProxyFix

from . import db


__all__ = ['create_app']

here = os.path.abspath(os.path.dirname(__file__))


def create_app(minimal=False):
    app = Flask(__name__)
    webpack = Webpack()
    app.config.from_object(os.getenv('SMILEPACK_SETTINGS', 'smilepack.settings.Development'))
    app.config["WEBPACK_MANIFEST_PATH"] = os.path.join(here, "manifest.json")
    webpack.init_app(app)
    db.configure_for_app(app, db_seed=True)

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
        app.jinja_env.globals.update(url_for_static=utils.url_for_static)

        if app.config.get('MEMCACHE_SERVERS'):
            app.cache = cache.MemcachedCache(app.config['MEMCACHE_SERVERS'], key_prefix=app.config.get('CACHE_PREFIX', ''))
        else:
            app.cache = cache.NullCache()

        if app.config['USE_BUNDLER']:
            from .views.bundler import bundle as bp_bundle
            from .bundler import get_bundle_url
            app.register_blueprint(bp_bundle, url_prefix='/bundle')
            app.jinja_env.globals.update(get_bundle_url=get_bundle_url)

        @app.route("/assets/<path:filename>")
        def send_asset(filename):
            return send_from_directory(os.path.join(here, "public"), filename)

        if app.config['PROXIES_COUNT'] > 0:
            app.wsgi_app = ProxyFix(app.wsgi_app, app.config['PROXIES_COUNT'])

        if app.config['ADMINS'] and app.config['ERROR_EMAIL_HANDLER_PARAMS']:
            params = dict(app.config['ERROR_EMAIL_HANDLER_PARAMS'])
            params['toaddrs'] = app.config['ADMINS']
            params['fromaddr'] = app.config['ERROR_EMAIL_FROM']
            params['subject'] = app.config['ERROR_EMAIL_SUBJECT']
            handler = SMTPHandler(**params)
            handler.setLevel(logging.ERROR)
            app.logger.addHandler(handler)


    app.babel = Babel(app)

    return app
