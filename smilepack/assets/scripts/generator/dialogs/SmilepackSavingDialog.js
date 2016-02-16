'use strict';

var BasicDialog = require('../../common/BasicDialog.js');


var SmilepackSavingDialog = function(element) {
    BasicDialog.apply(this, [element || document.getElementById('dialog-saving')]);
    this.form = this.dom.querySelector('form');
    this.btn = this.dom.querySelector('form input[type="submit"]');

    this._mode = 'blacklist';
    var wmodeevent = this._modeChangeEvent.bind(this);
    for (var i = 0; i < this.form.websitesmode.length; i++) {
        var radio = this.form.websitesmode[i];
        radio.addEventListener('change', wmodeevent);
        if (radio.checked) {
            this._mode = radio.value;
        }
    }
    var weditevent = this._editWebsitesEvent.bind(this);
    this.form.websitesblacklist.addEventListener('change', weditevent);
    this.form.websiteswhitelist.addEventListener('change', weditevent);

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

    var websites = this._loadWebsitesData();
    if (websites.hasOwnProperty('mode')) {
        for (var i = 0; i < this.form.websitesmode.length; i++) {
            if (this.form.websitesmode[i].value == websites.mode) {
                this.form.websitesmode[i].checked = true;
                this._mode = websites.mode;
                this._redrawMode();
                break;
            }
        }
    }
    if (websites.hasOwnProperty('blacklist')) {
        this.form.websitesblacklist.value = websites.blacklist.join('\n');
    }
    if (websites.hasOwnProperty('whitelist')) {
        this.form.websiteswhitelist.value = websites.whitelist.join('\n');
    }

    BasicDialog.prototype.open.apply(this, arguments);
};


SmilepackSavingDialog.prototype._getCookies = function() {
    // http://stackoverflow.com/a/4004010/5418360
    var c = document.cookie, v = 0, cookies = {};
    if (document.cookie.match(/^\s*\$Version=(?:"1"|1);\s*(.*)/)) {
        c = RegExp.$1;
        v = 1;
    }
    if (v === 0) {
        c.split(/[,;]/).map(function(cookie) {
            var parts = cookie.split(/=/, 2),
                name = decodeURIComponent(parts[0].replace(/^\s+/, "")),
                value = parts.length > 1 ? decodeURIComponent(parts[1].replace(/\s+$/, "")) : null;
            cookies[name] = value;
        });
    } else {
        c.match(/(?:^|\s+)([!#$%&'*+\-.0-9A-Z^`a-z|~]+)=([!#$%&'*+\-.0-9A-Z^`a-z|~]*|"(?:[\x20-\x7E\x80\xFF]|\\[\x00-\x7F])*")(?=\s*[,;]|$)/g).map(function($0, $1) {
            var name = $0,
                value = $1.charAt(0) === '"'
                          ? $1.substr(1, -1).replace(/\\(.)/g, "$1")
                          : $1;
            cookies[name] = value;
        });
    }
    return cookies;
};


SmilepackSavingDialog.prototype._loadWebsitesData = function() {
    var cookies = this._getCookies();
    var result = {};
    if (cookies.hasOwnProperty('websitesmode')) {
        result.mode = cookies.websitesmode;
    }
    if (cookies.hasOwnProperty('websitesblacklist')) {
        result.blacklist = cookies.websitesblacklist.split('|');
    }
    if (cookies.hasOwnProperty('websiteswhitelist')) {
        result.whitelist = cookies.websiteswhitelist.split('|');
    }
    return result;
};


SmilepackSavingDialog.prototype._isCookieValueValid = function(v) {
    // TODO: реализовать это всё более нормально
    return v.indexOf('=') < 0 && v.indexOf(';') < 0 && v.indexOf(',') < 0 && v.indexOf('\n') < 0;
};


SmilepackSavingDialog.prototype._saveWebsitesData = function(options) {
    var expdate = new Date();
    expdate.setFullYear(expdate.getFullYear() + 20);
    var postfix = '; path=/; expires=' + expdate.toGMTString();

    if (options.hasOwnProperty('mode') && this._isCookieValueValid(options.mode)) {
        document.cookie = 'websitesmode=' + options.mode + postfix;
    }
    if (options.hasOwnProperty('blacklist') && this._isCookieValueValid(options.blacklist.join('|'))) {
        document.cookie = 'websitesblacklist=' + options.blacklist.join('|') + postfix;
    }
    if (options.hasOwnProperty('whitelist') && this._isCookieValueValid(options.whitelist.join('|'))) {
        document.cookie = 'websiteswhitelist=' + options.whitelist.join('|') + postfix;
    }
};


SmilepackSavingDialog.prototype._modeChangeEvent = function(event) {
    this._mode = event.target.value;
    this._redrawMode();
};


SmilepackSavingDialog.prototype._redrawMode = function() {
    if (this._mode == 'blacklist') {
        this.form.websitesblacklist.style.display = '';
        this.form.websiteswhitelist.style.display = 'none';
    } else {
        this.form.websitesblacklist.style.display = 'none';
        this.form.websiteswhitelist.style.display = '';
    }
};


SmilepackSavingDialog.prototype._editWebsitesEvent = function(event) {
    var input = event.target;
    if (input.name == 'websitesblacklist') {
        this._saveWebsitesData({mode: this._mode, blacklist: input.value.split('\n')});
    } else if (input.name == 'websiteswhitelist') {
        this._saveWebsitesData({mode: this._mode, whitelist: input.value.split('\n')});
    }
};


module.exports = SmilepackSavingDialog;
