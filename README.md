Смайлопак
=========

Запускается примерно так:

```
pip3 install -r requirements.txt
export SMILEPACK_SETTINGS=local_settings.Local
python3 -m smilepack status  # проверка конфигурации
python3 -m smilepack runserver
```


## Плюшки

БД по умолчанию `sqlite3`, конфиг `DATABASE` должен быть в формате [параметров подключения в Pony ORM](http://doc.ponyorm.com/database.html#database-providers).

`memcached` по умолчанию подключен на `127.0.0.1:11211`

Ограничение числа запросов (Flask-Limiter) по умолчанию подключено на тот же `memcached`, отключается через `RATELIMIT_ENABLED = False` в `local_settings`.

Сборка js в один файл по умолчанию выключена, включается через `USE_BUNDLER = True`. По умолчанию собирает в `media/bundle/generator.js`; каталог необходимо предварительно создать. Сборка командой `python3 -m smilepack bundle`.

По умолчанию логи уровня INFO собираются в stderr всегда; для отключения `LOGGER_STDERR = False`.

Для продакшена с nginx стоит выставить `PROXIES_COUNT = 1`, чтобы забирать IP пользователя из `X-Forwarded-For`, который присылает этот самый nginx.

Загрузка на имгур включается через `UPLOAD_METHOD = 'imgur'` и указание айдишника приложения в `IMGUR_ID`. Загрузка в папочку — `UPLOAD_METHOD = 'directory'` и `SMILES_DIRECTORY = '/путь/к/смайликам/'`.


## Утилиты

* `python3 -m smilepack shell` — загружает приложение и запускает интерактивную консоль;

* `python3 -m smilepack rehash_custom_urls` — пересчитать хэши кастомных ссылок на смайлики (скорее всего выполнять не потребуется);

* `python3 -m smilepack rehash_smiles [путь/к/файлику_с_хэшами.txt]` — считает sha256-хэши смайликов, которые по каким-то причинам хэша ещё не имеют. Файлик с хэшами (со строками в формате `id sha256sum`) пригодится, если пересчитывать много, а смайлики есть локально: для расчёта хэша смайлики будут качаться и из интернетов в том числе (по кастомным ссылкам), а это долго.
