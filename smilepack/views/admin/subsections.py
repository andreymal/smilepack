#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from pony.orm import db_session
from flask import Blueprint, request, abort

from smilepack import models
from smilepack.views.utils import for_admin, json_answer, default_crossdomain, csrf_protect


bp = Blueprint('admin_subsections', __name__)


@bp.route('', methods=['POST'])
@default_crossdomain()
@json_answer
@csrf_protect
@db_session
@for_admin
def create_subsection():
    subsection = models.SubSection.bl.create(request.json.get('subsection'))
    return {'subsection': subsection.bl.as_json(with_parent=True)}


@bp.route('/<int:subsection_id>', methods=['POST'])
@default_crossdomain()
@json_answer
@csrf_protect
@db_session
@for_admin
def edit_subsection(subsection_id):
    subsection = models.SubSection.get(id=subsection_id)
    if not subsection:
        abort(404)
    subsection.bl.edit(request.json.get('subsection'))
    return {'subsection': subsection.bl.as_json(with_parent=True)}


@bp.route('/<int:subsection_id>', methods=['DELETE'])
@default_crossdomain()
@json_answer
@csrf_protect
@db_session
@for_admin
def delete_subsection(subsection_id):
    subsection = models.SubSection.get(id=subsection_id)
    if not subsection:
        abort(404)
    subsection.bl.delete()
    return {'success': True}
