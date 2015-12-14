Smilepack
=========

A website where you can create collections on smiles and use it on other sites.


Quick start
-----------

    pip3 install smilepack

    smilepack runserver

It creates `database.sqlite3` in current directory. Address `http://localhost:5000/`.

For production you can use gunicorn (or another WSGI server):

    gunicorn -w 4 'smilepack.application:create_app()'


Configuration
-------------

Default settings are change by `.py` file containing configuration class. Example in `examples/settings.py`. Save it as `local_settings.py` and load using environment variable:

    export SMILEPACK_SETTINGS=local_settings.Production

You can specify any Python object.

For development you can inherit class `smilepack.settings.Development`, for production use `smilepack.settings.Config`.


Database
--------

* `DATABASE_ENGINE` и `DATABASE` are [Pony ORM connection settings](http://doc.ponyorm.com/database.html#database-providers). `examples/settings.py` has example for MySQL. Default database is `sqlite3`.


Smiles
------

Smiles need to be stored somewhere. Use `UPLOAD_METHOD`:

* `None` (default) — don't save. All smiles should be uploaded to some hosting in advance.

* `'imgur'` — upload to Imgur. For this, set `IMGUR_ID` of API application. You need to install `Flask-Imgur`.

* `'directory'` — upload to `SMILES_DIRECTORY`.

If upload method is set, you can disable custom urls of smiles by `ALLOW_CUSTOM_URLS = True`. Then all links of user will reuploaded.

`SMILE_URL` — template for links of smiles stored in `SMILES_DIRECTORY`. Default `/smiles/images/{filename}`; if you use another url (CDN for example), you can set another template here. `ICON_URL` setting is similar.


Utilites
--------

* `smilepack status` — partly verifies the operability of configuration and database;

* `smilepack shell` — runs interactive console with application.
