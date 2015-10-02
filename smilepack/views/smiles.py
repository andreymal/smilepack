#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import jsonschema
from flask import Blueprint, abort, request

from ..models import *
from .utils import user_session, json_answer, default_crossdomain
from ..db import db_session


smiles = Blueprint('smiles', __name__)


@smiles.route('/')
@default_crossdomain()
@json_answer
@db_session
def index():
    return {'sections': Section.bl.get_with_categories()}


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

    result = section.bl.search_by_tags(tags)
    result = {'smiles': [x.bl.as_json() for x in result]}

    # TODO: переделать более по-человечески
    if request.args.get('together') == '1':
        s = set(tags)
        # берём только те смайлики, в которых есть все-все теги из запроса
        result['smiles'] = [x for x in result['smiles'] if not s - set(x['tags'])]

    return result


@smiles.route('/<int:category>')
@default_crossdomain()
@json_answer
@db_session
def show(category):
    cat = Category.bl.get(category)
    if not cat:
        abort(404)
    return {'smiles': cat.bl.get_smiles_as_json()}


@smiles.route('/suggest', methods=['POST'])
@user_session
@default_crossdomain(methods=['POST'])
@json_answer
@db_session
def suggest(session_id, first_visit):
    r = request.json
    if not r:
        raise jsonschema.ValidationError('Empty request')

    suggestion = SmileSuggestion.bl.create(session_id, r)

    return {'id': suggestion.id}
