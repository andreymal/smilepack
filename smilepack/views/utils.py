# -*- coding: utf-8 -*-

import random
import string
import functools
from datetime import datetime, timedelta

from werkzeug.exceptions import HTTPException, UnprocessableEntity
from flask import request, current_app, jsonify, make_response

from ..utils.exceptions import InternalError, BadRequestError


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
            return jsonify(func(*args, **kwargs))
        except BadRequestError as exc:
            resp = jsonify(
                error=exc.message,
                at=exc.at
            )
            resp.status_code = 422
            return resp
        except InternalError as exc:
            resp = jsonify(error=str(exc))
            resp.status_code = 500
            return resp
        except HTTPException as exc:
            resp = jsonify(error=exc.description)
            resp.status_code = exc.code
            return resp

    return decorator


def default_crossdomain(methods=['GET']):
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


def register_errorhandlers(app):
    app.register_error_handler(BadRequestError, handle_bad_request_error)


def handle_bad_request_error(error):
    return UnprocessableEntity(str(error))


def disable_cache(app):
    def add_header(response):
        response.cache_control.max_age = 0
        return response

    app.after_request(add_header)
