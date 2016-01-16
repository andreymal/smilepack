'use strict';

var BasicDialog = require('../../common/BasicDialog.js');


var CategoryDialog = function(element){
    BasicDialog.apply(this, [element || document.getElementById('dialog-new-category')]);
    this.form = this.dom.querySelector('form');
    this._bindEvents();
};
CategoryDialog.prototype = Object.create(BasicDialog.prototype);
CategoryDialog.prototype.constructor = CategoryDialog;


CategoryDialog.prototype.onsubmit = function(){
    var f = this.form;

    // Safari не умеет в f.[radio].value
    var value, url;
    if(f.icon.length){
        for(var i=0; i<f.icon.length; i++){
            if(!f.icon[i].checked && i != 0) continue;
            value = f.icon[i].value;
            url = f.icon[i].dataset.valueUrl;
            if(f.icon[i].checked) break;
        }
    }else{
        value = f.icon.value;
        url = f.icon.dataset.valueUrl;
    }

    var result = {success: true};
    if(this._submitEvent){
        result = this._submitEvent({
            categoryId: f.category.value.length > 0 ? parseInt(f.category.value) : null,
            name: f.name.value,
            iconId: value,
            iconUrl: url
        });
    }

    if(!result.success) return this.error(result.error);
    this.close();
};


CategoryDialog.prototype.open = function(options){
    if(options.edit != this.dom.classList.contains('mode-edit')){
        this.dom.classList.toggle('mode-add');
        this.dom.classList.toggle('mode-edit');
    }

    if(options.edit){
        this.form.name.value = options.category.name;
        this.form.icon.value = options.category.icon.id;
        this.form.category.value = options.category.id;
    }else{
        this.form.name.value = '';
        if(this.form.icon[0]) this.form.icon.value = this.form.icon[0].value;
        this.form.category.value = "";
    }

    BasicDialog.prototype.open.apply(this, arguments);
};


module.exports = CategoryDialog;
