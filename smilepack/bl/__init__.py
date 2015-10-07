#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from . import smiles, smilepacks, utils


utils.registry['bl.section'] = smiles.SectionBL
utils.registry['bl.category'] = smiles.CategoryBL
utils.registry['bl.smile'] = smiles.SmileBL
utils.registry['bl.smilepack'] = smilepacks.SmilePackBL
