#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from pony.orm import db_session
from flask import Blueprint, request, abort

from smilepack import models
from smilepack.views.utils import for_admin, json_answer, default_crossdomain, csrf_protect


bp = Blueprint('admin', __name__)


@bp.route('/nonapproved')
@default_crossdomain()
@json_answer
@db_session
@for_admin
def nonapproved():
    older = request.args.get('older')
    if older and older.isdigit():
        older = int(older)
    else:
        older = None
    offset = request.args.get('offset')
    if offset and offset.isdigit():
        offset = int(offset)
    else:
        offset = 0
    count = request.args.get('count')
    if count and count.isdigit():
        count = int(count)
    else:
        count = 100
    return {'smiles': models.Smile.bl.get_last_nonapproved_as_json(older=older, offset=offset, count=count)}


@bp.route('/<int:smile_id>', methods=['POST'])
@default_crossdomain()
@json_answer
@csrf_protect
@db_session
@for_admin
def edit_smile(smile_id):
    if not request.json or not isinstance(request.json, dict):
        abort(400)
    smile = models.Smile.get(id=smile_id)
    if not smile:
        abort(404)
    data = request.json.get('smile') or {}

    position = data.pop('position', None)

    if data:
        smile.bl.edit(data)

    if position and isinstance(position, dict):
        before_smile_id = position.pop('before')
        before_smile = models.Smile.get(id=before_smile_id) if isinstance(before_smile_id, int) else None
        if before_smile_id is not None and not before_smile:
            abort(404)

        kwargs = {}
        if 'after' in position:
            kwargs['check_after_smile_id'] = position.pop('after')
        if 'check_order' in position:
            kwargs['check_order'] = position.pop('check_order')

        smile.bl.reorder(before_smile, **kwargs)

    return {'smile': smile.bl.as_json(full_info=True, admin_info=True)}
