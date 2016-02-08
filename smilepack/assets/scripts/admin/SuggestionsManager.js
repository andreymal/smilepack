'use strict';

var ajax = require('../common/ajax.js');


var SuggestionsManager = function(collection) {
    this.collection = collection;

    var allGroupId = collection.createGroup();
    var catGroupId = collection.createGroup();
    var nocatGroupId = collection.createGroup();
    var nonsugGroupId = collection.createGroup();
    var hiddenGroupId = collection.createGroup();
    this.currentTab = null;

    this.tabs = {
        all: {groupId: allGroupId, btn: null, older: null},
        categories: {groupId: catGroupId, btn: null, older: null},
        nocategories: {groupId: nocatGroupId, btn: null, older: null},
        nonsuggestions: {groupId: nonsugGroupId, btn: null, older: null},
        hidden: {groupId: hiddenGroupId, btn: null, older: null}
    };

    collection.setCallback('onload', this._onload.bind(this));

    this._bindButtons();
};


SuggestionsManager.prototype._bindButtons = function() {
    var i;
    var btns = this.collection.getDOM().querySelectorAll('.action-more-nonapproved');
    for (i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', this._clickEvent.bind(this));
    }

    var tabs = this.collection.getDOM().querySelectorAll('.collection-tabs > li');
    var changeTabEvent = function(event) {
        if (!event.target.dataset.tab) {
            return;
        }
        this.changeTab(event.target.dataset.tab);
        return false;
    }.bind(this);
    for (i = 0; i < tabs.length; i++) {
        this.tabs[tabs[i].dataset.tab].btn = tabs[i];
        tabs[i].addEventListener('click', changeTabEvent);
    }

};


SuggestionsManager.prototype.changeTab = function(tab) {
    if (tab === this.currentTab) {
        return;
    }

    if (tab !== null && !this.tabs[tab]) {
        throw new Error('Unknown tab ' + tab);
    }
    if (this.currentTab !== null) {
        this.tabs[this.currentTab].btn.classList.remove('current');
    }
    this.currentTab = tab;
    if (tab !== null) {
        this.tabs[tab].btn.classList.add('current');
    }

    this.collection.showGroup(tab !== null ? this.tabs[tab].groupId : null);
};


SuggestionsManager.prototype.loadMoreSmiles = function(tab) {
    if (tab === undefined) {
        tab = this.currentTab;
    }
    if (tab === null) {
        return false;
    }

    var tabdata = this.tabs[tab];
    if (!tabdata) {
        throw new Error('Unknown tab ' + tab);
    }

    var onload = function(data) {
        var gid = [tabdata.groupId];
        for (var i = 0; i < data.smiles.length; i++) {
            tabdata.older = data.smiles[i].id;
            data.smiles[i].groupIds = gid;
            var localId = this.collection.addSmileIfNotExists(data.smiles[i]);
            if (localId === null) {
                continue;
            }
        }
    }.bind(this);
    var onerror = this._getSmilesErrorEvent.bind(this);
    var onend = function () {
        this.collection.setLoadingVisibility(false);
    }.bind(this);

    this.collection.setLoadingVisibility(true);
    ajax.get_unpublished_smiles(tab, tabdata.older, 0, 100, onload, onerror, onend);
    return true;
};


SuggestionsManager.prototype._getSmilesErrorEvent = function(data) {
    alert(data.error || data || 'fail');
};


SuggestionsManager.prototype._clickEvent = function(event) {
    this.loadMoreSmiles();
    event.preventDefault();
    return false;
};


SuggestionsManager.prototype._onload = function(collection, options) {
    if (collection !== this.collection) {
        return;
    }
    if (this.currentTab !== null && this.tabs[this.currentTab].groupId === options.groupId) {
        this.loadMoreSmiles();
    }
};


module.exports = SuggestionsManager;
