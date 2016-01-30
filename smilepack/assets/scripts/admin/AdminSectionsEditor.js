'use strict';

var ajax = require('../common/ajax.js'),
    dialogsManager = require('../common/dialogsManager.js'),
    CategoryDialog = require('./dialogs/CategoryDialog.js');


var AdminSectionsEditor = function(collection) {
    this.collection = collection;
    this.collection.subscribe('onaction', this._onaction.bind(this));
    dialogsManager.register('category', new CategoryDialog());
};


AdminSectionsEditor.prototype._onaction = function(options) {
    var parent = 0;
    var section = 0;
    if (options.level > 0 && options.action == 'edit') {
        parent = this.collection.getCategoryInfo(options.level, options.categoryId, {withParent: true}).parentId;
        if (options.level === 2) {
            section = this.collection.getCategoryInfo(1, parent, {withParent: true}).parentId;
        }
    } else if (options.level > 0 && options.action == 'add') {
        parent = this.collection.getSelectedCategory(options.level - 1);
    }

    if (options.action == 'add') {
        dialogsManager.open('category', {
            categoryLevel: options.level,
            parentCategoryId: parent
        }, this._editCategoryEvent.bind(this));
    } else if (options.action == 'edit') {
        var subsections = [];
        if (options.level === 2) {
            var subsectionIds = this.collection.getCategoryIds()[1];
            for (var i = 0; i < subsectionIds.length; i++) {
                var info = this.collection.getCategoryInfo(1, subsectionIds[i], {withParent: true});
                if (info.parentId === section) {
                    subsections.push([subsectionIds[i], info.name]);
                }
            }
        }

        dialogsManager.open('category', {
            edit: true,
            categoryLevel: options.level,
            parentCategoryId: parent,
            category: this.collection.getCategoryInfo(options.level, options.categoryId),
            subsections: subsections
        }, this._editCategoryEvent.bind(this));
    } else if (options.action == 'delete') {
        var category = this.collection.getCategoryInfo(options.level, options.categoryId);
        if (confirm('Вы действительно хотите удалить категорию «' + category.name + '»?')) {
            console.log('TODO: delete');
        }
    }
};


AdminSectionsEditor.prototype.addCategory = function(options) {
    var data = this._prepareCategoryData(options);
    if (!data.success) {
        return data;
    }
    data = data.data;

    var onload = function(data) {
        var item = null;
        var parentId = 0;
        if (options.categoryLevel === 0) {
            item = data.section;
        } else if (options.categoryLevel === 1) {
            item = data.subsection;
            parentId = item.section[0];
        } else if (options.categoryLevel === 2) {
            item = data.category;
            parentId = item.subsection[0];
        }
        if (!item) {
            options.onend(data);
            return;
        }

        this.collection.addCategory(
            options.categoryLevel,
            parentId,
            item
        );
        if (options.categoryLevel === 2) {
            this.collection.createGroupForCategory(options.categoryLevel, item.id);
        }
        options.onend({success: true});
    }.bind(this);

    var onerror = function(data) {
        options.onend(data);
    }.bind(this);

    ajax.create_category(options.categoryLevel, data, onload, onerror);
    return {success: true};
};


AdminSectionsEditor.prototype.editCategory = function(options) {
    var data = this._prepareCategoryData(options);
    if (!data.success) {
        return data;
    }
    data = data.data;

    var onload = function(data) {
        var item = null;
        var parentId = 0;
        if (options.categoryLevel === 0) {
            item = data.section;
        } else if (options.categoryLevel === 1) {
            item = data.subsection;
            parentId = item.section[0];
        } else if (options.categoryLevel === 2) {
            item = data.category;
            parentId = item.subsection[0];
        }
        if (!item) {
            options.onend(data);
            return;
        }

        if (parentId !== this.collection.getCategoryInfo(options.categoryLevel, item.id, {withParent: true}).parentId) {
            this.collection.removeCategory(options.categoryLevel, item.id);
            this.collection.addCategory(
                options.categoryLevel,
                parentId,
                item
            );
            if (options.categoryLevel === 2) {
                this.collection.createGroupForCategory(options.categoryLevel, item.id);
            }
            this.collection.selectCategory(options.categoryLevel, item.id);
        } else {
            this.collection.editCategory(
                options.categoryLevel,
                item.id,
                item
            );
        }
        options.onend({success: true});
    }.bind(this);

    var onerror = function(data) {
        options.onend(data);
    }.bind(this);

    ajax.edit_category(options.categoryLevel, options.categoryId, data, onload, onerror);
    return {success: true};
};


AdminSectionsEditor.prototype._prepareCategoryData = function(options) {
    if (options.hasOwnProperty('name') && !options.name) {
        return {error: 'Введите имя категории'};
    }
    if (options.hasOwnProperty('name') && options.name.length > 128) {
        return {error: 'Длинновато имя у категории'};
    }
    if (options.hasOwnProperty('iconId') && (options.iconId === undefined || options.iconId === null)) {
        return {error: 'Не выбрана иконка'};
    }
    if (options.hasOwnProperty('description') && options.description.length > 16000) {
        return {error: 'Слишком много описания'};
    }
    // TODO: subsection

    var data = {};
    if (options.hasOwnProperty('name')) {
        data.name = options.name;
    }
    if (options.hasOwnProperty('iconId')) {
        data.icon = options.iconId;
    }
    if (options.hasOwnProperty('description')) {
        data.description = options.description;
    }

    if (options.categoryLevel === 1) {
        data.section = options.hasOwnProperty('section') ? options.section : options.parentCategoryId;
    } else if (options.categoryLevel === 2) {
        data.subsection = options.hasOwnProperty('subsection') ? options.subsection : options.parentCategoryId;
    }

    return {success: true, data: data};
};


AdminSectionsEditor.prototype._editCategoryEvent = function(options) {
    if (options.categoryId !== undefined && options.categoryId !== null) {
        return this.editCategory(options);
    }
    return this.addCategory(options);
};


module.exports = AdminSectionsEditor;
