'use strict';

var dragdrop = require('./dragdrop.js');
var widgets = {};


/*
 * Виджет с коллекцией смайликов с неограниченным уровнем вложенности.
 * Формат hierarchy: [[атрибут со списком элементов, атрибут с id элемента, человекочитаемое название уровня], ...]
 */
widgets.Collection = function(hierarchy, options){
    this.hierarchy = hierarchy;
    this._depth = hierarchy.length;
    this.options = options;

    /* Многоуровневые категории с отдельной нумерацией по уровням */
    this._categories = [];
    this._rootChildren = [];
    this._lastIds = [];

    /* Объекты со смайликами; нумерация общая для всех категорий */
    this._smiles = {};
    this._selectedSmileIds = [];
    this._lastSelectedSmileId = null;
    this._smileMovePosId = null; /* для dragdrop */
    this._lastSmileId = 0;

    /* Выбранные категории на каджом из уровней */
    this._selectedIds = [];

    this._dom = {};

    this._dom.container = options.container || document.createElement('div');
    if(options.className && !this._dom.container.classList.contains(options.className)){
        this._dom.container.classList.add(options.className);
    }
    if(this._dom.container.getElementsByClassName('additional')[0]){
        this._dom.additionalContainer = this._dom.container.getElementsByClassName('additional')[0];
        this._dom.container.removeChild(this._dom.additionalContainer);
        this._dom.additionalContainer.style.display = 'none';
    }
    this._dom.container.innerHTML = '';
    this._dom.container.addEventListener('click', this._onclick.bind(this));

    /* Здесь будут храниться кнопки для категорий */
    this._dom.tabs_container = document.createElement('div');
    this._dom.tabs_container.className = 'tabs-wrapper';
    this._dom.container.appendChild(this._dom.tabs_container);

    /* Контейнеры для кнопок по уровням, они и хранятся в контейнере выше */
    this._dom.tabs_containers = [];

    /* Заголовок коллекции */
    if(options.title){
        this._dom.title = document.createElement('div');
        this._dom.title.className = 'collection-title';
        this._dom.title.textContent = options.title;
        this._dom.tabs_container.appendChild(this._dom.title);
    }else{
        this._dom.title = null;
    }

    /* Категория, смайлики которой сейчас отображаются (из-за ajax может не совпадать с this._selectedIds[this._depth - 1]) */
    this._dom.smiles_current_id = null;

    /* Описание категории */
    this._dom.category_description = document.createElement('div');
    this._dom.category_description.className = 'category-description';
    this._dom.category_description.textContent = options.message || '';
    this._dom.container.appendChild(this._dom.category_description);

    /* Контейнер для всяких дополнительных кнопок, к контейнеру не относящихся */
    if(!this._dom.additionalContainer){
        this._dom.additionalContainer = document.createElement('div');
        this._dom.additionalContainer.className = 'additional';
        this._dom.additionalContainer.style.display = 'none';
    }
    this._dom.container.appendChild(this._dom.additionalContainer);

    /* Подсветка для перемещаемых смайликов */
    this._dom.dropHint = document.createElement('div');
    this._dom.dropHint.className = 'drop-hint';
    this._dom.dropHint.style.display = 'none';
    this._dom.container.appendChild(this._dom.dropHint);

    for(var i=0; i<this._depth; i++){
        this._categories.push({});
        this._lastIds.push(0);
        this._selectedIds.push(null);

        var tcont = document.createElement('div');
        tcont.className = 'tabs-level';
        tcont.dataset.level = i.toString();
        if(i > 0) tcont.style.display = 'none';
        if(this.hierarchy[i][2]) tcont.appendChild(document.createTextNode(this.hierarchy[i][2]));

        if(options.editable) {
            var add_btn = document.createElement('a');
            add_btn.className = 'action-btn action-add';
            add_btn.dataset.action = 'add';
            add_btn.dataset.level = i.toString();
            add_btn.href = '#';
            tcont.appendChild(add_btn);
        }

        this._dom.tabs_containers.push(tcont);
        this._dom.tabs_container.appendChild(tcont);
    }

    /* Создаём контейнер для кнопок верхнего уровня */
    this._dom.rootCategories = this._buildDomTabs(0, 0);
    this._dom.rootCategories.style.display = '';

    /* Инициализируем перетаскивание смайликов */
    dragdrop.add(
        this._dom.container,
        {
            onstart: this._dragStart.bind(this),
            onmove: this._dragMove.bind(this),
            onmoveto: this._dragMoveTo.bind(this),
            ondropto: this._dragDropTo.bind(this),
            ontransitionend: this._dragEnd.bind(this),
            onclick: this._smileClickEvent.bind(this)
        }
    );
};


