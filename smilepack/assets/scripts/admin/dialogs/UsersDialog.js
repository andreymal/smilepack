'use strict';

var BasicDialog = require('../../common/BasicDialog.js');


var UsersDialog = function(element) {
    BasicDialog.apply(this, [element || document.getElementById('dialog-users')]);
    this.form = this.dom.querySelector('form');

    this.searchBtn = this.form.querySelector('.users-action-search');
    this.moreBtn = this.dom.querySelector('.users-action-more');
    this.loadingImg = this.dom.querySelector('.users-loading');
    this.list = this.dom.querySelector('ul.users-list');

    this._bindEvents();
    this.searchBtn.addEventListener('click', this._searchEvent.bind(this));
    this.moreBtn.addEventListener('click', this._moreClickEvent.bind(this));

    this._currentOptions = {};
    this._currentPrefix = null;
    this._currentCount = 0;
    this._currentItems = {};
};
UsersDialog.prototype = Object.create(BasicDialog.prototype);
UsersDialog.prototype.constructor = UsersDialog;


UsersDialog.prototype.open = function(options) {
    this._currentOptions = options;

    if (options.loader) {
        this.form.username.value = '';
        this._onload('', {users: []}, false);
        this.loadingImg.style.display = '';
        options.loader({}, function(data) {
            this._onload('', data, false);
        }.bind(this));
    }

    BasicDialog.prototype.open.apply(this);
};


UsersDialog.prototype.onsubmit = function() {
    if (!this._submitEvent) {
        return;
    }
    var result = this._submitEvent({user: null, username: this.form.username.value});

    if (!result.success) {
        return this.error(result.error);
    }
    this.close();
};


UsersDialog.prototype._onload = function(prefix, data, append) {
    this.loadingImg.style.display = 'none';

    if (data.error || !data.users) {
        this.error(data.error || data);
        return false;
    }

    this._currentPrefix = prefix;
    if (!append) {
        this._currentItems = {};
        this.list.innerHTML = '';
        this._currentCount = 0;
    } else {
        this._currentCount += data.users.length;
    }

    data.users.forEach(this._addUser.bind(this));
};


UsersDialog.prototype._addUser = function(user) {
    if (this._currentItems[user.id]) {
        this._currentItems[user.id] = user;
        return;
    }

    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = '#';
    a.dataset.id = user.id;
    a.textContent = user.username;
    a.addEventListener('click', this._userClickEvent.bind(this));


    li.appendChild(a);
    this.list.appendChild(li);

    this._currentItems[user.id] = user;
};


UsersDialog.prototype._moreClickEvent = function(event) {
    this.loadingImg.style.display = '';
    this._currentOptions.loader({prefix: this._currentPrefix, offset: this._currentCount}, function(data) {
        this._onload(this._currentPrefix, data, true);
    }.bind(this));

    event.preventDefault();
    return false;
};


UsersDialog.prototype._userClickEvent = function(event) {
    if (!this._submitEvent) {
        return;
    }
    var result = this._submitEvent({user: this._currentItems[parseInt(event.target.dataset.id)]});

    if (!result.success) {
        return this.error(result.error);
    }
    this.close();
    event.preventDefault();
    return false;
};


UsersDialog.prototype._searchEvent = function(event) {
    event.preventDefault();

    var username = this.form.username.value;

    if (username === this._currentPrefix || !this._currentOptions.loader) {
        return false;
    }

    this.loadingImg.style.display = '';
    this._currentOptions.loader({prefix: username}, function(data) {
        this._onload(username, data, false);
    }.bind(this));

    return false;
};


module.exports = UsersDialog;
