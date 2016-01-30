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

    // Safari не умеет в f.[radio].value
    var value, url;
    if (f.icon.length) {
        for (var i = 0; i < f.icon.length; i++) {
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

    var result = this._submitEvent({
        categoryLevel: parseInt(f.level.value),
        categoryId: f.category.value.length > 0 ? parseInt(f.category.value) : null,
        parentCategoryId: f.parent.value.length > 0 ? parseInt(f.parent.value) : 0,
        name: f.name.value,
        iconId: parseInt(value),
        iconUrl: url,
        description: f.description.value,
        onend: onend
    });

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

    this.form.level.value = options.categoryLevel;
    this.form.parent.value = options.parentCategoryId;
    if (options.edit) {
        this.form.name.value = options.category.name;
        this.form.icon.value = options.category.icon.id;
        this.form.category.value = options.category.id;
        this.form.description.value = options.category.description;
    } else {
        this.form.name.value = '';
        if (this.form.icon[0]) {
            this.form.icon.value = this.form.icon[0].value;
        }
        this.form.category.value = '';
        this.form.description.value = '';
    }
    this.btnAdd.disabled = false;
    this.btnEdit.disabled = false;
    BasicDialog.prototype.open.apply(this, arguments);
};


module.exports = CategoryDialog;
