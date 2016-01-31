#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os

from pony.orm import db_session
from flask import Blueprint, abort, request, send_from_directory, current_app
from flask_login import current_user

from smilepack import models
from smilepack.views.utils import user_session, json_answer, default_crossdomain, dictslice
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
        r['tags'] = [x.strip() for x in (request.form.get('tags') or '').split(',') if x.strip()]
        r['compress'] = request.form.get('compress') in (1, True, '1', 'on')
        r['extended'] = request.form.get('extended') in (1, True, '1', 'on')

    if request.files.get('file'):
        r['file'] = request.files['file']

    elif not r.get('url'):
        raise BadRequestError('Empty request')

    compress = r.pop('compress', False)

    if current_app.config['COMPRESSION']:
        compress = current_app.config['FORCE_COMPRESSION'] or compress

    # FIXME: sometimes Pony ORM with sqlite3 crashes here in __exit__
    # https://github.com/ponyorm/pony/issues/157
    import pony.orm
    try:
        with db_session:
            created, smile = models.Smile.bl.find_or_create(
                dictslice(r, ('file', 'url', 'w', 'h', 'category', 'description', 'tags')),  # 'approved' key is not allowed
                user_addr=request.remote_addr,
                session_id=session_id,
                compress=compress
            )
            smile_id = smile.id
    except pony.orm.core.CommitException as exc:
        # but really commit works, we can just ignore it
        current_app.logger.error('pony.orm.core.CommitException ignored: %s', exc)

    with db_session:
        admin_info = r.get('extended') and current_user.is_authenticated and current_user.is_admin
        result = {'smile': models.Smile.get(id=smile_id).bl.as_json(full_info=admin_info, admin_info=admin_info), 'created': created}
    return result


@bp.route('/images/<path:filename>')
def download(filename):
    if not current_app.config['SMILES_DIRECTORY']:
        abort(404)
    return send_from_directory(os.path.abspath(current_app.config['SMILES_DIRECTORY']), filename)
