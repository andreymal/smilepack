#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# pylint: disable=redefined-outer-name,unused-variable

from flask import url_for


def test_data_stub(app, client):
    res = client.get(url_for('pages.index'))
    assert b'<h1 class="sitename">' in res.data


def test_json_stub(app, client, factories):
    smile = factories.PublishedSmileFactory()
    hidden_smile = factories.SmileFactory()
    res = client.get(url_for('smiles.new'))
    data = res.json['smiles']
    assert len(data) == 1
    assert data[0]['id'] == smile.id
    assert data[0]['category'] == [smile.category.id, smile.category.name]
    assert data[0]['url'] == smile.url
