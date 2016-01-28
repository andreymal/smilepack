'use strict';

/*
 * Виджет для действий над смайликами с пачкой кнопок и списком категорий.
 */
var ActionPanel = function(collection, actions, options) {
    this.collection = collection;
    this.options = options;
    this._dom = {categorySelectors: {}, buttons: {}};
    this._actions = [];

    /* Основной контейнер, в котором всё лежит */
    if (options.container) {
        this._dom.container = options.container;
        this._dom.smilesCount = options.container.getElementsByClassName(options.smilesClassName || 'smiles-actions-count')[0];
        this._dom.actions = options.container.getElementsByClassName(options.smilesClassName || 'smiles-actions-list')[0];
    } else {
        this._dom.container = document.createElement('div');
        this._dom.container.className = options.className || 'smiles-actions-panel';
    }

    /* Блок с кнопками действий */
    if (!this._dom.actions) {
        this._dom.actions = document.createElement('div');
        this._dom.actions.className = options.smilesClassName || 'smiles-actions-list';
        this._dom.container.appendChild(this._dom.actions);
    }
    this._dom.actions.style.display = 'none';

    /* Собираем кнопки */
    var action, btn;
    for (var i = 0; i < actions.length; i++) {
        action = actions[i];
        if (!action || !action.action || this._actions.indexOf(action.action) >= 0) {
            continue;
        }

        var categorySelector = null;
        if (action.categorySelect) {
            categorySelector = this._dom.actions.getElementsByClassName('smiles-action-select-' + action.action)[0];
            if (!categorySelector) {
                categorySelector = document.createElement('select');
                categorySelector.className = 'smiles-actions-selector smiles-action-select-' + action.action;
                this._dom.actions.appendChild(action.title || action.action);
                this._dom.actions.appendChild(categorySelector);
            } else {
                categorySelector.innerHTML = '';
            }
            this._dom.categorySelectors[action.action] = categorySelector;
        }

        this._actions.push(action.action);
        btn = this._dom.actions.getElementsByClassName('smiles-action-' + action.action)[0];
        if (!btn) {
            btn = document.createElement('button');
            if (options.buttonClassName) {
                btn.className = options.buttonClassName;
            }
            btn.classList.add('smiles-action-' + action.action);
            btn.textContent = action.categorySelect ? 'OK' : (action.title || action.action);
            this._dom.actions.appendChild(btn);
            this._dom.actions.appendChild(document.createElement('br'));
        }
        btn.dataset.action = action.action;
        btn.addEventListener('click', this._onclick.bind(this));
        this._dom.buttons[action] = btn;
    }

    /* Подписываемся на события выделения и изменений в коллекции */
    collection.subscribe('onselect', this._onselect.bind(this));
    collection.subscribe('oncategoryedit', this._oncategoryedit.bind(this));

    /* Рисуем содержимое */
    this.repaintCategories();
    this._smiles = collection.getSelectedSmileIds();
    if (this._smiles.length > 0) {
        this.repaint();
    } else if (options.hideIfEmpty) {
        this._dom.container.style.display = 'none';
    }
};


ActionPanel.prototype.getDOM = function() {
    return this._dom.container;
};


ActionPanel.prototype.repaint = function() {
    if (this.options.hideIfEmpty) {
        this._dom.container.style.display = this._smiles.length > 0 ? '' : 'none';
    }
    this._dom.actions.style.display = this._smiles.length > 0 ? '' : 'none';
    if (this._dom.smilesCount) {
        this._dom.smilesCount.textContent = this._smiles.length.toString();
    }
};


ActionPanel.prototype.repaintCategories = function() {
    var categories = this.collection.getCategoryIdsWithSmiles();
    var options = document.createDocumentFragment();
    var i;

    for (i = 0; i < categories.length; i++) {
        var option = document.createElement('option');
        var level = categories[i][0];
        var id = categories[i][1];
        option.value = level.toString() + ',' + id.toString();
        option.textContent = this.collection.getCategoryInfo(level, id).name || option.value;
        options.appendChild(option);
    }

    for (var action in this._dom.categorySelectors) {
        var oldValue = this._dom.categorySelectors[action].value;
        this._dom.categorySelectors[action].innerHTML = '';
        this._dom.categorySelectors[action].appendChild(options.cloneNode(true));
        if (oldValue) {
            this._dom.categorySelectors[action].value = oldValue;
        }
    }
};


ActionPanel.prototype._onclick = function(event) {
    var btn = event.target || event.srcElement;
    var action = btn.dataset.action;
    var options = {};

    if (this._actions.indexOf(action) < 0) {
        return;
    }

    if (this._dom.categorySelectors[action] && this._dom.categorySelectors[action].value) {
        var cat = this._dom.categorySelectors[action].value.split(',', 2);
        options.categoryLevel = parseInt(cat[0]);
        options.categoryId = parseInt(cat[1]);
    }

    if (this.options.onaction) {
        this.options.onaction(this, action, options);
    }
};


ActionPanel.prototype._onselect = function(options) {
    this._smiles = options.current;
    this.repaint();
};


ActionPanel.prototype._oncategoryedit = function() {
    this.repaintCategories();
};


module.exports = ActionPanel;
