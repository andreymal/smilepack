'use strict';


var SmilePreview = function(element) {
    this.element = element;

    this._w = element.querySelector('input[name="w"]');
    this._h = element.querySelector('input[name="h"]');
    this._keepAspect = element.querySelector('input[name="keep-aspect"]');
    this._img = element.querySelector('img.smile-preview');
    this._reset = element.querySelector('.action-reset');

    this.defaults = {src: this._img.src, w: parseInt(this._img.width) || 0, h: parseInt(this._img.h) || 0};
    this.defaults.aspect = this.defaults.w > 0 && this.defaults.h > 0 ? this.defaults.w / this.defaults.h : 0.0;
    this.cleaned = true;
    this.aspect = 0.0;

    this.original = {src: this._img.src, w: this._img.width, h: this._img.h, aspect: this.defaults.aspect};

    this._w.addEventListener('change', this._onchangewidth.bind(this));
    this._w.addEventListener('keyup', this._onchangewidth.bind(this));
    this._h.addEventListener('change', this._onchangeheight.bind(this));
    this._h.addEventListener('keyup', this._onchangeheight.bind(this));
    this._reset.addEventListener('click', this._onreset.bind(this));
    this._keepAspect.addEventListener('change', this._onchangeaspect.bind(this));
};


SmilePreview.prototype.show = function() {
    this.element.style.display = '';
};


SmilePreview.prototype.hide = function() {
    this.element.style.display = 'none';
};


SmilePreview.prototype.get = function() {
    return {
        cleaned: this.cleaned,
        w: parseInt(this._w.value),
        h: parseInt(this._h.value),
        src: this._img.src,
        aspect: this.aspect
    };
};


SmilePreview.prototype.set = function(options) {
    if (options.hasOwnProperty('src')) {
        this._img.src = options.src;
        this.original.src = options.src;
    }
    if (options.hasOwnProperty('w')) {
        this._w.value = options.w;
        this._img.width = options.w;
        this.original.w = options.w;
    }
    if (options.hasOwnProperty('h')) {
        this._h.value = options.h;
        this._img.height = options.h;
        this.original.h = options.h;
    }
    if (options.hasOwnProperty('aspect')) {
        this.aspect = options.aspect;
        this.original.aspect = options.aspect;
    }
    this.cleaned = false;
};


SmilePreview.prototype.clear = function() {
    this.set(this.defaults);
    this._w.value = '';
    this._h.value = '';
    this.cleaned = false;
};


SmilePreview.prototype._onchangewidth = function() {
    var w = parseInt(this._w.value);
    if (isNaN(w) || w < 1 || w > 10240 || w == this._img.width) {
        return;
    }
    this._img.width = w;

    if (this.aspect <= 0 || !this._keepAspect.checked) {
        return;
    }

    var h = Math.round(w / this.aspect);
    this._img.height = h;
    this._h.value = h;
};


SmilePreview.prototype._onchangeheight = function() {
    var h = parseInt(this._h.value);
    if (isNaN(h) || h < 1 || h > 10240 || h == this._img.height) {
        return;
    }
    this._img.height = h;

    if (this.aspect <= 0 || !this._keepAspect.checked) {
        return;
    }

    var w = Math.round(h * this.aspect);
    this._img.width = w;
    this._w.value = w;
};


SmilePreview.prototype._onchangeaspect = function() {
    if (!this._keepAspect.checked) {
        return;
    }
    var w = parseInt(this._w.value);
    var h = parseInt(this._h.value);
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
        return;
    }
    this.aspect = w / h;
};


SmilePreview.prototype._onreset = function(event) {
    this.set({src: this.original.src, w: this.original.w, h: this.original.h, aspect: this.original.aspect});
    event.preventDefault();
    return false;
};


module.exports = SmilePreview;