widgets.Collection.prototype.getDOM = function(){
    return this._dom.container;
};


widgets.Collection.prototype.getAdditionalContainer = function(){
    return this._dom.additionalContainer;
};


widgets.Collection.prototype.loadData = function(items){
    this._loadDataLevel(items[this.hierarchy[0][0]], 0, 0);
};


widgets.Collection.prototype.addCategory = function(level, parentId, item){
    var parentLevel = level - 1;
    var parent = level > 0 ? this._categories[parentLevel][parentId] : null;
    if(level > 0 && !parent) return null;

    var id = item.id;
    if(id == null){
        this._lastIds[level]--;
        id = this._lastIds[level];
    }

    this._categories[level][id] = {
        id: id,
        parentId: level > 0 ? parentId : null,
        level: level,
        name: item.name,
        description: item.description,
        dom: null,
        iconId: item.icon ? item.icon.id : -1,
        iconUrl: item.icon ? item.icon.url : null,
        smileIds: null,
        childrenIds: level + 1 < this._depth ? [] : null,
        childrenDom: null,
        smilesDom: null
    };
    this._buildCategoryDom(level, id, true);

    return id;
};


widgets.Collection.prototype._buildCategoryDom = function(level, categoryId, save){
    var item = this._categories[level][categoryId];

    var btn = document.createElement('a');
    btn.className = 'tab-btn';
    btn.dataset.id = categoryId.toString();
    btn.dataset.level = level.toString();
    btn.href = (!this.options.useCategoryLinks || level < this._depth - 1) ? '#' : ('#' + categoryId);
    btn.title = item.description || '';
    if(item.iconUrl){
        var icon = document.createElement('img');
        icon.src = item.iconUrl;
        icon.className = 'tab-icon';
        icon.dataset.id = item.iconId;
        btn.appendChild(icon);
    }
    btn.appendChild(document.createTextNode(item.name));

    if(this.options.editable){
        var actions = document.createElement('span');
        actions.className = 'actions';

        var editbtn = document.createElement('a');
        editbtn.className = 'action-btn action-edit';
        editbtn.dataset.action = 'edit';
        actions.appendChild(editbtn); 

        var delbtn = document.createElement('a');
        delbtn.className = 'action-btn action-delete';
        delbtn.dataset.action = 'delete';
        actions.appendChild(delbtn);

        btn.appendChild(actions);
    }

    if(save){
        if(level > 0){
            var parent = this._categories[level - 1][item.parentId];
            if(!parent.childrenDom){
                parent.childrenDom = this._buildDomTabs(level, item.parentId);
            }
            parent.childrenIds.push(categoryId);
            parent.childrenDom.appendChild(btn);
        }else{
            this._rootChildren.push(categoryId);
            this._dom.rootCategories.appendChild(btn);
        }
        item.dom = btn;
    }
    return btn;
};


widgets.Collection.prototype.editCategory = function(level, categoryId, item){
    if(level < 0 || level >= this._depth || !this._categories[level][categoryId]) return null;
    var category = this._categories[level][categoryId];

    category.name = item.name;
    category.description = item.description;
    category.iconId = item.icon ? item.icon.id : -1;
    category.iconUrl = item.icon ? item.icon.url : null;

    var newDom = this._buildCategoryDom(level, categoryId, false);
    if(this._selectedIds[level] == categoryId) newDom.classList.add('tab-btn-active');

    var domParent = category.dom.parentNode;
    domParent.insertBefore(newDom, category.dom);
    domParent.removeChild(category.dom);
    category.dom = newDom;

    return categoryId;
};


