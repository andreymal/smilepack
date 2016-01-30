# -*- coding: utf-8 -*-

import os
import base64
import random
import string
import functools
from datetime import datetime, timedelta

import jinja2
import jsonschema
from werkzeug.exceptions import HTTPException, Forbidden, UnprocessableEntity
from flask import request, current_app, jsonify, make_response, session, send_from_directory, abort
from flask_login import current_user

from ..utils.exceptions import InternalError, BadRequestError


def dictslice(d, keys):
    return {k: v for k, v in d.items() if k in keys}


def generate_session_id():
    s = string.ascii_lowercase + string.digits
    return ''.join(random.choice(s) for _ in range(32))


def user_session(func):
    @functools.wraps(func)
    def decorator(*args, **kwargs):
        if 'smilepack_session' in request.cookies:
            first_visit = False
            session_id = str(request.cookies['smilepack_session'])[:32]
        else:
            first_visit = True
            session_id = generate_session_id()

        result = func(session_id, first_visit, *args, **kwargs)
        if not first_visit:
            return result
        response = current_app.make_response(result)
        response.set_cookie('smilepack_session', value=session_id, expires=datetime.now() + timedelta(365 * 10))
        return response

    return decorator


def json_answer(func):
    @functools.wraps(func)
    def decorator(*args, **kwargs):
        try:
            resp = jsonify(func(*args, **kwargs))
        except jsonschema.ValidationError as exc:
            resp = jsonify(error=exc.message, at=tuple(exc.path))
            resp.status_code = 422
        except BadRequestError as exc:
            if exc.at:
                resp = jsonify(error=exc.message, at=exc.at)
            else:
                resp = jsonify(error=exc.message)
            resp.status_code = 422
        except InternalError as exc:
            resp = jsonify(error=str(exc))
            resp.status_code = 500
        except HTTPException as exc:
            resp = jsonify(error=exc.description)
            resp.status_code = exc.code
        return resp

    return decorator


def csrf_protect(func):
    @functools.wraps(func)
    def decorator(*args, **kwargs):
        if request.method == 'GET':
            pass  # TODO:
        elif request.method != 'OPTIONS':  # TODO: recheck security
            token = session.get('csrf_token')
            if not token or (request.json or request.form).get('csrf_token') != token:
                raise Forbidden('Invalid csrf_token')
        return func(*args, **kwargs)

    return decorator


def for_admin(func):
    @functools.wraps(func)
    def decorator(*args, **kwargs):
        if current_user.is_anonymous or not current_user.is_admin:
            abort(403)
        return func(*args, **kwargs)

    return decorator


def default_crossdomain(methods=('GET',)):
    if methods is not None:
        methods = ', '.join(sorted(x.upper() for x in methods))

    def decorator(f):
        def wrapped_function(*args, **kwargs):
            if request.method == 'OPTIONS':
                resp = current_app.make_default_options_response()
            else:
                resp = make_response(f(*args, **kwargs))

            origin = request.headers.get('Origin')
            if not origin:
                return resp

            origins = current_app.config['API_ORIGINS']
            cred_origins = current_app.config['API_ALLOW_CREDENTIALS_FOR']
            origins_all = '*' in origins
            cred_origins_all = '*' in cred_origins

            h = resp.headers
            ok = False
            if cred_origins_all and (origins_all or origin in origins) or origin in cred_origins:
                h['Access-Control-Allow-Origin'] = origin
                h['Access-Control-Allow-Credentials'] = 'true'
                ok = True
            elif origin in origins:
                h['Access-Control-Allow-Origin'] = origin
                ok = True
            elif origins_all:
                h['Access-Control-Allow-Origin'] = '*'
                ok = True

            if ok:
                h['Access-Control-Allow-Methods'] = methods
                h['Access-Control-Max-Age'] = str(21600)

            return resp

        f.provide_automatic_options = False
        return functools.update_wrapper(wrapped_function, f)

    return decorator


def csrf_token(reset=False):
    if reset or not session.get('csrf_token'):
        session['csrf_token'] = base64.b64encode(os.urandom(24)).decode('ascii')
    return session['csrf_token']


def csrf_token_field():
    token = jinja2.escape(csrf_token())
    field = '<input type="hidden" name="csrf_token" value="{token}" />'.format(token=token)
    return jinja2.Markup(field)


def _handle_bad_request_error(error):
    return UnprocessableEntity(str(error))


def _handle_validation_error(error):
    return UnprocessableEntity('{}: {}'.format(tuple(error.path), error.message))


def _add_nocache_header(response):
    response.cache_control.max_age = 0
    return response


def configure_for_app(app, package_root):
    app.jinja_env.globals['csrf_token'] = csrf_token
    app.jinja_env.globals['csrf_token_field'] = csrf_token_field
    app.register_error_handler(BadRequestError, _handle_bad_request_error)
    app.register_error_handler(jsonschema.ValidationError, _handle_validation_error)
    app.after_request(_add_nocache_header)

    # Webpack assets
    @app.route("/assets/<path:filename>")
    def send_asset(filename):
        return send_from_directory(os.path.join(package_root, "public"), filename)
