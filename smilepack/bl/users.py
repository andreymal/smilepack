#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
from base64 import b64decode, b64encode

import scrypt
import jsonschema
from werkzeug.security import safe_str_cmp

from smilepack import schemas
from smilepack.bl.utils import BaseBL
from smilepack.utils.exceptions import BadRequestError


__all__ = ['UserBL']


class UserBL(BaseBL):
    def create(self, data):
        jsonschema.validate(data, schemas.USER)

        if 'username' not in data or 'password' not in data:
            raise BadRequestError('Please set username and password')

        if self._model().select(lambda x: x.username == data['username']):
            raise BadRequestError('User already exists')

        if not self.is_password_good(data['password'], extra=(data['username'],)):
            raise BadRequestError('Password is too bad, please change it')

        user = self._model()(
            username=data['username'],
            is_admin=data.get('is_admin', False),
            is_superadmin=data.get('is_superadmin', False),
            is_active=data.get('is_active', True),
        )
        user.flush()  # for user.id
        user.bl.set_password(data['password'])
        return user

    def edit(self, data, edited_by=None):
        jsonschema.validate(data, schemas.USER)

        user = self._model()
        old_username = user.username
        for key in ('username', 'is_admin', 'is_superadmin', 'is_active'):
            if key in data:
                if edited_by and edited_by.id == user.id:
                    raise BadRequestError('You can not edit yourself')
                setattr(user, key, data[key])
        if 'password' in data:
            if not self.is_password_good(data['password'], extra=(user.username, old_username)):
                raise BadRequestError('Password is too bad, please change it')
            user.bl.set_password(data['password'])

        return user

    def authenticate(self, password):
        if not password:
            return False

        data = self._model().password
        if not data:
            return False
        if not data.startswith('$scrypt$'):
            raise NotImplementedError('Unknown algorithm')
        try:
            b64_salt, Nexp, r, p, keylen, h = data.split('$')[2:]
            Nexp = int(Nexp, 10)
            r = int(r, 10)
            p = int(p, 10)
            keylen = int(keylen, 10)
        except:
            raise ValueError('Invalid hash format')

        return safe_str_cmp(h, self._generate_password_hash(password, b64_salt, Nexp, r, p, keylen))

    def authenticate_by_username(self, username, password):
        user = self._model().select(lambda x: x.username == username).first() if username else None
        if user and user.bl.authenticate(password):
            return user

    def set_password(self, password):
        if not password:
            self._model().password = ''
            return

        b64_salt = b64encode(os.urandom(32)).decode('ascii')
        args = {'b64_salt': b64_salt, 'Nexp': 14, 'r': 8, 'p': 1, 'keylen': 64}
        h = self._generate_password_hash(password, **args)
        self._model().password = '$scrypt${b64_salt}${Nexp}${r}${p}${keylen}${h}'.format(h=h, **args)

    def _generate_password_hash(self, password, b64_salt, Nexp=14, r=8, p=1, keylen=64):
        h = scrypt.hash(
            password.encode('utf-8'),
            b64decode(b64_salt),
            2 << Nexp, r, p, keylen
        )
        return b64encode(h).decode('ascii')

    def is_password_good(self, password, extra=()):
        if password in extra:
            return False
        if password in ('password', 'qwer1234'):
            return False
        if password == (password[0] * len(password)):
            return False
        for seq in ('1234567890', 'qwertyuiop', 'q1w2e3r4t5y6u7i8o9p0'):
            v = ''
            for x in seq:
                v += x
                if password == v:
                    return False
        return True

    def as_json(self):
        user = self._model()
        return {
            'id': user.id,
            'username': user.username,
            'created_at': user.created_at.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'updated_at': user.updated_at.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'last_login_at': user.last_login_at.strftime('%Y-%m-%dT%H:%M:%SZ') if user.last_login_at else None,
            'is_admin': user.is_admin,
            'is_superadmin': user.is_superadmin,
            'is_active': user.is_active,
        }
