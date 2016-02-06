Smilepack
=========

A website where you can create collections on smiles and use it on other sites.


Quick start
-----------

Install Smilepack from PyPI:

    pip3 install smilepack

Create administrator account:

    smilepack createsuperuser

It also creates `database.sqlite3` in current directory.

Run HTTP server:

    smilepack runserver

Now website is available at `http://localhost:5000/` and ready for use, but uploading of icons and smiles is recommended:

Open `http://localhost:5000/login/` and login as administrator. Open `http://localhost:5000/admin/`, click "Other actions" -> "Icon management" and upload at least one icon (don't forget to configure uploader if you wish upload icon from computer). Tick uploaded icon to publish it, and refresh the page. Now you can create categories of collection and upload smiles here.

For production you can use gunicorn (or another WSGI server):

    gunicorn -w 4 'smilepack.application:create_app()'


Configuration
-------------

You can change default settings by `.py` file containing configuration class. Example in `examples/settings.py`. Save it as `local_settings.py` and load using environment variable:

    export SMILEPACK_SETTINGS=local_settings.Production

You can specify any Python object. Be sure that `local_settings.py` must be available in `PYTHONPATH`.

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

`ICON_UPLOAD_METHOD` setting is similar.

If upload method is set, you can disable custom urls of smiles by `ALLOW_CUSTOM_URLS = True`. Then all links of user will reuploaded.

`SMILE_URL` — template for links of smiles stored in `SMILES_DIRECTORY`. Default `/smiles/images/{filename}`; if you use another url (CDN for example), you can set another template here. `ICON_URL` setting is similar.


Utilites
--------

* `smilepack status` — partly verifies the operability of configuration and database;

* `smilepack shell` — runs interactive console with application.
