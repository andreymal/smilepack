'use strict';

var BasicDialog = require('../../common/BasicDialog.js');
var SmilePreview = require('../../common/widgets/SmilePreview.js');


var SmileDialog = function(element) {
    BasicDialog.apply(this, [element || document.getElementById('dialog-edit-smile')]);

    this.form = this.dom.querySelector('form');
    this.btn = this.form.querySelector('input[type="submit"]');

    this.smilePreview = new SmilePreview(this.dom.querySelector('.smile-preview-block'));
    this.currentOptions = null;

    this._bindEvents();
};
SmileDialog.prototype = Object.create(BasicDialog.prototype);
SmileDialog.prototype.constructor = SmileDialog;


SmileDialog.prototype.open = function(options) {
    this.currentOptions = options;
    this._updateCategoriesList(options.collection);

    this.form.smile.value = options.id;
    this.form.tags.value = options.tags.join(', ');
    this.form.description.value = options.description;
    this.form.approved.checked = options.approvedByDefault || options.approved_at !== null;
    this.form.hidden.checked = options.hidden;
    if (options.category) {
        this.form.category.value = options.category[0];
    } else {
        this.form.category.value = '';
    }

    this.smilePreview.set({src: options.url, w: options.w, h: options.h, aspect: options.w / options.h});

    BasicDialog.prototype.open.apply(this);
};


SmileDialog.prototype._updateCategoriesList = function(collection) {
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
            console.warn('SmileDialog: category level is not 2, ignored.', categories[i]);
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


SmileDialog.prototype.onsubmit = function() {
    if (!this._submitEvent) {
        return;
    }
    var data = this.smilePreview.get();
    if (data.cleaned) {
        return;
    }
    var w = data.w;
    var h = data.h;

    var f = this.form;
    var category = f.category.value ? parseInt(f.category.value) : null;
    var tags = f.tags.value.toLowerCase().split(',');
    for (var i = 0; i < tags.length; i++) {
        tags[i] = tags[i].trim();
        if (tags[i].length < 1) {
            tags.splice(i, 1);
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

    var options = {onend: onend, smile: parseInt(f.smile.value)};
    if (w !== this.currentOptions.w) {
        options.w = w;
    }
    if (h !== this.currentOptions.h) {
        options.h = h;
    }
    if (this.currentOptions.category === null || this.currentOptions.category === undefined) {
        if (category !== null) {
            options.category = category;
        }
    } else if (category !== this.currentOptions.category[1]) {
        options.category = category;
    }
    if (tags.join(',') != this.currentOptions.tags.join(',')) {
        options.tags = tags;
    }
    if (f.description.value !== this.currentOptions.description) {
        options.description = f.description.value;
    }
    if (f.approved.checked !== (this.currentOptions.approved_at !== null)) {
        options.approved = f.approved.checked;
    }
    if (f.hidden.checked !== this.currentOptions.hidden) {
        options.hidden = f.hidden.checked;
    }

    var result = this._submitEvent(options);
    if (result.success) {
        this.btn.disabled = true;
    } else {
        this.error(result.error);
    }
};


module.exports = SmileDialog;
