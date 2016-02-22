'use strict';

var dragdrop = require('../dragdrop.js');


/**
 * Виджет с коллекцией смайликов с неограниченным уровнем вложенности.
 * Формат hierarchy: [[атрибут со списком элементов, атрибут с id элемента, человекочитаемое название уровня], ...]
 * @class
 * @param  {Array.<string[]>}  hierarchy
           Уровни категорий
 * @param  {Object}            [options]
           Дополнительные параметры
 * @param  {Object}            [options.classes]
           Позволяет переопределить CSS-классы, используемые для некоторых элементов
 * @param  {HTMLElement}       [options.container=null]
           DOM-элемент, в который будет помещена коллекция; при отсутствии он будет создан и его можно будет получить через getDOM()
 * @param  {boolean}           [options.editable=false]
           При true категории и смайлики могут редактироваться пользователем (добавляются соответствующие DOM-элементы)
 * @param  {number}            [options.lazyStep]
           По сколько смайликов за раз подгружать (по умолчанию для Chrome 15, для других браузеров 3)
 * @param  {string}            [options.message]
           Сообщение по умолчанию, отображаемое под категориями и над смайликами (можно задать через html-код, передав container)
           Обработчик события ondropto (drag&drop бросание смайлика на эту коллекцию)
 * @param  {function[]}        [options.events]
           Обработчики событий, не требующих ответа (onchange, onaction, onselect, oncategoryedit)
 * @param  {function[]}        [options.callbacks]
           Обработчики событий, требующих ответа (onload, onmove, ondropto)
 * @param  {boolean}           [options.selectable=false]
           Можно ли выделять смайлики через ЛКМ
 * @param  {boolean}           [options.selectableDragged=false]
           Можно ли выделять смайлики, помеченные как перемещённые
 * @param  {boolean}           [options.useCategoryLinks=false]
           При true кнопкам категорий со смайликами будут добавлены якоря на их ID
 */
