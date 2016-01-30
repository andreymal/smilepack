#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from pony.orm import db_session
from flask import Blueprint, request, abort

from smilepack import models
from smilepack.views.utils import for_admin, json_answer, default_crossdomain, csrf_protect


bp = Blueprint('admin_sections', __name__)


@bp.route('', methods=['POST'])
@default_crossdomain()
@json_answer
@csrf_protect
@db_session
@for_admin
def create_section():
    section = models.Section.bl.create(request.json.get('section'))
    return {'section': section.bl.as_json()}


@bp.route('/<int:section_id>', methods=['POST'])
@default_crossdomain()
@json_answer
@csrf_protect
@db_session
@for_admin
def edit_section(section_id):
    section = models.Section.get(id=section_id)
    if not section:
        abort(404)
    section.bl.edit(request.json.get('section'))
    return {'section': section.bl.as_json()}


@bp.route('/<int:section_id>', methods=['DELETE'])
@default_crossdomain()
@json_answer
@csrf_protect
@db_session
@for_admin
def delete_section(section_id):
    section = models.Section.get(id=section_id)
    if not section:
        abort(404)
    section.bl.delete()
    return {'success': True}
