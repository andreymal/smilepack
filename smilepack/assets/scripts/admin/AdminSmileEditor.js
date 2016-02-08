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
    options = options || {};
    options.collection = this.collection; // not function argument; needed for categories list
    if (smileIds.length == 1) {
        dialogsManager.open('editOneSmile', options, this.editSmile.bind(this));
    } else if (smileIds.length <= 50) {
        options.smileIds = smileIds;
        dialogsManager.open('editManySmiles', options, this.editManySmiles.bind(this));
    } else {
        // TODO: аккуратно убрать ограничение
        alert('Выделено более 50 смайликов, это как-то многовато');
    }
    return true;
};


AdminSmileEditor.prototype.openUploader = function() {
    dialogsManager.open('uploadSmile', {}, this.upload.bind(this));
};


AdminSmileEditor.prototype.upload = function(options) {
    if (!options.smiles || options.smiles.length < 1) {
        return {error: 'Не выбраны смайлики'};
    }

    var results = [];
    var i = -1;
    var count = options.smiles.length;
    var categoryId = this.collection.getSelectedCategory(2);
    var cancelled = false;

    var oncancel = function() {
        cancelled = true;
    };

    var upload = function() {
        i++;
        if (cancelled || i === count) {
            this._finishSmileUpload(results, categoryId, options.onend);
            return;
        }
        if (options.onprogress) {
            options.onprogress({current: i + 1, count: count});
        }

        var startedAt = Date.now();
        var result = this._uploadSmile(
            options.smiles[i],
            categoryId,
            function(data) {
                results.push(data);
                var sleep = 350 - (Date.now() - startedAt);
                setTimeout(upload, sleep > 40 ? sleep : 40);
            }
        );
        if (!result.success) {
            results.push(result);
            upload();
        }
    }.bind(this);

    upload();
    return {success: true, cancelfunc: oncancel};
};


AdminSmileEditor.prototype._uploadSmile = function(options, categoryId, onend) {
    if (options.error) {
        return {error: options.error};
    }
    if (!options.file && (!options.url || options.url.length < 9)) {
        return {error: 'Надо бы смайлик'};
    }
    if (options.url && options.url.length > 512) {
        return {error: 'Длинновата ссылка, перезалейте на что-нибудь поадекватнее'};
    }
    if (isNaN(options.w) || options.w < 1 || isNaN(options.h) || options.h < 1) {
        return {error: 'Размеры смайлика кривоваты'};
    }

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
            onend({success: false, error: data.error || data});
        } else {
            alert(data.error || data);
        }
        return;
    }
    if (!data.created) {
        if (onend) {
            onend({success: true, data: data, notice: 'Этот смайлик уже был создан! Дата загрузки: ' + data.smile.created_at});
        }
    } else if (onend) {
        onend({success: true, data: data});
    }
};

AdminSmileEditor.prototype._finishSmileUpload = function(results, categoryId, onend) {
    var msg = '';
    var smileIds = [];
    for (var i = 0; i < results.length; i++) {
        if (results[i].error) {
            msg += (i + 1).toString() + ': ' + results[i].error + '\n';
        } else if (results[i].notice) {
            msg += (i + 1).toString() + ': ' + results[i].notice + '\n';
        }
        if (results[i].data && results[i].data.smile) {
            smileIds.push(results[i].data.smile.id);
        }
    }

    if (smileIds.length == 1) {
        var smile = results[0].data.smile;
        smile.approvedByDefault = results[0].data.created;
        this.openEditDialog(smileIds, smile);
    } else if (smileIds.length > 1) {
        this.openEditDialog(smileIds, {approvedByDefault: true, categoryByDefault: categoryId});
    }

    if (onend) {
        onend({success: true, notice: msg.length > 0 ? msg : null});
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
    if (options.hasOwnProperty('approved')) {
        item.approved = options.approved;
    }
    if (options.hasOwnProperty('hidden')) {
        item.hidden = options.hidden;
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