var Collection = function(hierarchy, options) {
    this.hierarchy = hierarchy;
    this._depth = hierarchy.length;

    if (!options.classes) {
        options.classes = {};
    }
    this.options = options;

    var event;
    /* Обработчики, которых может быть несколько */
    this._eventListeners = {
        onchange: [],
        onaction: [],
        onselect: [],
        oncategoryedit: []
    };

    if (options.events) {
        for (event in this._eventListeners) {
            if (this._eventListeners.hasOwnProperty(event) && options.events[event]) {
                this._eventListeners[event].push(options.events[event]);
            }
        }
    }

    /* Обработчики, которые могут быть только по одному и от которых требуется какой-то ответ */
    this._callbacks = {
        onload: null,
        onmove: null,
        ondropto: null
    };

    if (options.callbacks) {
        for (event in this._callbacks) {
            if (this._callbacks.hasOwnProperty(event) && options.callbacks[event]) {
                this._callbacks[event] = options.callbacks[event];
            }
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
    if (this._depth > 0) {
        this._dom.rootCategories = this._buildDomTabs(0, 0);
        this._dom.rootCategories.style.display = '';
    }
};


/**
 * Возвращает корневой DOM-элемент коллекции для его добавления на страницу.
 * @return {HTMLElement}
 */
Collection.prototype.getDOM = function() {
    return this._dom.container;
};


/* Collection management */


/**
 * Устанавливает функцию, вызывающуюся при событии, которое требует ответа (onmove, ondropto).
 * @param  {string}   event    Название события
 * @param  {function} callback Функция, которая будет вызвана, когда событие случится
 */
Collection.prototype.setCallback = function(event, callback) {
    if (this._callbacks[event] === undefined) {
        throw new Error("Unknown event " + event);
    }
    this._callbacks[event] = callback;
};


/**
 * Подписка на какое-либо из событий.
 * @param  {string}   event    Название события
 * @param  {function} callback Функция, которая будет вызвана, когда событие случится
 */
Collection.prototype.subscribe = function(event, callback) {
    if (this._eventListeners[event] === undefined) {
        throw new Error("Unknown event " + event);
    }
    this._eventListeners[event].push(callback);
};


/**
 * Вызывает все функции, подписавшиеся на событие. В качестве this выступает сам объект коллекции.
 * @param  {string} event Событие, подписчики которого будут вызваны
 * @param  {Array}  args  Аргументы, которые будут переданы вызываемым функциям
 */
Collection.prototype.callListeners = function(event, args) {
    var funcs = this._eventListeners[event];
    for (var i = 0; i < funcs.length; i++) {
        funcs[i].apply(this, args);
    }
};


/**
 * Создаёт категории согласно переданной иерархии.
 * @param  {Object} items
 */
Collection.prototype.loadData = function(items) {
    this._loadDataLevel(items[this.hierarchy[0][0]], 0, 0);
};


/**
 * @return {boolean} true, если блок с вкладками категорий отображается
 */
Collection.prototype.isTabsVisible = function() {
    return this._dom.tabsContainer.style.display != 'none';
};


/**
 * Показывает или скрывает блок с вкладками категорий
 * @param {boolean} visible
 */
Collection.prototype.setTabsVisibility = function(visible) {
    this._dom.tabsContainer.style.display = visible ? '' : 'none';
};


/**
 * @return {boolean} Если установлен класс smiles-processing, возвращает true
 */
Collection.prototype.getLoadingVisibility = function() {
    return this._dom.container.classList.contains('smiles-processing');
};


/**
 * Устанавливает или убирает класс smiles-processing, который используется для обозначения подгрузки смайликов.
 */
Collection.prototype.setLoadingVisibility = function(isLoading) {
    if (this._dom.container.classList.contains('smiles-processing') !== isLoading) {
        this._dom.container.classList.toggle('smiles-processing');
    }
};


Collection.prototype.getLastInternalIds = function() {
    return [this._lastIds, this._lastCreatedSmileId];
};


Collection.prototype.setLastInternalIds = function(lastIds, lastSmileId) {
    for (var i = 0; i < this._depth; i++) {
        this._lastIds[i] = parseInt(lastIds[i], 10);
    }
    this._lastCreatedSmileId = parseInt(lastSmileId, 10);
};


/* Categories and groups management */


/**
 * Создаёт новую категорию. Нумерация категорий на разных уровнях независима друг от друга.
 * @param  {number} level              Уровень, на котором нужно добавить категорию
 * @param  {?number} parentId          ID родительской категории (должна находиться на уровне level - 1;
                                       если уровень 0, то родителя нет и аргумент игнорируется)
 * @param  {Object} item               Объект с информацией о категории
 * @param  {number} [item.id]          ID категории (при отсутствии сгенерируется автоматически отрицательное число)
 * @param  {string} item.name          Название категории
 * @param  {string} [item.description] Описание категории
 * @param  {Object} [item.icon]        Иконка категории
 * @param  {number} item.icon.id       ID иконки
 * @param  {string} item.icon.url      Ссылка на изображение иконки
 * @return {?number}                   ID созданной категории или null в случае проблем
 */
Collection.prototype.addCategory = function(level, parentId, item) {
    var parentLevel = level - 1;
    var parent = level > 0 ? this._categories[parentLevel][parentId] : null;
    if (level > 0 && !parent) {
        return null;
    }

    var id = item.id;
    if (id === undefined || id === null) {
        this._lastIds[level]--;
        id = this._lastIds[level];
    }

    this._categories[level][id] = {
        id: id,
        parentId: level > 0 ? parentId : null,
        level: level,
        name: item.name,
        description: item.description,
        empty: item.empty ? true : false,
        dom: null,
        childrenDom: null,
        iconId: item.icon ? item.icon.id : -1,
        iconUrl: item.icon ? item.icon.url : null,
        childrenIds: level + 1 < this._depth ? [] : null,
        groupId: null
    };
    this._buildCategoryDom(level, id, true);

    this.callListeners('oncategoryedit', {categoryLevel: level, categoryId: id, added: true, removed: false});

    return id;
};


/**
 * Редактирует категорию.
 * @param  {number} level      Уровень, на котором находится категория
 * @param  {number} categoryId ID категории
 * @param  {Object} item       Объект с новой информацией о категории (можно передать только изменяемые поля категории, необязательно все),
                               формат аналогичен формату в addCategory
 * @return {?number}           ID категории или null в случае проблем
 */
Collection.prototype.editCategory = function(level, categoryId, item) {
    if (level < 0 || level >= this._depth || !this._categories[level][categoryId]) {
        return null;
    }
    var category = this._categories[level][categoryId];

    if (item.hasOwnProperty('name')) {
        category.name = item.name;
    }
    if (item.hasOwnProperty('description')) {
        category.description = item.description;
    }
    if (item.hasOwnProperty('empty')) {
        category.empty = item.empty ? true : false;
    }
    if (item.hasOwnProperty('icon')) {
        category.iconId = item.icon ? item.icon.id : -1;
        category.iconUrl = item.icon ? item.icon.url : null;
    }

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


/**
 * Перемещает категорию перед другой категорией или после всех.
 * @param  {number} level           Уровень, на котором находится перемещаемая категория
 * @param  {number} categoryId      ID перемещаемой категории
 * @param  {number} [beforeId=null] ID категории, перед которой поместить перемещаемую, или null, если после всех
 * @return {boolean}                true при успехе
 */
Collection.prototype.moveCategory = function(level, categoryId, beforeId) {
    if (level < 0 || level >= this._depth) {
        return false;
    }
    var category = this._categories[level][categoryId];
    if (!category) {
        return false;
    }
    var before = this._categories[level][beforeId];
    if (before !== undefined && before !== null && !before) {
        return false;
    }
    if (before && before.id === category.id) {
        return true;
    }
    if (before && before.parentId !== category.parentId) {
        return false;
    }
    var parent = level > 0 ? this._categories[level - 1][category.parentId] : null;

    var childrenIds = parent ? parent.childrenIds : this._rootChildren;
    childrenIds.splice(childrenIds.indexOf(category.id), 1);
    if (before) {
        childrenIds.splice(childrenIds.indexOf(before.id), 0, category.id);
    } else {
        childrenIds.push(category.id);
    }

    var childrenDom = parent ? parent.childrenDom : this._dom.rootCategories;
    if (before) {
        childrenDom.insertBefore(category.dom, before.dom);
    } else {
        childrenDom.appendChild(category.dom);
    }

    return true;
};


/**
 * Удаляет категорию, связанную с ней группу и все дочерние категории (при их наличии).
 * @param  {number} level      Уровень, на котором находится удаляемая категория
 * @param  {number} categoryId ID удаляемой категории
 * @return {?number[]}         ID смайликов, которые были привязаны к категориям, или null в случае проблем
 */
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
        this.selectCategory(level, null);
    }

    if (this._currentCategory && this._currentCategory[0] == level && this._currentCategory[1] == categoryId) {
        this._showGroupNow(null);
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


/**
 * Создаёт группу смайликов.
 * @param  {Object} item                               Объект группы
 * @param  {string} [item.openedClass='smiles-opened'] CSS-класс, который будет добавлен к DOM коллекции, когда эта группа будет отображена
 * @param  {string} [item.description='']              Описание группы
 * @return {number}                                    ID созданной группы
 */
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


/**
 * Создаёт группу смайликов для категории.
 * @param  {number} categoryLevel Уровень, на котором находится категория, для которой создаётся группа
 * @param  {number} categoryId    ID категории
 * @param  {Object} [item]        Объект группы, формат аналогичен формату в функции createGroup
 * @return {?number}              ID созданной группы или null в случае проблем
 */
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


/**
 * Удаляет группу. Все смайлики, входящие в группу отвязываются от неё, но не удаляются.
 * @param  {number} groupId ID группы
 * @return {?number[]}      Массив ID смайликов группы или null в случае проблем
 */
Collection.prototype.removeGroup = function(groupId) {
    var group = this._groups[groupId];
    if (!group) {
        return null;
    }

    if (this._currentGroupId === group.id) {
        this.showGroup(null);
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


/**
 * Выбирает категорию и обновляет отображение в блоке категорий.
 * Если категория привязана к группе, то она тоже отображается.
 * Но если в группе нет смайликов и она ни разу не отображалась, то будет вызван callbacks.onload, а отображение отложено.
 * Вызванная функция должна будет повторить вызов selectCategory или selectGroup после добавлния смайликов.
 * @param  {number}  level         Уровень, на котором находится категория
 * @param  {number}  categoryId    ID категории
 * @param  {boolean} [force=false] При true пустая группа вместо вызова callbacks.onload отображается немедленно
 * @return {boolean}               true при успешном переключении (в том числе отложенном)
 */
Collection.prototype.selectCategory = function(level, categoryId, force) {
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
        this.selectCategory(level - 1, category.parentId);
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
        this.showGroup(category.groupId, force);
    }

    /* Для последнего уровня подсветим ещё категорию, смайлики которой сейчас отображаются */
    if (level + 1 === this._depth - 1 && this._currentCategory !== null && this._currentCategory[0] === level + 1) {
        this._categories[level + 1][this._currentCategory[1]].dom.classList.add('tab-btn-active');
    }

    return true;
};


/**
 * Отображает смайлики указанной категории. Обёртка над showGroup.
 * @param  {number}  level         Уровень, на котором находится категория
 * @param  {number}  categoryId    ID категории
 * @param  {boolean} [force=false] При true пустая группа вместо вызова callbacks.onload отображается немедленно
 * @return {boolean}               true при успехе
 */
Collection.prototype.showCategory = function(level, categoryId, force) {
    if (categoryId === undefined || categoryId === null) {
        return this._showGroupNow(null);
    }

    if (isNaN(level) || level < 0 || level >= this._depth) {
        return false;
    }
    var category = this._categories[level][categoryId];
    if (!category || category.groupId === null) {
        return false;
    }

    return this.showGroup(category.groupId, force);
};


/**
 * Отображает группу смайликов.
 * Если в группе нет смайликов и она ни разу не отображалась, то будет вызван callbacks.onload, а отображение отложено с возвратом true.
 * @param  {number}  groupId       ID отображаемой группы
 * @param  {boolean} [force=false] При true пустая группа вместо вызова callbacks.onload отображается немедленно
 * @return {boolean}               true при успешном переключении
 */
Collection.prototype.showGroup = function(groupId, force) {
    if (groupId === undefined || groupId === null) {
        return this._showGroupNow(null);
    }

    var group = this._groups[groupId];
    if (!group) {
        return false;
    }

    /* Если смайлики группы не загружены, запрашиваем их */
    if (!group.dom && group.smileIds.length < 1 && !force && this._callbacks.onload) {
        var options = {groupId: group.id};
        if (group.categoryId !== null) {
            options.categoryLevel = group.categoryLevel;
            options.categoryId = group.categoryId;
        }

        /* Отправляем запрос на загрузку */
        if (this._callbacks.onload(this, options)) {
            /* Если он принят, то создаём видимость загрузки */
            this.setLoadingVisibility(true);
            if (this._currentGroupId === null) {
                this._dom.message.textContent = group.description || '';
            }
            return true;
        } /* Если не принят, то далее отображаем пустую группу */
    }

    /* Убираем выделение у кнопки категории, если таковая была установлена */
    var cat = this._currentCategory;
    if (cat !== null) {
        this._categories[cat[0]][cat[1]].dom.classList.remove('tab-btn-active');
        if (this._selectedIds[this._depth - 1] === cat[1]) {
            this._selectedIds[this._depth - 1] = null;
        }
    }

    /* Отображаем группу */
    if (!this._showGroupNow(group.id)) {
        return false;
    }

    /* Добавляем выделение у кнопки новой категории */
    if (group.categoryId !== null) {
        this._categories[group.categoryLevel][group.categoryId].dom.classList.add('tab-btn-active');
    }

    return true;
};


/**
 * Возвращает информацию о категории.
 * @param  {number}  level                          Уровень, на котором находится категория
 * @param  {number}  categoryId                     ID категории
 * @param  {Object}  [options]                      Дополнительные параметры возвращаемого объекта
 * @param  {boolean} [options.withoutIconUrl=false] Не добавлять url в поле icon
 * @param  {boolean} [options.short=false]          Не добавлять уровень категории
 * @param  {boolean} [options.withoutIds=false]     Не добавлять ID категории
 * @param  {boolean} [options.withGroupId=false]    Добавить ID группы, к которой привязана категория
 * @return {?Object}                                Объект с информацией о группе (name, description, icon) или null в случае проблем
 */
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
    if (options && options.withParent) {
        info.parentId = category.parentId;
    }

    return info;
};


/**
 * Возвращает ID категорий, привязанных к группам (возможно пустым).
 * @return {Array.<id[]>} Массив категорий в формате [level, id]
 */
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


/**
 * Возвращает категории с учётом иерархии.
 * @param  {Object} [options] Дополнительные параметры, передаваемые в getCategoryInfo
 * @return {Object[]}         Массив категорий верхнего уровня (у каждой есть поле с потомками, названное согласно hierarchy)
 */
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


/**
 * Возвращает ID всех существующих категорий по уровням.
 * @return {Array<number[]>}
 */
Collection.prototype.getCategoryIds = function() {
    var result = [];
    var parse = function(x) {return parseInt(x, 10);};
    for (var i = 0; i < this._categories.length; i++){
        var ids = Object.keys(this._categories[i]).map(parse);
        result.push(ids);
    }
    return result;
};


/**
 * Возвращает ID категорий-потомков указанной.
 * При level=0 возвращает категории верхнего уровня и parentId игнорируется.
 * Если категория не существует или не может иметь потомков (самый нижний уровень), возвращается null.
 * @param  {number}  level    Уровень, с которого надо получить ID категорий
 * @param  {number}  parentId ID родительской категории
 * @return {?number[]}
 */
Collection.prototype.getCategoryChildrenIds = function(level, parentId) {
    if (level === undefined || level === null || isNaN(level) || level < 0 || level >= this._depth) {
        return null;
    }

    if (level === 0) {
        return this._rootChildren.slice();
    }

    var category = this._categories[level - 1][parentId];
    if (!category) {
        return null;
    }

    return category.childrenIds !== null ? category.childrenIds.slice() : null;
};


/**
 * Возвращает ID категории, выбранной на данном уровне в блоке категорий.
 * Может не совпадать с категорией, смайлики которой отобржаются в данный момент (если отображаются).
 @param  {number} level
 @return {?number}
 */
Collection.prototype.getSelectedCategory = function(level) {
    return this._selectedIds[level];
};


/**
 * Возвращает уровень и ID отображаемой сейчас категории со смайликами.
 * Может не совпадать с категорией, выделенной в блоке категорий.
 * @return {?number[]}
 */
Collection.prototype.getCurrentCategory = function() {
    if (this._currentCategory === null) {
        return null;
    }
    return [this._currentCategory[0], this._currentCategory[1]];
};


/**
 * Возвращает ID отображаемой сейчас группы смайликов.
 * @return {?number}
 */
Collection.prototype.getCurrentGroupId = function() {
    return this._currentGroupId;
};


/**
 * Возвращает ID группы, к которой привязана категория (или null, если не привязана).
 @param  {number} level      Уровень, на котором находится категория
 @param  {number} categoryId ID категории
 @return {?number} ID группы
 */
Collection.prototype.getGroupOfCategory = function(level, categoryId) {
    if (level === undefined || level === null || isNaN(level) || level < 0 || level >= this._depth) {
        return null;
    }
    var category = this._categories[level][categoryId];
    return category ? category.groupId : null;
};


/**
 * Возвращает ID родительской категории.
 @param  {number} level      Уровень, на котором находится категория, родителя которой выясняем
 @param  {number} categoryId ID категории
 @return {?number}           ID категории или null, если категория на самом верхнем уровне
 */
Collection.prototype.getParentId = function(level, categoryId) {
    if (level === undefined || level === null || isNaN(level) || level < 0 || level >= this._depth) {
        return null;
    }
    if (!this._categories[level][categoryId]) {
        return null;
    }
    return this._categories[level][categoryId].parentId;
};


/**
 * Возвращает true, если категория инициализирована (содержит смайлики или принудительно отображена без смайликов).
 * При отсутствии категории или группы, привязанной к категории, возвращает null.
 * Обёртка над isGroupLoaded.
 * @param  {number}  level         Уровень, на котором находится категория
 * @param  {number}  categoryId    ID категории
 * @return {?boolean}
 */
Collection.prototype.isCategoryLoaded = function(level, categoryId) {
    if (isNaN(level) || level < 0 || level >= this._depth) {
        return null;
    }
    var category = this._categories[level][categoryId];
    if (!category || category.groupId === null) {
        return null;
    }

    return this.isGroupLoaded(category.groupId);
};


/**
 * Возвращает true, если группа инициализирована (содержит смайлики или принудительно отображена без смайликов).
 * @param  {number}   groupId ID группы
 * @return {?boolean}
 */
Collection.prototype.isGroupLoaded = function(groupId) {
    var group = this._groups[groupId];
    if (!group) {
        return null;
    }
    return Boolean(group.dom || group.smileIds.length > 0);
};


/* Smiles management */


/**
 * Добавляет смайлик (с привязкой к группе или без).
 * @param  {Object}   item
 * @param  {number}   [item.id]             ID смайлика, при отсутствии автоматически задаётся отрицательное число
 * @param  {string}   item.url              Ссылка на изображение
 * @param  {number}   item.w                Ширина изображения в пикселях
 * @param  {number}   item.h                Высота изображения в пикселях
 * @param  {string}   [item.description=''] Описание смайлика
 * @param  {string[]} [item.tags=[]]        Теги смайлика
 * @param  {boolean}  [item.dragged=false]  true, если смайлик перемещён
 * @param  {boolean}  [item.selected=false] true, если смайлик выделен
 * @param  {number[]} [item.groupIds]       ID групп, в которые добавить смайлик (должен быть пустым при добавлении в категорию)
 * @param  {number}   [item.categoryLevel]  Уровень категории, в который добавить смайлик
 * @param  {number}   [item.categoryId]     ID категории, в который добавить смайлик
 * @param  {Object}   [item.raw]            Любой объект, который будет сохранён как есть, для хранения данных. Если не указан, берётся сам item
 * @param  {boolean}  [nolazy=false]        Если true, то атрибут src картинки будет установлен сразу же
           (по умолчанию откладывается на потом, чтобы Firefox не зависал)
 * @return {?number}                        ID смайлика или null в случае проблем
 */
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
        categoryLevel: null,
        categoryId: null,
        url: item.url,
        description: item.description,
        tags: item.tags || [],
        width: item.w,
        height: item.h,
        dragged: item.dragged || false,
        selected: item.selected || false,
        raw: item.hasOwnProperty('raw') ? item.raw : item
    };

    /* Добавляем в группы (привязка к категории здесь же) */
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

/**
 * Редактирует смайлик, если он существует. Все параметры аналогичны параметрам addSmile, только raw не устанавливается автоматически.
 * @param  {Object}   item
 * @param  {number}   [item.id]  ID смайлика, который нужно отредактировать
 * @return {boolean}             true при успехе
 */
Collection.prototype.editSmile = function(item) {
    var smile = this._smiles[item.id];
    if (!smile) {
        return false;
    }

    var updateDom = false;
    if (item.hasOwnProperty('w')) {
        smile.width = item.w;
        updateDom = true;
    }
    if (item.hasOwnProperty('h')) {
        smile.height = item.h;
        updateDom = true;
    }
    if (item.hasOwnProperty('url')) {
        smile.url = item.url;
        updateDom = true;
    }
    if (item.hasOwnProperty('description')) {
        smile.description = item.description || '';
        updateDom = true;
    }
    if (item.hasOwnProperty('tags')) {
        smile.tags = item.tags || [];
        updateDom = true;
    }

    if (updateDom) {
        for (var groupId in smile.groups) {
            var img = smile.groups[groupId];
            if (img) {
                img.src = smile.url;
                img.width = smile.width;
                img.height = smile.height;
                img.title = item.description || item.tags.join(", ") || item.url;
            }
        }
    }


    if (item.hasOwnProperty('dragged')) {
        this.setDragged(smile.id, item.dragged);
    }
    if (item.hasOwnProperty('selected')) {
        this.setSelected(smile.id, item.selected);
    }
    if (item.hasOwnProperty('raw')) {
        smile.raw = item.raw;
    }

    // TODO: category, groups
    return true;
};


/**
 * Добавляет смайлик, если он ещё не существует (проверка по id и url).
 * Если указанного id коллекция не знает, то создаётся новый смайлик и возвращается его id.
 * Если id и url совпадают с существующим смайликом, возвращается его id, а смайлик добавляется в недостающие категории и группы.
 * Если id указан, но url не совпадает с url существующего смайлика, то выбрасывается исключение (Conflict).
 * Аргументы аналогичны addSmile.
 * @param  {Object}  item
 * @param  {boolean} [nolazy=false]
 * @return {?number} ID нового или существующего смайлика или null при проблемах (кроме конфликта)
 */
Collection.prototype.addSmileIfNotExists = function(item, nolazy) {
    if (item.id !== undefined && item.id !== null && this._smiles[item.id]) {
        if (this._smiles[item.id].url !== item.url) {
            throw new Error('Conflict');
        }
        if (item.categoryLevel !== undefined && item.categoryId !== undefined) {
            this.addSmileToCategory(item.id, item.categoryLevel, item.categoryId);
        } else if (item.groupIds && item.groupIds.length > 0) {
            for (var i = 0; i < item.groupIds.length; i++) {
                this.addSmileToGroup(item.id, item.groupIds[i], nolazy);
            }
        }
        return item.id;
    }
    return this.addSmile(item, nolazy);
};


/**
 * Добавляет смайлик в указанную группу смайликов.
 * @param  {number} smileId         ID смайлика
 * @param  {number} groupID         ID группы
 * @param  {boolean} [nolazy=false] Если true, то атрибут src картинки будет установлен сразу же
 * @return {boolean}                true при успехе
 */
Collection.prototype.addSmileToGroup = function(smileId, groupId, nolazy) {
    var smile = this._smiles[smileId];
    var group = this._groups[groupId];
    if (!smile || !group) {
        return false;
    }
    if (smile.groups[group.id] !== undefined) { // can be null
        return true;
    }

    smile.groups[group.id] = null;
    group.smileIds.push(smile.id);
    if (group.categoryId !== null) {
        smile.categoryLevel = group.categoryLevel;
        smile.categoryId = group.categoryId;
        if (this._categories[group.categoryLevel][group.categoryId].empty) {
            this.editCategory(group.categoryLevel, group.categoryId, {empty: false});
        }
    }
    if (group.dom) {
        this._addSmileDom(smile.id, group.id, nolazy);
    }
    return true;
};


/**
 * Добавляет смайлик в указанную категорию (привязанную к группе). Обёртка над addSmileToGroup.
 * @param  {number} smileId         ID смайлика
 * @param  {number} categoryLevel   Уровень, на котором находится категория
 * @param  {number} categoryID      ID категории
 * @param  {boolean} [nolazy=false] Если true, то атрибут src картинки будет установлен сразу же
 * @return {boolean}                true при успехе
 */
Collection.prototype.addSmileToCategory = function(smileId, categoryLevel, categoryId, nolazy) {
    var smile = this._smiles[smileId];
    var category = this._categories[categoryLevel][categoryId];
    if (!smile || !category || category.groupId === null) {
        return false;
    }
    if (!this.addSmileToGroup(smile.id, category.groupId, nolazy)) {
        return false;
    }
    return true;
};


/**
 * Полностью удаляет смайлик из коллекции, с отвязыванием от всех групп.
 * @param  {number} id ID удаляемого смайлика
 * @return {boolean}   true при успехе
 */
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
    // FIXME: lazy queue?

    return true;
};


/**
 * Полностью удаляет смайлики из коллекции, с отвязыванием от всех групп.
 * @param  {number[]} smileIds ID удаляемых смайликов
 * @return {number[]}          ID успешно удалённых смайликов
 */
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


/**
 * Отвязывает смайлик от указанной группы.
 * @param  {number} id      ID смайлика
 * @param  {number} groupId ID группы
 * @return {?number}        При успехе — число групп, к которым смайлик всё ещё привязан (при 0 может быть смысл в вызове removeSmile)
 */
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
        if (group.smileIds.length === 0 && !this._categories[smile.categoryLevel][smile.categoryId].empty) {
            this.editCategory(smile.categoryLevel, smile.categoryId, {empty: true});
        }
        smile.categoryLevel = null;
        smile.categoryId = null;
    }

    return Object.keys(smile.groups).length;
};


