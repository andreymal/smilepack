'use strict';

var ajax = require('../common/ajax.js'),
    dialogsManager = require('../common/dialogsManager.js'),
    IconsDialog = require('./dialogs/IconsDialog.js');


var AdminIconsEditor = function(dialogElement) {
    var dialog = new IconsDialog(dialogElement);
    dialog.setToggleFunc(this.toggle.bind(this));  // TODO: refactor this and others
    dialogsManager.register('icons', dialog);
};


AdminIconsEditor.prototype.openDialog = function() {
    dialogsManager.open('icons', {}, this.upload.bind(this));
};


AdminIconsEditor.prototype.upload = function(options) {
    if (!options.file && (!options.url || options.url.length < 9)) {
        return {error: 'Надо бы икноку'};
    }
    if (options.url && options.url.length > 512) {
        return {error: 'Длинновата ссылка, перезалейте на что-нибудь поадекватнее'};
    }

    var onend = options.onend;

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
        ajax.create_icon({url: options.url, compress: true}, onload, onerror);
    } else if (options.file) {
        ajax.upload_icon({file: options.file, compress: '1'}, onload, onerror);
    }

    return {success: true};
};


AdminIconsEditor.prototype._uploadEvent = function(data, onend) {
    if (!data.created) {
        if (onend) {
            onend({error: 'Такая иконка уже есть'});
        }
        return;
    }

    if (onend) {
        onend({success: true, icon: data.icon});
    }
};


AdminIconsEditor.prototype.toggle = function(iconId, approved, onend) {
    ajax.edit_icon(
        iconId,
        {approved: approved},
        function() {
            onend({success: true});
        },
        onend
    );
};


module.exports = AdminIconsEditor;
