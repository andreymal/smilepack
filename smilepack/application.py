# -*- coding: utf-8 -*-

import os
import sys
import logging
from logging.handlers import SMTPHandler

from flask import Flask, request, g
from flask_limiter import Limiter
from flask_webpack import Webpack
from flask_login import LoginManager
import flask_babel

from werkzeug.contrib import cache
from werkzeug.contrib.fixers import ProxyFix

from smilepack import models  # pylint: disable=unused-import
from smilepack import database
from smilepack.views import utils as views_utils
from smilepack.bl import init_bl

__all__ = ['create_app']

here = os.path.abspath(os.path.dirname(__file__))


def create_app():
    app = Flask(__name__)
    webpack = Webpack()
    app.config.from_object(os.environ.get('SMILEPACK_SETTINGS', 'smilepack.settings.Development'))
    app.config["WEBPACK_MANIFEST_PATH"] = os.path.join(here, "manifest.json")
    webpack.init_app(app)
    database.configure_for_app(app)
    init_bl()

    # Localization
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

    # Flask-Limiter
    app.limiter = Limiter(app)
    app.logger.setLevel(app.config['LOGGER_LEVEL'])
    if not app.debug and app.config['LOGGER_STDERR']:
        app.logger.addHandler(logging.StreamHandler(sys.stderr))

    # Login for administration
    app.login_manager = LoginManager(app)

    @app.login_manager.user_loader
    def load_user(user_id):
        from smilepack.models import User
        return User.get(id=int(user_id))

    # Uploading with Imgur
    if app.config['UPLOAD_METHOD'] == 'imgur':
        try:
            from flask_imgur import Imgur
        except ImportError:
            from flask_imgur.flask_imgur import Imgur  # https://github.com/exaroth/flask-imgur/issues/2
        app.imgur = Imgur(app)
    else:
        app.imgur = None

    if app.config.get('MEMCACHE_SERVERS'):
        app.cache = cache.MemcachedCache(app.config['MEMCACHE_SERVERS'], key_prefix=app.config.get('CACHE_PREFIX', ''))
    else:
        app.cache = cache.NullCache()

    # Pass proxies for correct request_addr
    if app.config['PROXIES_COUNT'] > 0:
        app.wsgi_app = ProxyFix(app.wsgi_app, app.config['PROXIES_COUNT'])

    if app.config['X_RUNTIME_HEADER']:
        old_app = app.wsgi_app

        def timer_middleware(environ, start_response):
            import time

            def custom_start_response(status, headers):
                headers = list(headers) + [('X-Runtime', '{:.3f}'.format(time.time() - tm))]
                start_response(status, headers)

            tm = time.time()
            return old_app(environ, custom_start_response)
        app.wsgi_app = timer_middleware

    # Errors processing
    if app.config['ADMINS'] and app.config['ERROR_EMAIL_HANDLER_PARAMS']:
        params = dict(app.config['ERROR_EMAIL_HANDLER_PARAMS'])
        params['toaddrs'] = app.config['ADMINS']
        params['fromaddr'] = app.config['ERROR_EMAIL_FROM']
        params['subject'] = app.config['ERROR_EMAIL_SUBJECT']
        handler = SMTPHandler(**params)
        handler.setLevel(logging.ERROR)
        app.logger.addHandler(handler)

    # Routing
    register_blueprints(app)

    # Webpack assets, error handlers, nocache and more
    views_utils.configure_for_app(app, here)

    return app


def register_blueprints(app):
    from smilepack.views import auth, pages, icons, smiles, smilepacks, settings
    from smilepack.views.admin import users, sections, subsections, categories, icons as admin_icons, smiles as admin_smiles

    app.register_blueprint(auth.bp)
    app.register_blueprint(pages.bp)
    app.register_blueprint(icons.bp, url_prefix='/icons')
    app.register_blueprint(smiles.bp, url_prefix='/smiles')
    app.register_blueprint(smilepacks.bp, url_prefix='/smilepack')
    app.register_blueprint(settings.bp)

    app.register_blueprint(users.bp, url_prefix='/admin/users')
    app.register_blueprint(sections.bp, url_prefix='/admin/sections')
    app.register_blueprint(subsections.bp, url_prefix='/admin/subsections')
    app.register_blueprint(categories.bp, url_prefix='/admin/categories')
    app.register_blueprint(admin_icons.bp, url_prefix='/admin/icons')
    app.register_blueprint(admin_smiles.bp, url_prefix='/admin/smiles')
