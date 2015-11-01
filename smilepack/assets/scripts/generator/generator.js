'use strict';

var widgets = require('./widgets.js'),
    dialogs = require('./dialogs.js'),
    ajax = require('./ajax.js');

var generator = {
    storageVersion: 1,

    collection: null,
    smilepack: null,
    modified: false,
    current_id: null,

    collectionData: null,
    smilepackData: null,

    usedSmiles: [], // неупорядоченный

    saveStatus: null,

    /* dragdrop */

    dropToSmilepackEvent: function(options){
        var categoryId = this.smilepack.getSelectedCategory(0);
        if(categoryId === null) return null;

        var origId = parseInt(options.element.dataset.id);
        if(this.usedSmiles.indexOf(origId) >= 0) return;

        this.collection.setSelected(origId, false);
        var smile = this.collection.getSmileInfo(origId);
        smile.dragged = true;
        var id = this.smilepack.addSmile(categoryId, smile);
        if(options.dropPosition != null) this.smilepack.moveSmile(id, options.dropPosition);
        if(id === origId){
            this.usedSmiles.push(origId);
            this.modified = true;
            return {name: 'animateToSmile', id: id};
        }
    },

    dropToCollectionEvent: function(options){
        var id = parseInt(options.element.dataset.id);
        var i = this.usedSmiles.indexOf(id);
        if(i < 0) return;
        this.smilepack.removeSmile(id);
        this.usedSmiles.splice(i, 1);

        var smile = this.collection.getSmileInfo(id, {withParent: true});
        this.modified = true;
        if(smile && smile.categoryId == this.collection.getSelectedCategory(2)){ // кастомных смайликов в коллекции нет
            return {name: 'animateToSmile', id: id};
        }else{
            if(smile) this.collection.setDragged(id, false);
            return {name: 'fadeOut'}
        }
    },

    /* actions */

    onchange: function(container, elem_id){
        generator.current_id = elem_id;
        window.location.hash = '#' + elem_id.toString();
    },

    onaction: function(options){
        var action = options.action;
        var categoryId = options.categoryId;

        if(options.container !== this.smilepack || options.level != 0) return;

        if(action == 'delete' && categoryId != null){
            this.deleteSmilepackCategory(categoryId, true);
        }else if(action == 'add') {
            dialogs.open('category', {level: options.level});
        }else if(action == 'edit'){
            dialogs.open('category', {level: options.level, edit: true, category: this.smilepack.getCategoryInfo(0, options.categoryId)});
        }
    },

    onerror: function(data){
        console.log(data);
        alert(data.error || 'Кажется, что-то пошло не так');
    },

    check_hash: function(){
        if(!window.location.hash) return;
        var cat_id = window.location.hash.substring(1);
        if(isNaN(cat_id)) return;

        cat_id = parseInt(cat_id);
        if(cat_id == generator.current_id) return;

        generator.collection.set(2, cat_id);
    },

    toggleDark: function(){
        document.body.classList.toggle('dark');
        window.localStorage.generatorDark = document.body.classList.contains('dark') ? '1' : '0';
    },

    importUserscript: function(form, interactive, onend){
        ajax.import_userscript(form, function(data){this.importedUserscriptEvent(data, interactive)}.bind(this), this.onerror.bind(this), onend);
    },

    importedUserscriptEvent: function(data, interactive){
        if(!data.categories || data.categories.length < 1){
            console.log(data);
            if(interactive) alert(data.notice || 'Кажется, что-то пошло не так');
            return;
        }
        if(data.notice){
            if(interactive) alert(data.notice);
            console.log(data.notice);
        }

        this.replaceSmilepackData({categories: data.categories}, data.ids);
    },

    saveSmilepack: function(){
        var smileIds = this.smilepack.getAllSmileIds();
        if(!smileIds || smileIds.length < 1){
            alert('Добавьте хотя бы один смайлик!');
            return;
        }
        var categories = this.smilepack.getCategoriesWithHierarchy({short: true, withoutIds: true, withoutIconUrl: true});

        var smiles = [];
        var smilesToCreate = [];
        for(var i=0; i<smileIds.length; i++){
            var smile = this.smilepack.getSmileInfo(smileIds[i], {withoutIds: true, withParent: true});
            if(smileIds[i] >= 0){
                smile.id = smileIds[i];
                delete smile.url;
                delete smile.description;
            }else{
                smilesToCreate.push(smile);
            }
            smile.category_name = this.smilepack.getCategoryInfo(0, smile.categoryId).name;
            delete smile.categoryId;
            smiles.push(smile);
        }

        dialogs.open('smilepack');

        var lifetime_elem = document.getElementById('lifetime');

        this.saveStatus = {
            name: document.getElementById('name').value || undefined,
            lifetime: lifetime_elem ? parseInt(lifetime_elem.value) : 0,
            categories: categories,
            smiles: smiles,
            smilesToCreate: smilesToCreate,
            createPos: 0
        };
        this._saveSmilepackProcessing();
    },

    _saveSmilepackProcessing: function(data){
        if(data !== undefined) {
            var pos = this.saveStatus.createPos;
            if(data.error || !data.smile) return this._saveSmilepackError(data);
            this.saveStatus.smilesToCreate[pos].id = data.smile.id;
            delete this.saveStatus.smilesToCreate[pos].url;
            this.saveStatus.createPos++;
        }

        dialogs.get('smilepack').onprogress(this.saveStatus.createPos, this.saveStatus.smilesToCreate.length);
        if(this.saveStatus.createPos < this.saveStatus.smilesToCreate.length){
            var pos = this.saveStatus.createPos;
            setTimeout(function(){
                ajax.create_smile(
                    {
                        url: this.saveStatus.smilesToCreate[pos].url,
                        w: this.saveStatus.smilesToCreate[pos].w,
                        h: this.saveStatus.smilesToCreate[pos].h
                    },
                    this._saveSmilepackProcessing.bind(this),
                    this._saveSmilepackProcessingSmileError.bind(this)
                );
            }.bind(this), 350);
            return;
        }

        ajax.create_smilepack(
            this.saveStatus.name,
            this.saveStatus.lifetime,
            this.saveStatus.categories,
            this.saveStatus.smiles,
            this.savedSmilepackEvent.bind(this),
            this._saveSmilepackError.bind(this)
        );
    },

    _saveSmilepackProcessingSmileError: function(data){
        if(!data.error) return this._saveSmilepackError(data);
        var smile = this.saveStatus.smilesToCreate[this.saveStatus.createPos];
        var msg = 'Не удалось создать смайлик ' + smile.url + ':\n';
        msg += data.error;
        msg += '\nПропустить его и продолжить?';
        if(confirm(msg)){
            this.saveStatus.smiles.splice(this.saveStatus.smiles.indexOf(smile), 1);
            this.saveStatus.smilesToCreate.splice(this.saveStatus.createPos, 1);
            return this._saveSmilepackProcessing();
        }
        this.saveStatus = null;
        dialogs.close('smilepack');
    },

    _saveSmilepackError: function(data){
        this.onerror(data);
        this.saveStatus = null;
        dialogs.close('smilepack');
    },

    savedSmilepackEvent: function(data){
        if(data.path && window.history){
            document.title = document.getElementById('name').value;
            window.history.replaceState(null, null, data.path + location.hash);
        }

        var options = {savedData: data};
        dialogs.get('smilepack').onsave(options);

        var lastUrl = document.getElementById('smp-last-url');
        lastUrl.href = options.savedData.download_url;
        lastUrl.style.display = '';

        var deletionDate = document.getElementById('smp-delete-container');
        if(options.savedData.fancy_deletion_date){
            deletionDate.style.display = '';
            document.getElementById('smp-delete-date').textContent = options.savedData.fancy_deletion_date;
        }else{
            deletionDate.style.display = 'none';
        }
        this.modified = false;
    },

    addSmilepackCategory: function(name, iconId, iconUrl){
        var id = this.smilepack.addCategory(0, 0, {
            name: name,
            icon: {id: iconId, url: iconUrl}
        });
        if(id == null) return null;
        this.smilepack.set(0, id);
        this.modified = true;
        return id;
    },

    editSmilepackCategory: function(categoryId, name, iconId, iconUrl){
        var id = this.smilepack.editCategory(0, categoryId, {
            name: name,
            icon: {id: iconId, url: iconUrl}
        });
        if(id == null) return null;
        this.modified = true;
        return id;
    },

    deleteSmilepackCategory: function(categoryId, interactive){
        if(interactive && !confirm('Удалить категорию «' + this.smilepack.getCategoryInfo(0, categoryId).name + '»?')){
            return false;
        }
        var deleted_smiles = this.smilepack.removeCategory(0, categoryId);
        for(var i=0; deleted_smiles && i<deleted_smiles.length; i++){
            generator.collection.setDragged(deleted_smiles[i], false);
            var j = this.usedSmiles.indexOf(deleted_smiles[i]);
            if(j >= 0) this.usedSmiles.splice(j, 1);
        }
        this.modified = true;
        return true;
    },

    moveAllSmiles: function(){
        var categoryId = this.collection.getSelectedCategory(2);
        if(categoryId == null) return false;
        var smpCategoryId = this.smilepack.getSelectedCategory(0);
        if(smpCategoryId == null) return false;

        var smileIds = this.collection.getSmileIds(categoryId);
        if(smileIds == null) return false;
        for(var i=0; i<smileIds.length; i++){
            if(this.usedSmiles.indexOf(smileIds[i]) >= 0) continue;
            var newId = this.smilepack.addSmile(smpCategoryId, this.collection.getSmileInfo(smileIds[i]));
            if(newId != smileIds[i]) continue;
            this.usedSmiles.push(smileIds[i]);
            this.collection.setDragged(smileIds[i], true);
            this.modified = true;
        }
        return true;
    },

    addCustomSmile: function(smile_data, interactive, onend){
        var categoryId = generator.smilepack.getSelectedCategory(0);
        var onload = function(data){
            this._addCustomSmileEvent(data, smile_data, categoryId, interactive, onend);
        }.bind(this);
        var onerror = function(data, x){
            this.onerror(data, x);
            if(onend) onend(false, null);
        }.bind(this);

        if(smile_data.url){
            ajax.create_smile({
                url: smile_data.url,
                w: smile_data.w,
                h: smile_data.h
            }, onload, onerror);
            return true;
        }else if(smile_data.file){
            ajax.upload_smile({
                file: smile_data.file,
                w: smile_data.w,
                h: smile_data.h
            }, onload, onerror);
        }else {
            return false;
        }
    },

    _addCustomSmileEvent: function(data, smile_data, categoryId, interactive, onend){
        if(!data.smile) return this.onerror(data);
        if(this.usedSmiles.indexOf(data.smile.id) >= 0){
            if(interactive) alert('Этот смайлик уже используется!');
            onend(false, data.smile.id);
            return;
        }

        var id = generator.smilepack.addSmile(categoryId, {
            id: data.smile.id,
            url: data.smile.url,
            description: data.smile.description,
            w: smile_data.w,
            h: smile_data.h
        });

        if(id != null){
            this.usedSmiles.push(id);
            this.modified = true;
            if(!data.created && data.smile.category != null) this.collection.setDragged(data.smile.id, true);
        }
        onend(true, id);
    },

    storageSave: function(interactive){
        var data = {storageVersion: this.storageVersion, ids: this.smilepack.getLastInternalIds()};

        var smileIds = this.smilepack.getAllSmileIds();
        if(smileIds.length < 1){
            if(interactive && !confirm("Нет ни одного смайлика. Сохранить пустоту?")) return;
        }

        var categories = this.smilepack.getCategoriesWithHierarchy({short: true});

        var catsById = {};
        for(var i=0; i<categories.length; i++){
            catsById[categories[i].id] = categories[i];
            categories[i].smiles = [];
        }

        for(var i=0; i<smileIds.length; i++){
            var smile = this.smilepack.getSmileInfo(smileIds[i], {withParent: true});
            catsById[smile.categoryId].smiles.push(smile);
            delete smile.categoryId;
        }

        data.categories = categories;
        window.localStorage.smiles = JSON.stringify(data);
        this.modified = false;
        if(interactive) alert('Сохранено!');
    },

    storageLoad: function(interactive){
        var data = window.localStorage.smiles;
        if(!data || data.length < 3){
            if(interactive) alert('Нечего загружать!');
            return false;
        }

        data = JSON.parse(data);
        if(data.storageVersion != this.storageVersion){
            if(interactive) alert('С момента сохранения база данных поменялась, не могу загрузить :(');
            return false;
        }

        if(interactive && this.modified && !confirm('При загрузке потеряются несохранённые изменения, продолжить?')) return false;

        this.replaceSmilepackData({categories: data.categories}, data.ids);
        this.modified = false;
        return true;
    },

    /* data management */

    replaceSmilepackData: function(data, lastIds){
        var oldCategories = this.smilepack.getCategoriesWithHierarchy({short: true, withoutIconUrl: true});
        for(var i=0; i<oldCategories.length; i++) this.smilepack.removeCategory(0, oldCategories[i].id);
        for(var i=0; i<this.usedSmiles.length; i++) this.collection.setDragged(this.usedSmiles[i], false);
        this.usedSmiles = [];
        this.smilepack.setLastInternalIds([0], 0);

        this.smilepack.loadData(data);

        for(var i=0; i<data.categories.length; i++){
            var cat = data.categories[i];
            for(var j=0; j<cat.smiles.length; j++){
                var sm = cat.smiles[j];
                this.smilepack.addSmile(cat.id, sm);
            }
        }

        this.usedSmiles = this.smilepack.getAllSmileIds();
        for(var i=0; i<this.usedSmiles.length; i++){
            this.collection.setDragged(this.usedSmiles[i], true);
        }

        if(data.categories.length == 1){
            this.smilepack.set(0, data.categories[0].id);
        }

        if(lastIds) this.smilepack.setLastInternalIds(lastIds[0], lastIds[1]);
    },

    set_collection_smiles: function(collection, category_id){
        ajax.get_smiles(category_id, function(data){
            for(var i=0; i<data.smiles.length; i++){
                var localId = this.collection.addSmile(category_id, data.smiles[i]);
                if(localId === null) continue;

                if(this.usedSmiles.indexOf(data.smiles[i].id) >= 0){
                    this.collection.setDragged(localId, true);
                }
            }
            collection.setSmiles(category_id, true);
        }.bind(this));
    },

    initCollectionData: function(){
        this.collection.loadData(this.collectionData);
        if(this.collectionData.sections.length == 1){
            this.collection.set(0, this.collectionData.sections[0].id);
        }
        this.check_hash();
    },

    initCollections: function(){
        this.collection =  new widgets.Collection(
            [
                ['sections', 'section_id', 'Разделы:'],
                ['subsections', 'subsection_id', 'Подразделы:'],
                ['categories', 'category_id', 'Категории:']
            ],
            {
                title: "Коллекция смайликов",
                editable: false,
                container: document.getElementById('collection'),
                get_smiles_func: this.set_collection_smiles.bind(this),
                onchange: this.onchange.bind(this),
                ondropto: this.dropToCollectionEvent.bind(this),
                message: 'Выберите раздел для просмотра смайликов',
                additionalOnTop: true,
                selectable: false,
                selectableDragged: false,
                useCategoryLinks: true
            }
        );

        this.smilepack = new widgets.Collection(
            [
                ['categories', 'category_id', 'Категории:']
            ],
            {
                title: "Ваш смайлопак",
                editable: true,
                container: document.getElementById('smilepack'),
                ondropto: this.dropToSmilepackEvent.bind(this),
                onaction: this.onaction.bind(this),
                message: this.smilepackData ? 'Выберите категорию смайлопака для просмотра' : 'Добавьте категорию здесь и заполните её перетаскиванием смайликов из коллекции',
                selectable: false
            }
        );
    },

    initData: function(){
        if(this.collectionData){
            this.initCollectionData();
        }else{
            ajax.get_categories(function(data){
                this.collectionData = data;
                this.initCollectionData();
            }.bind(this));
        }
        if(this.smilepackData){
            this.replaceSmilepackData(this.smilepackData);
        }
    },

    bindButtonEvents: function(){
        this.collection.getAdditionalContainer().querySelector('.action-move-all').addEventListener('click', this.moveAllSmiles.bind(this));
        this.smilepack.getAdditionalContainer().querySelector('.action-add-smile').addEventListener('click', function(){dialogs.open('smile')});
        document.querySelector('.action-save').addEventListener('click', this.saveSmilepack.bind(this));

        document.getElementById('action-storage-save').addEventListener('click', function(){this.storageSave(true)}.bind(this));
        document.getElementById('action-storage-load').addEventListener('click', function(){this.storageLoad(true)}.bind(this));

        document.getElementById('action-import-userscript').addEventListener('click', function(){dialogs.open('import_userscript')});
        document.getElementById('action-toggle-dark').addEventListener('click', this.toggleDark.bind(this));
    },

    init: function(){
        this.initCollections();
        this.initData();
        this.bindButtonEvents();
        this.registerDialogs();

        if(window.localStorage.generatorDark == '1') this.toggleDark();

        window.addEventListener('hashchange', this.check_hash);
        window.addEventListener('beforeunload', function(e){
            if(!this.modified) return;
            var s = 'Есть несохранённые изменения в смайлопаке.';
            if(e) e.returnValue = s;
            return s;
        }.bind(this));
    }
};
/**
 * Dialogs moved here, temporary
 */
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
        if(this.form.icon[0]) this.form.icon.value = this.form.icon[0].value;
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
    this.btn = document.querySelector('#dialog-new-smile form input[type="submit"]');

    var onchange = this.refresh.bind(this);
    var onfile = this.refreshFile.bind(this);

    this.form.url.addEventListener('change', onfile);
    this.form.w.addEventListener('change', onchange);
    this.form.h.addEventListener('change', onchange);

    this.current_uploader = 'link';
    this.uploaders = {
        file: document.querySelector('#dialog-new-smile form .file-uploader'),
        link: document.querySelector('#dialog-new-smile form .link-uploader')
    };
    if(this.uploaders.file){
        this.uploaders.file.addEventListener('change', onfile);
    }
    if(this.form.uploader) {
        for(var i=0; i<this.form.uploader.length; i++){
            this.form.uploader[i].addEventListener('change', this._setUploaderEvent.bind(this));
        }
    }
};
generator.SmileDialog.prototype = Object.create(dialogs.Dialog.prototype);
generator.SmileDialog.prototype.constructor = generator.SmileDialog;


