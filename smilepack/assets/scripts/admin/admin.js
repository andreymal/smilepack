'use strict';

var ajax = require('../common/ajax.js'),
    Collection = require('../common/widgets/Collection.js');

var admin = {
    collection: null,
    suggestions: null,
    suggestionsGroup: null,

    setCollectionSmiles: function(collection, options) {
        var callbackCategory = function(data) {
            for (var i = 0; i < data.smiles.length; i++) {
                data.smiles[i].categoryLevel = 2;
                data.smiles[i].categoryId = options.categoryId;
                var localId = this.collection.addSmileIfNotExists(data.smiles[i]);
                if (localId === null) {
                    continue;
                }
            }
            collection.showCategory(2, options.categoryId, true);
        }.bind(this);
        var onerror = this.getSmilesErrorEvent.bind(this);

        ajax.get_smiles(options.categoryId, callbackCategory, onerror);
    },

    getSmilesErrorEvent: function(data) {
        alert(data.error || data || 'fail');
        var curCat = this.collection.getCurrentCategory();
        if (curCat) {
            this.collection.selectCategory(curCat[0], curCat[1]);
        } else {
            this.collection.showGroup(this.collection.getCurrentGroupId());
        }
    },

    toggleDark: function() {
        document.body.classList.toggle('dark');
        window.localStorage.generatorDark = document.body.classList.contains('dark') ? '1' : '0';
    },

    initCollections: function() {
        this.collection =  new Collection(
            [
                ['sections', 'section_id', 'Разделы:'],
                ['subsections', 'subsection_id', 'Подразделы:'],
                ['categories', 'category_id', 'Категории:']
            ],
            {
                editable: false,
                container: document.getElementById('collection'),
                get_smiles_func: this.setCollectionSmiles.bind(this),
                selectable: true,
                selectableDragged: false,
                useCategoryLinks: false
            }
        );

        this.suggestions = new Collection(
            [],
            {
                editable: false,
                container: document.getElementById('suggestions'),
                selectable: false
            }
        );

        this.suggestionsGroup = this.suggestions.createGroup();
        this.suggestions.showGroup(this.suggestionsGroup, true);
    },

    initCollectionData: function(data) {
        this.collection.loadData(data);
        var categories = this.collection.getCategoryIds()[2];
        for (var i = 0; i < categories.length; i++) {
            this.collection.createGroupForCategory(2, categories[i]);
        }
        if (data.sections.length == 1) {
            this.collection.selectCategory(0, data.sections[0].id);
        }
    },

    initData: function() {
        ajax.get_categories(this.initCollectionData.bind(this));
    },


    bindButtonEvents: function() {
        document.getElementById('action-toggle-dark').addEventListener('click', this.toggleDark.bind(this));
    },

    init: function() {
        if (window.localStorage.generatorDark == '1') {
            this.toggleDark();
        }

        this.initCollections();
        this.initData();
        this.bindButtonEvents();
    }
};


module.exports = admin;
