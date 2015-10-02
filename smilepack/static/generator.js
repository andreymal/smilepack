'use strict';

var generator = {
    started: false,
    current_id: null,
    
    collection: null,
    smilepack: null,

    /* {globalId: localId} */
    collectionSmiles: {},
    smilepackSmiles: {},

    /* {localId: globalId} */
    collectionSmilesLocal: {},
    smilepackSmilesLocal: {},

    /* Соответствие локальных айдишников из смайлопака смайликам из коллекции (с айдишниками из БД) */
    smilepackOriginals: {},

    /* Массив использованых смайлов, для подсветки */
    usedSmiles: [],

    /* Отрицательные id для ещё не созданных категорий */
    lastCategoryId: 0,

    categoryDialog: new widgets.Dialog({
        container: document.getElementById('dialog-new-category'),
        form: document.querySelector('#dialog-new-category form'),
        onshow: function(dialog, options){
            options = options || {};
            window.form = dialog.form;
            
            dialog.form.level.value = options.level || 0;
            dialog.form.parent.value = options.parent || 0;
            dialog.form.name.value = options.name || '';
            dialog.form.icon.value = options.icon || dialog.form.icon[0].value;
        },
        onsubmit: function(dialog){
            if(!dialog.form.name.value){
                dialog.error('Введите имя категории');
                return;
            }
            dialog.hide();

            generator.lastCategoryId = generator.lastCategoryId - 1;
            var id = generator.lastCategoryId;

            var localId = generator.smilepack.addElement(
                parseInt(dialog.form.level.value),
                parseInt(dialog.form.parent.value),
                {
                    id: id,
                    name: dialog.form.name.value,
                    icon:{
                        id: dialog.form.icon.value,
                        // FIXME: ._.
                        url: dialog.form.querySelector('input[name="icon"][value="' + parseInt(dialog.form.icon.value) + '"]').dataset.valueUrl
                    }
                }
            );
            if(localId === null){
                dialog.error('Что-то пошло не так');
                return;
            }
            dialog.hide();
            generator.smilepack.set(parseInt(dialog.form.level.value), id);
        }
    }),

    smileDialog: new widgets.Dialog({
        container: document.getElementById('dialog-new-smile'),
        form: document.querySelector('#dialog-new-smile form'),
        onshow: function(dialog, options){
            options = options || {};
            window.form = dialog.form;
            
            dialog.form.level.value = options.level || 0;
            dialog.form.category.value = options.category || 0;
        },
        refresh: function(dialog){
            var preview = this.form.querySelector('.new-smile-preview');
            if(preview.src != dialog.form.url.value) {
                var img = document.createElement('img');
                img.onload = function(){
                    preview.src = img.src;
                    preview.width = img.width;
                    preview.height = img.height;
                    dialog.form.w.value = img.width;
                    dialog.form.h.value = img.height;
                };
                img.onerror = function(){
                    preview.src = 'data:image/gif;base64,R0lGODdhAQABAIABAP///+dubiwAAAAAAQABAAACAkQBADs=';
                    preview.width = 0;
                    preview.height = 0;
                    dialog.form.w.value = '';
                    dialog.form.h.value = '';
                };
                img.src = dialog.form.url.value;
                return;
            }
            preview.width = parseInt(dialog.form.w.value);
            preview.height = parseInt(dialog.form.h.value);
        },
        onsubmit: function(dialog){
            if(!dialog.form.url.value){
                return;
            }
            dialog.hide();
            generator.addSmilepackSmile(
                parseInt(dialog.form.category.value),
                {
                    url: dialog.form.url.value,
                    w: dialog.form.w.value,
                    h: dialog.form.h.value
                },
                null
            );
        }
    }),

    saveDialog: new widgets.Dialog({
        container: document.getElementById('dialog-save'),
        form: null,
        onshow: function(dialog, options){
            if(!(options && options.savedData) == dialog.container.classList.contains('smp-saved')) dialog.container.classList.toggle('smp-saved');
            var processingElement = dialog.container.querySelector('.processing');
            var savedElement = dialog.container.querySelector('.saved');
            if(!options || !options.savedData){
                processingElement.style.display = '';
                savedElement.style.display = 'none';
                return;
            }

            processingElement.style.display = 'none';
            savedElement.style.display = '';

            savedElement.querySelector('.smp-id').textContent = options.savedData.smilepack_id;
            savedElement.querySelector('.smp-url').href = options.savedData.download_url;
            savedElement.querySelector('.smp-view-url').href = options.savedData.view_url;
            savedElement.querySelector('.smp-view-url').textContent = options.savedData.view_url;

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

        }
    }),

    onaction: function(container, action, level, elem_id){
        if(container !== generator.smilepack || level != 0) return;

        if(action == 'delete' && elem_id && confirm('Удалить категорию «' + generator.smilepack.getElementInfo(level, elem_id).name + '»?')){
            var deleted_smiles = container.removeElement(level, elem_id);
            for(var i=0; deleted_smiles && i<deleted_smiles.length; i++){
                var origId = generator.smilepackOriginals[deleted_smiles[i]];
                var localId = generator.collectionSmiles[origId];
                if(localId != null) generator.collection.setDragged(localId, false);
                if(origId != null) {
                    var u = generator.usedSmiles.indexOf(origId);
                    if(u >= 0) generator.usedSmiles.splice(u, 1);
                }
                delete generator.smilepackSmilesLocal[deleted_smiles[i]];
            }

        }else if(action == 'add') {
            generator.categoryDialog.show({level: level});
        }
    },

    set_collection_smiles: function(collection, category_id){
        ajax.get_smiles(category_id, function(data){
            /* TODO: при загрузке существующего смайлопака подсветить dragged, не забыв про smilepackOriginals */
            for(var i=0; i<data.smiles.length; i++){
                var localId = generator.collection.addSmile(category_id, data.smiles[i]);
                if(localId === null) continue;
                generator.collectionSmiles[data.smiles[i].id] = localId;
                generator.collectionSmilesLocal[localId] = data.smiles[i].id;

                if(generator.usedSmiles.indexOf(data.smiles[i].id) >= 0){
                    generator.collection.setDragged(localId, true);
                }
            }
            collection.setSmiles(category_id, true);
        });
    },

    move_all: function(){
        var sourceCategory = generator.collection.getLevelSelectedElement(2);
        var targetCategory = generator.smilepack.getLevelSelectedElement(0);
        if(sourceCategory === null || targetCategory === null) {
            alert("Сперва выберите или создайте категорию");
            return;
        }

        var smiles = generator.collection.getSmiles(sourceCategory, true);
        for(var i=0; i<smiles.length; i++){
            generator.addSmilepackSmile(targetCategory, {element: generator.collection.getSmileElement(smiles[i])}, smiles[i]);
            generator.collection.setDragged(smiles[i], true);
        }
    },

    add_smile: function(){
        var targetCategory = generator.smilepack.getLevelSelectedElement(0);
        generator.smileDialog.show({level: 0, category: targetCategory});
    },

    ondropto: function(options){
        if(options.sourceContainerElement === generator.collection.getDOM() && options.targetContainer === generator.smilepack){
            var info = generator.collection.typeOfElement(options.element);
            if(!info || info.type != 'smile' || !generator.collectionSmilesLocal[info.localId]) return null;
            var localId = generator.addSmilepackSmile(generator.smilepack.getLevelSelectedElement(0), {element: options.element}, info.localId);
            if(!localId) return null;
            generator.usedSmiles.push(generator.collectionSmilesLocal[info.localId]);
            return {name: 'animateToSmile', id: localId}

        }else if(options.sourceContainerElement === generator.smilepack.getDOM() && options.targetContainer === generator.collection){
            var info = generator.smilepack.typeOfElement(options.element);
            if(!info || info.type != 'smile' || !generator.smilepackSmilesLocal[info.localId]) return null;

            /* TODO: delete generator.smilepackSmiles[]; */
            delete generator.smilepackSmilesLocal[info.localId];
            generator.smilepack.removeSmile(info.localId);

            if(generator.smilepackOriginals[info.localId]){
                var u = generator.usedSmiles.indexOf(generator.smilepackOriginals[info.localId]);
                if(u >= 0) generator.usedSmiles.splice(u, 1);
            }

            if(generator.smilepackOriginals[info.localId] && generator.collectionSmiles[generator.smilepackOriginals[info.localId]]){
                /* FIXME: если категория со смайлом не текущая, то улетает в угол */
                var oid = generator.smilepackOriginals[info.localId];
                delete generator.smilepackOriginals[info.localId];
                return {name: 'animateToSmile', id: generator.collectionSmiles[oid]}
            }else{
                return {name: 'stop'};
            }
        }
    },

    onchange: function(elem_id){
        generator.current_id = elem_id;
        window.location.hash = '#' + elem_id.toString();
    },

    addSmilepackSmile: function(targetCategory, data, collectionLocalId){
        var localId;
        if(data.element) localId = generator.smilepack.addSmileFromElement(targetCategory, data.element);
        else localId = generator.smilepack.addSmile(targetCategory, data);
        if(localId === null) return null;
        if(collectionLocalId != null) generator.smilepackOriginals[localId] = generator.collectionSmilesLocal[collectionLocalId];
        /* generator.smilepackSmilesLocal[localId] = тут id из БД или отрицательное число; */
        /* TODO: generator.smilepackSmiles[тут id из БД или отрицательное число] = localId; */
        generator.smilepackSmilesLocal[localId] = data.id || -777;
        return localId;
    },

    check_hash: function(){
        if(!window.location.hash) return;
        var cat_id = window.location.hash.substring(1);
        if(isNaN(cat_id)) return;

        cat_id = parseInt(cat_id);
        if(cat_id == generator.current_id) return;

        generator.collection.set(2, cat_id);
    },

    save: function(){
        var smile_ids = generator.smilepack.getAllSmiles();
        if(!smile_ids || smile_ids.length < 1){
            alert('Добавьте хотя бы один смайлик!');
            return;
        }
        var categories = generator.smilepack.getAllElementsInfo();
        
        var smiles = [];
        for(var i=0; i<smile_ids.length; i++){
            var smile = generator.smilepack.getSmileInfo(smile_ids[i], {withoutIds: true, withParent: true});
            if(generator.smilepackOriginals[smile_ids[i]]){
                smile.id = generator.smilepackOriginals[smile_ids[i]];
                delete smile.url;
            }
            smile.category_name = generator.smilepack.getElementInfo(0, smile.parentId).name;
            delete smile.parentId;
            smiles.push(smile);
        }

        generator.saveDialog.show();
        ajax.create_smilepack(
            document.getElementById('name').value || undefined,
            parseInt(document.getElementById('lifetime').value),
            categories,
            smiles,
            generator.onsave,
            function(data){
                console.log(data);
                alert('Кажется, что-то пошло не так');
                generator.saveDialog.hide();
        }
        )
    },

    onsave: function(data){
        generator.saveDialog.show({savedData: data});
    },

    init_data: function(){
        generator.collection.loadData(generator.collectionData);
        if(generator.collectionData.sections.length == 1){
            generator.collection.set(0, generator.collectionData.sections[0].id);
        }
        generator.check_hash();
    },

    init_smilepack_data: function(){
        generator.smilepack.loadData(generator.smilepackData);

        for(var i=0; i<generator.smilepackData.categories.length; i++){
            var cat = generator.smilepackData.categories[i];
            for(var j=0; j<cat.smiles.length; j++){
                var sm = cat.smiles[j];
                var localId = generator.addSmilepackSmile(cat.id, sm, null);

                if(sm.internal_id){
                    generator.smilepackOriginals[localId] = sm.internal_id;
                    if(generator.collectionSmiles[sm.internal_id]){
                        generator.collection.setDragged(generator.collectionSmiles[sm.internal_id], true);
                    }
                    generator.usedSmiles.push(sm.internal_id);
                }
            }
        }

        if(generator.smilepackData.categories.length == 1){
            generator.smilepack.set(0, generator.smilepackData.categories[0].id);
        }
    },

    init: function(){
        if(this.started) return;
        this.started = true;

        widgets.Dialog.backgroundElement = document.getElementById('dialog-background')

        this.collection = new widgets.Collection(
            [
                ['sections', 'section_id', 'Разделы:'],
                ['subsections', 'subsection_id', 'Подразделы:'],
                ['categories', 'category_id', 'Категории:']
            ],
            {
                title: "Коллекция смайликов",
                editable: false,
                container: document.getElementById('collection'),
                get_smiles_func: this.set_collection_smiles,
                onchange: this.onchange,
                ondropto: this.ondropto,
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
                // get_smiles_func: this.set_collection_smiles,
                // onchange: this.onchange,
                ondropto: this.ondropto,
                onaction: this.onaction,
                message: this.smilepackData ? 'Выберите категорию смайлопака для просмотра' : 'Добавьте категорию здесь и заполните её перетаскиванием смайликов из коллекции'
            }
        );

        this.collection.getAdditionalContainer().querySelector('.action-move-all').addEventListener('click', this.move_all);
        this.smilepack.getAdditionalContainer().querySelector('.action-add-smile').addEventListener('click', this.add_smile);
        document.querySelector('.action-save').addEventListener('click', this.save);

        window.addEventListener('hashchange', this.check_hash);

        if(generator.collectionData){
            generator.init_data();
        }else{
            ajax.get_categories(function(data){
                generator.collectionData = data;
                generator.init_data();
            });
        }

        if(generator.smilepackData){
            generator.init_smilepack_data();
        }

        this.smileDialog.form.querySelector('input[name="url"]').addEventListener('change', this.smileDialog.refresh.bind(this.smileDialog));
        this.smileDialog.form.querySelector('input[name="w"]').addEventListener('change', this.smileDialog.refresh.bind(this.smileDialog));
        this.smileDialog.form.querySelector('input[name="h"]').addEventListener('change', this.smileDialog.refresh.bind(this.smileDialog));
    }
};

window.addEventListener('DOMContentLoaded', function(){generator.init()});
window.addEventListener('load', function(){generator.init()}); /* old browsers */
