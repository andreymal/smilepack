'use strict';

var BasicDialog = require('../../common/BasicDialog.js'),
    SmilePreview = require('../../common/widgets/SmilePreview.js');


var UploadDialog = function(element) {
    BasicDialog.apply(this, [element || document.getElementById('dialog-new-smile')]);
    this.form = this.dom.querySelector('form');
    this.btn = this.form.querySelector('input[type="submit"]');
    this.preview = new SmilePreview(this.dom.querySelector('.smile-preview-block'));

    var onfile = this.refreshFile.bind(this);

    this.form.url.addEventListener('change', onfile);

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
};
UploadDialog.prototype = Object.create(BasicDialog.prototype);
UploadDialog.prototype.constructor = UploadDialog;


UploadDialog.prototype._setUploaderEvent = function(event) {
    this.setUploader(event.target.value);
};


UploadDialog.prototype.setUploader = function(uploader) {
    if (uploader == this.current_uploader || !this.uploaders[uploader]) {
        return;
    }
    this.uploaders[this.current_uploader].style.display = 'none';
    this.uploaders[uploader].style.display = '';
    this.current_uploader = uploader;
    this.refreshFile();
};


UploadDialog.prototype.clearPreview = function() {
    this.preview.clear();
    this.btn.disabled = true;
};


UploadDialog.prototype.setPreviewUrl = function(url) {
    var img = document.createElement('img');
    img.onload = function() {
        this.preview.set({src: img.src, w: img.width, h: img.height, aspect: img.width / img.height});
        this.btn.disabled = false;
    }.bind(this);
    img.onerror = this.clearPreview.bind(this);
    this.btn.disabled = true;
    img.src = url;
};


UploadDialog.prototype.refreshFile = function() {
    var f = this.form;

    if (this.current_uploader == 'link') {
        if (this.preview.get().src == f.url.value) {
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
            this.btn.disabled = false;
        }.bind(this);
        reader.onerror = function() {
            this.clearPreview();
        }.bind(this);
        this.btn.disabled = true;
        reader.readAsDataURL(f.file.files[0]);
    }
};


UploadDialog.prototype.onsubmit = function() {
    if (!this._submitEvent) {
        return;
    }
    var data = this.preview.get();
    if (data.cleaned) {
        return;
    }
    var w = data.w;
    var h = data.h;

    var f = this.form;

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
            h: h,
            onend: onend,
            compress: f.compress ? f.compress.checked : false
        });
    } else if (this.current_uploader == 'file') {
        result = this._submitEvent({
            file: f.file.files ? f.file.files[0] : null,
            w: w,
            h: h,
            onend: onend,
            compress: f.compress ? f.compress.checked : false
        });
    }
    if (result.success) {
        this.btn.disabled = true;
    } else {
        this.error(result.error);
    }
};


module.exports = UploadDialog;
