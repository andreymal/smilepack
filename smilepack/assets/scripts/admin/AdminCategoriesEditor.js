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

    var smileIds = this.collection.getSmileIds(this.collection.getCurrentGroupId());
    var oldBeforeId = smileIds.indexOf(options.smileId);
    oldBeforeId = (oldBeforeId < smileIds.length - 1) ? smileIds[oldBeforeId + 1] : null;

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
        oldBeforeId,
        this.collection.getCurrentGroupId()
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
        function(response) {
            if (response.error === 'Result checking failed') {
                alert('Не получилось переместить смайлик; возможно,\nкто-то ещё редактирует категорию помимо вас.\nПопробуйте обновить страницу.');
            } else {
                alert(response.error || response || 'fail');
                for (var i = this._orderQueue.length - 1; i >= 0; i--) {
                    if (!this.collection.moveSmile(this._orderQueue[i][0], this._orderQueue[i][2], this._orderQueue[i][3])) {
                        throw new Error('Cannot rollback smiles moving :(');
                    }
                }
                this._orderQueue = [];
                if (!this.collection.moveSmile(data[0], data[2], data[3])) {
                    throw new Error('Cannot rollback smiles moving :(');
                }
            }
        }.bind(this),
        function() {
            this._orderQueueNext();
        }.bind(this)
    );
};


module.exports = AdminCategoriesEditor;
