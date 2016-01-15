#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from pony.orm import db_session

from flask import Blueprint, render_template, abort, current_app, request, redirect, url_for, flash
from flask_babel import gettext, format_datetime
from flask_login import login_user, logout_user, current_user

from smilepack.models import User
from smilepack.views.utils import user_session, csrf_token, csrf_protect


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
    if user:
        login_user(user)
        csrf_token(reset=True)
        return redirect(url_for('pages.index'))
    else:
        flash('Invalid username or password')
        return render_template('login.html', username=request.form.get('username') or '')  # TODO: HTTP Status


@bp.route('/logout/', methods=['POST'])
@csrf_protect
@db_session
def logout_page():
    logout_user()
    return redirect(url_for('pages.index'))
