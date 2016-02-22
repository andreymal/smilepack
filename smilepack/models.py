#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from datetime import datetime

from pony import orm
from flask import current_app
from flask_login import UserMixin

from smilepack.database import db
from smilepack.bl.registry import Resource


class User(db.Entity, UserMixin):
    username = orm.Required(str, 32, unique=True, autostrip=False)
    password = orm.Optional(str, 255, default='')
    is_admin = orm.Required(bool, default=lambda: False)
    is_superadmin = orm.Required(bool, default=lambda: False)
    is_active = orm.Required(bool, default=lambda: True)
    created_at = orm.Required(datetime, default=datetime.utcnow)
    updated_at = orm.Required(datetime, default=datetime.utcnow)
    last_login_at = orm.Optional(datetime)

    bl = Resource('bl.user')

    def before_update(self):
        self.updated_at = datetime.utcnow()


class Icon(db.Entity):
    """Иконка категории или раздела"""
    filename = orm.Required(str, 128, autostrip=False)
    custom_url = orm.Optional(str, 512, autostrip=False)
    created_at = orm.Required(datetime, default=datetime.utcnow)
    approved_at = orm.Optional(datetime, nullable=True)
    updated_at = orm.Required(datetime, default=datetime.utcnow)
    hashsum = orm.Optional(str, 128, index=True)

    user_addr = orm.Optional(str, 255, nullable=True, default=None)  # TODO: другой тип?
    user_cookie = orm.Optional(str, 64, nullable=True, default=None)

    sections = orm.Set('Section')
    subsections = orm.Set('SubSection')
    categories = orm.Set('Category')
    pack_categories = orm.Set('SmilePackCategory')
    tags = orm.Set('Tag')

    hashes = orm.Set('IconHash')
    urls = orm.Set('IconUrl')

    bl = Resource('bl.icon')

    @property
    def url(self):
        return self.custom_url or current_app.config['ICON_URL'].format(id=self.id, filename=self.filename)

    def before_update(self):
        self.updated_at = datetime.utcnow()


class IconUrl(db.Entity):
    """Ссылка, привязанная к иконке. Чтобы не пересоздавать одну и ту же иконку несколько раз."""
    url_hash = orm.Required(str, 128, index=True, unique=True, autostrip=False)
    url = orm.Optional(str, 512, autostrip=False)
    icon = orm.Required(Icon)


class IconHash(db.Entity):
    """Хэш, привязанный к иконке. Может быть несколько хэшей у иконки (сжатый и несжатый варианты, например)."""
    hashsum = orm.Required(str, 128, index=True, unique=True, autostrip=False)
    icon = orm.Required(Icon)


class Section(db.Entity):
    """Раздел (например, «My Little Pony»)"""
    name = orm.Required(str, 128, autostrip=False)
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
    name = orm.Required(str, 128, autostrip=False)
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
    name = orm.Required(str, 128, autostrip=False)
    icon = orm.Required(Icon)
    description = orm.Optional(str, 16000)
    smiles_count = orm.Required(int, default=0)
    order = orm.Required(int, default=0)
    created_at = orm.Required(datetime, default=datetime.utcnow)
    updated_at = orm.Required(datetime, default=datetime.utcnow)

    smiles = orm.Set('Smile')

    bl = Resource('bl.category')

    def before_update(self):
        self.updated_at = datetime.utcnow()

    def select_approved_smiles(self):
        return self.smiles.select(lambda x: x.category is not None and x.approved_at is not None)


class Smile(db.Entity):
    """Смайлик, как из коллекции, так и пользовательский"""
    category = orm.Optional(Category, index=True)
    filename = orm.Required(str, 128, index=True, autostrip=False)  # индекс для поиска смайликов по готовым ссылкам
    width = orm.Required(int)
    height = orm.Required(int)
    custom_url = orm.Optional(str, 512, autostrip=False)
    description = orm.Optional(str, 16000)
    tags = orm.Set('Tag')
    tags_cache = orm.Optional(str, nullable=True)
    order = orm.Required(int, default=0)
    is_suggestion = orm.Required(bool, default=False)  # for admin page
    hidden = orm.Required(bool, default=False)  # for admin page
    created_at = orm.Required(datetime, default=datetime.utcnow)
    approved_at = orm.Optional(datetime, nullable=True, index=True)
    updated_at = orm.Required(datetime, default=datetime.utcnow)
    hashsum = orm.Optional(str, 128, index=True)

    user_addr = orm.Optional(str, 255, nullable=True, default=None)  # TODO: другой тип?
    user_cookie = orm.Optional(str, 64, nullable=True, default=None)

    smp_smiles = orm.Set('SmilePackSmile')
    hashes = orm.Set('SmileHash')
    urls = orm.Set('SmileUrl')

    bl = Resource('bl.smile')

    @property
    def is_published(self):
        return self.category is not None and self.approved_at is not None

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
    url_hash = orm.Required(str, 40, index=True, unique=True, autostrip=False)
    url = orm.Optional(str, 512, autostrip=False)
    smile = orm.Required(Smile)


class SmileHash(db.Entity):
    """Хэш, привязанный к смайлику. Может быть несколько хэшей у смайлика (сжатый и несжатый варианты, например)."""
    hashsum = orm.Required(str, 128, index=True, unique=True, autostrip=False)
    smile = orm.Required(Smile)


class Tag(db.Entity):
    """Тег смайликов (например, «твайлайт спаркл»)"""
    section = orm.Required(Section, index=True)
    name = orm.Required(str, 64, index=True)
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
    name = orm.Required(str, 64, index=True)
    tag = orm.Required(Tag)
    tag_name = orm.Required(str, 64)  # экономим на джойне

    orm.composite_key(section, name)


class SmilePack(db.Entity):
    """Смайлопак"""
    hid = orm.Required(str, 16, index=True)
    version = orm.Required(int, default=1)
    parent = orm.Optional('SmilePack')
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

    children = orm.Set('SmilePack')

    orm.composite_key(hid, version)

    bl = Resource('bl.smilepack')

    def before_update(self):
        self.updated_at = datetime.utcnow()


class SmilePackCategory(db.Entity):
    """Категория смайлопака"""
    smilepack = orm.Required(SmilePack)
    name = orm.Optional(str, 128, autostrip=False)
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
