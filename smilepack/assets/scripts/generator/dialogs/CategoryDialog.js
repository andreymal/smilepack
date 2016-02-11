'use strict';

var BasicDialog = require('../../common/BasicDialog.js');


var CategoryDialog = function(element) {
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

    var edit = f.category.value.length > 0;
    var data = {
        categoryId: edit ? parseInt(f.category.value) : null,
        name: f.name.value,
        before: f.before.value.length ? parseInt(f.before.value) : null,
        onend: onend
    };

    // Safari не умеет в f.[radio].value
    var checkedIcon = this.form.querySelector('input[name="icon"]:checked');
    var value = checkedIcon ? checkedIcon.value : null;
    var url = checkedIcon ? checkedIcon.dataset.valueUrl : null;

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
    if (!result.success) {
        return this.error(result.error);
    }
    this.btnAdd.disabled = true;
    this.btnEdit.disabled = true;
};


CategoryDialog.prototype.open = function(options) {
    if (options.edit != this.dom.classList.contains('mode-edit')) {
        this.dom.classList.toggle('mode-add');
        this.dom.classList.toggle('mode-edit');
    }

    if (options.edit) {
        this.form.name.value = options.category.name;
        this.form.icon[0].checked = true;
        this.form.category.value = options.category.id;
    } else {
        this.form.name.value = '';
        if (this.form.icon[1]) {
            this.form.icon[1].checked = true;
        }
        this.form.category.value = "";
    }

    this.form.icon_url.value = '';

    var i, option;
    this.form.before.innerHTML = '';
    for (i = 0; i < options.beforeList.length; i++) {
        if (options.edit && options.beforeList[i][0] === options.category.id) {
            continue;
        }
        option = document.createElement('option');
        option.value = options.beforeList[i][0];
        option.textContent = options.beforeList[i][1];
        this.form.before.appendChild(option);
    }
    option = document.createElement('option');
    option.value = '';
    option.textContent = '---';
    this.form.before.appendChild(option);

    this.form.before.value = options.before !== null ? options.before.toString() : '';

    BasicDialog.prototype.open.apply(this, arguments);
};


module.exports = CategoryDialog;
