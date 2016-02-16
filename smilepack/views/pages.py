# -*- coding: utf-8 -*-

from hashlib import md5

from pony.orm import db_session

from flask import Blueprint, Response, render_template, abort, current_app, request, redirect, url_for
from flask_babel import format_datetime

from smilepack.models import Section, SmilePack, Smile, Icon
from smilepack.views.utils import user_session, for_admin


bp = Blueprint('pages', __name__)


@bp.route('/')
@user_session
@db_session
def index(session_id, first_visit):
    smiles_count = Smile.bl.get_all_collection_smiles_count()

    # TODO: переделать с учётом удаления старых смайлопаков
    smilepacks_count = current_app.cache.get('smilepacks_count')
    if smilepacks_count is None:
        smilepacks_count = SmilePack.select().count()
        current_app.cache.set('smilepacks_count', smilepacks_count, timeout=300)

    smilepacks = SmilePack.bl.get_by_user(session_id) if not first_visit else []
    smilepacks.reverse()
    return render_template(
        'index.html',
        session_id=session_id,
        first_visit=first_visit,
        smilepacks=smilepacks,
        smiles_count=smiles_count,
        smilepacks_count=smilepacks_count,
        new_smiles_json=Smile.bl.get_last_approved_as_json(count=25)
    )


@bp.route('/generate', defaults={'smp_hid': None, 'version': None})
@bp.route('/generate/<smp_hid>', defaults={'version': None})
@bp.route('/generate/<smp_hid>/<int:version>')
@user_session
def generator(session_id, first_visit, smp_hid, version):
    if smp_hid:
        with db_session:  # workaround for add_view (TODO: recheck this)
            packs = SmilePack.bl.get_versions(smp_hid)
            if not packs:
                abort(404)
            pack = None
            for x in packs:
                if version is not None and x.version == version:
                    pack = x
                    break
                elif not version and (not pack or x.version > pack.version):
                    pack = x
            if not pack:
                abort(404)
            pack.bl.add_view(request.remote_addr, session_id)
            pack_id = pack.id
            packs = [x.id for x in packs]
    else:
        pack = None
        pack_id = None
        packs = []

    with db_session:
        pack = SmilePack.get(id=pack_id) if pack_id is not None else None
        packs = SmilePack.select(lambda x: x.id in packs).order_by(SmilePack.version) if packs else []
        return render_template(
            'generator.html',
            session_id=session_id,
            can_edit=pack and pack.user_cookie == session_id,
            first_visit=first_visit,
            pack=pack,
            versions=packs,
            pack_deletion_date=format_datetime(pack.delete_at) if pack and pack.delete_at else None,
            lifetime=(pack.delete_at - pack.created_at).total_seconds() if pack and pack.delete_at else None,
            icons=Icon.bl.select_published()[:],
            icon_size=current_app.config['ICON_SIZE'],
            collection_data={"sections": Section.bl.get_all_with_categories()},
        )


@bp.route('/view/<smp_hid>', defaults={'version': None})
@bp.route('/view/<smp_hid>/<int:version>')
@user_session
def view(session_id, first_visit, smp_hid, version):
    if smp_hid:
        with db_session:
            packs = SmilePack.bl.get_versions(smp_hid)
            if not packs:
                abort(404)
            pack = None
            for x in packs:
                if version is not None and x.version == version:
                    pack = x
                    break
                elif not version and (not pack or x.version > pack.version):
                    pack = x
            if not pack:
                abort(404)
            pack.bl.add_view(request.remote_addr, session_id)
            pack_id = pack.id
            packs = [x.id for x in packs]
    else:
        pack = None
        pack_id = None
        packs = []

    with db_session:
        pack = SmilePack.get(id=pack_id) if pack_id is not None else None
        packs = SmilePack.select(lambda x: x.id in packs).order_by(SmilePack.version) if packs else []
        return render_template(
            'view.html',
            session_id=session_id,
            first_visit=first_visit,
            pack=pack,
            versions=packs,
            pack_deletion_date=format_datetime(pack.delete_at) if pack and pack.delete_at else None,
            lifetime=(pack.delete_at - pack.created_at).total_seconds() if pack and pack.delete_at else None,
        )


@bp.route('/admin/')
@db_session
@for_admin
def admin():
    return render_template(
        'admin.html',
        icons=Icon.bl.select_published()[:],
        admin_icons=Icon.select()[:],
        icon_size=current_app.config['ICON_SIZE'],
    )


@bp.route('/setlocale', methods=['GET', 'POST'])
def setlocale():
    locale = request.form.get('locale')
    if locale not in current_app.config['LOCALES']:
        locale = 'en'
    response = current_app.make_response(redirect(url_for('.index')))
    response.set_cookie('locale', locale, max_age=3600 * 24 * 365 * 10)
    return response


@bp.route('/robots.txt', methods=['GET'])
def robots():
    hosthash = md5(request.url_root.encode('utf-8')).hexdigest()
    data = current_app.cache.get('robots_' + hosthash)
    if not data:
        with db_session:
            data = render_template('robots.txt')
        current_app.cache.set('robots_' + hosthash, data, timeout=3600 * 24)
    return Response(data, mimetype='text/plain; charset=utf-8')


@bp.route('/sitemap.xml', methods=['GET'])
@db_session
def sitemap():
    hosthash = md5(request.url_root.encode('utf-8')).hexdigest()
    data = current_app.cache.get('sitemap_' + hosthash)
    if not data:
        with db_session:
            last_smile = Smile.bl.get_last_approved(count=1)
            last_smile = last_smile[0] if last_smile else None
            data = render_template('sitemap.xml', last_modified=last_smile.updated_at if last_smile else None)
        current_app.cache.set('sitemap_' + hosthash, data, timeout=300)
    return Response(data, mimetype='text/xml; charset=utf-8')
