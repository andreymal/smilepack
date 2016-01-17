'use strict';

var CollectionManager = require('./CollectionManager.js'),
    SuggestionsManager = require('./SuggestionsManager.js'),
    Collection = require('../common/widgets/Collection.js');

var admin = {
    collection: null,
    collectionManager: null,
    suggestions: null,
    suggestionsManager: null,

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

        this.collectionManager = new CollectionManager(this.collection);
        this.suggestionsManager = new SuggestionsManager(this.suggestions);
    },

    bindButtonEvents: function() {
        document.getElementById('action-toggle-dark').addEventListener('click', this.toggleDark.bind(this));
    },

    init: function() {
        if (window.localStorage.generatorDark == '1') {
            this.toggleDark();
        }
        this.initCollections();
        this.bindButtonEvents();
    }
};


module.exports = admin;
