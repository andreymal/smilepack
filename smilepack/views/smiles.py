#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os

from pony.orm import db_session
from flask import Blueprint, abort, request, send_from_directory, current_app

from smilepack import models
from smilepack.views.utils import user_session, json_answer, default_crossdomain
from smilepack.utils.exceptions import BadRequestError


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
    count = request.args.get('count')
    if count and count.isdigit():
        count = int(count)
    else:
        count = 100
    return {'smiles': models.Smile.bl.get_last_approved_as_json(count=count)}


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
    if not request.args.get('url'):
        return {'id': None}
    smile = models.Smile.bl.search_by_url(request.args['url'])
    if not smile:
        return {'id': None}
    smile_category_id = smile.category.id if smile.category else None
    return {'id': smile.id, 'url': smile.url, 'w': smile.width, 'h': smile.height, 'category': smile_category_id}


@bp.route('/<int:category>')
@default_crossdomain()
@json_answer
@db_session
def show(category):
    cat = models.Category.bl.get(category)
    if not cat:
        abort(404)
    return {'smiles': cat.bl.get_smiles_as_json()}


@bp.route('/', methods=['POST'])
@user_session
@default_crossdomain(methods=['POST'])
@json_answer
def create(session_id, first_visit):
    r = dict(request.json or {})
    if not r and request.form:
        # multipart/form-data не json, приходится конвертировать
        if request.form.get('w') and request.form['w'].isdigit():
            r['w'] = int(request.form['w'])
        if request.form.get('h') and request.form['h'].isdigit():
            r['h'] = int(request.form['h'])
        r['compress'] = request.form.get('compress') in (1, True, '1', 'on')

    if request.files.get('file'):
        r['file'] = request.files['file']

    elif not r.get('url'):
        raise BadRequestError('Empty request')

    compress = r.pop('compress', False)

    if current_app.config['COMPRESSION']:
        compress = current_app.config['FORCE_COMPRESSION'] or compress

    # FIXME: Pony ORM with sqlite3 crashes here
    with db_session:
        smile_id = models.Smile.bl.create(
            r,
            user_addr=request.remote_addr,
            session_id=session_id,
            compress=compress
        ).id
    with db_session:
        result = {'smile': models.Smile.get(id=smile_id).bl.as_json()}
    return result


@bp.route('/images/<path:filename>')
def download(filename):
    if not current_app.config['SMILES_DIRECTORY']:
        abort(404)
    return send_from_directory(os.path.abspath(current_app.config['SMILES_DIRECTORY']), filename)
