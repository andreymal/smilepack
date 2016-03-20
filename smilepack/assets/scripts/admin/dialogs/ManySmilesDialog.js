'use strict';

var BasicDialog = require('../../common/BasicDialog.js');


var ManySmilesDialog = function(element) {
    BasicDialog.apply(this, [element || document.getElementById('dialog-edit-many-smiles')]);

    this.form = this.dom.querySelector('form');
    this.btn = this.form.querySelector('input[type="submit"]');

    this.form.category.addEventListener('change', function() {
        this.form['change-category'].checked = true;
    }.bind(this));

    this.form.description.addEventListener('change', function() {
        this.form['change-description'].checked = true;
    }.bind(this));

    this.form.description.addEventListener('keyup', function() {
        this.form['change-description'].checked = true;
    }.bind(this));

    this._bindEvents();
};
ManySmilesDialog.prototype = Object.create(BasicDialog.prototype);
ManySmilesDialog.prototype.constructor = ManySmilesDialog;


ManySmilesDialog.prototype.open = function(options) {
    this.currentOptions = options;
    this._updateCategoriesList(options.collection);

    this.form['smile-ids'].value = options.smileIds.join(',');

    this.form['add-tags'].value = '';
    this.form['remove-tags'].value = '';

    if (options.categoryByDefault !== undefined && options.categoryByDefault !== null) {
        this.form['change-category'].checked = true;
        this.form.category.value = options.categoryByDefault.toString();
    } else {
        this.form['change-category'].checked = false;
    }
    this.form['change-description'].checked = false;
    this.form.description.value = '';

    // Safari не умеет в f.[radio].value
    if (options.approvedByDefault !== undefined && options.approvedByDefault !== null) {
        if (options.approvedByDefault) {
            this.form.querySelector('input[name="approved"][value="yes"]').checked = true;
        } else {
            this.form.querySelector('input[name="approved"][value="no"]').checked = true;
        }
    } else {
        this.form.querySelector('input[name="approved"][value=""]').checked = true;
    }
    this.form.querySelector('input[name="hidden"][value=""]').checked = true;

    BasicDialog.prototype.open.apply(this);
};


ManySmilesDialog.prototype._updateCategoriesList = function(collection) {
    var categories = collection ? collection.getCategoryIdsWithSmiles() : [];
    var options = document.createDocumentFragment();
    var i;

    var option = document.createElement('option');
    option.value = '';
    option.textContent = '---';
    options.appendChild(option);
    for (i = 0; i < categories.length; i++) {
        var level = categories[i][0];
        var id = categories[i][1];
        if (level !== 2) {
            console.warn('ManySmilesDialog: category level is not 2, ignored.', categories[i]);
            continue;
        }
        var catInfo = collection.getCategoryInfo(level, id, {withParent: true});
        var catTitle = catInfo.name || id.toString();
        if (catInfo.parentId !== null) {
            var parentInfo = collection.getCategoryInfo(level - 1, catInfo.parentId);
            catTitle = (parentInfo.name || catInfo.parentId.toString()) + ' -> ' + catTitle;
        }

        option = document.createElement('option');
        option.value = id.toString();
        option.textContent = catTitle;
        options.appendChild(option);
    }

    this.form.category.innerHTML = '';
    this.form.category.appendChild(options);
};


ManySmilesDialog.prototype.onsubmit = function() {
    if (!this._submitEvent) {
        return;
    }

    var i;
    var f = this.form;
    var category = f.category.value ? parseInt(f.category.value) : null;

    var smileIds = f['smile-ids'].value.split(',');
    for (i = 0; i < smileIds.length; i++) {
        smileIds[i] = parseInt(smileIds[i]);
    }

    var addTags = f['add-tags'].value.toLowerCase().split(',');
    for (i = 0; i < addTags.length; i++) {
        addTags[i] = addTags[i].trim();
        if (addTags[i].length < 1) {
            addTags.splice(i, 1);
            i--;
        }
    }

    var rmTags = f['remove-tags'].value.toLowerCase().split(',');
    for (i = 0; i < rmTags.length; i++) {
        rmTags[i] = rmTags[i].trim();
        if (rmTags[i].length < 1) {
            rmTags.splice(i, 1);
            i--;
        }
    }

    var onend = function(options) {
        this.btn.disabled = false;
        if (options.success) {
            this.close();
        } else if (options.confirm) {
            return confirm(options.confirm);
        } else {
            console.log(options);
            this.error(options.error);
        }
    }.bind(this);

    var options = {onend: onend, smileIds: smileIds};

    if (addTags.length > 0) {
        options.addTags = addTags;
    }
    if (rmTags.length > 0) {
        options.removeTags = rmTags;
    }
    if (f['change-category'].checked) {
        options.category = category;
    }
    if (f['change-description'].checked) {
        options.description = f.description.value;
    }

    var approved = f.querySelector('input[name="approved"]:checked');
    if (approved && approved.value == 'yes') {
        options.approved = true;
    } else if (approved && approved.value == 'no') {
        options.approved = false;
    }

    var hidden = f.querySelector('input[name="hidden"]:checked');
    if (hidden && hidden.value == 'yes') {
        options.hidden = true;
    } else if (hidden && hidden.value == 'no') {
        options.hidden = false;
    }

    var result = this._submitEvent(options);
    if (result.success) {
        this.btn.disabled = true;
    } else {
        this.error(result.error);
    }
};


module.exports = ManySmilesDialog;