generator.SmileDialog.prototype._setUploaderEvent = function(event){
    this.setUploader(event.target.value); // FIXME: нужно подружить this и bind
};


generator.SmileDialog.prototype.setUploader = function(uploader){
    if(uploader == this.current_uploader || !this.uploaders[uploader]) return;
    this.uploaders[this.current_uploader].style.display = 'none';
    this.uploaders[uploader].style.display = '';
    this.current_uploader = uploader;
    this.refreshFile();
};


generator.SmileDialog.prototype.clearPreview = function(){
    var f = this.form;
    var preview = f.querySelector('.new-smile-preview');
    preview.src = 'data:image/gif;base64,R0lGODdhAQABAIABAP///+dubiwAAAAAAQABAAACAkQBADs=';
    preview.width = 0;
    preview.height = 0;
    f.w.value = '';
    f.h.value = '';
};


generator.SmileDialog.prototype.setPreviewUrl = function(url){
    var f = this.form;
    var preview = f.querySelector('.new-smile-preview');

    var img = document.createElement('img');
    img.onload = function(){
        preview.src = img.src;
        preview.width = img.width;
        preview.height = img.height;
        f.w.value = img.width;
        f.h.value = img.height;
    };
    img.onerror = this.clearPreview.bind(this);
    img.src = url;
};


