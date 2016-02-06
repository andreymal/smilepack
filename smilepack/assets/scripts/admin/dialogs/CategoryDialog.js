'use strict';

var BasicDialog = require('../../common/BasicDialog.js');


var CategoryDialog = function(element) {
    BasicDialog.apply(this, [element || document.getElementById('dialog-new-category')]);
    this.form = this.dom.querySelector('form');
    this.subsectContainer = this.dom.querySelector('.subsection-container');
    this.subsect = this.dom.querySelector('.subsection-container select');
    var btns = this.dom.querySelectorAll('form input[type="submit"]');
    this.btnAdd = btns[0];
    this.btnEdit = btns[1];
    this._currentOptions = null;
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
    var checkedIcon = this.form.querySelector('input[name="icon"]:checked');
    var value = checkedIcon ? checkedIcon.value : null;
    var url = checkedIcon ? checkedIcon.dataset.valueUrl : null;

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
        categoryLevel: parseInt(f.level.value),
        categoryId: f.category.value.length > 0 ? parseInt(f.category.value) : null,
        parentCategoryId: f.parent.value.length > 0 ? parseInt(f.parent.value) : 0,
        onend: onend
    };

    var old = this._currentOptions;
    if (!old.edit || f.name.value !== old.category.name) {
        data.name = f.name.value;
    }
    if (!old.edit || parseInt(value) !== old.category.icon.id) {
        data.iconId = parseInt(value);
        data.iconUrl = url;
    }
    if (!old.edit || f.description.value !== old.category.description) {
        data.description = f.description.value;
    }
    if (old.subsections && old.subsections.length > 1 && parseInt(f.subsection.value) !== old.parentCategoryId) {
        data.subsection = parseInt(f.subsection.value);
    } else if (!old.edit || f.before.value !== (old.before !== null ? old.before.toString() : null)) {
        data.before = f.before.value.length ? parseInt(f.before.value) : null;
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
    this._currentOptions = options;

    var i, option;
    if (options.subsections && options.subsections.length > 1) {
        this.subsectContainer.style.display = '';
        this.subsect.innerHTML = '';
        for (i = 0; i < options.subsections.length; i++) {
            option = document.createElement('option');
            option.value = options.subsections[i][0];
            option.textContent = options.subsections[i][1];
            this.subsect.appendChild(option);
        }
        this.form.subsection.value = options.parentCategoryId;
    } else {
        this.subsectContainer.style.display = 'none';
        this.subsect.innerHTML = '';
        this.form.subsection.value = '';
    }

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

    this.form.level.value = options.categoryLevel;
    this.form.parent.value = options.parentCategoryId;
    if (options.edit) {
        this.form.name.value = options.category.name;
        if (this.form.icon) {
            this.form.querySelector('input[name="icon"][value="' + parseInt(options.category.icon.id) + '"]').checked = true;
        }
        this.form.category.value = options.category.id;
        this.form.description.value = options.category.description;
    } else {
        this.form.name.value = '';
        if (this.form.icon && this.form.icon[0]) {
            this.form.icon[0].checked = true;
        }
        this.form.category.value = '';
        this.form.description.value = '';
    }
    if (!this.form.icon) {
        this.btnAdd.disabled = true;
        this.btnEdit.disabled = true;
    } else {
        this.btnAdd.disabled = false;
        this.btnEdit.disabled = false;
    }
    BasicDialog.prototype.open.apply(this, arguments);
};


module.exports = CategoryDialog;
