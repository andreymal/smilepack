#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from datetime import datetime

from pony.orm import db_session
from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_babel import gettext
from flask_login import login_user, logout_user, current_user

from smilepack.models import User
from smilepack.views.utils import csrf_token, csrf_protect


bp = Blueprint('auth', __name__)


@bp.route('/login/', methods=['GET', 'POST'])
@csrf_protect
@db_session
def login_page():
    if current_user.is_authenticated:
        return redirect(url_for('pages.index'))

    if request.method != 'POST':
        return render_template('login.html')

    user = User.bl.authenticate_by_username(request.form.get('username'), request.form.get('password'))
    if user and login_user(user, remember=request.form.get('remember') == '1'):
        csrf_token(reset=True)
        user.last_login_at = datetime.utcnow()
        return redirect(url_for('pages.index'))

    if user:
        flash(gettext('Account is disabled') if not user.is_active else gettext('Cannot login'))  # TODO: flask-login gettext
    else:
        flash(gettext('Invalid username or password'))

    return render_template('login.html', username=request.form.get('username') or ''), 403


@bp.route('/logout/', methods=['POST'])
@csrf_protect
@db_session
def logout_page():
    logout_user()
    return redirect(url_for('pages.index'))
