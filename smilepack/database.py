# -*- coding: utf-8 -*-

from pony import orm
from pony.orm import Database


db = Database()


def configure_for_app(app, db_seed=False):
    db.bind(
        app.config['DATABASE_ENGINE'],
        **app.config['DATABASE']
    )
    db.generate_mapping(create_tables=True)
    if db_seed:
        with orm.db_session:
            seed()
    if app.config['SQL_DEBUG']:
        orm.sql_debug(True)

def seed():
    # TODO: remove after admin implementation
    from .models import Icon
    if Icon.select().first():
        return
    Icon(filename='AslrUK1.png', custom_url='https://i.imgur.com/AslrUK1.png').flush()
