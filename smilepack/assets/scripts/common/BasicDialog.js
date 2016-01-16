'use strict';

var BasicDialog = function(element){
    if(!element) throw new Error('Dialog requires element');

    this.dom = element;

    this.form = null;
    this._openEvent = null;
    this._submitEvent = null;
};


BasicDialog.prototype.getDOM = function(){
    return this.dom;
};


BasicDialog.prototype._bindEvents = function(){
    if(this.form){
        var onsubmit = function(event){
            this.onsubmit(event);
            event.preventDefault();
            return false;
        }.bind(this);
        this.form.addEventListener('submit', onsubmit);
    }

    var closeBtns = this.dom.querySelectorAll('.dialog-close');
    if(closeBtns.length > 0){
        var onclose = function(event){
            this.close();
            event.preventDefault();
            return false;
        }.bind(this);
        for(var i=0; i<closeBtns.length; i++){
            closeBtns[i].addEventListener('click', onclose);
        }
    }
};


BasicDialog.prototype.setOpenEvent = function(func){
    this._openEvent = func;
};


BasicDialog.prototype.setSubmitEvent = function(func){
    this._submitEvent = func;
};


BasicDialog.prototype.open = function(options){
    this.show();
    if(this._openEvent) this._openEvent(true);
};


BasicDialog.prototype.close = function(){
    this.hide();
    if(this._openEvent) this._openEvent(false);
};


BasicDialog.prototype.show = function(options){
    this.dom.classList.remove('hidden');
};


BasicDialog.prototype.hide = function(){
    this.dom.classList.add('hidden');
};


BasicDialog.prototype.error = function(text){
    alert(text);
};


BasicDialog.prototype.onsubmit = function(event){
    var result = {success: true};
    if(this._submitEvent) result = this._submitEvent({});

    if(result.success) this.close();
};

module.exports = BasicDialog;
