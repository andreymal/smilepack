'use strict';

var BasicDialog = require('../../common/BasicDialog.js');


var CategoryDialog = function(element){
    BasicDialog.apply(this, [element || document.getElementById('dialog-new-category')]);
    this.form = this.dom.querySelector('form');
    var btns = this.dom.querySelectorAll('form input[type="submit"]');
    this.btnAdd = btns[0];
    this.btnEdit = btns[1];
    this._bindEvents();
};
CategoryDialog.prototype = Object.create(BasicDialog.prototype);
CategoryDialog.prototype.constructor = CategoryDialog;


CategoryDialog.prototype.onsubmit = function() {
    if (!this._submitEvent) {
        return;
    }

    var f = this.form;

    var onend = function(options) {
        this.btnAdd.disabled = false;
        this.btnEdit.disabled = false;
        if (options.success) {
            this.close();
        } else if (options.confirm) {
            return confirm(options.confirm);
        } else {
            console.log(options);
            this.error(options.error);
        }
    }.bind(this);

    var data = {
        categoryId: f.category.value.length > 0 ? parseInt(f.category.value) : null,
        name: f.name.value,
        onend: onend
    };

    // Safari не умеет в f.[radio].value
    var value, url;
    if (f.icon.length) {
        for (var i = 0; i < f.icon.length; i++){
            if (!f.icon[i].checked && i !== 0) {
                continue;
            }
            value = f.icon[i].value;
            url = f.icon[i].dataset.valueUrl;
            if (f.icon[i].checked) {
                break;
            }
        }
    } else {
        value = f.icon.value;
        url = f.icon.dataset.valueUrl;
    }

    if (value === 'url') {
        data.iconType = 'url';
        data.iconUrl = f.icon_url.value;
    } else if (value === 'file') {
        data.iconType = 'file';
        data.iconFile = f.icon_file.files[0];
    } else if (value === 'nothing') {
        data.iconType = 'nothing';
    } else {
        data.iconType = 'id';
        data.iconId = parseInt(value);
        data.iconUrl = url;
    }

    var result = this._submitEvent(data);
    if(!result.success) {
        return this.error(result.error);
    }
    this.btnAdd.disabled = true;
    this.btnEdit.disabled = true;
};


CategoryDialog.prototype.open = function(options){
    if(options.edit != this.dom.classList.contains('mode-edit')){
        this.dom.classList.toggle('mode-add');
        this.dom.classList.toggle('mode-edit');
    }

    if (options.edit) {
        this.form.name.value = options.category.name;
        this.form.icon.value = 'nothing'; // FIXME: Safari
        this.form.category.value = options.category.id;
    } else {
        this.form.name.value = '';
        if (this.form.icon[1]) {
            this.form.icon.value = this.form.icon[1].value;
        }
        this.form.category.value = "";
    }

    this.form.icon_url.value = '';

    BasicDialog.prototype.open.apply(this, arguments);
};


module.exports = CategoryDialog;
