#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from pony.orm import db_session
from flask import Blueprint, request, abort
from werkzeug.exceptions import NotFound

from smilepack import models
from smilepack.views.utils import for_admin, json_answer, default_crossdomain, csrf_protect


bp = Blueprint('admin_categories', __name__)


@bp.route('', methods=['POST'])
@default_crossdomain()
@json_answer
@csrf_protect
@db_session
@for_admin
def create_category():
    category = models.Category.bl.create(request.json.get('category'))
    position = request.json['category'].get('position')
    if position and isinstance(position, dict):
        _reorder(category, position)
    return {'category': category.bl.as_json(with_parent=True)}


@bp.route('/<int:category_id>', methods=['POST'])
@default_crossdomain()
@json_answer
@csrf_protect
@db_session
@for_admin
def edit_category(category_id):
    category = models.Category.get(id=category_id)
    if not category:
        abort(404)
    category.bl.edit(request.json.get('category'))
    position = request.json['category'].get('position')
    if position and isinstance(position, dict):
        _reorder(category, position)
    return {'category': category.bl.as_json(with_parent=True)}


@bp.route('/<int:category_id>', methods=['DELETE'])
@default_crossdomain()
@json_answer
@csrf_protect
@db_session
@for_admin
def delete_category(category_id):
    category = models.Category.get(id=category_id)
    if not category:
        abort(404)
    orphans_count = category.bl.delete()
    return {'success': True, 'smiles': orphans_count}


def _reorder(category, position):
    before_id = position.pop('before')
    before = models.Category.get(id=before_id) if isinstance(before_id, int) else None
    if before_id is not None and not before:
        raise NotFound('before_category not found')

    kwargs = {}
    if 'after' in position:
        kwargs['check_after_category_id'] = position.pop('after')
    if 'check_order' in position:
        kwargs['check_order'] = position.pop('check_order')

    category.bl.reorder(before, **kwargs)
