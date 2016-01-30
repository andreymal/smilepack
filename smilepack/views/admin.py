#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from pony.orm import db_session
from flask import Blueprint, request, abort
from werkzeug.exceptions import NotFound

from smilepack import models
from smilepack.views.utils import for_admin, json_answer, default_crossdomain, csrf_protect


bp = Blueprint('admin', __name__)


@bp.route('/sections', methods=['POST'])
@default_crossdomain()
@json_answer
@csrf_protect
@db_session
@for_admin
def create_section():
    section = models.Section.bl.create(request.json.get('section'))
    return {'section': section.bl.as_json()}


@bp.route('/subsections', methods=['POST'])
@default_crossdomain()
@json_answer
@csrf_protect
@db_session
@for_admin
def create_subsection():
    subsection = models.SubSection.bl.create(request.json.get('subsection'))
    return {'subsection': subsection.bl.as_json(with_parent=True)}


@bp.route('/categories', methods=['POST'])
@default_crossdomain()
@json_answer
@csrf_protect
@db_session
@for_admin
def create_category():
    category = models.Category.bl.create(request.json.get('category'))
    return {'category': category.bl.as_json(with_parent=True)}


@bp.route('/sections/<int:section_id>', methods=['POST'])
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


@bp.route('/subsections/<int:subsection_id>', methods=['POST'])
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


@bp.route('/categories/<int:category_id>', methods=['POST'])
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
    return {'category': category.bl.as_json(with_parent=True)}


@bp.route('/unpublished')
@default_crossdomain()
@json_answer
@db_session
@for_admin
def unpublished():
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
    return {'smiles': models.Smile.bl.get_last_unpublished_as_json(filt=request.args.get('filter') or 'all', older=older, offset=offset, count=count)}


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

    return _edit_smile(smile, data)


@bp.route('/edit', methods=['POST'])
@default_crossdomain()
@json_answer
@csrf_protect
@db_session
@for_admin
def edit_many_smiles():
    if not request.json or not isinstance(request.json, dict) or not isinstance(request.json.get('items'), list):
        abort(400)
    smile_ids = []
    for item in request.json['items']:
        i = item.get('id')
        if not isinstance(i, int) and (not isinstance(i, str) or not i.isdigit()):
            abort(400)
        if not isinstance(item.get('smile'), dict):
            abort(400)
        smile_ids.append(int(i))

    smiles = {s.id: s for s in models.Smile.select(lambda x: x.id in smile_ids)[:]}
    if len(smiles) != len(request.json['items']):
        raise NotFound('Some of the required smiles not found')

    result = []
    for item in request.json['items']:
        smile = smiles[int(item['id'])]
        result.append(_edit_smile(smile, item['smile']))
        result[-1]['id'] = smile.id

    return {'items': result}


def _edit_smile(smile, data):
    position = data.pop('position', None)

    if data:
        smile.bl.edit(data)

    if position and isinstance(position, dict):
        before_smile_id = position.pop('before')
        before_smile = models.Smile.get(id=before_smile_id) if isinstance(before_smile_id, int) else None
        if before_smile_id is not None and not before_smile:
            raise NotFound('before_smile not found')

        kwargs = {}
        if 'after' in position:
            kwargs['check_after_smile_id'] = position.pop('after')
        if 'check_order' in position:
            kwargs['check_order'] = position.pop('check_order')

        smile.bl.reorder(before_smile, **kwargs)

    return {'smile': smile.bl.as_json(full_info=True, admin_info=True)}
