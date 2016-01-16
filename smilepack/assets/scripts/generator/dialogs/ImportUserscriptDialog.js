'use strict';

var BasicDialog = require('../../common/BasicDialog.js');


var ImportUserscriptDialog = function(element){
    BasicDialog.apply(this, [element || document.getElementById('dialog-import-userscript')]);
    this.form = this.dom.querySelector('form');
    this.btn = this.form.querySelector('input[type="submit"]')
    this._bindEvents();
};
ImportUserscriptDialog.prototype = Object.create(BasicDialog.prototype);
ImportUserscriptDialog.prototype.constructor = ImportUserscriptDialog;


ImportUserscriptDialog.prototype.onsubmit = function(){
    if(!this._submitEvent) return;

    var onend = function(result){
        if(result.notice || result.error){
            alert(result.notice || result.error);
        }
        this.btn.disabled = false;
        this.close();
    }.bind(this);

    var result = this._submitEvent({form: this.form, onend: onend});
    if(result.success) this.btn.disabled = true;
    else this.error(result.error);
};


ImportUserscriptDialog.prototype.open = function(options){
    this.form.file.value = '';
    this.btn.disabled = false;
    BasicDialog.prototype.open.apply(this, arguments);
};


module.exports = ImportUserscriptDialog;
