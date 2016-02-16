'use strict';

var BasicDialog = require('../../common/BasicDialog.js');


var SmilepackDialog = function(element) {
    BasicDialog.apply(this, [element || document.getElementById('dialog-save')]);
    this.processingElement = this.dom.querySelector('.processing');
    this.savedElement = this.dom.querySelector('.saved');

    this.beginElement = this.processingElement.querySelector('.processing-begin');
    this.endElement = this.processingElement.querySelector('.processing-end');
    this.smileCurrentElement = this.beginElement.querySelector('.smile-current');
    this.smilesCountElement = this.beginElement.querySelector('.smiles-count');
    this._bindEvents();

    this.mode = 'begin';
};
SmilepackDialog.prototype = Object.create(BasicDialog.prototype);
SmilepackDialog.prototype.constructor = SmilepackDialog;


SmilepackDialog.prototype.open = function(options) {
    if (this.mode != options.mode) {
        this.mode = options.mode;
        this.beginElement.style.display = this.mode == 'begin' ? '' : 'none';
        this.endElement.style.display = this.mode == 'saving' ? '' : 'none';

        this.processingElement.style.display = this.mode == 'saved' ? 'none' : '';
        this.savedElement.style.display = this.mode == 'saved' ? '' : 'none';

        if ((this.mode == 'saved') != this.dom.classList.contains('smp-saved')) {
            this.dom.classList.toggle('smp-saved');
        }
    }

    if (this.mode == 'begin') {
        this.smileCurrentElement.textContent = options.current + 1;
        this.smilesCountElement.textContent = options.count;
    } else if (this.mode == 'saved') {
        this.savedElement.querySelector('.smp-id').textContent = options.savedData.smilepack_id;
        this.savedElement.querySelector('.smp-url').href = options.savedData.download_url;
        this.savedElement.querySelector('.smp-view-url').href = options.savedData.view_url;
        this.savedElement.querySelector('.smp-view-url').textContent = options.savedData.view_url;
        this.savedElement.querySelector('.smp-mini-view-url').href = options.savedData.mini_view_url;
        this.savedElement.querySelector('.smp-mini-view-url').textContent = options.savedData.mini_view_url;
    }

    BasicDialog.prototype.open.apply(this, arguments);
};


module.exports = SmilepackDialog;
