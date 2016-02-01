#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os

from pony.orm import db_session
from flask import Blueprint, abort, request, send_from_directory, current_app
from flask_login import current_user

from smilepack import models
from smilepack.views.utils import user_session, json_answer, default_crossdomain, dictslice
from smilepack.utils.exceptions import BadRequestError


bp = Blueprint('icons', __name__)


@bp.route('/')
@default_crossdomain()
@json_answer
@db_session
def index():
    admin_info = request.args.get('extended') and current_user.is_authenticated and current_user.is_admin

    if request.args.get('all') and current_user.is_authenticated and current_user.is_admin:
        icons = models.Icon.select()[:]
    else:
        icons = models.Icon.bl.select_published()[:]
    return {'icons': [i.bl.as_json(admin_info=admin_info) for i in icons]}


@bp.route('/by_url')
@default_crossdomain()
@json_answer
@db_session
def by_url():
    if not request.args.get('url'):
        return {'icon': None}
    icon = models.Icon.bl.search_by_url(request.args['url'])
    if not icon:
        return {'icon': None}
    return {'icon': icon.bl.as_json()}


@bp.route('/', methods=['POST'])
@user_session
@default_crossdomain(methods=['POST'])
@json_answer
def create(session_id, first_visit):
    r = dict(request.json or {})
    if not r and request.form:
        # multipart/form-data не json, приходится конвертировать
        for key in ('w', 'h', 'category'):
            if request.form.get(key) and request.form[key].isdigit():
                r[key] = int(request.form[key])
        r['compress'] = request.form.get('compress') in (1, True, '1', 'on')
        r['extended'] = request.form.get('extended') in (1, True, '1', 'on')

    if request.files.get('file'):
        r['file'] = request.files['file']

    elif not r.get('url'):
        raise BadRequestError('Empty request')

    compress = r.pop('compress', False)

    if current_app.config['ICON_COMPRESSION']:
        compress = current_app.config['ICON_FORCE_COMPRESSION'] or compress

    with db_session:
        created, icon = models.Icon.bl.find_or_create(
            dictslice(r, ('file', 'url')),
            user_addr=request.remote_addr,
            session_id=session_id,
            compress=compress
        )

        admin_info = r.get('extended') and current_user.is_authenticated and current_user.is_admin
        result = {'icon': icon.bl.as_json(admin_info=admin_info), 'created': created}
    return result


@bp.route('/images/<path:filename>')
def download(filename):
    if not current_app.config['ICONS_DIRECTORY']:
        abort(404)
    return send_from_directory(os.path.abspath(current_app.config['ICONS_DIRECTORY']), filename)
