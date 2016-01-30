#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from pony.orm import db_session
from flask import Blueprint, request, abort
from werkzeug.exceptions import NotFound

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
    position = request.json['subsection'].get('position')
    if position and isinstance(position, dict):
        _reorder(subsection, position)
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
    position = request.json['subsection'].get('position')
    if position and isinstance(position, dict):
        _reorder(subsection, position)
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


def _reorder(subsection, position):
    before_id = position.pop('before')
    before = models.SubSection.get(id=before_id) if isinstance(before_id, int) else None
    if before_id is not None and not before:
        raise NotFound('before_subsection not found')

    kwargs = {}
    if 'after' in position:
        kwargs['check_after_subsection_id'] = position.pop('after')
    if 'check_order' in position:
        kwargs['check_order'] = position.pop('check_order')

    subsection.bl.reorder(before, **kwargs)
