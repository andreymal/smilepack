#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from datetime import datetime

from flask import current_app

from .db import db, orm
from .bl.utils import Resource


class Icon(db.Entity):
    """Иконка категории или раздела"""
    filename = orm.Required(str, 128)
    custom_url = orm.Optional(str, 512)
    sections = orm.Set('Section')
    subsections = orm.Set('SubSection')
    categories = orm.Set('Category')
    pack_categories = orm.Set('SmilePackCategory')
    created_at = orm.Required(datetime, default=datetime.utcnow)
    updated_at = orm.Required(datetime, default=datetime.utcnow)

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
    tags = orm.Set('SmileTag')
    category_suggestions = orm.Set('CategorySuggestion')
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
    category_suggestions = orm.Set('CategorySuggestion')
    order = orm.Required(int, default=0)
    created_at = orm.Required(datetime, default=datetime.utcnow)
    updated_at = orm.Required(datetime, default=datetime.utcnow)

    def before_update(self):
        self.updated_at = datetime.utcnow()


class Category(db.Entity):
    """Категория (например, «Твайлайт Спаркл»)"""
    subsection = orm.Required(SubSection)
    name = orm.Required(str, 128)
    icon = orm.Required(Icon)
    description = orm.Optional(str, 16000)
    smiles = orm.Set('Smile')
    smile_suggestions = orm.Set('SmileSuggestion')
    order = orm.Required(int, default=0)
    created_at = orm.Required(datetime, default=datetime.utcnow)
    updated_at = orm.Required(datetime, default=datetime.utcnow)

    bl = Resource('bl.category')

    def before_update(self):
        self.updated_at = datetime.utcnow()


class Smile(db.Entity):
    """Смайлики в категории"""
    category = orm.Required(Category)
    filename = orm.Required(str, 128)
    width = orm.Required(int)  # TODO: validations
    height = orm.Required(int)
    custom_url = orm.Optional(str, 512)
    source_url = orm.Optional(str, 512)
    source_description = orm.Optional(str, 16000)
    tags = orm.Set('SmileTag')
    tags_cache = orm.Optional(str, nullable=True)
    suggestion = orm.Optional('SmileSuggestion')
    smilepack_smiles = orm.Set('SmilePackSmile')
    order = orm.Required(int, default=0)
    created_at = orm.Required(datetime, default=datetime.utcnow)
    updated_at = orm.Required(datetime, default=datetime.utcnow)

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


class SmileTag(db.Entity):
    """Теги смайликов"""
    section = orm.Required(Section, index=True)
    name = orm.Required(str, 64)
    smiles = orm.Set(Smile)
    smiles_count = orm.Required(int, default=0, index=True)
    created_at = orm.Required(datetime, default=datetime.utcnow)

    orm.composite_key(section, name)


class CategorySuggestion(db.Entity):
    """Заявки на добавление категории от пользователей"""
    name = orm.Required(str, 128)
    description = orm.Optional(str, 16000)
    section = orm.Required(Section)
    subsection = orm.Optional(SubSection)
    smiles = orm.Set('SmileSuggestion')

    created_at = orm.Required(datetime, default=datetime.utcnow)


class SmileSuggestion(db.Entity):
    """Заявки на добавление смайликов от пользователей"""
    url = orm.Required(str, 512)
    user_cookie = orm.Required(str, 64, index=True)
    category = orm.Optional(Category)
    category_suggestion = orm.Optional(CategorySuggestion)
    description = orm.Optional(str, 16000)
    approved_smile = orm.Optional(Smile)
    created_at = orm.Required(datetime, default=datetime.utcnow, index=True)

    bl = Resource('bl.smilesuggestion')


class SmilePack(db.Entity):
    """Смайлопак"""
    user_cookie = orm.Required(str, 64, index=True)
    categories = orm.Set('SmilePackCategory')
    name = orm.Optional(str, 64)
    description = orm.Optional(str, 16000)
    downloads = orm.Required(int, default=0, index=True)
    created_at = orm.Required(datetime, default=datetime.utcnow)
    updated_at = orm.Required(datetime, default=datetime.utcnow)
    last_downloaded_at = orm.Optional(datetime, nullable=True, default=None)
    lifetime = orm.Optional(int)

    bl = Resource('bl.smilepack')

    @property
    def encoded_id(self):
        return self.bl.encode_id()

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

    def before_update(self):
        self.updated_at = datetime.utcnow()


class SmilePackSmile(db.Entity):
    """Смайлик в смайлопаке, из базы или кастомный"""
    category = orm.Required(SmilePackCategory)
    order = orm.Required(int, default=0)
    internal_smile = orm.Optional(Smile)
    custom_url = orm.Optional(str, 512)
    width = orm.Optional(int, nullable=True)
    height = orm.Optional(int, nullable=True)

    orm.composite_index(category, order)

    @property
    def url(self):
        if self.internal_smile:
            return self.internal_smile.url
        return self.custom_url
