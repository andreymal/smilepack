#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import zlib
from hashlib import md5
from pony.orm import db_session
from flask import Blueprint, Response, abort, render_template, current_app, request, url_for
from flask_babel import format_datetime

from smilepack.models import SmilePack, SmilePackCategory, Icon
from smilepack.views.utils import user_session, json_answer, default_crossdomain
from smilepack.utils import userscript_parser
from smilepack.utils.exceptions import BadRequestError


bp = Blueprint('smilepacks', __name__)


@bp.route('/<smp_hid>', defaults={'version': None})
@bp.route('/<smp_hid>/<int:version>')
@user_session
@default_crossdomain()
@json_answer
def show_version(session_id, first_visit, smp_hid, version):
    with db_session:  # workaround for add_view (TODO: recheck this)
        smp = SmilePack.bl.get_by_hid(smp_hid, version=version)
        if not smp:
            abort(404)
        smp.bl.add_view(request.remote_addr, session_id)
        smp_id = smp.id

    with db_session:
        smp = SmilePack.get(id=smp_id)
        return smp.bl.as_json(with_smiles=request.args.get('full') == '1')


@bp.route('/<smp_hid>/<int:version>/<int:category_id>')
@default_crossdomain()
@json_answer
@db_session
def show_category(smp_hid, version, category_id):
    cat = SmilePackCategory.bl.get_by_smilepack(smp_hid, category_id, version=version)
    if not cat:
        abort(404)

    return cat.bl.as_json(with_smiles=True)


@bp.route('/<smp_hid>.compat.user.js')
@user_session
def download_compat(session_id, first_visit, smp_hid):
    with db_session:
        smp = SmilePack.bl.get_by_hid(smp_hid)
        if not smp:
            abort(404)
        smp.bl.add_view(request.remote_addr, session_id)
        smp_id = smp.id

    mode, websites = _load_websites(request.cookies)

    websites_hash = '{}:{}'.format(mode, '\x00'.join(websites))
    websites_hash = md5(websites_hash.encode('utf-8')).hexdigest()

    ckey = 'compat_js_{}_{}'.format(smp_hid, websites_hash)
    result = current_app.cache.get(ckey)

    if result:
        # У memcached ограничение на размер данных, перестраховываемся
        result = zlib.decompress(result)
    else:
        with db_session:
            smp = SmilePack.get(id=smp_id)
            result = render_template(
                'smilepack_classic.js',
                pack=smp,
                pack_name=(smp.name or smp.hid).replace('\r', '').replace('\n', '').strip(),
                pack_json_compat=smp.bl.as_json_compat(),
                host=request.host,
                generator_url=url_for('pages.generator', smp_hid=None, _external=True),
                pack_ico_url=Icon.select().first().url,
                websites_mode=mode,
                websites_list=websites,
            ).encode('utf-8')

        current_app.cache.set(ckey, zlib.compress(result), timeout=3600)

    return Response(result, mimetype='text/javascript; charset=utf-8')


@bp.route('/', methods=['POST'])
@user_session
@default_crossdomain(methods=['POST'])
@json_answer
@db_session
def create(session_id, first_visit):
    r = request.json
    if not r or not r.get('smilepack'):
        raise BadRequestError('Empty request')

    pack = SmilePack.bl.create(
        r['smilepack'],
        session_id,
        user_addr=request.remote_addr,
    )

    deletion_date = pack.delete_at

    return {
        'name': pack.name,
        'can_edit': True,
        'smilepack_id': pack.hid,
        'version': pack.version,
        'download_url': url_for('.download_compat', smp_hid=pack.hid, _external=True),
        'view_url': url_for('pages.generator', smp_hid=pack.hid, _external=True),
        'mini_view_url': url_for('pages.view', smp_hid=pack.hid, _external=True),
        'path': url_for('pages.generator', smp_hid=pack.hid),
        'extended_path': url_for('pages.generator', smp_hid=pack.hid, version=pack.version),
        'created_at': pack.created_at.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'fancy_created_at': format_datetime(pack.created_at),
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


def _load_websites(data):
    if data.get('websitesmode') == 'blacklist':
        mode = 'blacklist'
    elif data.get('websitesmode') == 'whitelist':
        mode = 'whitelist'
    else:
        mode = current_app.config['DEFAULT_WEBSITES_MODE']

    if mode =='blacklist':
        if data.get('websitesblacklist'):
            websites = data['websitesblacklist'].split('|')
        else:
            websites = current_app.config['DEFAULT_WEBSITES_BLACKLIST']
    elif mode == 'whitelist':
        mode = 'whitelist'
        if data.get('websiteswhitelist'):
            websites = data['websiteswhitelist'].split('|')
        else:
            websites = current_app.config['DEFAULT_WEBSITES_WHITELIST']
    else:
        raise RuntimeError('Looks like invalid configuration; please check DEFAULT_WEBSITES_MODE')

    result = []
    for site in websites:
        if not site:
            continue
        site = site.strip()
        if not site:
            continue

        if '/' not in site:
            site += '/*'
        if '://' in site:
            result.append(site)
        else:
            result.append('http://' + site)
            result.append('https://' + site)
    result.sort()  # normalize for md5
    return mode, result
