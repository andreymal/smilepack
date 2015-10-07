#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from flask import Blueprint, abort, current_app, send_from_directory, abort


bundle = Blueprint('bundle', __name__)


@bundle.route('/<path:filename>')
def download(filename):
    if not current_app.config['USE_BUNDLER']:
        abort(404)
    return send_from_directory(current_app.config['BUNDLE_PATH'], filename)

