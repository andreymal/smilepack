#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from pony.orm import db_session
from flask import Blueprint, request

from smilepack import models
from smilepack.views.utils import for_admin, json_answer, default_crossdomain


bp = Blueprint('admin', __name__)


@bp.route('/nonapproved')
@default_crossdomain()
@json_answer
@db_session
@for_admin
def new():
    older = request.args.get('older')
    if older and older.isdigit():
        older = int(older)
    else:
        older = None
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
    return {'smiles': models.Smile.bl.get_last_nonapproved_as_json(older=older, offset=offset, count=count)}
