'use strict';

var ajax = require('../common/ajax.js'),
    dialogsManager = require('../common/dialogsManager.js'),
    SmileDialog = require('./dialogs/SmileDialog.js');


var AdminSmileEditor = function(collection, suggestions, dialogElement) {
    this.collection = collection;
    this.suggestions = suggestions;
    dialogsManager.register('editOneSmile', new SmileDialog(dialogElement));
    // TODO: editManySmiles
};


AdminSmileEditor.prototype.openEditDialog = function(collection, smileIds) {
    if (!smileIds || smileIds.length < 1) {
        return false;
    }
    var options;
    if (smileIds.length == 1) {
        options = collection.getSmileRaw(smileIds[0]);
        options.collection = this.collection; // not function argument; needed for categories list
        dialogsManager.open('editOneSmile', options, this.editSmile.bind(this));
    } else {
        dialogsManager.open('editManySmiles');
    }
    return true;
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


AdminSmileEditor.prototype._editSmileEvent = function(data, onend) {
    var smile = data.smile;
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

    onend({success: true});
};


module.exports = AdminSmileEditor;