widgets.Collection.prototype.removeCategory = function(level, categoryId){
    if(level < 0 || level >= this._depth) return null;
    var category = this._categories[level][categoryId];
    if(!category) return null;

    var deletedSmiles = [];

    /* Первым делом снимаем выделение */
    if(this._selectedIds[level] == categoryId){
        this.set(level, null);
    }

    /* Потом удаляем все дочерние категории */
    if(level + 1 >= this._depth){
        if(this._dom.smiles_current_id == categoryId) this.setSmiles(null);
    }else{
        while(category.childrenIds.length > 0){
            Array.prototype.push.apply(deletedSmiles, this.removeCategory(level + 1, category.childrenIds[0]));
        }
    }

    /* И смайлики тоже, да */
    if(category.smilesDom){
        category.smilesDom.parentNode.removeChild(category.smilesDom);
    }
    for(var i=0; category.smileIds && i<category.smileIds.length; i++){
        delete this._smiles[category.smileIds[i]];
        deletedSmiles.push(category.smileIds[i]);
    }

    /* И только теперь можно прибрать всё за текущим элементом */
    if(category.dom.parentNode){
        category.dom.parentNode.removeChild(category.dom);
    }
    if(category.childrenDom && category.childrenDom.parentNode){
        category.childrenDom.parentNode.removeChild(category.childrenDom);
    }
    delete this._categories[level][categoryId];

    /* Убираем у родителя упоминание о потомке */
    if(level > 0){
        var index = this._categories[level - 1][category.parentId].childrenIds.indexOf(categoryId);
        if(index > -1){
            this._categories[level - 1][category.parentId].childrenIds.splice(index, 1);
        }
    }else{
        var index = this._rootChildren.indexOf(categoryId);
        if(index > -1){
            this._rootChildren.splice(index, 1);
        }
    }

    return deletedSmiles;
};


widgets.Collection.prototype.addSmile = function(categoryId, item){
    if(!item) return null;
    var category = this._categories[this._depth - 1][categoryId];
    if(!category) return null;

    var id = item.id;
    if(id == null || isNaN(id)){
        this._lastSmileId--;
        id = this._lastSmileId;
    }

    this._smiles[id] = {
        id: id,
        categoryId: categoryId,
        url: item.url,
        description: item.description,
        tags: item.tags,
        width: item.w,
        height: item.h,
        dom: null,
        dragged: item.dragged || false,
        selected: item.selected || false
    };
    if(category.smileIds === null) category.smileIds = [];
    category.smileIds.push(id);
    if(category.smilesDom) this._addSmileDom(id);
    if(this._smiles[id].selected) this._selectedSmileIds.push(id);

    return id;
};


widgets.Collection.prototype._addSmileDom = function(smile_id){
    var item = this._smiles[smile_id];
    var category = this._categories[this._depth - 1][item.categoryId];
    if(item.dom || category.smileIds.indexOf(item.id) < 0) return false;


    var img = document.createElement('img');
    img.alt = "";
    img.title = (item.tags || []).join(", ") || item.description || item.url;
    img.src = item.url;
    img.width = item.width;
    img.height = item.height;
    img.className = "smile";
    img.dataset.id = item.id.toString();
    if(item.dragged) img.classList.add('dragged');
    if(item.selected) img.classList.add('selected');

    category.smilesDom.appendChild(img);
    item.dom = img;
    return true;
};


widgets.Collection.prototype.removeSmile = function(id){
    var smile = this._smiles[id];
    if(!smile) return false;
    var category = this._categories[this._depth - 1][smile.categoryId];
    category.smilesDom.removeChild(smile.dom);
    var i = category.smileIds.indexOf(id);
    if(i >= 0) category.smileIds.splice(i, 1);
    i = this._selectedSmileIds.indexOf(id);
    if(i >= 0) this._selectedSmileIds.splice(i, 1);
    delete this._smiles[id];
    return true;
};


