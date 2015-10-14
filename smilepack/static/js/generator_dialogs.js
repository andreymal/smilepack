'use strict';


/*
 * Диалог добавления категории смайлопака
 */
generator.CategoryDialog = function(options){
    dialogs.Dialog.apply(this, arguments);
    this.container = document.getElementById('dialog-new-category');
    this.form = document.querySelector('#dialog-new-category form');
};
generator.CategoryDialog.prototype = Object.create(dialogs.Dialog.prototype);
generator.CategoryDialog.prototype.constructor = generator.CategoryDialog;


generator.CategoryDialog.prototype.onsubmit = function(){
    var f = this.form;
    if(!f.name.value) return this.error('Введите имя категории');
    if(f.name.value.length > 128) return this.error('Длинновато имя у категории');

    // Safari не умеет в f.icon.value
    var value, url;
    for(var i=0; i<f.icon.length; i++){
        if(!f.icon[i].checked && i != 0) continue;
        value = f.icon[i].value;
        url = f.icon[i].dataset.valueUrl;
        if(f.icon[i].checked) break;
    }

    var id = null;
    if(f.category.value.length > 0){
        id = generator.editSmilepackCategory(
            parseInt(f.category.value),
            f.name.value,
            value,
            url
        );
    }else{
        id = generator.addSmilepackCategory(
            f.name.value,
            value,
            url
        );
    }
    if(id == null) return this.error('Что-то пошло не так');
    dialogs.close(this.name);
};


generator.CategoryDialog.prototype.open = function(options){
    if(options.edit != this.container.classList.contains('mode-edit')){
        this.container.classList.toggle('mode-add');
        this.container.classList.toggle('mode-edit');
    }

    if(options.edit){
        this.form.name.value = options.category.name;
        this.form.icon.value = options.category.icon.id;
        this.form.category.value = options.category.id;
    }else{
        this.form.name.value = '';
        this.form.icon.value = this.form.icon[0].value;
        this.form.category.value = "";
    }
    this.show();
    return true;
};


/*
 * Диалог добавления нового смайлика
 */
generator.SmileDialog = function(options){
    dialogs.Dialog.apply(this, arguments);
    this.container = document.getElementById('dialog-new-smile');
    this.form = document.querySelector('#dialog-new-smile form');

    this.form.url.addEventListener('change', this.refresh.bind(this));
    this.form.w.addEventListener('change', this.refresh.bind(this));
    this.form.h.addEventListener('change', this.refresh.bind(this));
};
generator.SmileDialog.prototype = Object.create(dialogs.Dialog.prototype);
generator.SmileDialog.prototype.constructor = generator.SmileDialog;


generator.SmileDialog.prototype.refresh = function(){
    var f = this.form;
    var preview = f.querySelector('.new-smile-preview');

    if(preview.src != f.url.value){
        var img = document.createElement('img');
        img.onload = function(){
            preview.src = img.src;
            preview.width = img.width;
            preview.height = img.height;
            f.w.value = img.width;
            f.h.value = img.height;
        };
        img.onerror = function(){
            preview.src = 'data:image/gif;base64,R0lGODdhAQABAIABAP///+dubiwAAAAAAQABAAACAkQBADs=';
            preview.width = 0;
            preview.height = 0;
            f.w.value = '';
            f.h.value = '';
        };
        img.src = f.url.value;
        return;
    }

    var w = parseInt(f.w.value);
    if(!isNaN(w) && w > 0) preview.width = w;

    var h = parseInt(f.h.value);
    if(!isNaN(h) && h > 0) preview.height = h;
};


generator.SmileDialog.prototype.onsubmit = function(){
    var f = this.form;
    if(!f.url.value || f.url.value.length < 9) return this.error('Надо бы ссылку на смайлик');
    if(f.url.value.length > 512) return this.error('Длинновата ссылка, перезалейте на что-нибудь поадекватнее');
    var w = parseInt(f.w.value);
    var h = parseInt(f.h.value);
    if(isNaN(w) || w < 1 || isNaN(h) || h < 1) return this.error('Размеры смайлика кривоваты');

    var id = generator.addCustomSmile(f.url.value, w, h);
    if(id == null) return this.error('Что-то пошло не так');
    dialogs.close(this.name);
};


/*
 * Диалог импортирования юзерскрипта
 */
generator.ImportUserscriptDialog = function(options){
    dialogs.Dialog.apply(this, arguments);
    this.container = document.getElementById('dialog-import-userscript');
    this.form = document.querySelector('#dialog-import-userscript form');
    this.btn = document.querySelector('#dialog-import-userscript form input[type="submit"]')
};
generator.ImportUserscriptDialog.prototype = Object.create(dialogs.Dialog.prototype);
generator.ImportUserscriptDialog.prototype.constructor = generator.ImportUserscriptDialog;


generator.ImportUserscriptDialog.prototype.onsubmit = function(){
    var file = this.form.file;
    if(!file.value) return this.error('Выберите файл');
    generator.importUserscript(this.form, true, function(){dialogs.close(this.name)}.bind(this));
    this.btn.disabled = true;
};


generator.ImportUserscriptDialog.prototype.open = function(options){
    this.form.file.value = '';
    this.btn.disabled = false;
    this.show();
    return true;
};


/*
 * Диалог сохранения смайлопака
 */
generator.SmilepackDialog = function(options){
    dialogs.Dialog.apply(this, arguments);
    this.container = document.getElementById('dialog-save');
    this.processingElement = this.container.querySelector('.processing');
    this.savedElement = this.container.querySelector('.saved');
};
generator.SmilepackDialog.prototype = Object.create(dialogs.Dialog.prototype);
generator.SmilepackDialog.prototype.constructor = generator.SmilepackDialog;


generator.SmilepackDialog.prototype.open = function(){
    this.processingElement.style.display = '';
    this.savedElement.style.display = 'none';
    if(this.container.classList.contains('smp-saved')) this.container.classList.remove('smp-saved');
    this.show();
    return true;
};


generator.SmilepackDialog.prototype.onsave = function(options){
    this.processingElement.style.display = 'none';
    this.savedElement.style.display = '';
    if(!this.container.classList.contains('smp-saved')) this.container.classList.add('smp-saved');

    this.savedElement.querySelector('.smp-id').textContent = options.savedData.smilepack_id;
    this.savedElement.querySelector('.smp-url').href = options.savedData.download_url;
    this.savedElement.querySelector('.smp-view-url').href = options.savedData.view_url;
    this.savedElement.querySelector('.smp-view-url').textContent = options.savedData.view_url;
};


generator.registerDialogs = function(){
    dialogs.register('category', this.CategoryDialog);
    dialogs.register('smile', this.SmileDialog);
    dialogs.register('smilepack', this.SmilepackDialog);
    dialogs.register('import_userscript', this.ImportUserscriptDialog);
};
