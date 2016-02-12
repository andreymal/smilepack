'use strict';

var ajax = require('../common/ajax.js');


var CollectionManager = function(collection) {
    this.collection = collection;
    collection.setCallback('onload', this._smilesLoader.bind(this));

    ajax.get_categories(function(data) {
        collection.loadData(data);
        var categories = collection.getCategoryIds()[2];
        for (var i = 0; i < categories.length; i++) {
            collection.createGroupForCategory(2, categories[i]);
        }
        if (data.sections.length == 1) {
            collection.selectCategory(0, data.sections[0].id);
        }
    }, function(data) {
        alert(data.error || data);
    });
};


CollectionManager.prototype._smilesLoader = function(collection, options) {
    var onload = function(data) {
        for (var i = 0; i < data.smiles.length; i++) {
            data.smiles[i].categoryLevel = 2;
            data.smiles[i].categoryId = options.categoryId;
            var localId = collection.addSmileIfNotExists(data.smiles[i]);
            if (localId === null) {
                continue;
            }
        }
        collection.showCategory(2, options.categoryId, true);
    }.bind(this);
    var onerror = this._getSmilesErrorEvent.bind(this);

    ajax.get_smiles(options.categoryId, true, onload, onerror);
    return true;
};


CollectionManager.prototype._getSmilesErrorEvent = function(data) {
    alert(data.error || data || 'fail');
    var curCat = this.collection.getCurrentCategory();
    if (curCat) {
        this.collection.selectCategory(curCat[0], curCat[1]);
    } else {
        this.collection.showGroup(this.collection.getCurrentGroupId());
    }
};


module.exports = CollectionManager;