widgets.Collection.prototype.moveSmile = function(smileId, beforeSmileId){
    if(smileId == beforeSmileId) return false;
    var smile = this._smiles[smileId];
    var beforeSmile = beforeSmileId != null ? this._smiles[beforeSmileId] : null;
    /* beforeSmile null - перемещаем смайлик в конец; undefined - не перемещаем, ибо смайлик не нашелся */
    if(!smile || beforeSmileId != null && !beforeSmile) return false;
    /* За пределы категории не перемещаем */
    if(beforeSmile && beforeSmile.categoryId != smile.categoryId) return false;

    var category = this._categories[this._depth - 1][smile.categoryId];
    var i = category.smileIds.indexOf(smile.id);
    /* Не забываем пересортировать айдишники в категории */
    if(i >= 0) category.smileIds.splice(i, 1);

    if(beforeSmile){
        /* Перемещаем смайлик перед указанным */
        smile.dom.parentNode.insertBefore(smile.dom, beforeSmile.dom);
        i = category.smileIds.indexOf(beforeSmile.id);
        category.smileIds.splice(i, 0, smile.id);
    }else{
        /* Перемещаем смайлик в конец */
        smile.dom.parentNode.appendChild(smile.dom);
        category.smileIds.push(smile.id);
    }

    return true;
};


widgets.Collection.prototype.set = function(level, categoryId){
    if(level < 0 || level >= this._depth) return false;
    var category = this._categories[level][categoryId];
    if(categoryId !== null && !category) return false;
    if(this._selectedIds[level] == categoryId) return true;

    /* Рекурсивно проверяем уровни выше */
    if(category && level > 0) this.set(level - 1, category.parentId);

    /* Отключаем уровни ниже */
    if(this._selectedIds[level] !== null){
        for(var i=level; i<this._depth; i++){
            if(this._selectedIds[i] === null) break;
            this._categories[i][this._selectedIds[i]].dom.classList.remove('tab-btn-active');
            if(i + 1 < this._depth){
                this._categories[i][this._selectedIds[i]].childrenDom.style.display = 'none';
                this._dom.tabs_containers[i + 1].style.display = 'none';
            }
            this._selectedIds[i] = null;
        }
    }
    if(!category) return true;

    /* Подсвечиваем кнопку в текущем уровне и отображаем уровень ниже */
    category.dom.classList.add('tab-btn-active');
    this._selectedIds[level] = categoryId;
    if(level + 1 < this._depth){
        this._dom.tabs_containers[level + 1].style.display = '';
        category.childrenDom.style.display = '';
    }else{
        this.setSmiles(categoryId);
    }
    return true;
};


widgets.Collection.prototype.setSmiles = function(categoryId, force){
    if(categoryId === null){
        if(this._dom.smiles_current_id !== null){
            this._categories[this._depth - 1][this._dom.smiles_current_id].smilesDom.style.display = 'none';
            this._dom.smiles_current_id = null;
            this._dom.category_description.textContent = '';
            this._dom.additionalContainer.style.display = 'none';
        }
        return true;
    }

    var smiles_current = null; 
    if(this._dom.smiles_current_id !== null){
        smiles_current = this._categories[this._depth - 1][this._dom.smiles_current_id].smilesDom;
    }

    var category = this._categories[this._depth - 1][categoryId];
    if(!category) return false;

    this._dom.category_description.textContent = category.description || '';

    if(category.smileIds === null){
        if(force || !this.options.get_smiles_func){
            /* В кэше нет, но надобно отобразить пустоту */
            category.smileIds = [];
        }else{
            /* В кэше нет — запрашиваем смайлики */
            if(smiles_current) smiles_current.classList.add('processing');
            this.options.get_smiles_func(this, categoryId);
        }
    }

    if(category.smileIds !== null && categoryId !== this._dom.smiles_current_id){
        if(!category.smilesDom){
            var dom_smiles = document.createElement('div');
            dom_smiles.className = 'smiles-list';
            dom_smiles.style.display = 'none';
            if(this.options.additionalOnTop){
                this._dom.container.appendChild(dom_smiles);
            }else{
                this._dom.container.insertBefore(dom_smiles, this._dom.additionalContainer);
            }
            category.smilesDom = dom_smiles;
            for(var i=0; i<category.smileIds.length; i++) this._addSmileDom(category.smileIds[i]);
        }

        this.deselectAll();

        if(smiles_current){
            if(smiles_current.classList.contains('processing')){
                smiles_current.classList.remove('processing');
            }
            smiles_current.style.display = 'none';
        }
        smiles_current = category.smilesDom;
        this._dom.smiles_current_id = categoryId;
        smiles_current.style.display = '';

        if(this.options.onchange) this.options.onchange(this, categoryId);
        this._dom.additionalContainer.style.display = '';
    }

    return true;
};

