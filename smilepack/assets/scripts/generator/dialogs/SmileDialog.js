'use strict';

var BasicDialog = require('../../common/BasicDialog.js'),
    SmilePreview = require('../../common/widgets/SmilePreview.js');


var SmileDialog = function(element) {
    BasicDialog.apply(this, [element || document.getElementById('dialog-new-smile')]);
    this.form = this.dom.querySelector('form');
    this.btn = this.form.querySelector('input[type="submit"]');

    this.suggestionArea = this.form.querySelector('.smile-suggestion-area');

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

    if (this.suggestionArea) {
        this.form.is_suggestion.addEventListener('change', this._changeIsSuggestionEvent.bind(this));
    }

    this._bindEvents();
    this.refreshFile();
};
SmileDialog.prototype = Object.create(BasicDialog.prototype);
SmileDialog.prototype.constructor = SmileDialog;


SmileDialog.prototype._setUploaderEvent = function(event) {
    this.setUploader(event.target.value);
};


SmileDialog.prototype.open = function(options) {
    if (this.suggestionArea) {
        this._updateCategoriesList(options.collection);
        this.form.is_suggestion.checked = false;
        this.suggestionArea.style.display = 'none';
    }
    BasicDialog.prototype.open.apply(this);
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


SmileDialog.prototype.clearUrlPreview = function() {
    this.preview.clear();
    this.btn.disabled = true;
};


SmileDialog.prototype.setPreviewUrl = function(url) {
    var img = document.createElement('img');
    img.onload = function() {
        this.preview.set({src: img.src, w: img.width, h: img.height, aspect: img.width / img.height});
        this.btn.disabled = false;
    }.bind(this);
    img.onerror = this.clearUrlPreview.bind(this);
    this.btn.disabled = true;
    img.src = url;
};


SmileDialog.prototype.refreshFile = function() {
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
        } else if (f.file.files.length > 1000) {
            this.previewSelect.style.display = 'none';
            this.error('Многовато будет');
            return;
        }

        this.filesData = [];
        this.loadFiles(this.filesData, Array.prototype.slice.apply(f.file.files));
    }
};


SmileDialog.prototype.loadFiles = function(filesData, files) {
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


SmileDialog.prototype.selectPreviewFile = function(fileno) {
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


SmileDialog.prototype._selectPreviewEvent = function(event) {
    this.selectPreviewFile(parseInt(event.target.value));
    return false;
};


SmileDialog.prototype.onsubmit = function() {
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

    var addData;
    if (this.current_uploader === 'link') {
        previewData = this.preview.get();
        if (previewData.cleaned) {
            return;
        }
        addData = {
            url: f.url.value,
            w: previewData.w,
            h: previewData.h,
            compress: f.compress ? f.compress.checked : false
        };
        if (this.suggestionArea && f.is_suggestion.checked) {
            addData.is_suggestion = true;
            addData.suggestion_category = f.suggestion_category.value.length > 0 ? parseInt(f.suggestion_category.value) : null;
            addData.tags = f.tags.value;
            addData.description = f.description.value;
        }
        smiles.push(addData);
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
            addData = {
                file: data.file,
                w: data.w,
                h: data.h,
                compress: f.compress ? f.compress.checked : false
            };
            if (this.suggestionArea && f.is_suggestion.checked) {
                addData.is_suggestion = true;
                addData.suggestion_category = f.suggestion_category.value.length > 0 ? parseInt(f.suggestion_category.value) : null;
                addData.tags = f.tags.value;
                addData.description = f.description.value;
            }
            smiles.push(addData);
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
        if (level !== 2) {
            console.warn('SmileDialog: category level is not 2, ignored.', categories[i]);
            continue;
        }
        option = document.createElement('option');
        var id = categories[i][1];
        option.value = id.toString();
        option.textContent = collection.getCategoryInfo(level, id).name || option.value;
        options.appendChild(option);
    }

    this.form.suggestion_category.innerHTML = '';
    this.form.suggestion_category.appendChild(options);
};


SmileDialog.prototype._changeIsSuggestionEvent = function() {
    this.suggestionArea.style.display = this.form.is_suggestion.checked ? '' : 'none';
};


SmileDialog.prototype._onprogress = function(options) {
    this.progressBlock.style.display = '';
    this.progressCurrent.textContent = options.current;
    this.progressCount.textContent = options.count;
};


SmileDialog.prototype._oncancel = function(event) {
    event.preventDefault();
    if (this._cancelfunc) {
        this._cancelfunc();
    }
    return false;
};


module.exports = SmileDialog;
