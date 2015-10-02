#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import jsonschema
from flask import abort
from werkzeug.exceptions import UnprocessableEntity


def register_errorhandlers(app):
    app.register_error_handler(jsonschema.ValidationError, handle_validation_error)


def handle_validation_error(error):
    return UnprocessableEntity('({}) {}'.format(error.path, error.message))


def disable_cache(app):
    def add_header(response):
        response.cache_control.max_age = 0
        return response
    app.after_request(add_header)