generator.SmileDialog.prototype.refreshFile = function(){
    var f = this.form;
    var preview = f.querySelector('.new-smile-preview');

    if(this.current_uploader == 'link'){
        if(preview.src == f.url.value) return;
        if(f.url.value.length < 9) {
            this.clearPreview();
            return;
        }
        this.setPreviewUrl(f.url.value);

    }else if(this.current_uploader == 'file'){
        if(!f.file.files || !f.file.files[0]){
            this.clearPreview();
            return;
        }

        var reader = new FileReader();
        reader.onload = function(){
            this.setPreviewUrl(reader.result);
        }.bind(this);
        reader.onerror = function(){
            this.clearPreview();
        }.bind(this);
        reader.readAsDataURL(f.file.files[0]);
    };
};


generator.SmileDialog.prototype.refresh = function(){
    var f = this.form;

    var preview = f.querySelector('.new-smile-preview');
    var aspect = preview.width / preview.height;
    var save_aspect = f.save_aspect.checked;

    var w = parseInt(f.w.value);
    if(!isNaN(w) && w > 0 && preview.width != w){
        preview.width = w;
        if(save_aspect){
            preview.height = Math.round(w / aspect);
            f.h.value = preview.height;
        }
    }

    var h = parseInt(f.h.value);
    if(!isNaN(h) && h > 0 && preview.height != h){
        preview.height = h;
        if(save_aspect){
            preview.width = Math.round(h * aspect);
            f.w.value = preview.width;
        }
    }
};