/**
 * @param  {number} smileId
 * @return {boolean} true, если смайлик с таким ID существует
 */
Collection.prototype.hasSmile = function(smileId) {
    return this._smiles[smileId] !== undefined;
};


/**
 * Возвращает объект с информацией о смайлике.
 * @param  {number}  smileId                    ID смайлика
 * @param  {Object}  [options]                  Дополнительные опции
 * @param  {boolean} [options.withoutIds=false] Не добавлять ID смайлика
 * @param  {boolean} [options.withParent=false] Добавить уровень и ID родительской категории и все группы
 * @param  {boolean} [options.withRaw=false]    Добавить объект raw, указанный при создании смайлика
 * @return {Object}
 */
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
    if (options && options.withRaw) {
        info.raw = smile.raw;
    }

    return info;
};


/**
 * Возвращает объект raw смайлика при его наличии.
 * @param  {number}  smileId ID смайлика
 * @return {?Object}
 */
Collection.prototype.getSmileRaw = function(smileId) {
    var smile = this._smiles[smileId];
    if (!smile) {
        return null;
    }
    return smile.raw;
};


/**
 * Возвращает ID смайлика по HTML-элементу. (Проверка через dataset.id)
 * @param  {HTMLElement} element HTML-элемент смайлика
 * @return {?number}             ID смайлика, если этот элемент в самом деле принадлежит смайлику
 */
