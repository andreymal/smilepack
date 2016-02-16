#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import jsonschema
from pony.orm import db_session
from flask import Blueprint, render_template, request, redirect, url_for
from flask_babel import gettext
from flask_login import current_user

from smilepack.views.utils import csrf_protect
from smilepack.utils.exceptions import BadRequestError


bp = Blueprint('settings', __name__)


@bp.route('/settings/', methods=['GET', 'POST'])
@csrf_protect
@db_session
def settings_page():
    if not current_user.is_authenticated:
        return redirect(url_for('auth.login_page'))

    if request.method != 'POST':
        return render_template('settings.html')

    errors = []

    if request.form.get('password1'):
        if request.form.get('password1') != request.form.get('password2'):
            errors.append(gettext('Passwords do not match'))
        elif not current_user.bl.authenticate(request.form.get('current_password')):
            errors.append(gettext('Current password is incorrect'))
        else:
            try:
                # User.bl.set_password() has no validation
                current_user.bl.edit({'password': request.form.get('password1')})
            except jsonschema.ValidationError as exc:
                errors.append(exc.message)
            except BadRequestError as exc:
                errors.append(str(exc))  # TODO: gettext later

    return render_template('settings.html', errors=errors, ok=not errors), (422 if errors else 200)
