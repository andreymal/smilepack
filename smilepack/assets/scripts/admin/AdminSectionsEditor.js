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
    if (options.level > 0 && options.action == 'edit') {
        parent = this.collection.getCategoryInfo(options.level, options.categoryId, {withParent: true}).parentId;
    } else if (options.level > 0 && options.action == 'add') {
        parent = this.collection.getSelectedCategory(options.level - 1);
    }

    if (options.action == 'add') {
        dialogsManager.open('category', {
            categoryLevel: options.level,
            parentCategoryId: parent
        }, this._editCategoryEvent.bind(this));
    } else if (options.action == 'edit') {
        dialogsManager.open('category', {
            edit: true,
            categoryLevel: options.level,
            parentCategoryId: parent,
            category: this.collection.getCategoryInfo(options.level, options.categoryId)
        }, this._editCategoryEvent.bind(this));
    } else if (options.action == 'delete') {
        var category = this.collection.getCategoryInfo(options.level, options.categoryId);
        if (confirm('Вы действительно хотите удалить категорию «' + category.name + '»?')) {
            console.log('TODO: delete');
        }
    }
};


AdminSectionsEditor.prototype.addCategory = function(options) {
    if (!options.name) {
        return {error: 'Введите имя категории'};
    }
    if (options.name.length > 128) {
        return {error: 'Длинновато имя у категории'};
    }
    if (options.iconId === undefined || options.iconId === null || !options.iconUrl) {
        return {error: 'Не выбрана иконка'};
    }
    if (options.description.length > 16000) {
        return {error: 'Слишком много описания'};
    }

    var onload = function(data) {
        var item = null;
        if (options.categoryLevel === 0) {
            item = data.section;
        } else if (options.categoryLevel === 1) {
            item = data.subsection;
        } else if (options.categoryLevel === 2) {
            item = data.category;
        }
        if (!item) {
            options.onend(data);
            return;
        }

        this.collection.addCategory(
            options.categoryLevel,
            options.parentCategoryId,
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

    var data = {
        name: options.name,
        icon: options.iconId,
        description: options.description
    };

    if (options.categoryLevel === 1) {
        data.section = options.parentCategoryId;
    } else if (options.categoryLevel === 2) {
        data.subsection = options.parentCategoryId;
    }

    ajax.create_category(options.categoryLevel, data, onload, onerror);
    return {success: true};
};


AdminSectionsEditor.prototype.editCategory = function(options) {
    console.log('edit', options);
    setTimeout(options.onend, 450);
    return {success: true};
};


AdminSectionsEditor.prototype._editCategoryEvent = function(options) {
    if (options.categoryId !== undefined && options.categoryId !== null) {
        return this.editCategory(options);
    }
    return this.addCategory(options);
};


module.exports = AdminSectionsEditor;