Collection.prototype.getSmileIdByDom = function(element) {
    if (!element || !this._dom.smilesContainer.contains(element) || !element.classList.contains('smile')) {
        return null;
    }
    var smile = this._smiles[parseInt(element.dataset.id)];
    return smile ? smile.id : null;
};


/**
 * Возвращает ID смайликов категории. Обёртка над getSmileIds.
 * @param  {number} level      Уровень, на котором находится категория
 * @param  {number} categoryId ID категории
 * @return {?number[]}         Массив с ID смайликов или null при проблемах
 */
Collection.prototype.getSmileIdsOfCategory = function(level, categoryId) {
    if (!this._categories[level][categoryId]) {
        return null;
    }
    return this.getSmileIds(this._categories[level][categoryId].groupId);
};


/**
 * Возвращает ID смайликов группы.
 * @param  {number} groupId ID группы
 * @return {?number[]}      Массив с ID смайликов или null при проблемах
 */
Collection.prototype.getSmileIds = function(groupId) {
    if (!this._groups[groupId]) {
        return null;
    }
    return Array.prototype.slice.apply(this._groups[groupId].smileIds);
};


/**
 * Возвращает количество смайликов категории. Обёртка над getSmilesCount.
 * @param  {number} level      Уровень, на котором находится категория
 * @param  {number} categoryId ID категории
 * @return {?number}           Количество смайликов или null при проблемах
 */
