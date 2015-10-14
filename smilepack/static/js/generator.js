'use strict';

var generator = {
    storageVersion: 1,

    collection: null,
    smilepack: null,
    modified: false,
    current_id: null,

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
        alert('Кажется, что-то пошло не так');
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
        if(data.notice) console.log(data.notice);

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
        for(var i=0; i<smileIds.length; i++){
            var smile = this.smilepack.getSmileInfo(smileIds[i], {withoutIds: true, withParent: true});
            if(smileIds[i] >= 0){
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

    addCustomSmile: function(url, width, height){
        var id = generator.smilepack.addSmile(generator.smilepack.getSelectedCategory(0), {
            url: url,
            w: width,
            h: height
        });
        if(id != null){
            this.usedSmiles.push(id);
            this.modified = true;
        }
        return id;
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


window.addEventListener('DOMContentLoaded', generator.init.bind(generator));
