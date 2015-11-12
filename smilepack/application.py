# -*- coding: utf-8 -*-

import os
import sys
import logging
from logging.handlers import SMTPHandler

from flask import Flask, send_from_directory, request, g
from flask_limiter import Limiter
from flask_webpack import Webpack
import flask_babel

from werkzeug.contrib import cache
from werkzeug.contrib.fixers import ProxyFix

from smilepack import database
from smilepack.views import smiles, smilepacks, pages, utils
from smilepack.bl import init_bl

__all__ = ['create_app']

here = os.path.abspath(os.path.dirname(__file__))


def create_app():
    app = Flask(__name__)
    webpack = Webpack()
    app.config.from_object(os.environ.get('SMILEPACK_SETTINGS', 'smilepack.settings.Development'))
    app.config["WEBPACK_MANIFEST_PATH"] = os.path.join(here, "manifest.json")
    webpack.init_app(app)
    database.configure_for_app(app, db_seed=True)
    init_bl()

    babel = flask_babel.Babel(app)

    @babel.localeselector
    def get_locale():
        locales = app.config['LOCALES'].keys()
        locale = request.cookies.get('locale')
        if locale in locales:
            return locale
        return request.accept_languages.best_match(locales)

    @app.before_request
    def before_request():
        g.locale = flask_babel.get_locale()

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

    app.register_blueprint(pages.bp)
    app.register_blueprint(smiles.bp, url_prefix='/smiles')
    app.register_blueprint(smilepacks.bp, url_prefix='/smilepack')

    utils.register_errorhandlers(app)
    utils.disable_cache(app)

    if app.config.get('MEMCACHE_SERVERS'):
        app.cache = cache.MemcachedCache(app.config['MEMCACHE_SERVERS'], key_prefix=app.config.get('CACHE_PREFIX', ''))
    else:
        app.cache = cache.NullCache()

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

    return app