Collection.prototype.getSmilesCountOfCategory = function(level, categoryId) {
    if (!this._categories[level][categoryId]) {
        return null;
    }
    return this.getSmilesCount(this._categories[level][categoryId].groupId);
};


/**
 * Возвращает количество смайликов группы.
 * @param  {number} groupId ID группы
 * @return {?number}        Количество смайликов или null при проблемах
 */
Collection.prototype.getSmilesCount = function(groupId) {
    if (!this._groups[groupId]) {
        return null;
    }
    return this._groups[groupId].smileIds.length;
};


/**
 * Возвращает ID выделенных смайликов. Все принадлежат отображаемой сейчас группе, потому что выделять скрытые смайлики нельзя.
 * @return {number[]} ID выделенных смайликов
 */
Collection.prototype.getSelectedSmileIds = function() {
    return Array.prototype.slice.apply(this._selectedSmileIds);
};


/**
 * Возвращает ID смайликов, рассортированные по категориям.
 * @param  {number} [level] Уровень категорий, смайлики которой забираем (по умолчанию последний уровень как чаще всего используемый)
 * @return {Object}         Объект {categoryId: smileId, ...}
 */
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


/**
 * Возвращает ID смайликов, принадлежащих категориям указанного уровня.
 * @param  {number} [level] Уровень категорий, смайлики которой забираем (по умолчанию последний уровень как чаще всего используемый)
 * @return {number[]}       ID смайликов
 */
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


