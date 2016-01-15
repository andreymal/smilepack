# -*- coding: utf-8 -*-


def init_bl():
    from smilepack.bl import user, smiles, smilepacks, utils, registry

    registry.register('bl.user', user.UserBL)
    registry.register('bl.section', smiles.SectionBL)
    registry.register('bl.subsection', smiles.SubSectionBL)
    registry.register('bl.category', smiles.CategoryBL)
    registry.register('bl.smile', smiles.SmileBL)
    registry.register('bl.tag', smiles.TagBL)
    registry.register('bl.smilepack', smilepacks.SmilePackBL)
    registry.register('bl.smilepack_category', smilepacks.SmilePackCategoryBL)
