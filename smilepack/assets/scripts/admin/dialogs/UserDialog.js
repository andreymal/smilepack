'use strict';

var BasicDialog = require('../../common/BasicDialog.js');


var UserDialog = function(element) {
    BasicDialog.apply(this, [element || document.getElementById('dialog-user')]);
    this.form = this.dom.querySelector('form');
    this.btn = this.form.querySelector('input[type="submit"]');

    this._domCreatedAt = this.dom.querySelector('.user-created-at');
    this._domLoginAt = this.dom.querySelector('.user-last-login-at');


    this._bindEvents();
};
UserDialog.prototype = Object.create(BasicDialog.prototype);
UserDialog.prototype.constructor = UserDialog;


UserDialog.prototype.open = function(options) {
    this._currentOptions = options;

    if (options.id !== undefined && options.id !== null) {
        this.form.id.value = options.id;
        this.form.username.disabled = true;
        this.form.username.value = options.username;
        this._domCreatedAt.textContent = options.created_at;
        this._domLoginAt.textContent = options.last_login_at || 'N/A';

        this.form.is_admin.checked = options.is_admin;
        this.form.is_superadmin.checked = options.is_superadmin;
        this.form.is_active.checked = options.is_active;
    } else {
        this.form.id.value = '';
        this.form.username.disabled = false;
        this.form.username.value = options.username || '';
        this._domCreatedAt.textContent = 'N/A';
        this._domLoginAt.textContent = 'N/A';

        this.form.is_admin.checked = false;
        this.form.is_superadmin.checked = false;
        this.form.is_active.checked = true;
    }

    this.form.password1.value = '';
    this.form.password2.value = '';

    BasicDialog.prototype.open.apply(this);
};


UserDialog.prototype.onsubmit = function() {
    if (!this._submitEvent) {
        return;
    }

    var onend = function(data) {
        this.btn.disabled = false;
        if (data.success) {
            this.close();
        } else {
            this.error(data.error || data);
        }
    }.bind(this);

    var edit = this.form.id.value.length > 0;
    var data = {
        onend: onend,
        userId: edit ? parseInt(this.form.id.value) : null
    };

    var old = this._currentOptions;
    if (!edit || old.username != this.form.username.value) {
        if (!edit && !this.form.username.value) {
            return this.error('Укажите имя пользователя');
        }
        data.username = this.form.username.value;
    }
    if (!edit || old.is_admin != this.form.is_admin.checked) {
        data.is_admin = this.form.is_admin.checked;
    }
    if (!edit || old.is_superadmin != this.form.is_superadmin.checked) {
        data.is_superadmin = this.form.is_superadmin.checked;
    }
    if (!edit || old.is_active != this.form.is_active.checked) {
        data.is_active = this.form.is_active.checked;
    }

    if (this.form.password1.value.length > 0) {
        if (this.form.password2.value !== this.form.password1.value) {
            return this.error('Пароли не совпадают');
        }
        data.password = this.form.password1.value;
    }

    var result = this._submitEvent(data);

    if (!result.success) {
        return this.error(result.error);
    }
    this.btn.disabled = true;
};


module.exports = UserDialog;