widgets.Collection.prototype.getDragged = function(id){
    var smile = this._smiles[id];
    return smile ? smile.dragged : null;
}


widgets.Collection.prototype.setDragged = function(id, dragged){
    var smile = this._smiles[id];
    if(!smile) return false;
    if(smile.dragged != dragged){
        smile.dragged = !smile.dragged;
        if(smile.dom) smile.dom.classList.toggle('dragged');
    }
    return true;
};


widgets.Collection.prototype.getSelected = function(id){
    var smile = this._smiles[id];
    return smile ? smile.selected : null;
}


widgets.Collection.prototype.setSelected = function(id, selected){
    var smile = this._smiles[id];
    /* Смайлики в скрытых категориях не выделяем */
    if(!smile || selected && smile.categoryId != this._selectedIds[this._depth - 1]) return false;
    if(selected && smile.dragged && !options.selectableDragged) return false;

    /* Переключаем выделение */
    if(smile.selected != selected){
        smile.selected = !smile.selected;
        if(smile.dom) smile.dom.classList.toggle('selected');
    }

    /* Обновляем список выделенных смайликов */
    var i = this._selectedSmileIds.indexOf(smile.id);
    if(selected && i < 0) this._selectedSmileIds.push(smile.id);
    else if (!selected && i >= 0) this._selectedSmileIds.splice(i, 1);

    /* Запоминаем последний выделенный смайлик для shift+ЛКМ */
    if(selected) this._lastSelectedSmileId = smile.id;
    else if(this._selectedSmileIds.length == 0) this._lastSelectedSmileId = null;
    return true;
};


widgets.Collection.prototype.toggleSelected = function(id){
    var smile = this._smiles[id];
    if(!smile) return false;
    return this.setSelected(smile.id, !smile.selected);
};


widgets.Collection.prototype.deselectAll = function(){
    var smile;
    if(this._selectedSmileIds.length == 0) return false;
    for(var i=0; i<this._selectedSmileIds.length; i++){
        smile = this._smiles[this._selectedSmileIds[i]];
        smile.selected = false;
        if(smile.dom) smile.dom.classList.toggle('selected');
    }
    this._selectedSmileIds = [];
    this._lastSelectedSmileId = null;
    return true;
};


widgets.Collection.prototype.getDropPosition = function(){
    return this._smileMovePosId;
};


widgets.Collection.prototype.getLastInternalIds = function(){
    return [this._lastIds, this._lastSmileId];
};


widgets.Collection.prototype.setLastInternalIds = function(lastIds, lastSmileId){
    for(var i=0; i<this._depth; i++){
        this._lastIds[i] = parseInt(lastIds[i]);
    }
    this._lastSmileId = parseInt(lastSmileId);
};


widgets.Collection.prototype.getCategoryInfo = function(level, categoryId, options){
    if(level < 0 || level >= this._depth) return null;
    var category = this._categories[level][categoryId];
    if(!category) return null;

    var info = {
        name: category.name,
        description: category.description,
        icon: !category.iconUrl ? null : {
            id: category.iconId != null ? parseInt(category.iconId) : null,
            url: (!options || !options.withoutIconUrl) ? category.iconUrl : undefined
        }
    };

    if(!options || !options.short){
        info.level = category.level;
    }
    if(!options || !options.withoutIds){
        info.id = category.id;
    }

    return info;
};


