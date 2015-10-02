'use strict';

var widgets = {};

/*
 * Виджет с коллекцией смайликов с неограниченным уровнем вложенности.
 * Формат hierarchy: [[атрибут со списком элементов, атрибут с id элемента, человекочитаемое название уровня], ...]
 */
widgets.Collection = function(hierarchy, options){
    this.hierarchy = hierarchy;
    this._depth = this.hierarchy.length;
    this.options = options;

    /* У всех элементов всех уровней общая внутренняя нумерация */
    this._elements = {};
    this._lastId = 0;
    
    /* У смайликов отдельная внутренняя нумерация */
    this._smileLastId = 0;

    /* Выбранные элементы на каждом из уровней */
    this._selected = [];

    /* Табличка соответствия внешней нумерации внутренней по уровням; для публичных методов */
    this._ids = [];

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

    /* Здесь будут храниться кнопки для элементов */
    this._dom.tabs_container = document.createElement('div');
    this._dom.tabs_container.className = 'tabs-wrapper';
    this._dom.container.appendChild(this._dom.tabs_container);

    this._dom.title = document.createElement('div');
    this._dom.title.className = 'collection-title';
    this._dom.title.textContent = options.title || '';
    this._dom.tabs_container.appendChild(this._dom.title);

    /* Контейнеры для кнопок по уровням */
    this._dom.tabs_containers = [];

    /* А здесь группы кнопок, привязанные к элементам (0 это корень) */
    this._dom.tabs = {};

    /* Теги img со смайликами по их id */
    this._dom.smiles = {};
    /* Блоки со смайликами */
    this._dom.smiles_blocks = {};
    /* А это текущий из них */
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

    for(var i=0; i<this._depth; i++){
        this._selected.push(null);
        this._ids.push({});

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
    this._buildDomTabs(0, 0);
    this._dom.tabs[0].style.display = '';

    /* Инициализируем перетаскивание смайликов */
    dragdrop.add(
        this._dom.container,
        {
            onstart: this._dragStart.bind(this),
            onmove: this._dragMove.bind(this),
            // onmoveto: this._dragMoveTo.bind(this),
            ondropto: this._dragDropTo.bind(this),
            ondrop: this._dragDrop.bind(this),
            ontransitionend: this._dragEnd.bind(this)
        }
    );
};

widgets.Collection.prototype._dragStart = function(options){
    var e = options.element;
    if(e === this._dom.container) return null;

    do {
        if(e.dataset.action) break;
        if(e.classList.contains('smile') && !e.classList.contains('dragged')){
            if(!this._dom.smiles[parseInt(e.dataset.localId)]) return null;
            return e;
        }
        if(this.options.editable && e.classList.contains('tab-btn') && e.dataset.localId && this._elements[parseInt(e.dataset.localId)]){
            return e;
        }
        e = e.parentNode;
    }while(e && e !== this._dom.container);

    return null;
};

widgets.Collection.prototype._dragMove = function(options){
    if(options.starting){
        if(!options.element.classList.contains('dragged')) options.element.classList.add('dragged');
    }
};

widgets.Collection.prototype._dragMoveTo = function(container, element, clientX, clientY, target){
    // console.log(container, clientX, clientY, target);
};

widgets.Collection.prototype._dragDropTo = function(options){
    /* if(!this.options.editable || !this._selected[this._depth - 1]) return null;
    if(options.element.classList.contains('smile')){
        if(options.sourceContainer === this._dom.container){
            return null;
        }
        return this._dom.container;
    } */

    if(!this.options.ondropto) return null;

    if(options.sourceContainer === this._dom.container){
        return null;
    }

    /* Что делать при перетаскивании смайликов между ними, решает владелец коллекции */
    /* Коллекция руководит только сам собой, но не взаимодействием с другими коллекциями */
    var dropAction = null;
    if(this.options.ondropto){
        dropAction = this.options.ondropto({
            sourceContainerElement: options.sourceContainer,
            targetContainer: this,
            element: options.element,
            overlay: options.overlay
        });
    }
    if(dropAction && dropAction.name == 'animateToSmile'){
        return {name: 'animate', targetElement: this._dom.smiles[dropAction.id]}
    }
    return dropAction;
};

widgets.Collection.prototype._dragDrop = function(options){
}

widgets.Collection.prototype._dragEnd = function(options){
    if(!options.element) return;
    if(options.element.classList.contains('dragged')) options.element.classList.remove('dragged');
}

widgets.Collection.prototype.getLevelSelectedElement = function(level){
    if(level < 0 || level >= this._depth) return null;
    return this._selected[level] !== null ? this._elements[this._selected[level]].origId : null;
}

widgets.Collection.prototype.typeOfElement = function(element){
    if(!element){
        return null;
    }
    if(element.classList.contains('smile') && this._dom.smiles[parseInt(element.dataset.localId)] === element){
        return {
            type: 'smile',
            localId: parseInt(element.dataset.localId),
            categoryId: this._elements[parseInt(element.dataset.localItemId)].origId
        };
    }
    return null;
};

widgets.Collection.prototype.childOf = function(elem_id, parent_id){
    if(elem_id == parent_id || !this._elements[elem_id] || !this._elements[parent_id]){
        return false;
    }

    var tmp_id = elem_id;
    while(this._elements[tmp_id].parent_id != 0){
        tmp_id = this._elements[tmp_id].parent_id;
        if(tmp_id == parent_id) return true;
    }
    return false;
}

widgets.Collection.prototype.getDOM = function(){
    return this._dom.container;
};

widgets.Collection.prototype.set = function(level, elem_id){
    if(level < 0 || level >= this._depth) return false;
    if(elem_id !== null && !this._ids[level][elem_id]) return false;
    return this._setLocal(elem_id === null ? null : this._ids[level][elem_id], level);
}

widgets.Collection.prototype.setSmiles = function(elem_id, force){
    if(elem_id === null){
        if(this._dom.smiles_current_id !== null){
            this._dom.container.removeChild(this._dom.smiles_blocks[this._dom.smiles_current_id]);
            this._dom.smiles_current_id = null;
            this._dom.category_description.textContent = '';
            this._dom.additionalContainer.style.display = 'none';
        }
        return true;
    }

    var smiles_current = this._dom.smiles_current_id === null ? null : this._dom.smiles_blocks[this._dom.smiles_current_id];

    var item_id = this._ids[this._depth - 1][elem_id];
    if(!item_id) return false;
    var item = this._elements[item_id];
    this._dom.category_description.textContent = item.description || '';

    if(!this._dom.smiles_blocks[item_id]){
        if(force || !this.options.get_smiles_func){
            /* В кэше нет, но надобно отобразить пустоту */
            this._addSmileLocal(item_id, null);
        }else{
            /* В кэше нет — запрашиваем смайлики */
            if(smiles_current) smiles_current.classList.add('processing');
            this.options.get_smiles_func(this, elem_id);
        }
    }

    if(this._dom.smiles_blocks[item_id] && item_id !== this._dom.smiles_current_id){
        if(smiles_current){
            if(smiles_current.classList.contains('processing')){
                smiles_current.classList.remove('processing');
            }
            smiles_current.style.display = 'none';
        }
        smiles_current = this._dom.smiles_blocks[item_id];
        this._dom.smiles_current_id = item_id;
        smiles_current.style.display = '';

        if(this.options.onchange) this.options.onchange(elem_id);
        this._dom.additionalContainer.style.display = '';
    }

    return true;
};

widgets.Collection.prototype.setDragged = function(smile_id, dragged){
    if(!this._dom.smiles[smile_id]) return false;
    if(this._dom.smiles[smile_id].classList.contains('dragged') != dragged){
        this._dom.smiles[smile_id].classList.toggle('dragged');
    }
    return true;
};

widgets.Collection.prototype.removeSmile = function(smile_id){
    if(!this._dom.smiles[smile_id]) return false;
    this._dom.smiles[smile_id].parentNode.removeChild(this._dom.smiles[smile_id]);
    delete this._dom.smiles[smile_id];
    return true;
};

widgets.Collection.prototype.addSmile = function(elem_id, data){
    var item_id = this._ids[this._depth - 1][elem_id];
    if(!item_id) return null;
    return this._addSmileLocal(item_id, data);
}

widgets.Collection.prototype.addSmileFromElement = function(elem_id, element){
    var item_id = this._ids[this._depth - 1][elem_id];
    if(!item_id) return null;
    return this._addSmileLocal(item_id, null, element);
}

widgets.Collection.prototype._addSmileLocal = function(item_id, data, element){
    if(!this._dom.smiles_blocks[item_id]){
        var dom_smiles = document.createElement('div');
        dom_smiles.className = 'smiles-list';
        dom_smiles.style.display = 'none';
        this._dom.container.insertBefore(dom_smiles, this._dom.additionalContainer);
        this._dom.smiles_blocks[item_id] = dom_smiles;
    }
    if(!data && !element) return null;

    this._smileLastId = this._smileLastId + 1;
    var smileId = this._smileLastId;
    var img;

    if(element){
        img = element.cloneNode();
    }else{
        img = document.createElement("img");
        img.alt = "";
        img.title = (data.tags || []).join(", ") || data.source_description || data.source_url || data.url;
        img.src = data.url;
        img.width = data.w;
        img.height = data.h;
        img.className = "smile";
        img.dataset.id = data.id || "";
    }
    img.dataset.localId = smileId.toString();
    img.dataset.localItemId = item_id.toString();
    this._dom.smiles_blocks[item_id].appendChild(img);
    this._dom.smiles[smileId] = img;
    return smileId;
};

widgets.Collection.prototype.addElement = function(level, parent_id, item){
    if(level < 0 || level >= this._depth || (level != 0 && !this._ids[level - 1][parent_id])){
        return null;
    }
    if(level > 0) parent_id = this._ids[level - 1][parent_id];
    else parent_id = 0;
    return this._addElementLocal(parent_id, item);
}

widgets.Collection.prototype._addElementLocal = function(parent_id, item){
    this._lastId++;
    var item_id = this._lastId;
    var level = (parent_id == 0) ? 0 : this._elements[parent_id].level + 1;

    /* Создаём кнопку */
    var btn = document.createElement('a');
    btn.className = 'tab-btn';
    btn.dataset.localId = item_id.toString();
    btn.dataset.id = (item.id).toString();
    btn.href = level < this._depth - 1 ? '#' : ('#' + btn.dataset.id);
    btn.title = item.description || '';
    if(item.icon && item.icon.url){
        var icon = document.createElement('img');
        icon.src = item.icon.url;
        icon.className = 'tab-icon';
        icon.dataset.id = item.icon.id;
        btn.appendChild(icon);
    }
    btn.appendChild(document.createTextNode(item.name))

    if(this.options.editable){
        var actions = document.createElement('span');
        actions.className = 'actions';

        /* var editbtn = document.createElement('a');
        editbtn.className = 'action-btn action-edit';
        editbtn.dataset.action = 'edit';
        actions.appendChild(editbtn); */

        var delbtn = document.createElement('a');
        delbtn.className = 'action-btn action-delete';
        delbtn.dataset.action = 'delete';
        actions.appendChild(delbtn);

        btn.appendChild(actions);
    }

    this._dom.tabs[parent_id].appendChild(btn);

    /* Сохраняем информацю о кнопке */
    this._elements[item_id] = {
        id: item_id,
        origId: item.id,
        parentId: parent_id,
        level: level,
        name: item.name,
        description: item.description,
        dom: btn,
        iconId: item.icon ? item.icon.id : -1,
        iconUrl: item.icon ? item.icon.url : null,
        children_ids: []
    }
    this._ids[level][item.id] = item_id;
    if(parent_id != 0) this._elements[parent_id].children_ids.push(item_id);

    /* Создаём контейнер для уровней ниже */
    /* FIXME: при таком создании нет контейнера для корня */
    if(level + 1 < this._depth){
        this._buildDomTabs(level + 1, item_id)
    }

    return item_id;
};

widgets.Collection.prototype.getAllElementsInfo = function(options){
    /* TODO: оптимизировать */
    var items = [];
    var items_dict = {};
    var queue = [];
    var i, item, out_item;
    for(var localId in this._elements) queue.push(localId);

    while(queue.length > 0){
        for(i=0; i<queue.length; i++){
            item = this._elements[queue[i]];
            out_item = this.getElementInfo(item.level, item.origId, options);
            if(item.level + 1 < this._depth){
                out_item[this.hierarchy[item.level + 1][0]] = [];
            }

            if(item.level == 0){
                items.push(out_item);
                items_dict[queue[i]] = out_item;
                queue.splice(0, 1);
                i--;
            }else if(items_dict[item.parentId]){
                items_dict[item.parentId][this.hierarchy[item.level][0]].push(out_item);
                items_dict[queue[i]] = out_item;
                queue.splice(0, 1);
                i--;
            }
        }
    }
    items_dict = null;
    return items;
};

widgets.Collection.prototype.getElementInfo = function(level, elem_id, options){
    if(level < 0 || level >= this._depth || !this._ids[level][elem_id]) return null;
    var item = this._elements[this._ids[level][elem_id]];
    var info = {
        name: item.name,
        description: item.description,
        icon: !item.iconUrl ? null : {
            id: item.iconId != null ? parseInt(item.iconId) : null,
            url: item.iconUrl
        }
    };

    if(!options || !options.short){
        info.level = item.level;
    }
    if(!options || !options.withoutIds){
        info.id = item.origId;
    }

    return info;
};

widgets.Collection.prototype.getSmileInfo = function(smile_id, options){
    var smile = this._dom.smiles[smile_id];
    if(!smile) return null;
    var info = {
        url: smile.src,
        w: parseInt(smile.getAttribute('width')),
        h: parseInt(smile.getAttribute('height'))
    }
    if(!options || !options.withoutIds){
        info.id = smile_id;
    }
    if(options && options.withParent){
        info.parentId = this._elements[parseInt(smile.dataset.localItemId)].origId;
    }
    return info;
};

widgets.Collection.prototype.getSmileElement = function(smile_id){
    return this._dom.smiles[smile_id] || null;
};

widgets.Collection.prototype.getAdditionalContainer = function(){
    return this._dom.additionalContainer;
};

widgets.Collection.prototype.getSmiles = function(elem_id, without_dragged){
    var item_id = this._ids[this._depth - 1][elem_id];
    if(!this._dom.smiles_blocks[item_id]) return null;

    var smile_ids = [];
    var imgs = Array.prototype.slice.apply(this._dom.smiles_blocks[item_id].querySelectorAll('img[class="smile"]'));
    for(var i=0; i<imgs.length; i++){
        var smileId = parseInt(imgs[i].dataset.localId);
        if(this._dom.smiles[smileId] && (!without_dragged || !imgs[i].classList.contains('dragged'))){
            smile_ids.push(smileId);
        }
    }

    return smile_ids;
};

widgets.Collection.prototype.getAllSmiles = function(without_dragged){
    var smile_ids = [];
    for(var smileId in this._dom.smiles){
        if(!without_dragged || !this._dom.smiles[smileId].classList.contains('dragged')){
            smile_ids.push(smileId);
        }
    }

    return smile_ids;
};

widgets.Collection.prototype._buildDomTabs = function(level, parent_id){
    var tabs = document.createElement('div');
    tabs.className = 'tabs-items';
    tabs.style.display = 'none';
    tabs.dataset.id = 'tabs-' + parent_id.toString();
    this._dom.tabs[parent_id] = tabs;

    if(this.options.editable){
        this._dom.tabs_containers[level].insertBefore(tabs, this._dom.tabs_containers[level].lastElementChild);
    }else{
        this._dom.tabs_containers[level].appendChild(tabs);
    }
    return tabs;
}

widgets.Collection.prototype.removeElement = function(level, id){
    if(!this._ids[level][id]) return null;
    return this._removeElementLocal(this._ids[level][id]);
}
;
widgets.Collection.prototype._removeElementLocal = function(item_id){
    var item = this._elements[item_id];
    var smile_ids = [];

    /* Снимаем выделение */
    if(this._selected[item.level] == item_id){
        this._setLocal(null, item.level);
    }

    /* Рекурсивно даляем элементы уровнями ниже */
    if(item.level + 1 >= this._depth){
        if(this._dom.smiles_current_id == item_id) this.setSmiles(null);
    }else{
        for(var i=0; i<item.children_ids.length; i++){
            this._removeElementLocal(item.children_ids[i]);
        }
    }

    /* И смайлики тоже, да */
    if(this._dom.smiles_blocks[item_id]){
        var imgs = Array.prototype.slice.apply(this._dom.smiles_blocks[item_id].querySelectorAll('img[class="smile"]'));
        for(var i=0; i<imgs.length; i++){
            var smileId = parseInt(imgs[i].dataset.localId);
            if(this.removeSmile(smileId)) smile_ids.push(smileId);
        }
        if(this._dom.smiles_blocks[item_id].parentNode){
            this._dom.smiles_blocks[item_id].parentNode.removeChild(this._dom.smiles_blocks[item_id]);
        }
        delete this._dom.smiles_blocks[item_id];
    }

    /* И только теперь можно прибрать всё за текущим элементом */
    if(item.dom.parentNode) item.dom.parentNode.removeChild(item.dom);
    item.dom = null;
    delete this._ids[item.level][item.origId];
    delete this._elements[item_id];

    if(this._dom.tabs[item_id] && this._dom.tabs[item_id].parentNode){
        this._dom.tabs[item_id].parentNode.removeChild(this._dom.tabs[item_id]);
    }
    delete this._dom.tabs[item_id];

    if(item.parentId != 0){
        var index = this._elements[item.parentId].children_ids.indexOf(item.id);
        if(index > -1) this._elements[item.parentId].children_ids.splice(index, 1);
    }

    return smile_ids;;
};

widgets.Collection.prototype.loadData = function(items){
    this._loadDataLevel(items[this.hierarchy[0][0]], 0, 0);
};

widgets.Collection.prototype._loadDataLevel = function(items, level, parent_id){
    var level_info = this.hierarchy[level];
    var item_id;

    for(var i=0; i<items.length; i++){
        item_id = this._addElementLocal(parent_id, items[i]);

        /* Загружаем следующий уровень при его наличии */
        if(level + 1 < this._depth && items[i][this.hierarchy[level + 1][0]]){
            this._loadDataLevel(items[i][this.hierarchy[level + 1][0]], level + 1, item_id);
        }
    }
}

widgets.Collection.prototype._setLocal = function(local_id, level){
    var item;
    if(local_id !== null){
        if(!this._elements[local_id]) return false;
        item = this._elements[local_id];
        level = item.level;
    }else{
        if(level < 0 || level >= this._depth) return false;
        item = null;
    }
    if(this._selected[level] == local_id) return true;

    /* Рекурсивно проверяем уровни выше */
    if(item !== null && item.parentId != 0) this._setLocal(item.parentId);

    /* Отключаем уровни ниже */
    if(this._selected[level] !== null){
        for(var i=level; i<this._depth; i++){
            if(this._selected[i] === null) break;
            this._elements[this._selected[i]].dom.classList.remove('tab-btn-active');
            if(i + 1 < this._depth){
                this._dom.tabs[this._selected[i]].style.display = 'none';
                this._dom.tabs_containers[i + 1].style.display = 'none';
            }
            this._selected[i] = null;
        }
    }
    if(item === null) return true;

    /* Подсвечиваем кнопку в текущем уровне и отображаем уровень ниже */
    item.dom.classList.add('tab-btn-active');
    this._selected[level] = local_id;
    if(level + 1 < this._depth){
        this._dom.tabs_containers[item.level + 1].style.display = '';
        this._dom.tabs[local_id].style.display = '';
    }else{
        this.setSmiles(item.origId);
    }
    return true;
}

widgets.Collection.prototype._onclick = function(event){
    var target = null;

    /* Ищем кнопку с вкладкой */
    var btn = null;
    var tab = null;
    while(!btn || !tab){
        target = target ? target.parentNode : event.target;
        if(!target || target === document.body || target === this._dom.container){
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

    var item_id = tab && tab.dataset.localId ? parseInt(tab.dataset.localId) : null;
    var item = this._elements[item_id] || null;
    var action = btn ? btn.dataset.action : null;

    if(action){
        if(this.options.onaction){
            this.options.onaction(
                this,
                action,
                item ? item.level : parseInt(btn.dataset.level),
                item ? item.origId : null
            );
        }
        event.preventDefault();
        return false;
    }

    if(item_id !== null){
        if(!this._setLocal(item_id)) return;
        event.preventDefault();
        return false;
    }
}


/*
 * Простенькая обёртка над DOM для диалогов
 */
widgets.Dialog = function(options){
    this.container = options.container;
    this.form = options.form;
    this.onshow = options.onshow;
    this.onsubmit = options.onsubmit;
    this._refresh = options.refresh;
    this.active = !this.container.classList.contains('hidden');

    if(this.form){
        this.form.addEventListener('submit', function(event){
            this.onsubmit(this);
            event.preventDefault();
            return false;
        }.bind(this));
    }

    var close = this.container.querySelector('.dialog-close');
    if(close) close.addEventListener('click', this.hide.bind(this));
};

widgets.Dialog.backgroundElement = null;

widgets.Dialog.prototype.show = function(options){
    if(this.onshow) this.onshow(this, options);

    if(this.container.classList.contains('hidden')){
        this.container.classList.remove('hidden')
    }
    var bg = widgets.Dialog.backgroundElement;
    if(bg && bg.classList.contains('hidden')){
        bg.classList.remove('hidden');
    }

    var errorElement = this.container.querySelector('.error');
    if(errorElement && !errorElement.classList.contains('hidden')){
        errorElement.classList.add('hidden');
    }
};

widgets.Dialog.prototype.hide = function(){
    if(!this.container.classList.contains('hidden')){
        this.container.classList.add('hidden')
    }
    var bg = widgets.Dialog.backgroundElement;
    if(bg && !bg.classList.contains('hidden')){
        bg.classList.add('hidden');
    }
};

widgets.Dialog.prototype.error = function(text){
    var errorElement = this.container.querySelector('.error');
    if(!errorElement){
        alert(text);
        return;
    }
    errorElement.textContent = text || '';
    if(!text != errorElement.classList.contains('hidden')){
        errorElement.classList.toggle('hidden');
    }
};

widgets.Dialog.prototype.refresh = function(){
    if(this._refresh) this._refresh(this);
};
