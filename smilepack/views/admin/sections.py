#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from pony.orm import db_session
from flask import Blueprint, request, abort
from werkzeug.exceptions import NotFound

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
    position = request.json['section'].get('position')
    if position and isinstance(position, dict):
        _reorder(section, position)
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
    position = request.json['section'].get('position')
    if position and isinstance(position, dict):
        _reorder(section, position)
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


def _reorder(section, position):
    before_id = position.pop('before')
    before = models.Section.get(id=before_id) if isinstance(before_id, int) else None
    if before_id is not None and not before:
        raise NotFound('before_section not found')

    kwargs = {}
    if 'after' in position:
        kwargs['check_after_section_id'] = position.pop('after')
    if 'check_order' in position:
        kwargs['check_order'] = position.pop('check_order')

    section.bl.reorder(before, **kwargs)
