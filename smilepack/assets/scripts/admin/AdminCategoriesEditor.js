'use strict';

var ajax = require('../common/ajax.js');


var AdminCategoriesEditor = function(collection, suggestions) {
    this.collection = collection;
    this.suggestions = suggestions;

    this._orderQueue = [];
    this._orderQueueWorking = false;

    this.collection.setCallback('ondropto', this._ondroptoCollection.bind(this));
    this.collection.setCallback('onmove', this._onmove.bind(this));

    this.suggestions.setCallback('ondropto', this._ondroptoSuggestions.bind(this));
};


AdminCategoriesEditor.prototype.isBusy = function() {
    return this._orderQueueWorking;
};


AdminCategoriesEditor.prototype.apply = function() {
    if (!this._orderQueueWorking) {
        this._orderQueueNext();
    }
};


AdminCategoriesEditor.prototype.addToCollection = function(smileId, options) {
    options = options || {};
    var category = this.collection.getCurrentCategory();
    var smile = this.suggestions.getSmileInfo(smileId);
    if (!category || category[0] !== 2 || smile === null) {
        return false;
    }
    var categoryId = category[1];

    smile.categoryLevel = 2;
    smile.categoryId = categoryId;
    smile.dragged = false;
    if (this.collection.addSmile(smile, true) !== smileId) {
        return false;
    }
    if (!options.ignoreDragged){
        this.suggestions.setDragged(smileId, true);
    }
    var positionData = null;
    if (options.moveBefore !== undefined && options.moveBefore !== null) {
        this.collection.moveSmile(smileId, options.moveBefore, this.collection.getGroupOfCategory(category[0], category[1]));
    }
    if (options.forceSendPosition || (options.moveBefore !== undefined && options.moveBefore !== null)) {
        var smileIds = this.collection.getSmileIds(this.collection.getCurrentGroupId());
        var beforeId = smileIds.indexOf(smileId);
        beforeId = (beforeId < smileIds.length - 1) ? smileIds[beforeId + 1] : null;
        var order = smileIds.indexOf(smileId);
        var afterId = order > 0 ? smileIds[order - 1] : null;

        positionData = {
            before: beforeId,
            after: afterId,
            check_order: order
        };
    }

    this._orderQueue.push({
        smileId: smileId,
        data: {
            position: positionData,
            category: categoryId,
            approved: true
        },
        rollback: {
            mode: 'remove'
        }
    });
    if (!options.applyLater && !this._orderQueueWorking) {
        this._orderQueueNext();
    }
    return true;
};


AdminCategoriesEditor.prototype.removeFromCollection = function(smileId, options) {
    options = options || {};
    var smileIds = this.collection.getSmileIds(this.collection.getCurrentGroupId());
    var beforeId = smileIds.indexOf(smileId);
    beforeId = (beforeId < smileIds.length - 1) ? smileIds[beforeId + 1] : null;
    var smile = this.collection.getSmileInfo(smileId, {withParent: true});

    if (smile === null || !this.collection.removeSmile(smileId)) {
        return false;
    }
    if (!options.ignoreDragged) {
        this.suggestions.setDragged(smileId, false);
    }

    this._orderQueue.push({
        smileId: smileId,
        data: {
            approved: false
        },
        rollback: {
            mode: 'create',
            beforeId: beforeId,
            groupId: this.collection.getGroupOfCategory(smile.categoryLevel, smile.categoryId),
            smile: smile
        }
    });
    if (!options.applyLater && !this._orderQueueWorking) {
        this._orderQueueNext();
    }
    return true;
};


AdminCategoriesEditor.prototype._ondroptoCollection = function(options) {
    if (options.targetContainer !== this.collection || options.sourceContainerElement !== this.suggestions.getDOM()) {
        return null;
    }

    var category = this.collection.getCurrentCategory();
    var smileId = this.suggestions.getSmileIdByDom(options.element);
    if (!category || category[0] !== 2 || smileId === null) {
        return null;
    }

    if (this.addToCollection(smileId, {ignoreDragged: true, moveBefore: options.dropPosition, forceSendPosition: true})) {
        this.collection.setDragged(smileId, true);
        return {name: 'animateToSmile', id: smileId};
    }
};


AdminCategoriesEditor.prototype._ondroptoSuggestions = function(options) {
    if (options.targetContainer !== this.suggestions || options.sourceContainerElement !== this.collection.getDOM()) {
        return null;
    }

    var smileId = this.collection.getSmileIdByDom(options.element);
    if (smileId === null) {
        return null;
    }

    if (this.removeFromCollection(smileId, {ignoreDragged: true})) {
        return this.suggestions.getSmileInfo(smileId) ? {name: 'animateToSmile', id: smileId} : {name: 'fadeOut'};
    }
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

    this._orderQueue.push({
        smileId: options.smileId,
        data: {
            position: {
                before: options.beforeId,
                after: afterId,
                check_order: order
            }
        },
        rollback: {
            mode: 'move',
            beforeId: oldBeforeId,
            groupId: this.collection.getCurrentGroupId()
        }
    });
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

    var items = this._orderQueue.slice(0, 50);

    var onload = function(data) {
        var smiles = data.items || [{id: data.smile.id, smile: data.smile}];
        for (var i = 0; i < smiles.length; i++) {
            var smile = smiles[i].smile;
            if (smile) {
                if (this.collection.getSmileInfo(smile.id)) {
                    this.collection.editSmile({id: smile.id, raw: smile});
                }
                if (this.suggestions.getSmileInfo(smile.id)) {
                    this.suggestions.editSmile({id: smile.id, raw: smile});
                }
            }
        }
        this._orderQueue.splice(0, 50);
    }.bind(this);

    var onerror = function(response) {
        if (response.error === 'Result checking failed') {
            alert('Не получилось переместить смайлик; возможно,\nкто-то ещё редактирует категорию помимо вас.\nПопробуйте обновить страницу.');
            this._orderQueue = [];
            return;
        }

        alert(response.error || response || 'fail');
        for (var i = this._orderQueue.length - 1; i >= 0; i--) {
            var item = this._orderQueue[i];
            var rb = item.rollback;

            if (rb.mode === 'move') {
                if (!this.collection.moveSmile(item.smileId, rb.beforeId, rb.groupId)) {
                    throw new Error('Cannot rollback smiles moving :(');
                }
            } else if (rb.mode === 'remove') {
                if (!this.collection.removeSmile(item.smileId)) {
                    throw new Error('Cannot rollback smiles addition! :(');
                }
                if (this.suggestions.getDragged(item.smileId)) {
                    this.suggestions.setDragged(item.smileId, false);
                }
            } else if (rb.mode === 'create') {
                if (this.collection.addSmile(rb.smile, true) !== item.smileId || !this.collection.moveSmile(item.smileId, rb.beforeId, rb.groupId)) {
                    throw new Error('Cannot rollback smiles deletion! :(');
                }
            } else {
                throw new Error('Unknown rollback method ' + rb.mode);
            }
        }

        this._orderQueue = [];
    }.bind(this);

    var onend = function() {
        setTimeout(this._orderQueueNext.bind(this), 400);
    }.bind(this);

    if (items.length > 1) {
        var datas = [];
        for (var i = 0; i < items.length; i++) {
            datas.push({id: items[i].smileId, smile: items[i].data});
        }
        ajax.edit_many_smiles(
            datas,
            onload,
            onerror,
            onend
        );
    } else {
        ajax.edit_smile(
            items[0].smileId,
            items[0].data,
            onload,
            onerror,
            onend
        );
    }
};


module.exports = AdminCategoriesEditor;
