# -*- coding: utf-8 -*-

from hashlib import md5
from pony import orm

from flask import current_app

from smilepack.models import Smile, SmileUrl


def check_and_normalize(url):
    if not url or not isinstance(url, str):
        raise ValueError('Invalid url')
    if url.startswith('//'):
        url = 'http:' + url
    if not url.startswith('http://') and not url.startswith('https://'):
        raise ValueError('Invalid url {}'.format(url))
    return url


def hash_url(url):
    return md5(url.encode('utf-8')).hexdigest()


def parse_by_regex(url):
    for item in current_app.config['URL_PARSER_REGEX']:
        m = item['re'].search(url)
        if not m:
            continue

        result = {}

        try:
            result['id'] = int(m.group('id'))
        except IndexError:
            pass

        try:
            result['filename'] = m.group('filename')
        except IndexError:
            pass

        if result:
            return result
    return None


def parse(urls):
    parsed_urls = []
    ids = []
    filenames = []

    for url in urls:
        if not url:
            parsed_urls.append({})
            continue
        r = parse_by_regex(url)
        if r:
            parsed_urls.append(r)
            if 'id' in r:
                ids.append(r['id'])
            if 'filename' in r:
                filenames.append(r['filename'])
        else:
            parsed_urls.append({})

    return {
        'parsed_urls': parsed_urls,
        'ids': ids,
        'filenames': filenames
    }


def rehash_custom_smiles(min_id=None, pagesize=500):
    print('Checking duplicates...')
    d = orm.select((x.custom_url, orm.count(x.id)) for x in Smile if x.custom_url is not None).order_by(-1, 2)[:21]
    if d and d[0][1] > 1:
        if len(d) <= 20:
            print('You have {} duplicates:\n{}\nPlease fix it.'.format(
                len(d),
                '\n'.join(' - {} ({})'.format(*x) for x in d)
            ))
        else:
            print('You have more than 20 duplicates. Please fix it.')
        return

    if min_id is None:
        min_id = orm.select(orm.min(x.id) for x in Smile).first()
    if min_id is None:
        print('Nothing.')
        return

    while True:
        smiles = Smile.select(lambda x: x.id >= min_id).order_by(Smile.id)[:pagesize]
        if not smiles:
            break
        print('{}...'.format(smiles[0].id))
        min_id = smiles[-1].id + 1

        orm.commit()

        for smile in smiles:
            if not smile.custom_url:
                continue
            url = smile.url
            url_hash = hash_url(url)

            u = SmileUrl.select(lambda x: x.url_hash == url_hash).first()
            if u:
                if u.url != url:
                    u.url = url
                if u.smile != smile:
                    u.smile = smile
                u.flush()
            else:
                u = SmileUrl(
                    url_hash=url_hash,
                    url=url,
                    smile=smile
                ).flush()
