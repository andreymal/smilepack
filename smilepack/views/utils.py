#!/usr/bin/env python
# -*- coding: utf-8 -*-

import json
import random
import string
import functools
from datetime import datetime, timedelta

from flask import request, current_app, jsonify, make_response


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
        # TODO: Exceptions
        return jsonify(func(*args, **kwargs))
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

            h = resp.headers

            h['Access-Control-Allow-Origin'] = current_app.config['API_ORIGIN']
            h['Access-Control-Allow-Methods'] = methods
            h['Access-Control-Max-Age'] = str(21600)
            # if headers is not None:
            #     h['Access-Control-Allow-Headers'] = headers
            if current_app.config['API_ALLOW_CREDENTIALS']:
                h['Access-Control-Allow-Credentials'] = 'true'
            return resp

        f.provide_automatic_options = False
        return functools.update_wrapper(wrapped_function, f)
    return decorator
