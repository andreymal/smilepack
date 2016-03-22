#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# pylint: disable=redefined-outer-name,unused-variable

from flask import url_for

from smilepack.database import db


def test_selenium_stub(app, client, selenium, live_server, factories):
    smiles = [factories.PublishedSmileFactory() for _ in range(29)]
    smiles.append(factories.PublishedSmileFactory(category=smiles[0].category))
    hidden_smile = factories.SmileFactory(approved_at=None)
    db.commit()

    selenium.get(url_for('pages.index', _external=True))

    web_smiles = selenium.find_elements_by_css_selector('#new-smiles > a')
    assert len(web_smiles) == 25

    web_category_ids = [int(x.get_attribute('href').split('#')[1]) for x in web_smiles]
    assert web_category_ids == [x.category.id for x in reversed(smiles[-25:])]
