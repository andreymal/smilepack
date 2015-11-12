# -*- coding: utf-8 -*-

from pony.orm import db_session

from flask import Blueprint, render_template, abort, current_app, request, redirect, url_for
from flask_babel import gettext, format_datetime

from smilepack.models import Section, SmilePack, Smile, Icon
from smilepack.views.utils import user_session


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


@bp.route('/generate', defaults={'smp_id': None})
@bp.route('/generate/<smp_id>')
@user_session
@db_session
def generator(session_id, first_visit, smp_id):
    if smp_id:
        pack = SmilePack.bl.get_by_hid(smp_id)
        if not pack:
            abort(404)
        pack.bl.add_view(request.remote_addr, session_id if not first_visit else None)
    else:
        pack = None

    return render_template(
        'generator.html',
        session_id=session_id,
        first_visit=first_visit,
        pack=pack,
        pack_deletion_date=format_datetime(pack.delete_at) if pack and pack.delete_at else None,
        lifetime=(pack.delete_at - pack.created_at).total_seconds() if pack and pack.delete_at else None,
        icons=Icon.select().order_by(Icon.id)[:],
        collection_data={"sections": Section.bl.get_all_with_categories()},
    )


@bp.route('/setlocale', methods=['GET', 'POST'])
def setlocale():
    locale = request.form.get('locale')
    if locale not in current_app.config['LOCALES']:
        locale = 'en'
    response = current_app.make_response(redirect(url_for('.index')))
    response.set_cookie('locale', locale, max_age=3600 * 24 * 365 * 10)
    return response
