'use strict';

var ajax = require('../common/ajax.js'),
    dialogsManager = require('../common/dialogsManager.js'),
    UsersDialog = require('./dialogs/UsersDialog.js'),
    UserDialog = require('./dialogs/UserDialog.js');


var AdminUsersEditor = function(dialogUsersElement, dialogUserElement) {
    dialogsManager.register('users', new UsersDialog(dialogUsersElement));
    dialogsManager.register('user', new UserDialog(dialogUserElement));
};


AdminUsersEditor.prototype.openDialog = function() {
    dialogsManager.open('users', {loader: this._loader.bind(this)}, this.openEditDialog.bind(this));
};


AdminUsersEditor.prototype.openEditDialog = function(options) {
    if (!options.user || options.user.id === undefined || options.user.id === null) {
        dialogsManager.open('user', {username: options.username || null}, this.addUser.bind(this));
        return {success: true};
    }
    dialogsManager.open('user', options.user, this.editUser.bind(this));
    return {success: true};
};


AdminUsersEditor.prototype.addUser = function(options) {
    if (!options.username || options.username.length < 2 || options.username.length > 32) {
        return {error: 'Недопустимое имя пользователя'};
    }
    if (!options.password) {
        return {error: 'Укажите пароль'};
    }
    if (options.password.length < 8) {
        return {error: 'Пароль слишком короткий'};
    }
    if (options.password.length > 32) {
        return {error: 'Пароль слишком длинный'};
    }

    var onend = options.onend;
    delete options.onend;

    ajax.create_user(
        options,
        function() {
            onend({success: true});
        },
        onend
    );

    return {success: true};
};


AdminUsersEditor.prototype.editUser = function(options) {
    if (options.username && (options.username.length < 2 || options.username.length > 32)) {
        return {error: 'Недопустимое имя пользователя'};
    }
    if (options.userId === undefined || options.userId === null) {
        return {error: 'Кого редактируем?'};
    }
    if (options.password && options.password.length < 8) {
        return {error: 'Пароль слишком короткий'};
    }
    if (options.password && options.password.length > 32) {
        return {error: 'Пароль слишком длинный'};
    }

    var onend = options.onend;
    delete options.onend;
    var userId = options.userId;
    delete options.userId;

    ajax.edit_user(
        userId,
        options,
        function() {
            onend({success: true});
        },
        onend
    );

    return {success: true};
};


AdminUsersEditor.prototype._loader = function(params, callback) {
    ajax.get_users(params, callback, callback);
};


module.exports = AdminUsersEditor;