widgets.Collection.prototype.getCategoriesWithHierarchy = function(options){
    var root = [];
    var items = [];
    var level, item, id;

    for(level=0; level<this._depth; level++){
        items.push({});

        for(id in this._categories[level]){
            item = this.getCategoryInfo(level, id, options);

            if(level + 1 < this._depth){
                item[this.hierarchy[level + 1][0]] = [];
            }

            if(level > 0){
                items[level - 1][this._categories[level][id].parentId][this.hierarchy[level][0]].push(item);
            }else{
                root.push(item);
            }
            items[level][item.id] = item;
        }
    }

    return root;
};


widgets.Collection.prototype.getSmileInfo = function(smileId, options){
    var smile = this._smiles[smileId];
    if(!smile) return null;

    var info = {
        url: smile.url,
        w: smile.width,
        h: smile.height,
        description: smile.description
    };


    if(!options || !options.withoutIds){
        info.id = smile.id;
    }
    if(options && options.withParent){
        info.categoryId = smile.categoryId;
    }

    return info;
};


widgets.Collection.prototype.getSmileIdByDom = function(element){
    if(!element || !this._dom.container.contains(element) || !element.classList.contains('smile')) return null;
    var smile = this._smiles[parseInt(element.dataset.id)];
    return smile ? smile.id : null;
};


widgets.Collection.prototype.getSmileIds = function(categoryId){
    if(!this._categories[this._depth - 1][categoryId]) return null;
    return Array.prototype.slice.apply(this._categories[this._depth - 1][categoryId].smileIds);
};


widgets.Collection.prototype.getAllCategorizedSmileIds = function(){
    var result = {};
    for(var categoryId in this._categories[this._depth - 1]){
        result[categoryId] = Array.prototype.slice.apply(this._categories[this._depth - 1][categoryId].smileIds);
    }
    return result;
};


widgets.Collection.prototype.getAllSmileIds = function(){
    var result = [];
    /* Выдираем из категорий для сохранения порядка */
    for(var categoryId in this._categories[this._depth - 1]){
        result.push.apply(result, this._categories[this._depth - 1][categoryId].smileIds);
    }
    return result;
};


widgets.Collection.prototype.getSelectedCategory = function(level){
    return this._selectedIds[level];
};


widgets.Collection.prototype.getParentId = function(level, categoryId){
    if(level <= 0 || level >= this._depth || !this._categories[level][categoryId]) return null;
    return this._categories[level][categoryId].parentId;
};


widgets.Collection.prototype.typeOfElement = function(element){
    if(!element) return null;
    if(element.classList.contains('smile') && this._smiles[parseInt(element.dataset.id)].dom === element){
        var id = parseInt(element.dataset.id);
        return {
            type: 'smile',
            id: id,
            categoryId: this._smiles[id].categoryId
        };
    }
    return null;
};


/* private */


widgets.Collection.prototype._loadDataLevel = function(items, level, parent_id){
    var item_id;

    for(var i=0; i<items.length; i++){
        item_id = this.addCategory(level, parent_id, items[i]);

        /* Загружаем следующий уровень при его наличии */
        if(level + 1 < this._depth && items[i][this.hierarchy[level + 1][0]]){
            this._loadDataLevel(items[i][this.hierarchy[level + 1][0]], level + 1, item_id);
        }
    }
};

widgets.Collection.prototype._buildDomTabs = function(level, categoryId){
    var parentLevel = level - 1;
    if(level > 0 && !this._categories[parentLevel][categoryId]) return null;
    var tabs = document.createElement('div');
    tabs.className = 'tabs-items';
    tabs.style.display = 'none';
    if(level > 0){
        tabs.dataset.id = 'tabs-' + categoryId.toString();
    }

    if(this.options.editable){
        this._dom.tabs_containers[level].insertBefore(tabs, this._dom.tabs_containers[level].lastElementChild);
    }else{
        this._dom.tabs_containers[level].appendChild(tabs);
    }
    return tabs;
};

/* events */


