'use strict';

var ajax = require('../common/ajax.js');


var AdminCategoriesEditor = function(collection, suggestions) {
    this.collection = collection;
    this.suggestions = suggestions;

    this._orderQueue = [];
    this._orderQueueWorking = false;

    this.collection.setCallback('ondropto', this._ondropto.bind(this));
    this.collection.setCallback('onmove', this._onmove.bind(this));
};


AdminCategoriesEditor.prototype._ondropto = function(options) {
    if (options.targetContainer === this.collection) {
        console.log(options);
    }
    return null;
};


AdminCategoriesEditor.prototype._onmove = function(options) {
    if (options.container !== this.collection || options.smileId === options.beforeId) {
        return {name: 'move', beforeId: options.smileId};  // reject
    }

    var smileIds = options.container.getSmileIds(options.container.getCurrentGroupId());
    smileIds.splice(smileIds.indexOf(options.smileId), 1);
    if (options.beforeId !== null) {
        smileIds.splice(smileIds.indexOf(options.beforeId), 0, options.smileId);
    } else {
        smileIds.push(options.smileId);
    }

    var order = smileIds.indexOf(options.smileId);
    var afterId = order > 0 ? smileIds[order - 1] : null;

    this._orderQueue.push([
        options.smileId,
        {
            before: options.beforeId,
            after: afterId,
            check_order: order
        },
    ]);
    if (!this._orderQueueWorking) {
        this._orderQueueNext();
    }


};


AdminCategoriesEditor.prototype._orderQueueNext = function() {
    this._orderQueueWorking = true;
    if (this._orderQueue.length < 1) {
        this._orderQueueWorking = false;
        return;
    }

    var data = this._orderQueue.splice(0, 1)[0];
    ajax.edit_smile(
        data[0],
        {position: data[1]},
        null,
        function(data) {
            alert(data.error === 'Result checking failed' ? 'Не получилось переместить смайлик; возможно,\nкто-то ещё редактирует категорию помимо вас.\nПопробуйте обновить страницу.' : (data.error || data || 'fail'));
        },
        function() {
            this._orderQueueNext();
        }.bind(this)
    );
};


module.exports = AdminCategoriesEditor;
