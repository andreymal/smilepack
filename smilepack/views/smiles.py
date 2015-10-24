#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from urllib.request import urlopen

import jsonschema
from flask import Blueprint, abort, request, send_from_directory

from ..models import *
from .utils import user_session, json_answer, default_crossdomain
from ..utils import urls
from ..db import db_session
from ..utils.exceptions import BadRequestError


smiles = Blueprint('smiles', __name__)


@smiles.route('/')
@default_crossdomain()
@json_answer
@db_session
def index():
    return {'sections': Section.bl.get_all_with_categories()}


@smiles.route('/search/<int:section_id>')
@default_crossdomain()
@json_answer
@db_session
def search(section_id):
    section = Section.get(id=section_id)
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


@smiles.route('/by_url')
@default_crossdomain()
@json_answer
@db_session
def by_url():
    if not request.args.get('url'):
        return {'id': None}
    smile = Smile.bl.search_by_url(request.args['url'])
    if not smile:
        return {'id': None}
    return {'id': smile.id, 'url': smile.url, 'w': smile.width, 'h': smile.height, 'category': smile.category.id if smile.category else None}


@smiles.route('/<int:category>')
@default_crossdomain()
@json_answer
@db_session
def show(category):
    cat = Category.bl.get(category)
    if not cat:
        abort(404)
    return {'smiles': cat.bl.get_smiles_as_json()}


@smiles.route('/', methods=['POST'])
@user_session
@default_crossdomain(methods=['POST'])
@json_answer
@db_session
def create(session_id, first_visit):
    r = dict(request.json or {})
    if not r and request.form:
        # multipart/form-data не json, приходится конвертировать
        if request.form.get('w') and request.form['w'].isdigit():
            r['w'] = int(request.form['w'])
        if request.form.get('h') and request.form['h'].isdigit():
            r['h'] = int(request.form['h'])

    if request.files.get('file'):
        r['file'] = request.files['file']

    elif not r.get('url'):
        raise BadRequestError('Empty request')

    return {'smile': Smile.bl.create(r, user_addr=request.remote_addr, session_id=session_id).bl.as_json()}


@smiles.route('/images/<path:filename>')
def download(filename):
    if not current_app.config['SMILES_DIRECTORY']:
        abort(404)
    return send_from_directory(current_app.config['SMILES_DIRECTORY'], filename)
