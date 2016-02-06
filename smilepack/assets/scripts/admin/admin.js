'use strict';

var dialogsManager = require('../common/dialogsManager.js'),
    CollectionManager = require('./CollectionManager.js'),
    SuggestionsManager = require('./SuggestionsManager.js'),
    AdminCategoriesEditor = require('./AdminCategoriesEditor.js'),
    AdminSectionsEditor = require('./AdminSectionsEditor.js'),
    AdminSmileEditor = require('./AdminSmileEditor.js'),
    AdminIconsEditor = require('./AdminIconsEditor.js'),
    AdminUsersEditor = require('./AdminUsersEditor.js'),
    Collection = require('../common/widgets/Collection.js'),
    ActionPanel = require('../common/widgets/ActionPanel.js');

var admin = {
    collection: null,
    collectionManager: null,
    collectionActionPanel: null,
    suggestions: null,
    suggestionsManager: null,
    suggestionsActionPanel: null,
    categoriesEditor: null,
    sectionsEditor: null,
    smileEditor: null,
    iconsEditor: null,
    usersEditor: null,

    toggleDark: function() {
        document.body.classList.toggle('dark');
        var dark = document.body.classList.contains('dark') ? '1' : '0';
        try {
            window.localStorage.generatorDark = dark;
        } catch (e) {
            console.error('Cannot use localStorage:', e);
        }
    },

    onactionCollection: function(panel, action, options) {
        var smiles = this.collection.getSelectedSmileIds();
        if (!smiles || smiles.length < 1) {
            return;
        }

        var i;
        if (action === 'remove') {
            for (i = 0; i < smiles.length; i++) {
                this.categoriesEditor.removeFromCollection(smiles[i], {applyLater: true});
            }
            this.categoriesEditor.apply();
        } else if (action == 'edit') {
            this.smileEditor.openEditDialog(smiles, this.collection.getSmileRaw(smiles[0]));
        }
    },

    onactionSuggestions: function(panel, action, options) {
        var smiles = this.suggestions.getSelectedSmileIds();
        if (!smiles || smiles.length < 1) {
            return;
        }

        var i;
        if (action == 'add') {
            for (i = smiles.length - 1; i >= 0; i--) {
                this.categoriesEditor.addToCollection(smiles[i], {applyLater: true});
            }
            this.categoriesEditor.apply();
        } else if (action == 'edit') {
            this.smileEditor.openEditDialog(smiles, this.suggestions.getSmileRaw(smiles[0]));
        }
    },

    openUploader: function() {
        this.smileEditor.openUploader();
    },

    initCollections: function() {
        this.collection =  new Collection(
            [
                ['sections', 'section_id', 'Разделы:'],
                ['subsections', 'subsection_id', 'Подразделы:'],
                ['categories', 'category_id', 'Категории:']
            ],
            {
                editable: true,
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
                selectable: true
            }
        );

        this.collectionManager = new CollectionManager(this.collection);
        this.suggestionsManager = new SuggestionsManager(this.suggestions);

        this.categoriesEditor = new AdminCategoriesEditor(this.collection, this.suggestions);
        this.sectionsEditor = new AdminSectionsEditor(this.collection);

        this.collectionActionPanel = new ActionPanel(
            this.collection,
            [
                {action: 'edit'},
                {action: 'remove'}
            ],
            {
                container: document.getElementById('collection-action-panel'),
                hideIfEmpty: true,
                buttonClassName: 'button',
                onaction: this.onactionCollection.bind(this)
            }
        );

        this.suggestionsActionPanel = new ActionPanel(
            this.suggestions,
            [
                {action: 'edit'},
                {action: 'add'}
            ],
            {
                container: document.getElementById('suggestions-action-panel'),
                hideIfEmpty: true,
                buttonClassName: 'button',
                onaction: this.onactionSuggestions.bind(this)
            }
        );
    },

    bindButtonEvents: function() {
        document.getElementById('action-edit-icons').addEventListener('click', function() {
            this.iconsEditor.openDialog();
        }.bind(this));
        if (this.usersEditor) {
            document.getElementById('action-edit-users').addEventListener('click', function() {
                this.usersEditor.openDialog();
            }.bind(this));
        }
        document.getElementById('action-toggle-dark').addEventListener('click', this.toggleDark.bind(this));
        document.querySelector('#collection .additional .action-upload').addEventListener('click', this.openUploader.bind(this));
    },

    initDialogs: function() {
        dialogsManager.init(document.getElementById('dialog-background'), {});
        this.smileEditor = new AdminSmileEditor(this.collection, this.suggestions);
        this.iconsEditor = new AdminIconsEditor();
        if (document.getElementById('dialog-users')) {
            this.usersEditor = new AdminUsersEditor(document.getElementById('dialog-users'));
        }
    },

    _onbeforeunload: function() {
        if (this.categoriesEditor.isBusy()) {
            return 'Ещё сохраняются некоторые изменения, подождите немного';
        }
    },

    init: function() {
        var dark = '';
        try {
            dark = window.localStorage.generatorDark;
        } catch (e) {
            console.error('Cannot use localStorage:', e);
        }
        if (dark == '1') {
            this.toggleDark();
        }
        this.initCollections();
        this.initDialogs();
        this.bindButtonEvents();
        window.onbeforeunload = this._onbeforeunload.bind(this);
    }
};


module.exports = admin;
