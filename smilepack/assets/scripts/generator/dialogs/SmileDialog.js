'use strict';

var BasicDialog = require('./BasicDialog.js');


var SmileDialog = function(element) {
    BasicDialog.apply(this, [element || document.getElementById('dialog-new-smile')]);
    this.form = this.dom.querySelector('form');
    this.btn = this.form.querySelector('input[type="submit"]');

    var onchange = this.refresh.bind(this);
    var onfile = this.refreshFile.bind(this);

    this.form.url.addEventListener('change', onfile);
    this.form.w.addEventListener('change', onchange);
    this.form.h.addEventListener('change', onchange);
    this.form.w.addEventListener('keyup', onchange);
    this.form.h.addEventListener('keyup', onchange);

    this.current_uploader = 'link';
    this.uploaders = {
        file: this.form.querySelector('.file-uploader'),
        link: this.form.querySelector('.link-uploader')
    };
    if (this.uploaders.file) {
        this.uploaders.file.addEventListener('change', onfile);
    }
    if (this.form.uploader) {
        for (var i = 0; i < this.form.uploader.length; i++) {
            this.form.uploader[i].addEventListener('change', this._setUploaderEvent.bind(this));
        }
    }

    this._bindEvents();
    this.refreshFile();
    this.refresh();
};
SmileDialog.prototype = Object.create(BasicDialog.prototype);
SmileDialog.prototype.constructor = SmileDialog;


SmileDialog.prototype._setUploaderEvent = function(event) {
    this.setUploader(event.target.value);
};


SmileDialog.prototype.setUploader = function(uploader) {
    if (uploader == this.current_uploader || !this.uploaders[uploader]) {
        return;
    }
    this.uploaders[this.current_uploader].style.display = 'none';
    this.uploaders[uploader].style.display = '';
    this.current_uploader = uploader;
    this.refreshFile();
};


SmileDialog.prototype.clearPreview = function() {
    var f = this.form;
    var preview = f.querySelector('.new-smile-preview');
    preview.src = 'data:image/gif;base64,R0lGODdhAQABAIABAP///+dubiwAAAAAAQABAAACAkQBADs=';
    preview.width = 0;
    preview.height = 0;
    f.w.value = '';
    f.h.value = '';
};


SmileDialog.prototype.setPreviewUrl = function(url) {
    var f = this.form;
    var preview = f.querySelector('.new-smile-preview');

    var img = document.createElement('img');
    img.onload = function() {
        preview.src = img.src;
        preview.width = img.width;
        preview.height = img.height;
        f.w.value = img.width;
        f.h.value = img.height;
    };
    img.onerror = this.clearPreview.bind(this);
    img.src = url;
};


SmileDialog.prototype.refreshFile = function() {
    var f = this.form;
    var preview = f.querySelector('.new-smile-preview');

    if (this.current_uploader == 'link') {
        if (preview.src == f.url.value) {
            return;
        }
        if (f.url.value.length < 9) {
            this.clearPreview();
            return;
        }
        this.setPreviewUrl(f.url.value);

    } else if (this.current_uploader == 'file') {
        if (!f.file.files || !f.file.files[0]) {
            this.clearPreview();
            return;
        }

        var reader = new FileReader();
        reader.onload = function() {
            this.setPreviewUrl(reader.result);
        }.bind(this);
        reader.onerror = function() {
            this.clearPreview();
        }.bind(this);
        reader.readAsDataURL(f.file.files[0]);
    }
};


SmileDialog.prototype.refresh = function() {
    var f = this.form;

    var preview = f.querySelector('.new-smile-preview');
    var aspect = preview.width / preview.height;
    var save_aspect = f.save_aspect.checked;

    var nw = preview.width;
    var nh = preview.height;

    var w = parseInt(f.w.value);
    if (!isNaN(w) && w > 0 && preview.width != w) {
        nw = w;
        if (save_aspect) {
            nh = Math.round(w / aspect);
            f.h.value = nh;
        }
    }

    var h = parseInt(f.h.value);
    if (!isNaN(h) && h > 0 && preview.height != h) {
        nh = h;
        if (save_aspect) {
            nw = Math.round(h * aspect);
            f.w.value = nw;
        }
    }

    if (nw < 1) {
        nw = 1;
    } else if (nw > 10240) {
        nw = 10240;
    }

    if (nh < 1) {
        nh = 1;
    } else if (nh > 10240) {
        nh = 10240;
    }

    preview.width = nw;
    preview.height = nh;
};


SmileDialog.prototype.onsubmit = function() {
    if (!this._submitEvent) {
        return;
    }

    var f = this.form;
    var w = parseInt(f.w.value);
    var h = parseInt(f.h.value);

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

    var result;
    if (this.current_uploader == 'link') {
        result = this._submitEvent({
            url: f.url.value,
            w: w,
            h: h, onend: onend
        });
    } else if (this.current_uploader == 'file') {
        result = this._submitEvent({
            file: f.file.files ? f.file.files[0] : null,
            w: w,
            h: h,
            onend: onend
        });
    }
    if (result.success) {
        this.btn.disabled = true;
    } else {
        this.error(result.error);
    }
};


module.exports = SmileDialog;
