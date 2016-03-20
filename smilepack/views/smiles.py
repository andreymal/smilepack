#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os

from pony.orm import db_session
from flask import Blueprint, abort, request, send_from_directory, current_app
from flask_login import current_user

from smilepack import models
from smilepack.views.utils import user_session, json_answer, default_crossdomain, dictslice
from smilepack.utils.exceptions import BadRequestError
from smilepack.utils import uploader
from smilepack.utils.urls import hash_url


bp = Blueprint('smiles', __name__)


@bp.route('/')
@default_crossdomain()
@json_answer
@db_session
def index():
    return {'sections': models.Section.bl.get_all_with_categories()}


@bp.route('/new')
@default_crossdomain()
@json_answer
@db_session
def new():
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
    return {'smiles': models.Smile.bl.get_last_approved_as_json(offset=offset, count=count)}


@bp.route('/search/<int:section_id>')
@default_crossdomain()
@json_answer
@db_session
def search(section_id):
    section = models.Section.get(id=section_id)
    if not section:
        return {'smiles': []}

    tags = request.args.get('tags')
    if tags:
        tags = [x.strip().lower() for x in tags.split(',') if x and x.strip()]
    if not tags:
        return {'smiles': []}

    tags_entities = section.bl.get_tags(tags)

    result = section.bl.search_by_tags(set(x.name for x in tags_entities))
    result = {'smiles': [x.bl.as_json() for x in result]}

    # TODO: переделать более по-человечески
    if request.args.get('together') == '1':
        s = set(tags)
        # берём только те смайлики, в которых есть все-все теги из запроса
        result['smiles'] = [x for x in result['smiles'] if not s - set(x['tags'])]

    result['tags'] = [tag.bl.as_json() for tag in tags_entities]

    return result


@bp.route('/by_url')
@default_crossdomain()
@json_answer
@db_session
def by_url():
    url = request.args.get('url')
    if not url:
        return {'id': None}

    cache_key = 'smile_by_url_{}'.format(hash_url(url))
    result = current_app.cache.get(cache_key)
    if result:
        return result

    smile = models.Smile.bl.full_search_by_url(url)

    if not smile:
        result = {'id': None}
    else:
        smile_category_id = smile.category.id if smile.category else None
        result = smile.bl.as_json()
        result['category'] = smile_category_id

    current_app.cache.set(cache_key, result, timeout=60)
    return result


@bp.route('/<int:category>')
@default_crossdomain()
@json_answer
@db_session
def show(category):
    cat = models.Category.bl.get(category)
    if not cat:
        abort(404)
    admin_info = request.args.get('extended') and current_user.is_authenticated and current_user.is_admin
    return {'smiles': cat.bl.get_smiles_as_json(admin_info=admin_info)}


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
        r['description'] = request.form.get('description') or ''
        r['tags'] = request.form.get('tags') or ''
        r['compress'] = request.form.get('compress') in (1, True, '1', 'on')
        r['extended'] = request.form.get('extended') in (1, True, '1', 'on')
        r['is_suggestion'] = request.form.get('is_suggestion') in (1, True, '1', 'on')

    if isinstance(r.get('tags'), str):
        r['tags'] = [x.strip() for x in r['tags'].split(',') if x.strip()]

    if request.files.get('file'):
        r['file'] = request.files['file']

    elif not r.get('url'):
        raise BadRequestError('Empty request')

    compress = r.pop('compress', False)

    if current_app.config['COMPRESSION']:
        compress = current_app.config['FORCE_COMPRESSION'] or compress

    with db_session:
        params = dictslice(r, ('file', 'url', 'w', 'h', 'category', 'description', 'tags', 'is_suggestion'))  # 'approved' key is not allowed
        if not current_app.config['ALLOW_SUGGESTIONS']:
            params['is_suggestion'] = False
        created, smile = models.Smile.bl.find_or_create(
            params,
            user_addr=request.remote_addr,
            session_id=session_id,
            compress=compress
        )
        if not created and r.get('is_suggestion') and not smile.is_suggestion and not smile.hidden and not smile.approved_at:
            edit_data = {'is_suggestion': True}
            for key in ('category', 'tags', 'description'):
                if key in r:
                    edit_data[key] = r[key]
            smile.bl.edit(edit_data)

        admin_info = r.get('extended') and current_user.is_authenticated and current_user.is_admin
        result = {'smile': smile.bl.as_json(full_info=admin_info, admin_info=admin_info), 'created': created}
    return result


@bp.route('/images/<path:filename>')
def download(filename):
    if not current_app.config['SMILES_DIRECTORY']:
        abort(404)
    return send_from_directory(os.path.abspath(current_app.config['SMILES_DIRECTORY']), filename)
