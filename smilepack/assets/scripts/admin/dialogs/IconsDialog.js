'use strict';

var BasicDialog = require('../../common/BasicDialog.js');


var IconsDialog = function(element) {
    BasicDialog.apply(this, [element || document.getElementById('dialog-icons')]);
    this.form = this.dom.querySelector('form');
    this.btn = this.form.querySelector('input[type="submit"]');
    this._bindEvents();

    var items = this.dom.querySelectorAll('.admin-icon-publish');
    for (var i = 0; i < items.length; i++) {
        items[i].addEventListener('change', this._togglePublishedEvent.bind(this));
    }

    this._toggleFunc = null;
};
IconsDialog.prototype = Object.create(BasicDialog.prototype);
IconsDialog.prototype.constructor = IconsDialog;


IconsDialog.prototype.setToggleFunc = function(func) {
    this._toggleFunc = func;
};


IconsDialog.prototype.onsubmit = function() {
    if (!this._submitEvent) {
        return;
    }

    var onend = function(options) {
        this.btn.disabled = false;
        if (!options.success) {
            console.log(options);
            this.error(options.error);
        } else {
            this.addIcon(options.icon);
        }
    }.bind(this);

    var data = {onend: onend};
    var iconType = this.form.querySelector('input[name="icon_type"]:checked').value;
    if (iconType == 'file') {
        data.file = this.form.file.files[0];
    } else {
        data.url = this.form.url.value;
    }

    var result = this._submitEvent(data);

    if (!result.success) {
        return this.error(result.error);
    }
    this.btn.disabled = true;
};


IconsDialog.prototype.addIcon = function(icon) {
    var div = document.createElement('div');
    div.className = 'admin-icon-item';
    var label = document.createElement('label');

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'admin-icon-publish';
    cb.dataset.id = icon.id;

    var img = document.createElement('img');
    img.className = 'admin-icon-img';
    img.src = icon.url;
    img.alt = icon.id;
    img.title = icon.id;

    label.appendChild(cb);
    label.appendChild(img);
    div.appendChild(label);
    div.addEventListener('change', this._togglePublishedEvent.bind(this));
    this.dom.querySelector('.admin-icons-list').appendChild(div);
};


IconsDialog.prototype._togglePublishedEvent = function(event) {
    var checkbox = event.target;

    if (this._toggleFunc) {
        this._toggleFunc(
            parseInt(checkbox.dataset.id),
            checkbox.checked,
            function(data) {
                if (!data.success) {
                    checkbox.checked = !checkbox.checked;
                    this.error(data.error);
                }
            }.bind(this)
        );
    } else {
        checkbox.checked = !checkbox.checked;
    }
};


module.exports = IconsDialog;