/* Smiles moving and selection */


/**
 * Перемещает смайлик перед другим смайликом (или после всех) в пределах группы.
 * @param  {number}  smileId       ID перемещаемого смайлика
 * @param  {?number} beforeSmileId ID смайлика, перед которым поместить (null — поместить после всех)
 * @param  {number}  groupId       Группа, внутри которой двигаем смайлик
 * @return {boolean}               true при успехе (в т.ч. если смайлик перемещён в то же место, где и был)
 */
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


/**
 * @param  {number}  id ID смайлика
 * @return {boolean}    true, если смайлик помечен как перемещённый (drag&drop)
 */
Collection.prototype.getDragged = function(id) {
    var smile = this._smiles[id];
    return smile ? smile.dragged : null;
};


/**
 * Помечает смайлик как перемещённый (используется в drag&drop).
 * Может автоматически меняться при начале перетаскивания мышью и завершении анимации в конце перетаскивания.
 * @param  {number}  id      ID смайлика
 * @param  {boolean} dragged Перемещён или нет
 * @return {boolean}         true при успехе (в т.ч. если статус не поменялся)
 */
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
        if (smile.dragged && smile.selected && !this.options.selectableDragged) {
            this.setSelected(id, false);
        }
    }
    return true;
};


/**
 * @param  {number} id ID смайлика
 * @return {boolean} Выделен ли смайлик
 */
