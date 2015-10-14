#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from . import smiles, smilepacks, utils
from .. import bl_registry


bl_registry.register('bl.section', smiles.SectionBL)
bl_registry.register('bl.category', smiles.CategoryBL)
bl_registry.register('bl.smile', smiles.SmileBL)
bl_registry.register('bl.smilepack', smilepacks.SmilePackBL)
bl_registry.register('bl.smilepack_category', smilepacks.SmilePackCategoryBL)
