'use strict';

var dragdrop = require('../dragdrop.js');


/*
 * Виджет с коллекцией смайликов с неограниченным уровнем вложенности.
 * Формат hierarchy: [[атрибут со списком элементов, атрибут с id элемента, человекочитаемое название уровня], ...]
 */
var Collection = function(hierarchy, options) {
    this.hierarchy = hierarchy;
    this._depth = hierarchy.length;

    if (!options.classes) {
        options.classes = {};
    }
    this.options = options;

    this._eventListeners = {
        onchange: [],
        onaction: [],
        onselect: [],
        oncategoryedit: []
    };

    for (var event in this._eventListeners) {
        if (options[event]) {
            this._eventListeners[event].push(options[event]);
        }
    }

    /* Многоуровневые категории с отдельной нумерацией по уровням */
    this._categories = [];
    this._rootChildren = [];
    this._lastIds = [];

    /* Группы смайликов, которые привязываются к категориям */
    this._groups = {};
    this._lastGroupId = 0;
    this._currentGroupId = null;
    this._currentCategory = null; /* На случай, если текущая группа относится к категории */

    /* Объекты со смайликами; нумерация общая для всех групп */
    this._smiles = {};
    this._selectedSmileIds = [];
    this._lastSelectedSmileId = null;
    this._smileMovePosId = null; /* для dragdrop */
    this._lastCreatedSmileId = 0;

    this._lazyCategoriesQueue = [];
    this._lazyProcessing = 0;
    if (options.lazyStep) {
        this._lazyStep = options.lazyStep;
    } else if (navigator.userAgent.toLowerCase().indexOf('chrome') >= 0) {
        this._lazyStep = 15;
    } else {
        this._lazyStep = 3;
    }
    this._lazyCallback = this._lazyLoaded.bind(this);

    /* Выбранные категории на каджом из уровней */
    this._selectedIds = [];

    this._initDOM();
    this._initDOMTabs();

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

    /* После успешной инициализации убираем лого загрузки */
    var tmp = Array.prototype.slice.apply(this._dom.container.querySelectorAll('.temporary'));
    for (var i = tmp.length - 1; i >= 0; i--) {
        tmp[i].parentNode.removeChild(tmp[i]);
    }
};


Collection.prototype._initDOM = function() {
    var options = this.options;
    var classes = options.classes;

    this._dom = {};
    this._dom.container = options.container || document.createElement('div');
    var cont = this._dom.container;
    cont.addEventListener('click', this._onclick.bind(this));

    if (classes.container && !cont.classList.contains(classes.container)) {
        cont.classList.add(classes.container);
    }

    this._dom.tabsContainer = cont.getElementsByClassName(classes.tabsWrapper || 'tabs-wrapper')[0];
    if (!this._dom.tabsContainer) {
        this._dom.tabsContainer = document.createElement('div');
        this._dom.tabsContainer.className = classes.tabsWrapper || 'tabs-wrapper';
        cont.appendChild(this._dom.tabsContainer);
    }

    this._dom.message = cont.getElementsByClassName(classes.message || 'collection-message')[0];
    if (!this._dom.message) {
        this._dom.message = document.createElement('div');
        this._dom.message.className = classes.message || 'collection-message';
        this._dom.message.textContent = options.message || '';
        cont.appendChild(this._dom.message);
    }

    this._dom.smilesContainer = cont.getElementsByClassName(classes.smilesContainer || 'collection-smiles')[0];
    if (!this._dom.smilesContainer) {
        this._dom.smilesContainer = document.createElement('div');
        this._dom.smilesContainer.className = classes.smilesContainer || 'collection-smiles';
        cont.appendChild(this._dom.smilesContainer);
    }

    this._dom.dropHint = document.createElement('div');
    this._dom.dropHint.className = 'drop-hint';
    this._dom.dropHint.style.display = 'none';
    this._dom.smilesContainer.appendChild(this._dom.dropHint);
};


Collection.prototype._initDOMTabs = function() {
    this._dom.tabsContainers = [];

    for (var i = 0; i < this._depth; i++){
        this._categories.push({});
        this._lastIds.push(0);
        this._selectedIds.push(null);

        var tcont = document.createElement('div');
        tcont.className = this.options.classes.tabsLevel || 'tabs-level';
        tcont.dataset.level = i.toString();
        if (i > 0) {tcont.style.display = 'none';}
        if (this.hierarchy[i][2]) {
            tcont.appendChild(document.createTextNode(this.hierarchy[i][2]));
        }

        if (this.options.editable) {
            var add_btn = document.createElement('a');
            add_btn.className = 'action-btn action-add';
            add_btn.dataset.action = 'add';
            add_btn.dataset.level = i.toString();
            add_btn.href = '#';
            tcont.appendChild(add_btn);
        }

        this._dom.tabsContainers.push(tcont);
        this._dom.tabsContainer.appendChild(tcont);
    }

    /* Создаём контейнер для кнопок верхнего уровня */
    this._dom.rootCategories = this._buildDomTabs(0, 0);
    this._dom.rootCategories.style.display = '';
};


Collection.prototype.getDOM = function() {
    return this._dom.container;
};


Collection.prototype.subscribe = function(event, callback) {
    if (this._eventListeners[event] === undefined) {
        throw new Error("Unknown event " + event);
    }
    this._eventListeners[event].push(callback);
};


Collection.prototype.callListeners = function(event, args) {
    var funcs = this._eventListeners[event];
    for (var i = 0; i < funcs.length; i++) {
        funcs[i].apply(this, args);
    }
};


Collection.prototype.loadData = function(items) {
    this._loadDataLevel(items[this.hierarchy[0][0]], 0, 0);
};


Collection.prototype.isTabsVisible = function() {
    return this._dom.tabsContainer.style.display != 'none';
};


Collection.prototype.setTabsVisibility = function(visible) {
    this._dom.tabsContainer.style.display = visible ? '' : 'none';
};


Collection.prototype.addCategory = function(level, parentId, item) {
    var parentLevel = level - 1;
    var parent = level > 0 ? this._categories[parentLevel][parentId] : null;
    if (level > 0 && !parent) {
        return null;
    }

    var id = item.id;
    if (id === undefined || item.id === null) {
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
        childrenIds: level + 1 < this._depth ? [] : null,
        groupId: null
    };
    this._buildCategoryDom(level, id, true);

    this.callListeners('oncategoryedit', {categoryLevel: level, categoryId: id, added: true, removed: false});

    return id;
};


