#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import zlib
from pony.orm import db_session
from flask import Blueprint, Response, abort, render_template, current_app, request, url_for
from flask_babel import format_datetime

from smilepack.models import SmilePack, SmilePackCategory, Icon
from smilepack.views.utils import user_session, json_answer, default_crossdomain
from smilepack.utils import userscript_parser
from smilepack.utils.exceptions import BadRequestError


bp = Blueprint('smilepacks', __name__)


@bp.route('/<smp_id>')
@user_session
@default_crossdomain()
@json_answer
@db_session
def show(session_id, first_visit, smp_id):
    smp = SmilePack.bl.get_by_hid(smp_id)
    if not smp:
        abort(404)

    smp.bl.add_view(request.remote_addr, session_id if not first_visit else None)
    return smp.bl.as_json(with_smiles=request.args.get('full') == '1')


@bp.route('/<smp_id>/<int:category_id>')
@default_crossdomain()
@json_answer
@db_session
def show_category(smp_id, category_id):
    cat = SmilePackCategory.bl.get_by_smilepack(smp_id, category_id)
    if not cat:
        abort(404)

    return cat.bl.as_json(with_smiles=True)


@bp.route('/<smp_id>.compat.user.js')
@user_session
@db_session
def download_compat(session_id, first_visit, smp_id):
    ckey = 'compat_js_{}'.format(smp_id)
    result = current_app.cache.get(ckey)

    smp = SmilePack.bl.get_by_hid(smp_id)
    if not smp:
        abort(404)
    smp.bl.add_view(request.remote_addr, session_id if not first_visit else None)

    if result:
        # У memcached ограничение на размер данных, перестраховываемся
        result = zlib.decompress(result['zlib_data'])
    else:
        result = render_template(
            'smilepack_classic.js',
            pack_name=(smp.name or smp.hid).replace('\r', '').replace('\n', '').strip(),
            pack_json_compat=smp.bl.as_json_compat(),
            host=request.host,
            generator_url=url_for('pages.generator', smp_id=None, _external=True),
            pack_ico_url=Icon.select().first().url,
        ).encode('utf-8')

        current_app.cache.set(ckey, {
            'updated_at': smp.updated_at,
            'zlib_data': zlib.compress(result)
        }, timeout=60)  # TODO: cache invalidation?

    return Response(result, mimetype='text/javascript; charset=utf-8')


@bp.route('/', methods=['POST'])
@user_session
@default_crossdomain(methods=['POST'])
@json_answer
@db_session
def create(session_id, first_visit):
    r = request.json
    if not r:
        raise BadRequestError('Empty request')

    pack = SmilePack.bl.create(
        session_id,
        r.get('smiles'),
        r.get('categories'),
        name=r.get('name'),
        description=r.get('description'),
        lifetime=r.get('lifetime') if current_app.config['ALLOW_LIFETIME_SELECT'] else 0,
        user_addr=request.remote_addr,
    )

    deletion_date = pack.delete_at

    return {
        'smilepack_id': pack.hid,
        'download_url': url_for('.download_compat', smp_id=pack.hid, _external=True),
        'view_url': url_for('pages.generator', smp_id=pack.hid, _external=True),
        'path': url_for('pages.generator', smp_id=pack.hid),
        'deletion_date': deletion_date.strftime('%Y-%m-%dT%H:%M:%SZ') if deletion_date else None,
        'fancy_deletion_date': format_datetime(deletion_date) if deletion_date else None
    }


@bp.route('/import', methods=['POST'])
@default_crossdomain(methods=['POST'])
@json_answer
def import_userscript():
    if 'file' not in request.files:
        return {'categories': [], 'notice': 'No file'}
    if request.files['file'].content_length > 512 * 1024:
        return {'categories': [], 'notice': 'Too big file'}
    data = request.files['file'].stream.read().decode('utf-8-sig', 'replace').replace('\r', '')

    with db_session:
        try:
            categories, cat_id, sm_id, missing = userscript_parser.parse(data)
        except userscript_parser.UserscriptParserError as exc:
            return {'categories': [], 'notice': str(exc)}

    return {
        'categories': categories,
        'ids': ([cat_id], sm_id),
        'notice': 'Missing smiles count: {}'.format(missing) if missing > 0 else None
    }
