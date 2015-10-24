#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from flask import Blueprint, render_template, abort, current_app, request
from flask.ext.babel import format_datetime

from ..models import Section, SmilePack, Smile, Icon
from .utils import user_session
from ..db import db_session


pages = Blueprint('pages', __name__)


@pages.route('/')
@user_session
@db_session
def index(session_id, first_visit):
    # TODO: перенести это в bl
    smiles_count = current_app.cache.get('smiles_count')
    if smiles_count is None:
        smiles_count = Smile.select(lambda x: x.category is not None).count()
        current_app.cache.set('smiles_count', smiles_count, timeout=300)

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
    )


@pages.route('/generate', defaults={'smp_id': None})
@pages.route('/generate/<smp_id>')
@user_session
@db_session
def generator(session_id, first_visit, smp_id):
    if smp_id:
        pack = SmilePack.bl.get_by_hid(smp_id)
        if not pack:
            abort(404)
    else:
        pack = None

    return render_template(
        'generator.html',
        session_id=session_id,
        first_visit=first_visit,
        pack=pack,
        pack_deletion_date=format_datetime(pack.delete_at) if pack and pack.delete_at else None,
        lifetime=(pack.delete_at - pack.created_at).total_seconds if pack and pack.delete_at else None,
        icons=Icon.select().order_by(Icon.id)[:],
        collection_data={"sections": Section.bl.get_all_with_categories()},
    )
