#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from datetime import datetime

import factory

from smilepack import models


class PonyFactory(factory.Factory):
    class Meta(object):
        abstract = True

    @classmethod
    def _build(cls, model_class, *args, **kwargs):
        return model_class(*args, **kwargs)

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        obj = model_class(*args, **kwargs)
        obj.flush()
        return obj


class IconFactory(PonyFactory):
    class Meta(object):
        model = models.Icon

    filename = 'KbXkgQ8.png'
    custom_url = factory.Sequence(lambda n: "https://i.imgur.com/KbXkgQ8.png?%d" % n)
    approved_at = factory.LazyAttribute(lambda obj: datetime.utcnow())
    hashsum = factory.Sequence(lambda n: "TestIconHash%d" % n)

    # TODO: IconHash, IconUrl


class SectionFactory(PonyFactory):
    class Meta(object):
        model = models.Section

    name = factory.Sequence(lambda n: "Section %d" % n)
    icon = factory.SubFactory(IconFactory)


class SubSectionFactory(PonyFactory):
    class Meta(object):
        model = models.SubSection

    name = factory.Sequence(lambda n: "SubSection %d" % n)
    icon = factory.SubFactory(IconFactory)
    section = factory.SubFactory(SectionFactory)


class CategoryFactory(PonyFactory):
    class Meta(object):
        model = models.Category

    name = factory.Sequence(lambda n: "Category %d" % n)
    icon = factory.SubFactory(IconFactory)
    subsection = factory.SubFactory(SubSectionFactory)


class SmileFactory(PonyFactory):
    class Meta(object):
        model = models.Smile

    filename = 'YyiByVa.png'
    custom_url = factory.Sequence(lambda n: "https://i.imgur.com/YyiByVa.png?%d" % n)
    width = 70
    height = 70
    hashsum = factory.Sequence(lambda n: "TestSmileHash%d" % n)

    # TODO: SmileHash, SmileUrl


class PublishedSmileFactory(SmileFactory):
    category = factory.SubFactory(CategoryFactory)
    approved_at = factory.LazyAttribute(lambda obj: datetime.utcnow())
