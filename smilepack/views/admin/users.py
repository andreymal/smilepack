#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from pony.orm import db_session
from flask_login import current_user
from flask import Blueprint, request, abort

from smilepack import models
from smilepack.views.utils import for_admin, json_answer, default_crossdomain, csrf_protect


bp = Blueprint('admin_users', __name__)


@bp.route('/', methods=['GET'])
@default_crossdomain()
@json_answer
@db_session
@for_admin
def index():
    if not current_user.is_superadmin:
        abort(403)
    offset = request.args.get('offset', '')
    limit = request.args.get('limit', '')
    offset = int(offset) if offset.isdigit() else 0
    limit = max(1, min(int(limit), 500)) if limit.isdigit() else 100

    users = models.User.select()
    if request.args.get('prefix'):
        p = request.args['prefix']
        users = users.filter(lambda x: x.username.startswith(p))
    count = users.count()
    return {'count': count, 'users': [x.bl.as_json() for x in users[offset:offset + limit]]}


@bp.route('/', methods=['POST'])
@default_crossdomain()
@json_answer
@csrf_protect
@db_session
@for_admin
def create():
    if not current_user.is_superadmin:
        abort(403)
    if not request.json or not isinstance(request.json, dict):
        abort(400)
    data = request.json.get('user') or {}
    user = models.User.bl.create(data)
    return {'user': user.bl.as_json()}


@bp.route('/<int:user_id>', methods=['POST'])
@default_crossdomain()
@json_answer
@csrf_protect
@db_session
@for_admin
def edit(user_id):
    if not current_user.is_superadmin:
        abort(403)

    if not request.json or not isinstance(request.json, dict):
        abort(400)
    user = models.User.get(id=user_id)
    if not user:
        abort(404)
    data = request.json.get('user') or {}

    if data:
        user.bl.edit(data, edited_by=current_user)

    return {'user': user.bl.as_json()}
