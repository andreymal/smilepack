#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from datetime import datetime

from pony import orm
from flask import current_app

from smilepack.database import db
from smilepack.bl.registry import Resource


class Icon(db.Entity):
    """Иконка категории или раздела"""
    filename = orm.Required(str, 128)
    custom_url = orm.Optional(str, 512)
    created_at = orm.Required(datetime, default=datetime.utcnow)
    updated_at = orm.Required(datetime, default=datetime.utcnow)

    sections = orm.Set('Section')
    subsections = orm.Set('SubSection')
    categories = orm.Set('Category')
    pack_categories = orm.Set('SmilePackCategory')
    tags = orm.Set('Tag')

    @property
    def url(self):
        return self.custom_url or current_app.config['ICON_URL'].format(id=self.id, filename=self.filename)

    def before_update(self):
        self.updated_at = datetime.utcnow()


class Section(db.Entity):
    """Раздел (например, «My Little Pony»)"""
    name = orm.Required(str, 128)
    icon = orm.Required(Icon)
    description = orm.Optional(str, 16000)
    subsections = orm.Set('SubSection')
    order = orm.Required(int, default=0)
    tags = orm.Set('Tag')
    tag_synonyms = orm.Set('TagSynonym')
    created_at = orm.Required(datetime, default=datetime.utcnow)
    updated_at = orm.Required(datetime, default=datetime.utcnow)

    bl = Resource('bl.section')

    def before_update(self):
        self.updated_at = datetime.utcnow()


class SubSection(db.Entity):
    """Подраздел (например, «Mane 6»)"""
    name = orm.Required(str, 128)
    icon = orm.Required(Icon)
    description = orm.Optional(str, 16000)
    section = orm.Required(Section)
    categories = orm.Set('Category')
    order = orm.Required(int, default=0)
    created_at = orm.Required(datetime, default=datetime.utcnow)
    updated_at = orm.Required(datetime, default=datetime.utcnow)

    bl = Resource('bl.subsection')

    def before_update(self):
        self.updated_at = datetime.utcnow()


class Category(db.Entity):
    """Категория (например, «Твайлайт Спаркл»)"""
    subsection = orm.Required(SubSection)
    name = orm.Required(str, 128)
    icon = orm.Required(Icon)
    description = orm.Optional(str, 16000)
    smiles = orm.Set('Smile')
    order = orm.Required(int, default=0)
    created_at = orm.Required(datetime, default=datetime.utcnow)
    updated_at = orm.Required(datetime, default=datetime.utcnow)

    bl = Resource('bl.category')

    def before_update(self):
        self.updated_at = datetime.utcnow()


class Smile(db.Entity):
    """Смайлик, как из коллекции, так и пользовательский"""
    category = orm.Optional(Category, index=True)
    filename = orm.Required(str, 128, index=True)  # индекс для поиска смайликов по готовым ссылкам
    width = orm.Required(int)
    height = orm.Required(int)
    custom_url = orm.Optional(str, 512)
    description = orm.Optional(str, 16000)
    tags = orm.Set('Tag')
    tags_cache = orm.Optional(str, nullable=True)
    order = orm.Required(int, default=0)
    is_submission = orm.Required(bool, default=False)
    created_at = orm.Required(datetime, default=datetime.utcnow)
    approved_at = orm.Optional(datetime, nullable=True, index=True)
    updated_at = orm.Required(datetime, default=datetime.utcnow)
    hashsum = orm.Optional(str, 128, index=True)
    hashes = orm.Set('SmileHash')

    user_addr = orm.Optional(str, 255, nullable=True, default=None)  # TODO: другой тип?
    user_cookie = orm.Optional(str, 64, nullable=True, default=None)

    smp_smiles = orm.Set('SmilePackSmile')
    urls = orm.Set('SmileUrl')

    bl = Resource('bl.smile')

    @property
    def tags_list(self):
        if self.tags_cache is not None and not self.tags_cache:
            return []
        if self.tags_cache is not None:
            return self.tags_cache.split(',')
        return [x.name for x in self.tags]

    @property
    def url(self):
        return self.custom_url or current_app.config['SMILE_URL'].format(id=self.id, filename=self.filename)

    def before_update(self):
        self.updated_at = datetime.utcnow()


class SmileUrl(db.Entity):
    """Ссылка, привязанная к смайлику. Чтобы не пересоздавать один и тот же смайлик несколько раз."""
    url_hash = orm.Required(str, 40, index=True, unique=True)
    url = orm.Optional(str, 512)
    smile = orm.Required(Smile)


class SmileHash(db.Entity):
    """Хэш, привязанная к смайлику. Может быть несколько хэшей у смайлика (сжатый и несжатый варианты, например)."""
    hashsum = orm.Required(str, 128, index=True, unique=True)
    smile = orm.Required(Smile)


class Tag(db.Entity):
    """Тег смайликов (например, «твайлайт спаркл»)"""
    section = orm.Required(Section, index=True)
    name = orm.Required(str, 64, index=True, unique=True)
    description = orm.Optional(str, 16000)
    icon = orm.Optional(Icon)
    smiles = orm.Set(Smile)
    smiles_count = orm.Required(int, default=0, index=True)
    created_at = orm.Required(datetime, default=datetime.utcnow)
    updated_at = orm.Required(datetime, default=datetime.utcnow)

    synonyms = orm.Set('TagSynonym')

    orm.composite_key(section, name)

    bl = Resource('bl.tag')

    def before_update(self):
        self.updated_at = datetime.utcnow()


class TagSynonym(db.Entity):
    """Синоним тега смайлика (например, «twilight sparkle» -> «твайлайт спаркл»)"""
    section = orm.Required(Section, index=True)
    name = orm.Required(str, 64, unique=True)
    tag = orm.Required(Tag)
    tag_name = orm.Required(str, 64)  # экономим на джойне

    orm.composite_key(section, name)


class SmilePack(db.Entity):
    """Смайлопак"""
    hid = orm.Required(str, 16, index=True, unique=True)
    user_addr = orm.Optional(str, 255, nullable=True, default=None)
    user_cookie = orm.Required(str, 64, index=True)
    categories = orm.Set('SmilePackCategory')
    name = orm.Optional(str, 64)
    description = orm.Optional(str, 16000)
    views_count = orm.Required(int, default=0, index=True)
    last_viewed_at = orm.Optional(datetime, default=datetime.utcnow)
    created_at = orm.Required(datetime, default=datetime.utcnow)
    updated_at = orm.Required(datetime, default=datetime.utcnow)
    delete_at = orm.Optional(datetime, default=datetime.utcnow)

    bl = Resource('bl.smilepack')

    def before_update(self):
        self.updated_at = datetime.utcnow()


class SmilePackCategory(db.Entity):
    """Категория смайлопака"""
    smilepack = orm.Required(SmilePack)
    name = orm.Required(str, 128)
    icon = orm.Required(Icon)
    description = orm.Optional(str, 16000)
    smiles = orm.Set('SmilePackSmile')
    order = orm.Required(int, default=0)
    created_at = orm.Required(datetime, default=datetime.utcnow)
    updated_at = orm.Required(datetime, default=datetime.utcnow)

    bl = Resource('bl.smilepack_category')

    def before_update(self):
        self.updated_at = datetime.utcnow()


class SmilePackSmile(db.Entity):
    category = orm.Required(SmilePackCategory)
    smile = orm.Required(Smile)
    order = orm.Required(int, default=0)
    width = orm.Optional(int)
    height = orm.Optional(int)
