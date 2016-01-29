'use strict';

var dialogsManager = {
    dialogs: {},
    opened: [],
    background: null
};

dialogsManager.init = function(background, dialogs) {
    this.background = background;
    for (var name in dialogs) {
        this.register(name, dialogs[name]);
    }
};


dialogsManager.register = function(name, dialog) {
    if (this.dialogs[name]) {
        throw new Error('Conflict dialog ' + name);
    }
    this.dialogs[name] = {
        dialog: dialog,
        submitCallback: null
    };

    dialog.setOpenEvent(function(opened) {
        this._openEvent(name, opened);
    }.bind(this));

    dialog.setSubmitEvent(function(data) {
        return this._submitEvent(name, data);
    }.bind(this));
};


dialogsManager.open = function(name, options, onsubmit) {
    if (!this.dialogs[name]) {
        throw new Error('Unknown dialog ' + name);
    }
    this.dialogs[name].dialog.open(options);
    this.dialogs[name].submitCallback = onsubmit;
};


dialogsManager.close = function(name) {
    if (!this.dialogs[name]) {
        throw new Error('Unknown dialog ' + name);
    }
    if (this.opened.indexOf(name) < 0) {
        return null;
    }
    this.dialogs[name].dialog.close();
};


dialogsManager._openEvent = function(name, opened) {
    var dialog = this.dialogs[name];
    var i = this.opened.indexOf(name);
    if ((i >= 0) == opened) {
        return;
    }

    if (opened) {
        if (this.opened.length > 0) {
            this.dialogs[this.opened[this.opened.length - 1]].dialog.hide();
        }
        this.opened.push(name);
    } else {
        this.opened.splice(i, 1);
        dialog.submitCallback = null;
        if (i == this.opened.length && i > 0) {
            this.dialogs[this.opened[this.opened.length - 1]].dialog.show();
        }
    }

    if (this.background) {
        if (this.opened.length > 0) {
            this.background.classList.remove('hidden');
        } else {
            this.background.classList.add('hidden');
        }
    }
};


dialogsManager._submitEvent = function(name, data) {
    var onsubmit = this.dialogs[name].submitCallback;
    if (onsubmit) {
        return onsubmit(data);
    }
    return {success: true};
};


module.exports = dialogsManager;
window.dialogsManager = dialogsManager;
