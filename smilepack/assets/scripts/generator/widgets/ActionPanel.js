'use strict';

/*
 * Виджет для действий над смайликами с пачкой кнопок и списком категорий.
 */
var ActionPanel = function(collection, actions, options) {
    this.collection = collection;
    this.options = options;
    this._dom = {};
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
    this._dom.buttons = {};
    var action, title, btn;
    for (var i = 0; i < actions.length; i++) {
        action = actions[i][0];
        title = actions[i][1] || action;
        if (!action || this._actions.indexOf(action) >= 0) {
            continue;
        }

        this._actions.push(action);
        btn = this._dom.actions.getElementsByClassName('smiles-action-' + action)[0];
        if (!btn) {
            btn = document.createElement('button');
            if (options.buttonClassName) {
                btn.className = options.buttonClassName;
            }
            btn.classList.add('smiles-action-' + action);
            btn.textContent = title;
            this._dom.actions.appendChild(btn);
        }
        btn.dataset.action = action;
        btn.addEventListener('click', this._onclick.bind(this));
        this._dom.buttons[action] = btn;
    }

    /* Подписываемся на события выделения в коллекции */
    collection.subscribe('onselect', this._onselect.bind(this));

    /* Рисуем содержимое */
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


ActionPanel.prototype._onclick = function(event) {
    var btn = event.target || event.srcElement;
    var action = btn.dataset.action;
    if (this._actions.indexOf(action) < 0) {
        return;
    }
    if (this.options.onaction) {
        this.options.onaction(this, action);
    }
};


ActionPanel.prototype._onselect = function(options) {
    this._smiles = options.current;
    this.repaint();
};


module.exports = ActionPanel;
window.ActionPanel = ActionPanel;