Collection.prototype.getSelected = function(id) {
    var smile = this._smiles[id];
    return smile ? smile.selected : null;
};


/**
 * Выделяет смайлик или снимает выделение. Только в пределах отображаемой сейчас группы.
 * @param  {number}  id       ID смайлика
 * @param  {boolean} selected выделен/не выделен
 * @return {boolean}          true при успхе (в т.ч. если статус не поменялся)
 */
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


/**
 * Переключает выделение смайлика на противоположное (вкл/выкл).
 * @param  {number}  id ID смайлика
 * @return {boolean}    true при успхе
 */
Collection.prototype.toggleSelected = function(id) {
    var smile = this._smiles[id];
    if (!smile) {
        return false;
    }
    return this.setSelected(smile.id, !smile.selected);
};


/**
 * Выделяет все смайлики отображаемой группы.
 * @param  {boolean} [withDragged=false] Выделять ли перемещённые смайлики (options.selectableDragged игнорируется)
 * @return {boolean}                     true при успехе
 */
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


/**
 * Убирает выделение со всех смайликов.
 * @return {boolean} true при успехе (false если нет отображаемой группы или нет выделенных смайликов)
 */
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


/**
 * Возвращает ID смайлика, перед которым будет помещён перемещаемый.
 * @return {?number} ID смайлика или, если ничего не перемещается или после всех, null
 */
Collection.prototype.getDropPosition = function() {
    return this._smileMovePosId;
};


