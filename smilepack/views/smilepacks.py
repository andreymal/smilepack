#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import zlib

import jsonschema
from flask import Blueprint, Response, abort, render_template, current_app, request, url_for
from flask.ext.babel import format_datetime

from ..models import SmilePack, Icon
from .utils import user_session, json_answer, default_crossdomain
from ..db import db_session


smilepacks = Blueprint('smilepacks', __name__)


@smilepacks.route('/<smp_id>')
@default_crossdomain()
@json_answer
@db_session
def show(smp_id):
    import time
    tm = time.time()
    smp = SmilePack.bl.get_by_encoded_id(smp_id, preload=True)
    print('%.2fms' % ((time.time() - tm) * 1000))
    if not smp:
        abort(404)


    r = smp.bl.as_json()

    return r


@smilepacks.route('/<smp_id>.compat.user.js')
@db_session
def download_compat(smp_id):
    ckey = 'compat_js_{}'.format(smp_id)
    result = current_app.cache.get(ckey)

    if result:
        # У memcached ограничение на размер данных, перестраховываемся
        result = zlib.decompress(result['zlib_data'])
    else:
        smp = SmilePack.bl.get_by_encoded_id(smp_id, preload=True)
        if not smp:
            abort(404)
        result = render_template(
            'smilepack_classic.js',
            pack_json_compat=smp.bl.as_json_compat(),
            host=request.host,
            generator_url=url_for('pages.generator', smp_id=None, _external=True),
            pack_ico_url=Icon.select().first().url,
        ).encode('utf-8')

        current_app.cache.set(ckey, {
            'updated_at': smp.updated_at,
            'zlib_data': zlib.compress(result)
        }, timeout=60)  # TODO: cache invalidation?

    return Response(result, mimetype='text/javascript; charset=utf-8')


@smilepacks.route('/', methods=['POST'])
@user_session
@default_crossdomain(methods=['POST'])
@json_answer
@db_session
def create(session_id, first_visit):
    r = request.json
    if not r:
        raise jsonschema.ValidationError('Empty request')

    pack = SmilePack.bl.create(
        session_id,
        r.get('smiles'),
        r.get('categories'),
        name=r.get('name'),
        description=r.get('description'),
        lifetime=r.get('lifetime')
    )

    # TODO: перенести это в bl
    current_app.cache.set('smilepacks_count', None, timeout=1)

    deletion_date = pack.bl.get_deletion_date()

    return {
        'smilepack_id': pack.encoded_id,
        'download_url': url_for('.download_compat', smp_id=pack.encoded_id, _external=True),
        'view_url': url_for('pages.generator', smp_id=pack.encoded_id, _external=True),
        'deletion_date': deletion_date.strftime('%Y-%m-%dT%H:%M:%SZ') if deletion_date else None,
        'fancy_deletion_date': format_datetime(deletion_date) if deletion_date else None
    }
