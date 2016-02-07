'use strict';

var BasicDialog = require('../../common/BasicDialog.js');


var SmilepackSavingDialog = function(element) {
    BasicDialog.apply(this, [element || document.getElementById('dialog-saving')]);
    this.form = this.dom.querySelector('form');
    this.btn = this.dom.querySelector('form input[type="submit"]');
    this._bindEvents();
};
SmilepackSavingDialog.prototype = Object.create(BasicDialog.prototype);
SmilepackSavingDialog.prototype.constructor = SmilepackSavingDialog;


SmilepackSavingDialog.prototype.onsubmit = function() {
    if (!this._submitEvent) {
        return;
    }

    var f = this.form;

    var result = this._submitEvent({
        mode: f.mode.value,
        hid: f.hid.value,
        version: f.version.value,
        name: f.name.value,
        lifetime: parseInt(f.lifetime.value)
    });
    if (!result.success) {
        return this.error(result.error);
    }
    this.close();
};


SmilepackSavingDialog.prototype.open = function(options) {
    this.form.mode.value = options.mode;
    if (options.hasOwnProperty('hid')) {
        this.form.hid.value = options.hid;
    }
    if (options.hasOwnProperty('version')) {
        this.form.version.value = options.version;
    }
    BasicDialog.prototype.open.apply(this, arguments);
};


module.exports = SmilepackSavingDialog;