/**
 * Возвращает информацию о DOM-элементе, если возможно. О смайлике: type='smile', id, groupId
 * @param  {HTMLElement} element Элемент
 * @return {Object} Объект с информацией
 */
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
    if (item.empty) {
        btn.classList.add('tab-btn-empty');
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
        if (level < this._depth - 1) {
            item.childrenDom = this._buildDomTabs(level + 1, categoryId);
        }
        if (level > 0) {
            var parent = this._categories[level - 1][item.parentId];
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


Collection.prototype._showGroupNow = function(groupId) {
    this.setLoadingVisibility(false);
    if (this._currentGroupId === groupId) {
        return true;
    }

    /* Прибираем за предыдущей группой */
    var currentGroup = null;
    if (this._currentGroupId !== null) {
        currentGroup = this._groups[this._currentGroupId];
        this.deselectAll();
        currentGroup.dom.style.display = 'none';
        this._dom.container.classList.remove(currentGroup.openedClass);
    }

    /* Если новой группы нет, то прячем всё до конца */
    if (groupId === undefined || groupId === null) {
        if (currentGroup !== null) {
            this._currentGroupId = null;
            this._currentCategory = null;
            this._dom.message.textContent = '';
        }
        return true;
    }

    var group = this._groups[groupId];

    /* Если новую группу открывают первый раз, то собираем DOM */
    if (!group.dom) {
        group.dom = document.createElement('div');
        group.dom.className = 'smiles-list';
        group.dom.dataset.groupId = group.id;
        this._dom.smilesContainer.appendChild(group.dom);

        for (var i = 0; i < group.smileIds.length; i++) {
            this._addSmileDom(group.smileIds[i], group.id);
        }
    }

    /* Показываем */
    group.dom.style.display = '';
    this._dom.container.classList.add(group.openedClass);
    this._dom.message.textContent = group.description || '';

    /* Запоминаем, что показали */
    this._currentGroupId = group.id;
    /* Если группа привязана к категории, то её тоже запоминаем */
    if (group.categoryId !== null) {
        this._currentCategory = [group.categoryLevel, group.categoryId];
    } else {
        this._currentCategory = null;
    }

    /* Собираем информацию для уведомления и уведомляем */
    var options = {groupId: group.id};
    if (this._currentCategory !== null) {
        options.categoryLevel = this._currentCategory[0];
        options.categoryId = this._currentCategory[1];
    }
    this.callListeners('onchange', [options]);

    return true;
};


Collection.prototype._addSmileDom = function(smile_id, groupId, nolazy) {
    var item = this._smiles[smile_id];
    var group = this._groups[groupId];
    if (item.groups[groupId] || group.smileIds.indexOf(item.id) < 0) {
        return false;
    }

    var img = document.createElement('img');
    img.alt = "";
    img.title = item.description || item.tags.join(', ') || item.url;
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
            if (group.smileIds.length === 0 && group.categoryId !== null) {
                this.editCategory(group.categoryLevel, group.categoryId, {empty: true});
            }
        }
    }
    delete this._smiles[id];
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
        var item = {};
        for (var prop in items[i]) {
            if (!items[i].hasOwnProperty(prop)) {
                continue;
            }
            if (prop == 'smiles_count' && !item.hasOwnProperty('empty')) {
                item.empty = items[i].smiles_count === 0;
            } else {
                item[prop] = items[i][prop];
            }
        }
        item_id = this.addCategory(level, parent_id, item);

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
        if (!this.selectCategory(categoryLevel, categoryId)) {
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
        var actualBeforeId = smileMovePosId;
        if (smileMovePosId === null) {
            var lastSmile = this._smiles[group.smileIds[group.smileIds.length - 1]];
            var rect = lastSmile.groups[this._currentGroupId].getBoundingClientRect();
            if (!(options.y >= rect.bottom || options.y >= rect.top && options.x >= rect.left)) {
                actualBeforeId = smile.id;
            }
        } else if (smile.id === smileMovePosId) {
            actualBeforeId = smile.id;
        }

        var action = {name: 'move', beforeId: actualBeforeId};
        if (this._callbacks.onmove) {
            action = this._callbacks.onmove({
                container: this,
                smileId: smile.id,
                beforeId: actualBeforeId
            }) || action;
        }

        if (action.name === 'move') {
            if (action.beforeId !== smile.id) {
                this.moveSmile(smile.id, action.beforeId);
            }
        } else if (action.name !== 'nothing') {
            throw new Error('Unknown action ' + action.name);
        }

        return null;
    }

    /* Что делать при перетаскивании DOM-элементов (включая смайлики) между ними, решает владелец коллекции */
    /* Коллекция руководит только сама собой, но не взаимодействием с другими коллекциями */
    if (!this._callbacks.ondropto) {
        return null;
    }
    var dropAction = this._callbacks.ondropto({
        sourceContainerElement: options.sourceContainer,
        targetContainer: this,
        element: options.element,
        overlay: options.overlay,
        dropPosition: smileMovePosId
    });
    if (dropAction && dropAction.name == 'animateToSmile') {
        var elem = this._smiles[dropAction.id].groups[this._currentGroupId];
        if (elem) {
            return {name: 'animate', targetElement: elem};
        }
        this.setDragged(dropAction.id, false);
        return {name: 'fadeOut'};
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