widgets.Collection.prototype._onclick = function(event){
    if(event.target.classList.contains('smile')) return; // смайлики обрабатывает dragdrop
    var target = null;

    /* Ищем кнопку с вкладкой (или хотя бы что-то одно) */
    var btn = null;
    var tab = null;
    while(!btn || !tab){
        target = target ? target.parentNode : event.target;
        if(!target || target === this._dom.container || target === document.body){
            if(!btn && !tab) return;
            else break;
        }
        if(target.classList.contains('action-btn')){
            btn = target;
            action = btn.dataset.action;
        }else if(target.classList.contains('tab-btn')){
            tab = target;
        }
    }

    var categoryId = tab && tab.dataset.id ? parseInt(tab.dataset.id) : null;
    var categoryLevel = categoryId !== null ? parseInt(tab.dataset.level) : null;
    var item = categoryLevel !== null ? this._categories[categoryLevel][categoryId] : null;
    var action = btn ? btn.dataset.action : null;

    if(action){
        if(this.options.onaction){
            this.options.onaction({
                container: this,
                action: action,
                level: item ? item.level : parseInt(btn.dataset.level),
                categoryId: categoryId
            });
        }
        event.preventDefault();
        return false;
    }

    if(categoryLevel !== null){
        if(!this.set(categoryLevel, categoryId)) return;
        event.preventDefault();
        return false;
    }
};


widgets.Collection.prototype._smileClickEvent = function(options){
    if(!options.element.classList.contains('smile') || !options.element.dataset.id) return;
    var smile = this._smiles[parseInt(options.element.dataset.id)];
    if(!smile) return;
    if(!this.options.selectable) return;
    var category = this._categories[this._depth - 1][smile.categoryId];

    if(options.event.shiftKey && this._lastSelectedSmileId != null) {
        var pos1 = category.smileIds.indexOf(this._lastSelectedSmileId);
        var pos2 = category.smileIds.indexOf(smile.id);
        if(pos1 > pos2){
            var tmp = pos2;
            pos2 = pos1;
            pos1 = tmp;
        }
        for(var i=pos1; i<=pos2; i++){
            this.setSelected(category.smileIds[i], true);
        }
    }else if(!options.event.ctrlKey && !options.event.metaKey && (this._selectedSmileIds.length > 1 || !smile.selected)){
        this.deselectAll();
        this.setSelected(smile.id, true);
    }else{
        this.setSelected(smile.id, !smile.selected);
    }
};


/* dragdrop */


widgets.Collection.prototype._dragStart = function(options){
    var e = options.element;
    if(e === this._dom.container) return null;

    do {
        if(e.dataset.action) break;
        if(e.classList.contains('smile') && !e.classList.contains('dragged')){
            var smile = this._smiles[parseInt(e.dataset.id)];
            if(!smile || smile.dragged) return null;
            return e;
        }
        if(this.options.editable && e.classList.contains('tab-btn')){
            var level = parseInt(e.dataset.level);
            var categoryId = parseInt(e.dataset.id);
            if(this._categories[level] && this._categories[level][categoryId]) return e;
        }
        e = e.parentNode;
    }while(e && e !== this._dom.container);

    return null;
};


widgets.Collection.prototype._dragMove = function(options){
    if(options.targetContainer !== this._dom.container){
        this._dom.dropHint.style.display = 'none';
    }
    var e = options.element;
    if(e.classList.contains('smile')){
        if(options.starting && !e.classList.contains('dragged')) this.setDragged(parseInt(e.dataset.id), true);

    }else if(e.classList.contains('tab-btn')){
        if(options.starting && !e.classList.contains('dragged')) e.classList.add('dragged');
    }
};


widgets.Collection.prototype._dragMoveTo = function(options){
    var e = options.element;
    if(e.classList.contains('smile')){
        var smile_id = parseInt(e.dataset.id);
        if(this.options.editable){
            var smileOver = this.getSmileIdByDom(options.mouseOver);
            this._calculateSmileMove(options.x, options.y, smile_id, smileOver);
        }

    }else if(e.classList.contains('tab-btn')){
        // TODO:
    }
};