Collection.prototype._buildCategoryDom = function(level, categoryId, save) {
    var item = this._categories[level][categoryId];

    var btn = document.createElement('a');
    btn.className = 'tab-btn';
    btn.dataset.id = categoryId.toString();
    btn.dataset.level = level.toString();
    btn.href = (!this.options.useCategoryLinks || level < this._depth - 1) ? '#' : ('#' + categoryId);
    btn.title = item.description || '';
    if (item.iconUrl) {
        var icon = document.createElement('img');
        icon.src = item.iconUrl;
        icon.className = 'tab-icon';
        icon.dataset.id = item.iconId;
        btn.appendChild(icon);
    }
    btn.appendChild(document.createTextNode(item.name));

    if (this.options.editable) {
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

    if (save) {
        if (level > 0) {
            var parent = this._categories[level - 1][item.parentId];
            if (!parent.childrenDom) {
                parent.childrenDom = this._buildDomTabs(level, item.parentId);
            }
            parent.childrenIds.push(categoryId);
            parent.childrenDom.appendChild(btn);
        } else {
            this._rootChildren.push(categoryId);
            this._dom.rootCategories.appendChild(btn);
        }
        item.dom = btn;
    }
    return btn;
};


Collection.prototype.editCategory = function(level, categoryId, item) {
    if (level < 0 || level >= this._depth || !this._categories[level][categoryId]) {
        return null;
    }
    var category = this._categories[level][categoryId];

    category.name = item.name;
    category.description = item.description;
    category.iconId = item.icon ? item.icon.id : -1;
    category.iconUrl = item.icon ? item.icon.url : null;

    var newDom = this._buildCategoryDom(level, categoryId, false);
    if (this._selectedIds[level] == categoryId) {
        newDom.classList.add('tab-btn-active');
    }

    var domParent = category.dom.parentNode;
    domParent.insertBefore(newDom, category.dom);
    domParent.removeChild(category.dom);
    category.dom = newDom;

    this.callListeners('oncategoryedit', {categoryLevel: level, categoryId: category.id, added: false, removed: false});

    return category.id;
};


Collection.prototype.removeCategory = function(level, categoryId) {
    if (level < 0 || level >= this._depth) {
        return null;
    }
    var category = this._categories[level][categoryId];
    if (!category) {
        return null;
    }

    var unusedSmiles = [];

    /* Первым делом снимаем выделение */
    if (this._selectedIds[level] == categoryId) {
        this.set(level, null);
    }

    if (this._currentCategory && this._currentCategory[0] == level && this._currentCategory[1] == categoryId) {
        this.setSmiles(null);
    }

    /* Потом удаляем все дочерние категории */
    if (level + 1 < this._depth) {
        while (category.childrenIds.length > 0) {
            Array.prototype.push.apply(unusedSmiles, this.removeCategory(level + 1, category.childrenIds[0]));
        }
    }

    /* И смайлики тоже, да */
    if (category.groupId !== null) {
        Array.prototype.push.apply(unusedSmiles, this.removeGroup(category.groupId));
    }

    /* И только теперь можно прибрать всё за текущим элементом */
    if (category.dom.parentNode) {
        category.dom.parentNode.removeChild(category.dom);
    }
    category.dom = null;

    if (category.childrenDom && category.childrenDom.parentNode) {
        category.childrenDom.parentNode.removeChild(category.childrenDom);
        category.childrenDom = null;
    }
    delete this._categories[level][categoryId];

    /* Убираем у родителя упоминание о потомке */
    var index;
    if (level > 0) {
        index = this._categories[level - 1][category.parentId].childrenIds.indexOf(categoryId);
        if (index > -1) {
            this._categories[level - 1][category.parentId].childrenIds.splice(index, 1);
        }
    } else {
        index = this._rootChildren.indexOf(categoryId);
        if (index > -1) {
            this._rootChildren.splice(index, 1);
        }
    }

    this.callListeners('oncategoryedit', {categoryLevel: level, categoryId: category.id, added: false, removed: true});

    return unusedSmiles;
};


Collection.prototype.createGroup = function(item) {
    var groupId = ++this._lastGroupId;
    item = item || {};
    this._groups[groupId] = {
        id: groupId,
        dom: null,
        smileIds: [],
        lazyQueue: [],
        openedClass: item.openedClass || 'smiles-opened',
        description: item.description || '',
        categoryLevel: null,
        categoryId: null
    };
    return groupId;
};


Collection.prototype.createGroupForCategory = function(categoryLevel, categoryId, item) {
    var category = this._categories[categoryLevel][categoryId];
    if (!category || category.groupId !== null) {
        return null;
    }

    item = item || {};
    if (item.description === undefined) {
        item.description = category.description;
    }
    if (!item.openedClass) {
        item.openedClass = 'smiles-opened';
    }
    category.groupId = this.createGroup(item);
    this._groups[category.groupId].categoryLevel = categoryLevel;
    this._groups[category.groupId].categoryId = category.id;

    this.callListeners('oncategoryedit', {categoryLevel: categoryLevel, categoryId: category.id, added: false, removed: false});

    return category.groupId;
};


Collection.prototype.removeGroup = function(groupId) {
    var group = this._groups[groupId];
    if (!group) {
        return null;
    }

    if (this._currentGroupId == group.id) {
        this.setSmiles(null);
    }

    for (var i = 0; i < group.smileIds.length; i++) {
        var smile = this._smiles[group.smileIds[i]];
        delete smile.groups[group.id];
    }
    if (group.dom) {
        group.dom.parentNode.removeChild(group.dom);
    }
    // TODO: check categories
    delete this._groups[groupId];
    return group.smileIds;
};


Collection.prototype.addSmile = function(item, nolazy) {
    if (!item) {
        return null;
    }

    var i;

    /* Генерируем id смайлика, если его нам не предоставили */
    var id = item.id;
    if (id === undefined || id === null || isNaN(id)) {
        this._lastCreatedSmileId--;
        id = this._lastCreatedSmileId;
    }
    if (this._smiles[id]) {
        return null;
    }

    /* Смайлик можно привязать к нескольким группам */
    var groupIds = [], groupId;
    for (i = 0; item.groupIds && i < item.groupIds.length; i++){
        groupId = item.groupIds[i];
        if (this._groups[groupId]) {
            groupIds.push(groupId);
        }
    }

    /* Смайлик можно привязать к одной категории */
    var categoryLevel = item.categoryLevel;
    var categoryId = item.categoryId;
    if (groupIds.length === 0 && categoryId !== undefined && categoryId !== null && !isNaN(categoryId)) {
        if (isNaN(categoryLevel) || categoryLevel < 0 || categoryLevel >= this._depth) {
            return null;
        }
        if (!this._categories[categoryLevel][categoryId]) {
            return null;
        }
        groupIds.push(this._categories[categoryLevel][categoryId].groupId);
        if (groupIds[0] === null) {
            return null;
        }
    } else {
        categoryLevel = null;
        categoryId = null;
    }

    /* Сохраняем */
    this._smiles[id] = {
        id: id,
        groups: {},
        categoryLevel: categoryLevel,
        categoryId: categoryId,
        url: item.url,
        description: item.description,
        tags: item.tags,
        width: item.w,
        height: item.h,
        dragged: item.dragged || false,
        selected: item.selected || false
    };

    /* Добавляем в группы */
    for (i = 0; i < groupIds.length; i++) {
        this.addSmileToGroup(id, groupIds[i], nolazy);
    }

    /* Проверяем выделение, если смайлик добавлен в текущую группу */
    if (this._smiles[id].selected) {
        if (this._currentGroupId !== null && this._smiles[id].groups[this._currentGroupId] !== undefined) {
            this._selectedSmileIds.push(id);
            this._selectUpdated([id], []);
        } else {
            this._smiles[id].selected = false;
        }
    }
    return id;
};


Collection.prototype._addSmileDom = function(smile_id, groupId, nolazy) {
    var item = this._smiles[smile_id];
    var group = this._groups[groupId];
    if (item.groups[groupId] || group.smileIds.indexOf(item.id) < 0) {
        return false;
    }

    var img = document.createElement('img');
    img.alt = "";
    img.title = (item.tags || []).join(", ") || item.description || item.url;
    img.width = item.width;
    img.height = item.height;
    img.classList.add('smile');
    img.dataset.id = item.id.toString();
    img.dataset.groupId = group.id.toString();

    if (!nolazy) {
        img.classList.add('smile-loading');
    }
    if (item.dragged) {
        img.classList.add('dragged');
    }
    if (item.selected && this._currentGroupId == group.id) {
        img.classList.add('selected');
    }

    if (!nolazy) {
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///////yH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
        img.dataset.src = item.url;
        group.lazyQueue.push(smile_id);
        // TODO: optimize for multiple _addSmileDom calls
        if (this._lazyCategoriesQueue.indexOf(group.id) < 0) {
            this._lazyCategoriesQueue.push(group.id);
        }
    } else {
        img.src = item.url;
    }

    group.dom.appendChild(img);
    item.groups[group.id] = img;
    if (!nolazy && this._lazyProcessing < this._lazyStep) {
        this._lazyNext();
    }
    return true;
};


Collection.prototype.addSmileToGroup = function(smileId, groupId, nolazy) {
    var smile = this._smiles[smileId];
    var group = this._groups[groupId];
    if (!smile || !group) {
        return false;
    }
    if (smile.groups[group.id] !== undefined) {
        return true;
    }

    smile.groups[group.id] = null;
    group.smileIds.push(smile.id);
    if (group.categoryId !== null) {
        smile.categoryLevel = group.categoryLevel;
        smile.categoryId = group.categoryId;
    }
    if (group.dom) {
        this._addSmileDom(smile.id, group.id, nolazy);
    }
    return true;
};


Collection.prototype.addSmileToCategory = function(smileId, categoryLevel, categoryId) {
    var smile = this._smiles[smileId];
    var category = this._categories[categoryLevel][categoryId];
    if (!smile || !category || category.groupId === null) {
        return false;
    }
    if (!this.addSmileToGroup(smile.id, category.groupId)) {
        return false;
    }
    return true;
};


Collection.prototype.removeSmile = function(id) {
    if (!this._smiles[id]) {
        return false;
    }

    var i = this._selectedSmileIds.indexOf(id);
    if (i >= 0) {
        this._selectedSmileIds.splice(i, 1);

        if (this._lastSelectedSmileId == id) {
            this._lastSelectedSmileId = null;
        }

        this._selectUpdated([], [id]);
    }

    this._removeSmileRaw(id);

    return true;
};


Collection.prototype.removeManySmiles = function(smileIds) {
    var reallyDeleted = [];
    var id, j;

    for (var i = 0; i < smileIds.length; i++) {
        id = smileIds[i];
        if (!this._smiles[id]) {
            continue;
        }

        j = this._selectedSmileIds.indexOf(id);
        if (j >= 0) {
            this._selectedSmileIds.splice(j, 1);
            if (this._lastSelectedSmileId === id) {
                this._lastSelectedSmileId = null;
            }
        }

        this._removeSmileRaw(id);
        reallyDeleted.push(id);
    }

    this._selectUpdated([], reallyDeleted);

    return reallyDeleted;
};


Collection.prototype._removeSmileRaw = function(id) {
    var smile = this._smiles[id];
    var group, i;
    for (var groupId in smile.groups) {
        group = this._groups[groupId];
        if (smile.groups[groupId]) {
            group.dom.removeChild(smile.groups[groupId]);
        }

        i = group.smileIds.indexOf(smile.id);
        if (i >= 0) {
            group.smileIds.splice(i, 1);
        }
    }
    delete this._smiles[id];
};


Collection.prototype.removeSmileFromGroup = function(id, groupId) {
    var smile = this._smiles[id];
    if (!smile) {
        return null;
    }

    var group = this._groups[groupId];
    if (!group) {
        return Object.keys(smile.groups).length;
    }

    var index = group.smileIds.indexOf(smile.id);
    if (index < 0) {
        return Object.keys(smile.groups).length;
    }
    group.smileIds.splice(index, 1);

    if (smile.groups[group.id]) {
        group.dom.removeChild(smile.groups[group.id]);
    }
    delete smile.groups[group.id];

    if (this._currentGroupId === group.id && smile.selected) {
        index = this._selectedSmileIds.indexOf(id);
        if (index >= 0) {
            this._selectedSmileIds.splice(index, 1);
        }
        smile.selected = false;
        this._selectUpdated([], [id]);
    }

    if (smile.categoryId !== null && this._categories[smile.categoryLevel][smile.categoryId].groupId === group.id) {
        smile.categoryLevel = null;
        smile.categoryId = null;
    }

    return Object.keys(smile.groups).length;
};


Collection.prototype.moveSmile = function(smileId, beforeSmileId, groupId) {
    if (groupId === undefined) {
        groupId = this._currentGroupId;
    }
    var group = this._groups[groupId];
    if (!group) {
        return false;
    }

    if (smileId == beforeSmileId) {
        return false;
    }
    var smile = this._smiles[smileId];
    var beforeSmile = beforeSmileId !== null ? this._smiles[beforeSmileId] : null;
    /* beforeSmile null - перемещаем смайлик в конец; undefined - не перемещаем, ибо смайлик не нашелся */
    if (!smile || beforeSmileId !== null && !beforeSmile) {
        return false;
    }
    /* За пределы группы не перемещаем */
    if (beforeSmile && !beforeSmile.groups[group.id]) {
        return false;
    }

    var i = group.smileIds.indexOf(smile.id);
    /* Не забываем пересортировать айдишники в группе */
    if (i >= 0) {
        group.smileIds.splice(i, 1);
    }

    if (beforeSmile) {
        /* Перемещаем смайлик перед указанным */
        if (group.dom) {
            group.dom.insertBefore(smile.groups[group.id], beforeSmile.groups[group.id]);
        }
        i = group.smileIds.indexOf(beforeSmile.id);
        group.smileIds.splice(i, 0, smile.id);
    } else {
        /* Перемещаем смайлик в конец */
        if (group.dom) {
            group.dom.appendChild(smile.groups[group.id]);
        }
        group.smileIds.push(smile.id);
    }

    return true;
};


Collection.prototype.set = function(level, categoryId) {
    if (level < 0 || level >= this._depth) {
        return false;
    }
    var category = this._categories[level][categoryId];
    if (categoryId !== null && !category) {
        return false;
    }
    if (this._selectedIds[level] == categoryId) {
        return true;
    }

    /* Рекурсивно проверяем уровни выше, если это не снятие выделения */
    if (category && level > 0) {
        this.set(level - 1, category.parentId);
    }

    /* Отключаем уровни ниже */
    if (this._selectedIds[level] !== null) {
        for (var i = level; i < this._depth; i++){
            if (this._selectedIds[i] === null) {
                break;
            }
            this._categories[i][this._selectedIds[i]].dom.classList.remove('tab-btn-active');
            if (i + 1 < this._depth) {
                this._categories[i][this._selectedIds[i]].childrenDom.style.display = 'none';
                this._dom.tabsContainers[i + 1].style.display = 'none';
            }
            this._selectedIds[i] = null;
        }
    }

    /* Если это снятие выделения, то всё */
    if (!category) {
        return true;
    }

    /* Подсвечиваем кнопку в текущем уровне и отображаем уровень ниже */
    category.dom.classList.add('tab-btn-active');
    this._selectedIds[level] = categoryId;
    if (level + 1 < this._depth && category.childrenDom) {
        this._dom.tabsContainers[level + 1].style.display = '';
        category.childrenDom.style.display = '';
    } else if (category.groupId !== null){
        this.setCategorySmiles(level, category.id);
    }
    return true;
};


Collection.prototype.setCategorySmiles = function(categoryLevel, categoryId, force) {
    if (categoryId === undefined || categoryId === null) {
        return this.setSmiles(null);
    }

    if (isNaN(categoryLevel) || categoryLevel < 0 || categoryLevel >= this._depth) {
        return false;
    }
    var category = this._categories[categoryLevel][categoryId];
    if (!category || category.groupId === null) {
        return false;
    }

    var group = this._groups[category.groupId];

    /* Если смайлики группы не загружены, запрашиваем их, упомянув категорию */
    if (group.dom === null && group.smileIds.length < 1 && !force && this.options.get_smiles_func) {
        if (this._currentGroupId) {
            this._groups[this._currentGroupId].dom.classList.add('processing');
        } else {
            this._dom.message.textContent = group.description || '';
        }
        this.options.get_smiles_func(this, {
            groupId: group.id,
            categoryLevel: categoryLevel,
            categoryId: categoryId
        });
        return true;
    }

    this._currentCategory = [categoryLevel, category.id];
    if (!this.setSmiles(category.groupId, true)) {
        this._currentCategory = null;
        return false;
    }
    return true;
};


Collection.prototype.setSmiles = function(groupId, force) {
    if (groupId === null) {
        if (this._currentGroupId !== null) {
            this.deselectAll();
            this._groups[this._currentGroupId].dom.style.display = 'none';
            this._currentGroupId = null;
            this._currentCategory = null;
            this._dom.message.textContent = '';
            this._dom.container.classList.remove('smiles-opened');
        }
        return true;
    }

    var smiles_current = null; 
    if (this._currentGroupId !== null) {
        smiles_current = this._groups[this._currentGroupId].dom;
    }

    var group = this._groups[groupId];
    if (!group) {
        return false;
    }

    /* Если смайлики группы не загружены, запрашиваем их */
    if (!group.dom && !force && this.options.get_smiles_func) {
        /* Создаём видимость загрузки */
        this._dom.container.classList.add('smiles-processing');
        if (this._dom._currentGroupId === null) {
            this._dom.message.textContent = group.description || '';
        }
        /* Сам запрос */
        this.options.get_smiles_func(this, {groupId: group.id});
        return true;
    }

    if (this._currentGroupId == group.id) {
        return true;
    }

    this.deselectAll();
    if (smiles_current) {
        this._dom.container.classList.remove('smiles-processing');
        smiles_current.style.display = 'none';
    }
    this._currentGroupId = group.id;
    this._dom.message.textContent = group.description || '';

    if (!group.dom) {
        /* Если мы попали сюда, значит нас просят игнорировать отсутствие смайликов */
        group.dom = document.createElement('div');
        group.dom.className = 'smiles-list';
        this._dom.smilesContainer.appendChild(group.dom);

        for (var i = 0; i < group.smileIds.length; i++) {
            this._addSmileDom(group.smileIds[i], group.id);
        }
    }
    group.dom.style.display = '';

    var options = {groupId: group.id};
    if (this._currentCategory !== null) {
        options.categoryLevel = this._currentCategory[0];
        options.categoryId = this._currentCategory[1];
    }
    this.callListeners('onchange', [options]);

    this._dom.container.classList.add(group.openedClass || 'smiles-opened');

    return true;
};

Collection.prototype.getDragged = function(id) {
    var smile = this._smiles[id];
    return smile ? smile.dragged : null;
};


Collection.prototype.setDragged = function(id, dragged) {
    var smile = this._smiles[id];
    if (!smile) {
        return false;
    }
    if (smile.dragged != dragged) {
        smile.dragged = !smile.dragged;
        for (var groupId in smile.groups) {
            if (smile.groups[groupId] === null) {
                continue;
            }
            smile.groups[groupId].classList.toggle('dragged');
        }
    }
    return true;
};


Collection.prototype.getSelected = function(id) {
    var smile = this._smiles[id];
    return smile ? smile.selected : null;
};


Collection.prototype.setSelected = function(id, selected) {
    var smile = this._smiles[id];
    /* Смайлики в скрытых группах не выделяем */
    if (this._currentGroupId === null) {
        return false;
    }
    /* Смайлики, которые невозможно выделить, тоже не выделяем */
    if (!smile || selected && smile.groups[this._currentGroupId] === undefined) {
        return false;
    }
    /* Если нам запрещено выделять перемещённые смайлики, то не выделяем */
    if (selected && smile.dragged && !this.options.selectableDragged) {
        return false;
    }

    /* После всех проверок применяем выделение */
    this._setSelectedRaw(smile.id, selected);

    return true;
};


Collection.prototype._setSelectedRaw = function(id, selected, noEvent) {
    var smile = this._smiles[id];
    var changed = false;

    /* Переключаем выделение */
    if (smile.selected != selected) {
        smile.selected = !smile.selected;
        if (smile.groups[this._currentGroupId]) {
            smile.groups[this._currentGroupId].classList.toggle('selected');
        }
    }

    /* Обновляем список выделенных смайликов */
    var i = this._selectedSmileIds.indexOf(smile.id);
    if (selected && i < 0) {
        this._selectedSmileIds.push(smile.id);
        changed = true;
    } else if (!selected && i >= 0) {
        this._selectedSmileIds.splice(i, 1);
        changed = true;
    }

    /* Запоминаем последний выделенный смайлик для shift+ЛКМ */
    if (selected) {
        this._lastSelectedSmileId = smile.id;
    } else if (this._selectedSmileIds.length === 0 || this._lastSelectedSmileId === smile.id) {
        this._lastSelectedSmileId = null;
    }

    /* Оповещаем слушателей события о данном событии */
    if (changed && !noEvent) {
        if (selected) {
            this._selectUpdated([smile.id], []);
        } else {
            this._selectUpdated([], [smile.id]);
        }
    }

    return changed;
};


Collection.prototype.toggleSelected = function(id) {
    var smile = this._smiles[id];
    if (!smile) {
        return false;
    }
    return this.setSelected(smile.id, !smile.selected);
};


Collection.prototype.selectAll = function(withDragged) {
    var smile;
    if (this._currentGroupId === null) {
        return false;
    }

    var smiles = Array.prototype.slice.apply(this._groups[this._currentGroupId].smileIds);
    if (smiles.length < 1) {
        return true;
    }
    var selectedSmiles = [];
    var addedSmiles = [];

    for (var i = 0; i < smiles.length; i++) {
        smile = this._smiles[smiles[i]];
        if (!withDragged && smile.dragged) {
            continue;
        }
        selectedSmiles.push(smile.id);
        if (smile.selected) {
            continue;
        }
        addedSmiles.push(smile.id);
        smile.selected = true;
        if (smile.groups[this._currentGroupId]) {
            smile.groups[this._currentGroupId].classList.add('selected');
        }
    }

    if (addedSmiles.length < 1) {
        return true;
    }

    this._selectedSmileIds = selectedSmiles;
    this._lastSelectedSmileId = selectedSmiles[selectedSmiles.length - 1];

    this._selectUpdated(addedSmiles, []);

    return true;
};


Collection.prototype.deselectAll = function() {
    var smile;
    if (this._currentGroupId === null || this._selectedSmileIds.length === 0) {
        return false;
    }

    var deselectedSmiles = Array.prototype.slice.apply(this._selectedSmileIds);

    for (var i = 0; i < deselectedSmiles.length; i++) {
        smile = this._smiles[deselectedSmiles[i]];
        smile.selected = false;
        if (smile.groups[this._currentGroupId]) {
            smile.groups[this._currentGroupId].classList.remove('selected');
        }
    }

    this._selectedSmileIds = [];
    this._lastSelectedSmileId = null;

    this._selectUpdated([], deselectedSmiles);

    return true;
};


Collection.prototype.getDropPosition = function() {
    return this._smileMovePosId;
};


Collection.prototype.getLastInternalIds = function() {
    return [this._lastIds, this._lastCreatedSmileId];
};


Collection.prototype.setLastInternalIds = function(lastIds, lastSmileId) {
    for (var i = 0; i < this._depth; i++) {
        this._lastIds[i] = parseInt(lastIds[i]);
    }
    this._lastCreatedSmileId = parseInt(lastSmileId);
};


Collection.prototype.getCategoryInfo = function(level, categoryId, options) {
    if (level === undefined || level === null || isNaN(level) || level < 0 || level >= this._depth) {
        return null;
    }
    var category = this._categories[level][categoryId];
    if (!category) {
        return null;
    }

    var info = {
        name: category.name,
        description: category.description,
        icon: !category.iconUrl ? null : {
            id: category.iconId !== null ? parseInt(category.iconId) : null,
            url: (!options || !options.withoutIconUrl) ? category.iconUrl : undefined
        }
    };

    if (!options || !options.short) {
        info.level = category.level;
    }
    if (!options || !options.withoutIds) {
        info.id = category.id;
    }
    if (options && options.withGroupId) {
        info.groupId = category.groupId;
    }

    return info;
};


Collection.prototype.getCategoryIdsWithSmiles = function() {
    var result = [];
    for (var level = 0; level < this._depth; level++) {
        for (var id in this._categories[level]) {
            if (this._categories[level][id].groupId !== null) {
                result.push([level, id]);
            }
        }
    }
    return result;
};


Collection.prototype.getCategoriesWithHierarchy = function(options) {
    var root = [];
    var items = [];
    var level, item, id;

    for (level = 0; level < this._depth; level++) {
        items.push({});

        for (id in this._categories[level]) {
            item = this.getCategoryInfo(level, id, options);

            if (level + 1 < this._depth) {
                item[this.hierarchy[level + 1][0]] = [];
            }

            if (level > 0) {
                items[level - 1][this._categories[level][id].parentId][this.hierarchy[level][0]].push(item);
            } else {
                root.push(item);
            }
            items[level][item.id] = item;
        }
    }

    return root;
};


Collection.prototype.getCategoryIds = function() {
    var result = [];
    var parse = function(x) {return parseInt(x, 10);};
    for (var i = 0; i < this._categories.length; i++){
        var ids = Object.keys(this._categories[i]).map(parse);
        Array.prototype.push(ids);
    }
    return result;
};


Collection.prototype.getSmileInfo = function(smileId, options) {
    var smile = this._smiles[smileId];
    if (!smile) {
        return null;
    }

    var info = {
        url: smile.url,
        w: smile.width,
        h: smile.height,
        description: smile.description
    };


    if (!options || !options.withoutIds) {
        info.id = smile.id;
    }
    if (options && options.withParent) {
        info.categoryLevel = smile.categoryLevel;
        info.categoryId = smile.categoryId;
        info.groups = Object.keys(smile.groups).map(function(x) {return parseInt(x, 10);});
    }

    return info;
};


Collection.prototype.getSmileIdByDom = function(element) {
    if (!element || !this._dom.smilesContainer.contains(element) || !element.classList.contains('smile')) {
        return null;
    }
    var smile = this._smiles[parseInt(element.dataset.id)];
    return smile ? smile.id : null;
};


Collection.prototype.getSmileIdsOfCategory = function(level, categoryId) {
    if (!this._categories[level][categoryId]) {
        return null;
    }
    return this.getSmileIds(this._categories[level][categoryId].groupId);
};


Collection.prototype.getSmileIds = function(groupId) {
    if (!this._groups[groupId]) {
        return null;
    }
    return Array.prototype.slice.apply(this._groups[groupId].smileIds);
};


Collection.prototype.getSelectedSmileIds = function() {
    return Array.prototype.slice.apply(this._selectedSmileIds);
};


Collection.prototype.getAllCategorizedSmileIds = function(level) {
    var result = {};
    if (level === undefined || level === null || isNaN(level)) {
        level = this._depth - 1;
    } else if (level < 0 || level >= this._depth) {
        return result;
    }

    var group;
    for (var categoryId in this._categories[level]) {
        if (this._categories[level][categoryId].groupId === null) {
            continue;
        }
        group = this._categories[level][categoryId].groupId;
        group = this._groups[group];
        result[categoryId] = Array.prototype.slice.apply(group.smileIds);
    }
    return result;
};


Collection.prototype.getLevelSmileIds = function(level) {
    var result = [];
    if (level === undefined || level === null || isNaN(level)){
        level = this._depth - 1;
    } else if (level < 0 || level >= this._depth) {
        return result;
    }

    /* Выдираем из категорий для сохранения порядка */
    var group;
    for (var categoryId in this._categories[level]) {
        if (this._categories[level][categoryId].groupId === null) {
            continue;
        }
        group = this._categories[level][categoryId].groupId;
        group = this._groups[group];
        Array.prototype.push.apply(result, group.smileIds);
    }
    return result;
};


Collection.prototype.getSelectedCategory = function(level) {
    return this._selectedIds[level];
};


Collection.prototype.getCurrentGroupId = function() {
    return this._currentGroupId;
};


Collection.prototype.getGroupOfCategory = function(level, categoryId) {
    if (level === undefined || level === null || isNaN(level) || level < 0 || level >= this._depth) {
        return null;
    }
    var category = this._categories[level][categoryId];
    return category ? category.groupId : null;
};


Collection.prototype.getParentId = function(level, categoryId) {
    if (level === undefined || level === null || isNaN(level) || level < 0 || level >= this._depth) {
        return null;
    }
    if (!this._categories[level][categoryId]) {
        return null;
    }
    return this._categories[level][categoryId].parentId;
};


Collection.prototype.typeOfElement = function(element) {
    if (!element) {
        return null;
    }
    if (element.classList.contains('smile')) {
        var id = parseInt(element.dataset.id);
        var groupId = parseInt(element.dataset.groupId);
        var smile = this._smiles[id];
        if (!smile || smile.groups[groupId] !== element) {
            return null;
        }
        return {
            type: 'smile',
            id: id,
            groupId: groupId
        };
    }
    // TODO: tabs
    return null;
};


/* private */


Collection.prototype._selectUpdated = function(added, removed) {
    if ((this._selectedSmileIds.length > 0) != this._dom.container.classList.contains('with-selection')) {
        this._dom.container.classList.toggle('with-selection');
    }
    this.callListeners('onselect', [{
        added: added,
        removed: removed,
        current: Array.prototype.slice.apply(this._selectedSmileIds),
        groupId: this._currentGroupId,
        container: this
    }]);
};


Collection.prototype._loadDataLevel = function(items, level, parent_id) {
    var item_id;

    for (var i = 0; i < items.length; i++) {
        item_id = this.addCategory(level, parent_id, items[i]);

        /* Загружаем следующий уровень при его наличии */
        if (level + 1 < this._depth && items[i][this.hierarchy[level + 1][0]]) {
            this._loadDataLevel(items[i][this.hierarchy[level + 1][0]], level + 1, item_id);
        }
    }
};

Collection.prototype._buildDomTabs = function(level, categoryId) {
    var parentLevel = level - 1;
    if (level > 0 && !this._categories[parentLevel][categoryId]) {
        return null;
    }
    var tabs = document.createElement('div');
    tabs.className = this.options.classes.tabsItems || 'tabs-items';
    tabs.style.display = 'none';
    if (level > 0) {
        tabs.dataset.id = 'tabs-' + categoryId.toString();
    }

    if (this.options.editable) {
        this._dom.tabsContainers[level].insertBefore(tabs, this._dom.tabsContainers[level].lastElementChild);
    } else {
        this._dom.tabsContainers[level].appendChild(tabs);
    }

    return tabs;
};

/* events */


Collection.prototype._onclick = function(event) {
    if (event.target === this._dom.container || this._currentGroupId !== null && event.target === this._groups[this._currentGroupId].dom) {
        /* Кликнули в пустоту */
        this.deselectAll();
        return false;
    }

    if (event.target.classList.contains('smile')) {
        return; // смайлики обрабатывает dragdrop
    }
    var target = null;

    /* Ищем кнопку с вкладкой (или хотя бы что-то одно) */
    var btn = null;
    var tab = null;
    while (!btn || !tab) {
        target = target ? target.parentNode : event.target;
        if (!target || target === this._dom.container || target === document.body) {
            if (!btn && !tab) {
                return;
            } else {
                break;
            }
        }
        if (target.classList.contains('action-btn')) {
            btn = target;
            action = btn.dataset.action;
        } else if (target.classList.contains('tab-btn')) {
            tab = target;
        }
    }

    var categoryId = tab && tab.dataset.id ? parseInt(tab.dataset.id) : null;
    var categoryLevel = categoryId !== null ? parseInt(tab.dataset.level) : null;
    var item = categoryLevel !== null ? this._categories[categoryLevel][categoryId] : null;
    var action = btn ? btn.dataset.action : null;

    if (action) {
        this.callListeners('onaction', [{
            container: this,
            action: action,
            level: item ? item.level : parseInt(btn.dataset.level),
            categoryId: categoryId
        }]);
        event.preventDefault();
        return false;
    }

    if (categoryLevel !== null) {
        if (!this.set(categoryLevel, categoryId)) {
            return;
        }
        event.preventDefault();
        return false;
    }
};


Collection.prototype._smileClickEvent = function(options) {
    if (!options.element.classList.contains('smile') || !options.element.dataset.id) {
        return;
    }
    var smile = this._smiles[parseInt(options.element.dataset.id)];
    if (!smile || !this.options.selectable || this._currentGroupId === null) {
        return;
    }

    var group = this._groups[this._currentGroupId];

    if (options.event.shiftKey && this._lastSelectedSmileId === null){
        /* Shift - выделение пачки смайликов, но если считать пачку неоткуда, то выделяем один смайлик */
        this.setSelected(smile.id, true);
    } else if (options.event.shiftKey && this._lastSelectedSmileId !== null) {
        /* Shift - выделение пачки смайликов; считаем начало и конец пачки */
        var pos1 = group.smileIds.indexOf(this._lastSelectedSmileId);
        var pos2 = group.smileIds.indexOf(smile.id);
        if (pos1 > pos2) {
            var tmp = pos2;
            pos2 = pos1;
            pos1 = tmp;
        }

        /* Выделяем всю пачку */
        var selectedSmiles = [];
        var selSmile;
        for (var i = pos1; i <= pos2; i++) {
            selSmile = this._smiles[group.smileIds[i]];
            if ((this.options.selectableDragged || !selSmile.dragged) && this._setSelectedRaw(group.smileIds[i], true, true)) {
                selectedSmiles.push(group.smileIds[i]);
            }
        }

        /* Если в пачке были невыделенные смайлики, то уведомляем об изменении выделения */
        if (selectedSmiles.length > 0) {
            this._selectUpdated(selectedSmiles, []);
        }
    } else if (!options.event.ctrlKey && !options.event.metaKey && (this._selectedSmileIds.length > 1 || !smile.selected)) {
        /* Простой клик по смайлику - выделяем его одного */
        this.deselectAll();
        this.setSelected(smile.id, true);
    } else {
        /* Ctrl - выделение одного смайлика или снятие выделения; также снятие выделения у единственного выделенного */
        this.setSelected(smile.id, !smile.selected);
    }
};


/* dragdrop */


Collection.prototype._dragStart = function(options) {
    var e = options.element;
    if (e === this._dom.container || e === this._dom.smilesContainer) {
        return null;
    }

    do {
        if (e.dataset.action) {
            break;
        }
        if (e.classList.contains('smile') && !e.classList.contains('dragged')) {
            var smile = this._smiles[parseInt(e.dataset.id)];
            return smile && !smile.dragged ? e : null;
        }
        if (this.options.editable && e.classList.contains('tab-btn')) {
            var level = parseInt(e.dataset.level);
            var categoryId = parseInt(e.dataset.id);
            if (this._categories[level] && this._categories[level][categoryId]) {
                return e;
            }
        }
        e = e.parentNode;
    } while (e && e !== this._dom.container && e !== this._dom.smilesContainer);

    return null;
};

Collection.prototype._dragMove = function(options) {
    if (options.targetContainer !== this._dom.container){
        this._dom.dropHint.style.display = 'none';
    }
    var e = options.element;

    if (e.classList.contains('smile')) {
        /* В коллекции отмечаем смайлик перемещённым */
        if (options.starting && !e.classList.contains('dragged')) {
            this.setDragged(parseInt(e.dataset.id), true);
        }

        /* В оверлее убираем ленивую загрузку */
        if (options.starting && options.overlay && options.overlay.dataset.src) {
            options.overlay.src = options.overlay.dataset.src;
            delete options.overlay.dataset.src;
            options.overlay.classList.remove('smile-loading');
        }

    } else if (e.classList.contains('tab-btn')) {
        /* Отмечаем категорию перемещённой */
        if (options.starting && !e.classList.contains('dragged')) {
            e.classList.add('dragged');
        }
    }
};


Collection.prototype._dragMoveTo = function(options) {
    var e = options.element;
    if (e.classList.contains('smile')) {
        /* Рассчитываем, в какое место перетаскивают смайлик */
        if (this.options.editable) {
            var smileOver = this.getSmileIdByDom(options.mouseOver);
            this._calculateSmileMove(options.x, options.y, smileOver);
        }

    } else if (e.classList.contains('tab-btn')) {
        // TODO:
    }
};


Collection.prototype._dragDropTo = function(options) {
    var smileMovePosId = this._smileMovePosId;
    this._smileMovePosId = null;
    this._dom.dropHint.style.display = 'none';

    if (options.sourceContainer === this._dom.container && this.options.editable) {
        if (!options.element.classList.contains('smile')) {
            return null;
        }
        var smile = this._smiles[options.element.dataset.id];
        if (!smile) {
            return null;
        }

        var group = this._groups[this._currentGroupId];
        if (smileMovePosId === null) {
            var lastSmile = this._smiles[group.smileIds[group.smileIds.length - 1]];
            var rect = lastSmile.groups[this._currentGroupId].getBoundingClientRect();
            if (options.y >= rect.bottom || options.y >= rect.top && options.x >= rect.left) {
                this.moveSmile(smile.id, null);
            }
        } else if (smile.id !== smileMovePosId) {
            this.moveSmile(smile.id, smileMovePosId);
        }

        return null;
    }

    /* Что делать при перетаскивании DOM-элементов (включая смайлики) между ними, решает владелец коллекции */
    /* Коллекция руководит только сама собой, но не взаимодействием с другими коллекциями */
    if (!this.options.ondropto) {
        return null;
    }
    var dropAction = this.options.ondropto({
        sourceContainerElement: options.sourceContainer,
        targetContainer: this,
        element: options.element,
        overlay: options.overlay,
        dropPosition: smileMovePosId
    });
    if (dropAction && dropAction.name == 'animateToSmile') {
        return {name: 'animate', targetElement: this._smiles[dropAction.id].groups[this._currentGroupId]};
    }
    return dropAction;
};


Collection.prototype._dragEnd = function(options) {
    if (!options.element) {
        return null;
    }
    var e = options.element;
    if (e.classList.contains('smile')) {
        if (e.classList.contains('dragged')) {
            this.setDragged(parseInt(e.dataset.id), false);
        }
    } else if (e.classList.contains('tab-btn')){
        if (e.classList.contains('dragged')) {
            e.classList.remove('dragged');
        }
    }
};


Collection.prototype._calculateSmileMove = function(x, y, smileOverId) {
    if (smileOverId === undefined || smileOverId === null) {
        this._dom.dropHint.style.display = 'none';
        this._smileMovePosId = null;
        return;
    }

    var smileOver = this._smiles[smileOverId];
    var group = this._groups[this._currentGroupId];

    /* Считаем, на какую половину смайлика наведён курсор */
    var rect = smileOver.groups[this._currentGroupId].getBoundingClientRect();
    var relPos = (x - rect.left) / rect.width;

    var newMovePosId = null;
    if (relPos >= 0.5) {
        /* На правую — будем дропать смайлик после него */
        newMovePosId = group.smileIds.indexOf(smileOver.id) + 1;
        if (newMovePosId >= group.smileIds.length) {
            newMovePosId = null;
        } else {
            newMovePosId = group.smileIds[newMovePosId];
        }
    } else {
        /* На левую — перед ним */
        newMovePosId = smileOverId;
    }

    if (newMovePosId == this._smileMovePosId) {
        return;
    }
    this._smileMovePosId = newMovePosId;

    /* Ищем соседний смайлик для расчёта высоты подсветки */
    var nearSmile = null;
    if (newMovePosId == smileOverId) {
        nearSmile = group.smileIds.indexOf(smileOverId) - 1;
        nearSmile  = nearSmile >= 0 ? this._smiles[group.smileIds[nearSmile]] : null;
    } else if (newMovePosId !== null) {
        nearSmile = this._smiles[newMovePosId];
    }

    /* За высоту подсветки берём высоту меньшего смайлика */
    var nearRect = nearSmile ? nearSmile.groups[this._currentGroupId].getBoundingClientRect() : null;
    if (nearRect && nearRect.height < rect.height) {
        this._dom.dropHint.style.height = nearRect.height + 'px';
    } else {
        this._dom.dropHint.style.height = rect.height + 'px';
    }

    /* Отображаем подсветку */
    if (newMovePosId !== null) {
        smileOver.groups[this._currentGroupId].parentNode.insertBefore(this._dom.dropHint, this._smiles[newMovePosId].groups[this._currentGroupId]);
    } else {
        smileOver.groups[this._currentGroupId].parentNode.appendChild(this._dom.dropHint);
    }
    this._dom.dropHint.style.display = '';
};


/* lazy loading of smiles */


Collection.prototype._lazyNext = function() {
    /* В первую очередь загружаем смайлики текущей категории */
    var categoryId = this._currentGroupId;
    /* Если текущей категории нет и очереди нет, выходим */
    if (categoryId === null && this._lazyCategoriesQueue.length === 0){
        return;
    } else if (categoryId === null){
        categoryId = this._lazyCategoriesQueue[0];
    }
    /* Если категория загружена полностью, берём следующую из очереди, а текущую из неё удаляем */
    var category = this._groups[categoryId];
    while (category.lazyQueue.length === 0) {
        var i = this._lazyCategoriesQueue.indexOf(categoryId);
        if (i >= 0) {
            this._lazyCategoriesQueue.splice(i, 1);
        }
        if (this._lazyCategoriesQueue.length === 0) {
            return;
        }
        categoryId = this._lazyCategoriesQueue[0];
        category = this._groups[categoryId];
    }

    /* Загружаем */
    var smile_id = category.lazyQueue.splice(0, 1)[0];
    var dom = this._smiles[smile_id].groups[categoryId];

    dom.addEventListener('load', this._lazyCallback);
    dom.addEventListener('error', this._lazyCallback);
    this._lazyProcessing++;
    dom.src = dom.dataset.src;
    delete dom.dataset.src;
};


Collection.prototype._lazyLoaded = function(event) {
    event.target.classList.remove('smile-loading');
    this._lazyProcessing--;
    event.target.removeEventListener('load', this._lazyCallback);
    event.target.removeEventListener('error', this._lazyCallback);
    if (this._lazyProcessing < this._lazyStep) {
        setTimeout(this._lazyNext.bind(this), 0);
    }
};


module.exports = Collection;
