#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from pony.orm import db_session
from flask import Blueprint, request, abort

from smilepack import models
from smilepack.views.utils import for_admin, json_answer, default_crossdomain, csrf_protect


bp = Blueprint('admin_icons', __name__)


@bp.route('/<int:icon_id>', methods=['POST'])
@default_crossdomain()
@json_answer
@csrf_protect
@db_session
@for_admin
def edit_icon(icon_id):
    if not request.json or not isinstance(request.json, dict):
        abort(400)
    icon = models.Icon.get(id=icon_id)
    if not icon:
        abort(404)
    data = request.json.get('icon') or {}

    if data:
        icon.bl.edit(data)

    return {'icon': icon.bl.as_json(admin_info=True)}
