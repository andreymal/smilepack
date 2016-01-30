'use strict';

var ajax = require('../common/ajax.js'),
    dialogsManager = require('../common/dialogsManager.js'),
    UploadDialog = require('./dialogs/UploadDialog.js'),
    SmileDialog = require('./dialogs/SmileDialog.js'),
    ManySmilesDialog = require('./dialogs/ManySmilesDialog.js');


var AdminSmileEditor = function(collection, suggestions, dialogElement) {
    this.collection = collection;
    this.suggestions = suggestions;
    dialogsManager.register('uploadSmile', new UploadDialog(dialogElement));
    dialogsManager.register('editOneSmile', new SmileDialog(dialogElement));
    dialogsManager.register('editManySmiles', new ManySmilesDialog(dialogElement));
};


AdminSmileEditor.prototype.openEditDialog = function(smileIds, options) {
    if (!smileIds || smileIds.length < 1) {
        return false;
    }
    if (smileIds.length == 1) {
        options.collection = this.collection; // not function argument; needed for categories list
        dialogsManager.open('editOneSmile', options, this.editSmile.bind(this));
    } else if (smileIds.length <= 50) {
        dialogsManager.open('editManySmiles', {collection: this.collection, smileIds: smileIds}, this.editManySmiles.bind(this));
    } else {
        alert('Выделено более 50 смайликов, это как-то многовато');
    }
    return true;
};


AdminSmileEditor.prototype.openUploader = function() {
    dialogsManager.open('uploadSmile', {}, this.upload.bind(this));
};


AdminSmileEditor.prototype.upload = function(options) {
    if (!options.file && (!options.url || options.url.length < 9)) {
        return {error: 'Надо бы смайлик'};
    }
    if (options.url && options.url.length > 512) {
        return {error: 'Длинновата ссылка, перезалейте на что-нибудь поадекватнее'};
    }
    if (isNaN(options.w) || options.w < 1 || isNaN(options.h) || options.h < 1) {
        return {error: 'Размеры смайлика кривоваты'};
    }

    var onend = options.onend;
    var categoryId = this.collection.getSelectedCategory(2);

    var onload = function(data) {
        this._uploadEvent(data, onend);
    }.bind(this);
    var onerror = function(data) {
        if (onend) {
            onend({success: false, error: data.error || data});
        } else {
            console.log(data);
            alert(data.error || data);
        }
    }.bind(this);

    if (options.url) {
        ajax.create_smile({
            url: options.url,
            w: options.w,
            h: options.h,
            category: categoryId,
            extended: 1,
            compress: options.compress
        }, onload, onerror);
    } else if (options.file) {
        ajax.upload_smile({
            file: options.file,
            w: options.w,
            h: options.h,
            category: categoryId,
            extended: 1,
            compress: options.compress ? '1' : ''
        }, onload, onerror);
    }

    return {success: true};
};


AdminSmileEditor.prototype._uploadEvent = function(data, onend) {
    if (!data.smile) {
        console.log(data);
        if (onend) {
            onend({error: data.error || data});
        } else {
            alert(data.error || data);
        }
        return;
    }
    data.smile.approvedByDefault = data.created;
    this.openEditDialog([data.smile.id], data.smile);
    if (!data.created) {
        alert('Этот смайлик уже был создан! Дата загрузки: ' + data.smile.created_at);
    }
    if (onend) {
        onend({success: true});
    }
};


AdminSmileEditor.prototype.editSmile = function(options) {
    var onend = null;
    if (options.hasOwnProperty('onend')) {
        onend = options.onend;
        delete options.onend;
    }
    var smileId = options.smile;
    delete options.smile;

    var onload = function(data) {
        this._editSmileEvent(data, onend);
    }.bind(this);
    var onerror = function(data) {
        if (onend) {
            onend({success: false, error: data.error || data});
        } else {
            alert(data.error || data);
        }
    }.bind(this);

    ajax.edit_smile(smileId, options, onload, onerror);

    return {success: true};
};


AdminSmileEditor.prototype.editManySmiles = function(options) {
    var onend = null;
    if (options.hasOwnProperty('onend')) {
        onend = options.onend;
        delete options.onend;
    }
    var smileIds = options.smileIds;
    delete options.smileIds;

    var onload = function(data) {
        this._editSmileEvent(data, onend);
    }.bind(this);
    var onerror = function(data) {
        if (onend) {
            onend({success: false, error: data.error || data});
        } else {
            alert(data.error || data);
        }
    }.bind(this);

    var item = {};
    if (options.hasOwnProperty('category')) {
        item.category = options.category;
    }
    if (options.hasOwnProperty('description')) {
        item.description = options.description;
    }
    if (options.hasOwnProperty('addTags')) {
        item.add_tags = options.addTags;
    }
    if (options.hasOwnProperty('removeTags')) {
        item.remove_tags = options.removeTags;
    }

    var items = [];
    for (var i = 0; i < smileIds.length; i++) {
        items.push({id: smileIds[i], smile: item});
    }

    ajax.edit_many_smiles(items, onload, onerror);

    return {success: true};
};


AdminSmileEditor.prototype._editSmileEvent = function(data, onend) {
    var smiles = data.items || [data];

    for (var i = 0; i < smiles.length; i++) {
        var smile = smiles[i].smile;
        if (!smile) {
            onend({success: false, error: data.error || data});
            return;
        }

        if (this.suggestions.getSmileInfo(smile.id)) {
            if (!this.suggestions.editSmile(smile) || !this.suggestions.editSmile({id: smile.id, raw: smile})) {
                onend({success: false, error: 'Что-то пошло не так'});
                return;
            }
            this.suggestions.setDragged(smile.id, smile.approved_at !== null && smile.category !== null);
        }

        var info = this.collection.getSmileInfo(smile.id, {withParent: true});
        if (!info && smile.approved_at !== null && smile.category !== null && this.collection.isCategoryLoaded(2, smile.category[0])) {
            if (this.collection.addSmile(smile) !== smile.id || !this.collection.addSmileToCategory(smile.id, 2, smile.category[0])) {
                onend({success: false, error: 'Что-то пошло не так'});
                return;
            }
        } else if (info && (!smile.category || smile.approved_at === null)) {
            this.collection.removeSmile(smile.id);
        } else if (info) {
            if (!this.collection.editSmile(smile) || !this.collection.editSmile({id: smile.id, raw: smile})) {
                onend({success: false, error: 'Что-то пошло не так'});
                return;
            }
            if (info.categoryId !== smile.category[0]) {
                this.collection.removeSmileFromGroup(smile.id, this.collection.getGroupOfCategory(info.categoryLevel, info.categoryId));
                if (this.collection.isCategoryLoaded(2, smile.category[0])) {
                    this.collection.addSmileToCategory(smile.id, 2, smile.category[0]);
                }
            }
        }
    }

    onend({success: true});
};


module.exports = AdminSmileEditor;
