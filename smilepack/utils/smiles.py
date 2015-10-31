#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import re
import time
from hashlib import sha256

from pony import orm
from smilepack.models import Smile


def calc_hashsums_if_needed(store_path=None):
    store = {}
    if store_path:
        for x in open(store_path, 'r'):
            sm_id, value = x.strip().split(' ', 1)
            sm_id = int(sm_id)
            if not re.match(r'^[0-9a-f]{64}$', value):
                raise ValueError(value)
            if sm_id in store and store[sm_id] != value:
                raise ValueError('Duplicate smile hash {}'.format(sm_id))
            store[sm_id] = value

    pagesize = 500
    min_id = orm.select(orm.min(x.id) for x in Smile).first()
    if min_id is None:
        print('Nothing.')
        return

    tic = 0.5
    tm = time.time() - tic

    while True:
        smiles = Smile.select(lambda x: x.id >= min_id).order_by(Smile.id)[:pagesize]
        if not smiles:
            break

        for smile in smiles:
            tm2 = time.time()
            if tm2 - tm >= tic:
                print(smile.id, end='\r')
                while tm2 - tm >= tic:
                    tm += tic

            if smile.id in store:
                smile.hashsum = store[smile.id]
                smile.flush()
                continue

            try:
                data = smile.bl.open().read()
                if not data:
                    raise IOError('Empty data')
            except IOError as exc:
                print('Cannot load smile {}: {}'.format(smile.id, str(exc)))
                continue

            smile.hashsum = sha256(data).hexdigest()
            smile.flush()

        min_id = smiles[-1].id + 1
    print()