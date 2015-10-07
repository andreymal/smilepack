'use strict';

var generator = {
    collection: null,
    smilepack: null,

    collectionData: null,
    smilepackData: null,

    usedSmiles: [], // неупорядоченный

    /* dragdrop */

    dropToSmilepackEvent: function(options){
        var categoryId = this.smilepack.getSelectedCategory(0);
        if(categoryId === null) return null;

        var origId = parseInt(options.element.dataset.id);
        if(this.usedSmiles.indexOf(origId) >= 0) return;

        var smile = this.collection.getSmileInfo(origId);
        smile.dragged = true;
        var id = this.smilepack.addSmile(categoryId, smile);
        if(id === origId){
            this.usedSmiles.push(origId);
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
        if(smile && smile.categoryId == this.collection.getSelectedCategory(2)){ // кастомных смайликов в коллекции нет
            return {name: 'animateToSmile', id: id};
        }else{
            if(smile) this.collection.setDragged(id, false);
            return {name: 'fadeOut'}
        }
    },

    /* actions */

    onaction: function(options){
        var action = options.action;
        var categoryId = options.categoryId;

        if(options.container !== this.smilepack || options.level != 0) return;

        if(action == 'delete' && categoryId != null){
            this.deleteSmilepackCategory(categoryId, true);
        }else if(action == 'add') {
            dialogs.open('category', {level: options.level});
        }
    },

    saveSmilepack: function(){
        var smileIds = this.smilepack.getAllSmileIds();
        if(!smileIds || smileIds.length < 1){
            alert('Добавьте хотя бы один смайлик!');
            return;
        }
        var categories = this.smilepack.getCategoriesWithHierarchy({short: true, withoutIds: true, withoutIconUrl: true});

        var smiles = [];
        for(var i=0; i<smileIds.length; i++){
            var smile = this.smilepack.getSmileInfo(smileIds[i], {withoutIds: true, withParent: true});
            if(this.collection.getSmileInfo(smileIds[i])){
                smile.id = smileIds[i];
                delete smile.url;
                delete smile.description;
                delete smile.w;
                delete smile.h;
            }
            smile.category_name = this.smilepack.getCategoryInfo(0, smile.categoryId).name;
            delete smile.categoryId;
            smiles.push(smile);
        }

        
        dialogs.open('smilepack');

        ajax.create_smilepack(
            document.getElementById('name').value || undefined,
            parseInt(document.getElementById('lifetime').value),
            categories,
            smiles,
            this.savedSmilepackEvent.bind(this),
            function(data){
                console.log(data);
                alert('Кажется, что-то пошло не так');
                dialogs.close('smilepack');
            }
        );
    },

    savedSmilepackEvent: function(data){
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
    },

    addSmilepackCategory: function(name, iconId, iconUrl){
        var id = this.smilepack.addCategory(0, 0, {
            name: name,
            icon: {id: iconId, url: iconUrl}
        });
        if(!id) return null;
        this.smilepack.set(0, id);
        return id;
    },

    deleteSmilepackCategory: function(categoryId, withConfirm){
        if(withConfirm && !confirm('Удалить категорию «' + this.smilepack.getCategoryInfo(0, categoryId).name + '»?')){
            return false;
        }
        var deleted_smiles = this.smilepack.removeCategory(0, categoryId);
        for(var i=0; deleted_smiles && i<deleted_smiles.length; i++){
            generator.collection.setDragged(deleted_smiles[i], false);
            var j = this.usedSmiles.indexOf(deleted_smiles[i]);
            if(j >= 0) this.usedSmiles.splice(j, 1);
        }
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
        }
        return true;
    },

    addCustomSmile: function(url, width, height){
        var id = generator.smilepack.addSmile(generator.smilepack.getSelectedCategory(0), {
            url: url,
            w: width,
            h: height
        });
        if(id != null) this.usedSmiles.push(id);
        return id;
    },

    /* data management */

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
        // this.check_hash();
    },

    initSmilepackData: function(){
        this.smilepack.loadData(this.smilepackData);

        for(var i=0; i<this.smilepackData.categories.length; i++){
            var cat = this.smilepackData.categories[i];
            for(var j=0; j<cat.smiles.length; j++){
                var sm = cat.smiles[j];
                this.smilepack.addSmile(cat.id, sm);
            }
        }

        this.usedSmiles = this.smilepack.getAllSmileIds();

        if(this.smilepackData.categories.length == 1){
            this.smilepack.set(0, this.smilepackData.categories[0].id);
        }
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
                //onchange: this.onchange.bind(this),
                ondropto: this.dropToCollectionEvent.bind(this),
                message: 'Выберите раздел для просмотра смайликов'
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
                message: this.smilepackData ? 'Выберите категорию смайлопака для просмотра' : 'Добавьте категорию здесь и заполните её перетаскиванием смайликов из коллекции'
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
            this.initSmilepackData();
        }
    },

    bindButtonEvents: function(){
        this.collection.getAdditionalContainer().querySelector('.action-move-all').addEventListener('click', this.moveAllSmiles.bind(this));
        this.smilepack.getAdditionalContainer().querySelector('.action-add-smile').addEventListener('click', function(){dialogs.open('smile')});
        document.querySelector('.action-save').addEventListener('click', this.saveSmilepack.bind(this));
    },

    init: function(){
        this.initCollections();
        this.initData();
        this.bindButtonEvents();

        dialogs.register('category', this.CategoryDialog);
        dialogs.register('smile', this.SmileDialog);
        dialogs.register('smilepack', this.SmilepackDialog);
    }
};


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

    var id = generator.addSmilepackCategory(
        f.name.value,
        f.icon.value,
        // FIXME: ._.
        f.querySelector('input[name="icon"][value="' + parseInt(f.icon.value) + '"]').dataset.valueUrl
    );
    if(!id) return this.error('Что-то пошло не так');
    dialogs.close(this.name);
};

generator.CategoryDialog.prototype.open = function(options){
    this.form.name.value = '';
    this.form.icon.value = this.form.icon[0].value;
    this.show();
    return true;
};


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


window.addEventListener('DOMContentLoaded', generator.init.bind(generator));