widgets.Collection.prototype._dragDropTo = function(options){
    var smileMovePosId = this._smileMovePosId;
    this._smileMovePosId = null;
    this._dom.dropHint.style.display = 'none';

    if(!this.options.ondropto) return null;
    if(options.sourceContainer === this._dom.container && this.options.editable){
        if(!options.element.classList.contains('smile')) return null;
        var smile = this._smiles[options.element.dataset.id];
        if(!smile) return null;

        var category = this._categories[this._depth - 1][smile.categoryId];
        if(smileMovePosId == null){
            var lastSmile = this._smiles[category.smileIds[category.smileIds.length - 1]];
            var rect = lastSmile.dom.getBoundingClientRect();
            if(options.y >= rect.bottom || options.y >= rect.top && options.x >= rect.left){
                this.moveSmile(smile.id, null);
            }
        }else{
            this.moveSmile(smile.id, smileMovePosId);
        }

        return null;
    }

    /* Что делать при перетаскивании DOM-элементов (включая смайлики) между ними, решает владелец коллекции */
    /* Коллекция руководит только сама собой, но не взаимодействием с другими коллекциями */
    var dropAction = this.options.ondropto({
        sourceContainerElement: options.sourceContainer,
        targetContainer: this,
        element: options.element,
        overlay: options.overlay,
        dropPosition: smileMovePosId
    });
    if(dropAction && dropAction.name == 'animateToSmile'){
        return {name: 'animate', targetElement: this._smiles[dropAction.id].dom};
    }
    return dropAction;
};


widgets.Collection.prototype._dragEnd = function(options){
    if(!options.element) return null;
    var e = options.element;
    if(e.classList.contains('smile')){
        if(e.classList.contains('dragged')) this.setDragged(parseInt(e.dataset.id), false);
    }else if(e.classList.contains('tab-btn')){
        if(e.classList.contains('dragged')) e.classList.remove('dragged');
    }
};


widgets.Collection.prototype._calculateSmileMove = function(x, y, smileId, smileOverId){
    var smileOverOld = this._smileMovePosId;
    if(smileId == smileOverId) smileOverId = null;
    if(smileOverId == null){
        this._dom.dropHint.style.display = 'none';
        this._smileMovePosId = null;
        return;
    }

    var smileOver = this._smiles[smileOverId];
    var category = this._categories[this._depth - 1][smileOver.categoryId];

    /* Считаем, на какую половину смайлика наведён курсор */
    var rect = smileOver.dom.getBoundingClientRect();
    var relPos = (x - rect.left) / rect.width;

    var newMovePosId;
    if(relPos >= 0.5){
        /* На правую — будем дропать смайлик после него */
        var newMovePosId = category.smileIds.indexOf(smileOver.id) + 1;
        if(newMovePosId >= category.smileIds.length) newMovePosId = null;
        else newMovePosId = category.smileIds[newMovePosId];
    }else{
        /* На левую — перед ним */
        newMovePosId = smileOverId;
    }

    if(newMovePosId == this._smileMovePosId) return;
    this._smileMovePosId = newMovePosId;

    /* Ищем соседний смайлик для расчёта высоты подсветки */
    var nearSmile = null;
    if(newMovePosId == smileOverId){
        nearSmile = category.smileIds.indexOf(smileOverId) - 1;
        nearSmile  = nearSmile >= 0 ? this._smiles[category.smileIds[nearSmile]] : null;
    }else if(newMovePosId != null){
        nearSmile = this._smiles[newMovePosId];
    }

    /* За высоту подсветки берём высоту меньшего смайлика */
    var nearRect = nearSmile ? nearSmile.dom.getBoundingClientRect() : null;
    if(nearRect && nearRect.height < rect.height) {
        this._dom.dropHint.style.height = nearRect.height + 'px';
    }else{
        this._dom.dropHint.style.height = rect.height + 'px';
    }

    /* Отображаем подсветку */
    if(newMovePosId != null) {
        smileOver.dom.parentNode.insertBefore(this._dom.dropHint, this._smiles[newMovePosId].dom);
    }else{
        smileOver.dom.parentNode.appendChild(this._dom.dropHint);
    }
    this._dom.dropHint.style.display = '';
};

module.exports = widgets;