generator.SmileDialog.prototype.onsubmit = function(){
    var f = this.form;
    if(this.current_uploader == 'link'){
        if(!f.url.value || f.url.value.length < 9) return this.error('Надо бы ссылку на смайлик');
        if(f.url.value.length > 512) return this.error('Длинновата ссылка, перезалейте на что-нибудь поадекватнее');
    }else if(this.current_uploader == 'file'){
        if(!f.file.files || !f.file.files[0]) return this.error('Надо бы выбрать файл');
    }
    var w = parseInt(f.w.value);
    var h = parseInt(f.h.value);
    if(isNaN(w) || w < 1 || isNaN(h) || h < 1) return this.error('Размеры смайлика кривоваты');

    var onend = function(added, smile_id){
        this.btn.disabled = false;
        if(added) dialogs.close(this.name);
    }.bind(this);

    if(this.current_uploader == 'link'){
        generator.addCustomSmile({url: f.url.value, w: w, h: h}, true, onend);
    }else if(this.current_uploader == 'file'){
        generator.addCustomSmile({file: f.file.files[0], w: w, h: h}, true, onend);
    }
    this.btn.disabled = true;
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

    this.beginElement = this.processingElement.querySelector('.processing-begin');
    this.endElement = this.processingElement.querySelector('.processing-end');
    this.smileCurrentElement = this.beginElement.querySelector('.smile-current');
    this.smilesCountElement = this.beginElement.querySelector('.smiles-count');
};
generator.SmilepackDialog.prototype = Object.create(dialogs.Dialog.prototype);
generator.SmilepackDialog.prototype.constructor = generator.SmilepackDialog;


generator.SmilepackDialog.prototype.open = function(){
    this.processingElement.style.display = '';
    this.savedElement.style.display = 'none';
    if(this.container.classList.contains('smp-saved')) this.container.classList.remove('smp-saved');
    this.onprogress(0, 0);
    this.show();
    return true;
};


generator.SmilepackDialog.prototype.onprogress = function(smile_current, smiles_count){
    if(smile_current >= smiles_count){
        this.beginElement.style.display = 'none';
        this.endElement.style.display = '';
        return;
    }
    this.beginElement.style.display = '';
    this.endElement.style.display = 'none';
    this.smileCurrentElement.textContent = smile_current + 1;
    this.smilesCountElement.textContent = smiles_count;
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

module.exports = generator;
