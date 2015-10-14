Смайлопак
=========

Запускается примерно так:

```
pip3 install -r requirements.txt
export SMILEPACK_SETTINGS=local_settings.Local
python -m smilepack runserver
```


## Плюшки

БД по умолчанию `sqlite3`, конфиг `DATABASE` должен быть в формате [параметров подключения в Pony ORM](http://doc.ponyorm.com/database.html#database-providers).

`memcached` по умолчанию подключен на `127.0.0.1:11211`

Ограничение запросов (Flask-Limiter) по умолчанию подключено на тот же `memcached`, отключается через `RATELIMIT_ENABLED = False` в `local_settings`.

Сборка js в один файл по умолчанию выключена, включается через `USE_BUNDLER = True`. По умолчанию собирает в `media/bundle/generator.js`; каталог необходимо предварительно создать. Сборка командой `python3 -m smilepack bundle`.

По умолчанию логи уровня INFO собираются в stderr всегда; для отключения `LOGGER_STDERR = False`.

Для продакшена с nginx стоит выставить `PROXIES_COUNT = 1`, чтобы забирать IP пользователя из `X-Forwarded-For`, который присылает этот самый nginx.
