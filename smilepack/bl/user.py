#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
from base64 import b64decode, b64encode

import scrypt
from werkzeug.security import safe_str_cmp


from smilepack.bl.utils import BaseBL


__all__ = ['UserBL']


class UserBL(BaseBL):
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

        return safe_str_cmp(h, self.generate_password_hash(password, b64_salt, Nexp, r, p, keylen))

    def authenticate_by_username(self, username, password):
        user = self._model().select(lambda x: x.username == username).first() if username else None
        if user and user.bl.authenticate(password):
            return user

    def set_password(self, password):
        b64_salt = b64encode(os.urandom(32)).decode('ascii')
        args = {'b64_salt': b64_salt, 'Nexp': 14, 'r': 8, 'p': 1, 'keylen': 64}
        h = self.generate_password_hash(password, **args)
        self._model().password = '$scrypt${b64_salt}${Nexp}${r}${p}${keylen}${h}'.format(h=h, **args)

    def generate_password_hash(self, password, b64_salt, Nexp=14, r=8, p=1, keylen=64):
        h = scrypt.hash(
            password.encode('utf-8'),
            b64decode(b64_salt),
            2 << Nexp, r, p, keylen
        )
        return b64encode(h).decode('ascii')
