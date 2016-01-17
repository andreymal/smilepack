'use strict';

var ajax = require('../common/ajax.js');


var SuggestionsManager = function(collection) {
    this.collection = collection;
    this.older = null;

    this.groupId = collection.createGroup();
    collection.showGroup(this.groupId, true);

    var btns = this.collection.getDOM().querySelectorAll('.action-more-nonapproved');
    for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', this._clickEvent.bind(this));
    }
};


SuggestionsManager.prototype.loadMoreSmiles = function() {
    var onload = function(data) {
        var gid = [this.groupId];
        for (var i = 0; i < data.smiles.length; i++) {
            this.older = data.smiles[i].id;
            data.smiles[i].groupIds = gid;
            var localId = this.collection.addSmileIfNotExists(data.smiles[i]);
            if (localId === null) {
                continue;
            }
        }
        console.log(this.older);
    }.bind(this);
    var onerror = this._getSmilesErrorEvent.bind(this);
    var onend = function () {
        this.collection.setLoadingVisibility(false);
    }.bind(this);

    this.collection.setLoadingVisibility(true);
    ajax.get_nonapproved_smiles(this.older, 0, 100, onload, onerror, onend);
};


SuggestionsManager.prototype._getSmilesErrorEvent = function(data) {
    alert(data.error || data || 'fail');
};


SuggestionsManager.prototype._clickEvent = function(event) {
    this.loadMoreSmiles();
    event.preventDefault();
    return false;
};


module.exports = SuggestionsManager;
