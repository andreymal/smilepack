'use strict';

var dialogs = {
    dialogs: {},
    queue: [],
    background: document.getElementById('dialog-background'),

    register: function(name, DialogClass){
        var dialog = new DialogClass({background: this.background, name: name});
        dialog.bindEvents();
        this.dialogs[name] = dialog;
    },

    open: function(name, options){
        if(!this.dialogs[name] || this.queue.indexOf(name) >= 0) return false;
        if(!this.dialogs[name].open(options)) return false;

        if(this.background.classList.contains('hidden')) this.background.classList.remove('hidden');
        if(this.queue.length > 0){
            this.dialogs[this.queue.length - 1].hide();
        }
        this.queue.push(name);
        return true;
    },

    close: function(name){
        if(!this.dialogs[name] || this.queue.indexOf(name) < 0) return false;
        if(!this.dialogs[name].close()) return false;

        this.queue.splice(this.queue.indexOf(name), 1);
        if(this.queue.length > 0){
            this.dialogs[this.queue.length - 1].show();
        }else{
            if(!this.background.classList.contains('hidden')) this.background.classList.add('hidden');
        }
        this.dialogs[name].close();
        return true;
    },

    get: function(name){
        return this.dialogs[name];
    }
};


dialogs.Dialog = function(options){
    this.name = options.name;
};

dialogs.Dialog.prototype.bindEvents = function(){
    if(this.form){
        this._onsubmitEvent = function(event){
            this.onsubmit(event);
            event.preventDefault();
            return false;
        }.bind(this);
        this.form.addEventListener('submit', this._onsubmitEvent);
    }

    var closeBtns = this.container.querySelectorAll('.dialog-close');
    if(closeBtns.length > 0){
        this._closeClickEvent = function(event){
            dialogs.close(this.name);
            event.preventDefault();
            return false;
        }.bind(this);
        for(var i=0; i<closeBtns.length; i++){
            closeBtns[i].addEventListener('click', this._closeClickEvent);
        }
    }
};

dialogs.Dialog.prototype.show = function(){
    if(this.container && this.container.classList.contains('hidden')){
        this.container.classList.remove('hidden');
    }
};

dialogs.Dialog.prototype.hide = function(){
    if(this.container && !this.container.classList.contains('hidden')){
        this.container.classList.add('hidden');
    }
};

dialogs.Dialog.prototype.open = function(options){
    this.show();
    return true;
};

dialogs.Dialog.prototype.close = function(){
    this.hide();
    return true;
};

dialogs.Dialog.prototype.onsubmit = function(event){
    dialogs.close(this.name);
};

dialogs.Dialog.prototype.error = function(text){
    var errorDom = this.container ? this.container.querySelector('.dialog-error') : null;
    if(errorDom){
        errorDom.textContent = text;
    }else{
        alert(text);
    }
};

module.exports = dialogs;