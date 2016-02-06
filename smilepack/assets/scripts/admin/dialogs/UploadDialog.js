'use strict';

var BasicDialog = require('../../common/BasicDialog.js'),
    SmilePreview = require('../../common/widgets/SmilePreview.js');


var UploadDialog = function(element) {
    BasicDialog.apply(this, [element || document.getElementById('dialog-new-smile')]);
    this.form = this.dom.querySelector('form');
    this.btn = this.form.querySelector('input[type="submit"]');

    this.progressBlock = this.dom.querySelector('.smile-progress-block');
    this.progressCurrent = this.progressBlock.querySelector('.smile-progress-current');
    this.progressCount = this.progressBlock.querySelector('.smile-progress-count');

    this.preview = new SmilePreview(this.dom.querySelector('.smile-preview-block'));
    this.previewSelect = this.dom.querySelector('.smile-preview-select');
    if (this.previewSelect) {
        this.previewSelect.addEventListener('change', this._selectPreviewEvent.bind(this));
    }

    this._cancelbtn = this.dom.querySelector('.upload-action-cancel');
    this._cancelfunc = null;
    if (this._cancelbtn) {
        this._cancelbtn.addEventListener('click', this._oncancel.bind(this));
    }

    this.filesData = [];
    this.currentFilePreview = -1;

    var onfile = this.refreshFile.bind(this);

    this.form.url.addEventListener('change', onfile);

    this.current_uploader = 'link';
    this.uploaders = {
        file: this.form.querySelector('.file-uploader'),
        link: this.form.querySelector('.link-uploader')
    };
    if (this.uploaders.file) {
        this.form.file.addEventListener('change', onfile);
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


UploadDialog.prototype.clearUrlPreview = function() {
    this.preview.clear();
    this.btn.disabled = true;
};


UploadDialog.prototype.setPreviewUrl = function(url) {
    var img = document.createElement('img');
    img.onload = function() {
        this.preview.set({src: img.src, w: img.width, h: img.height, aspect: img.width / img.height});
        this.btn.disabled = false;
    }.bind(this);
    img.onerror = this.clearUrlPreview.bind(this);
    this.btn.disabled = true;
    img.src = url;
};


UploadDialog.prototype.refreshFile = function() {
    var f = this.form;

    if (this.current_uploader == 'link') {
        this.filesData = [];
        this.currentFilePreview = -1;
        if (this.previewSelect) {
            this.previewSelect.style.display = 'none';
        }

        if (this.preview.get().src == f.url.value) {
            return;
        }
        if (f.url.value.length < 9) {
            this.clearUrlPreview();
            return;
        }
        this.setPreviewUrl(f.url.value);

    } else if (this.current_uploader == 'file') {
        var i;

        if (this.previewSelect && f.file.files && f.file.files.length > 1) {
            // Если файлов много, включаем выбиралку смайлика для предпросмотра
            this.previewSelect.style.display = '';
            this.previewSelect.innerHTML = '';
            for (i = 0; i < f.file.files.length; i++) {
                var option = document.createElement('option');
                option.value = i;
                option.textContent = f.file.files[i].name;
                this.previewSelect.appendChild(option);
            }
            this.previewSelect.value = 0;
        } else {
            this.previewSelect.style.display = 'none';
        }

        this.preview.clear();
        this.currentFilePreview = -1;
        this.btn.disabled = true;
        if (!f.file.files || !f.file.files.length) {
            return;
        } else if (f.file.files.length > 50) {
            this.previewSelect.style.display = 'none';
            this.error('Многовато будет');
            return;
        }

        this.filesData = [];
        this.loadFiles(this.filesData, Array.prototype.slice.apply(f.file.files));
    }
};


UploadDialog.prototype.loadFiles = function(filesData, files) {
    if (filesData !== this.filesData) {
        // Пока загружались файлы, пользователь выбрал уже другие
        return;
    }
    if (filesData.length === files.length) {
        // Файлы загрузились (успешно или неуспешно)
        return;
    }

    var fileno = filesData.length;
    var file = files[fileno];

    var onerror = function() {
        filesData.push(null);
        this.loadFiles(filesData, files, onload);
    }.bind(this);

    var img = null;
    var fileOnload = function() {
        img = document.createElement('img');
        img.src = reader.result;
        img.onload = imgOnload;
        img.onerror = onerror;
    }.bind(this);

    var imgOnload = function() {
        filesData.push({
            file: file,
            data: reader.result,
            w: img.width,
            h: img.height
        });
        img = null;
        if (filesData === this.filesData) {
            this.btn.disabled = false;
            if (fileno === 0) {
                this.selectPreviewFile(0);
            }
            this.loadFiles(filesData, files, onload);
        }
    }.bind(this);

    if (file.size > 16 * 1024 * 1024) {
        setTimeout(onerror, 0); // Не забиваем стек
    } else {
        var reader = new FileReader();
        reader.onerror = onerror;
        reader.onload = fileOnload;
        reader.readAsDataURL(file);
    }
};


UploadDialog.prototype.selectPreviewFile = function(fileno) {
    if (this.form.file.files.length <= fileno) {
        return false;
    }
    if (fileno === this.currentFilePreview) {
        return true;
    }

    if (this.currentFilePreview !== -1 && this.filesData[this.currentFilePreview]) {
        var previewData = this.preview.get();
        if (!previewData.cleaned) {
            this.filesData[this.currentFilePreview].w = previewData.w;
            this.filesData[this.currentFilePreview].h = previewData.h;
        }
    }

    if (fileno < 0) {
        this.preview.clear();
        this.currentFilePreview = -1;
    } else {
        this.currentFilePreview = fileno;
        var d = this.filesData[fileno];
        if (d === undefined || d === null || !d.data) {
            this.preview.clear();
        } else {
            this.preview.set({src: d.data, w: d.w, h: d.h, aspect: d.w / d.h});
        }
    }
    return true;
};


UploadDialog.prototype._selectPreviewEvent = function(event) {
    this.selectPreviewFile(parseInt(event.target.value));
    return false;
};


UploadDialog.prototype.onsubmit = function() {
    if (!this._submitEvent) {
        return;
    }

    var f = this.form;
    var smiles = [];
    var previewData;

    var onprogress = this._onprogress.bind(this);

    var onend = function(options) {
        this.btn.disabled = false;
        this.progressBlock.style.display = 'none';
        if (this._cancelbtn) {
            this._cancelfunc = null;
            this._cancelbtn.style.display = 'none';
        }

        if (options.success) {
            this.close();
            if (options.notice) {
                alert(options.notice);
            }
        } else if (options.confirm) {
            return confirm(options.confirm);
        } else {
            console.log(options);
            this.error(options.error);
        }
    }.bind(this);

    if (this.current_uploader === 'link') {
        previewData = this.preview.get();
        if (previewData.cleaned) {
            return;
        }
        smiles.push({
            url: f.url.value,
            w: previewData.w,
            h: previewData.h,
            compress: f.compress ? f.compress.checked : false
        });
    } else if (this.current_uploader === 'file') {
        if (this.currentFilePreview !== -1 && this.filesData[this.currentFilePreview]) {
            previewData = this.preview.get();
            if (!previewData.cleaned) {
                this.filesData[this.currentFilePreview].w = previewData.w;
                this.filesData[this.currentFilePreview].h = previewData.h;
            }
        }

        for (var i = 0; i < this.filesData.length; i++) {
            var data = this.filesData[i];
            if (!data) {
                smiles.push({error: 'Не удалось прочитать смайлик'});
                continue;
            }
            smiles.push({
                file: data.file,
                w: data.w,
                h: data.h,
                compress: f.compress ? f.compress.checked : false
            });
        }
    }

    var result = this._submitEvent({
        smiles: smiles,
        onprogress: onprogress,
        onend: onend
    });

    if (result.success) {
        this.btn.disabled = true;
        if (result.cancelfunc && this._cancelbtn) {
            this._cancelfunc = result.cancelfunc;
            this._cancelbtn.style.display = '';
        }
    } else {
        this.error(result.error);
    }
};


UploadDialog.prototype._onprogress = function(options) {
    this.progressBlock.style.display = '';
    this.progressCurrent.textContent = options.current;
    this.progressCount.textContent = options.count;
};


UploadDialog.prototype._oncancel = function(event) {
    event.preventDefault();
    if (this._cancelfunc) {
        this._cancelfunc();
    }
    return false;
};


module.exports = UploadDialog;
