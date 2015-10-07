#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os

from flask import current_app, url_for


def get_bundle_url(name, **kwargs):
    if not current_app.config['USE_BUNDLER']:
        raise RuntimeError('Bundler is not enabled')
    if name not in current_app.config['BUNDLES']:
        raise KeyError('Bundle "" not found'.format(name))

    output = current_app.config['BUNDLES'][name]['output']
    return url_for('bundle.download', filename=output, **kwargs)


def bundle_js(files, output, check_strict=False):
    from jsmin import jsmin

    minified_js = []
    for x in files:
        data = open(x, 'r').read().strip()
        minified_js.append(jsmin(data))
        if check_strict and not data.startswith('"use strict"') and not data.startswith("'use strict'"):
            print('WARNING: {} not in strict mode'.format(x))

    with open(output, 'w') as fp:
        fp.write('\n'.join(minified_js))


def bundle_app(app, verbose=False):
    cnt = 0
    for name, bundle in app.config['BUNDLES'].items():
        files = [os.path.join(app.static_folder, x) for x in bundle['files']]
        output = os.path.join(app.config['BUNDLE_PATH'], bundle['output'])

        if verbose:
            print('Processing {} ({})'.format(name, output))

        if bundle['type'] == 'js':
            bundle_js(files, output, check_strict=bundle.get('check_strict', True))
        else:
            raise ValueError('Unknown bundle type "{}"'.format(bundle['type']))
        cnt += 1

    if verbose:
        print('{} bundles processed.'.format(cnt))
