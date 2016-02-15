'use strict';

var ajax = require('../common/ajax.js'),
    dialogsManager = require('../common/dialogsManager.js'),

    Collection = require('../common/widgets/Collection.js'),
    ActionPanel = require('../common/widgets/ActionPanel.js'),

    CategoryDialog = require('./dialogs/CategoryDialog.js'),
    SmileDialog = require('./dialogs/SmileDialog.js'),
    ImportUserscriptDialog = require('./dialogs/ImportUserscriptDialog.js'),
    SmilepackSavingDialog = require('./dialogs/SmilepackSavingDialog.js'),
    SmilepackDialog = require('./dialogs/SmilepackDialog.js');


var generator = {
    storageVersion: 1,

    collection: null,
    collectionPanel: null,
    smilepack: null,
    smilepackPanel: null,

    modified: false,
    current_id: null,
    newSmilesGroup: null,

    tabs: {},
    currentTab: 'collection',

    collectionData: null,
    smilepackData: null,

    usedSmiles: [], // неупорядоченный

    saveStatus: null,
    lastSavedPack: null,

    /* dragdrop */

    dropToSmilepackEvent: function(options) {
        var categoryId = this.smilepack.getSelectedCategory(0);
        if (categoryId === null) {
            return null;
        }

        var elem = this.collection.typeOfElement(options.element);
        if (elem.type != 'smile' || this.usedSmiles.indexOf(elem.id) >= 0) {
            return null;
        }

        this.collection.setSelected(elem.id, false);

        var smile = this.collection.getSmileInfo(elem.id);
        smile.dragged = true;
        smile.categoryLevel = 0;
        smile.categoryId = categoryId;

        var id = this.smilepack.addSmile(smile, true);
        if (options.dropPosition !== undefined && options.dropPosition !== null) {
            this.smilepack.moveSmile(id, options.dropPosition);
        }

        this.usedSmiles.push(elem.id);
        this.modified = true;
        return {name: 'animateToSmile', id: id};
    },

    dropToCollectionEvent: function(options) {
        var elem = this.smilepack.typeOfElement(options.element);
        if (!elem) {
            return;
        }
        var id = elem.id;

        var i = this.usedSmiles.indexOf(id);
        if (i < 0) {
            return;
        }

        this.smilepack.removeSmile(id);
        this.usedSmiles.splice(i, 1);
        this.modified = true;

        var smile = this.collection.getSmileInfo(id, {withParent: true});
        if (smile && smile.groups.indexOf(this.collection.getCurrentGroupId()) >= 0) {
            return {name: 'animateToSmile', id: id};
        } else if (smile) {
            this.collection.setDragged(id, false);
            return {name: 'fadeOut'};
        } else {
            return {name: 'fadeOut'};
        }
    },

    /* actions */

    onchange: function(options) {
        if (options.categoryId === undefined || options.categoryId === null) {
            window.history.replaceState("", document.title, window.location.pathname + window.location.search);
            return;
        }
        window.history.replaceState("", document.title, window.location.pathname + window.location.search + '#' + options.categoryId.toString());
    },

    onaction: function(options) {
        var action = options.action;
        var categoryId = options.categoryId;

        if (options.container !== this.smilepack || options.level !== 0) {
            return;
        }

        var beforeList = [];
        var before = null;
        if (action != 'delete') {
            var itemIds = this.smilepack.getCategoryChildrenIds(0, 0);
            for (var i = 0; i < itemIds.length; i++) {
                var info = this.smilepack.getCategoryInfo(0, itemIds[i], {withParent: true});
                beforeList.push([itemIds[i], info.name]);
                if (action == 'edit' && itemIds[i] === categoryId && i < itemIds.length - 1) {
                    before = itemIds[i + 1];
                }
            }
        }

        if (action == 'delete' && categoryId !== undefined && categoryId !== null) {
            this.deleteSmilepackCategory(categoryId, true);
        } else if (action == 'add') {
            dialogsManager.open('category', {edit: false, beforeList: beforeList, before: before}, this.modifySmilepackCategory.bind(this));
        } else if (action == 'edit') {
            dialogsManager.open('category', {
                edit: true,
                beforeList: beforeList,
                before: before,
                category: this.smilepack.getCategoryInfo(0, options.categoryId)
            }, this.modifySmilepackCategory.bind(this));
        }
    },

    onactionCollection: function(panel, action, options) {
        var smiles = this.collection.getSelectedSmileIds();

        if (action == 'add') {
            var smpId = this.smilepack.getSelectedCategory(0);
            if (smpId === null) {
                return;
            }

            this.collection.deselectAll();
            this.moveSmiles(smpId, smiles, false);
        }
    },

    onactionSmilepack: function(panel, action, options) {
        var smiles = this.smilepack.getSelectedSmileIds();
        var i;

        if (action == 'remove') {
            var removedSmiles = this.smilepack.removeManySmiles(smiles);
            for (i = 0; removedSmiles && i < removedSmiles.length; i++) {
                var j = this.usedSmiles.indexOf(removedSmiles[i]);
                if (j >= 0) {
                    generator.collection.setDragged(removedSmiles[i], false);
                    this.usedSmiles.splice(j, 1);
                }
            }
            this.modified = true;
        } else if (action == 'move') {
            var groupId = this.smilepack.getGroupOfCategory(options.categoryLevel, options.categoryId);
            if (groupId === null || groupId === this.smilepack.getCurrentGroupId()) {
                return;
            }
            this.smilepack.deselectAll();

            for (i = 0; i < smiles.length; i++) {
                this.smilepack.removeSmileFromGroup(smiles[i], this.smilepack.getCurrentGroupId());
                this.smilepack.addSmileToGroup(smiles[i], groupId);
            }
        }
    },

    onerror: function(data) {
        console.log(data);
        alert(data.error || 'Кажется, что-то пошло не так');
    },

    check_hash: function() {
        if (!window.location.hash) {
            return;
        }
        var categoryId = window.location.hash.substring(1);
        if (isNaN(categoryId)) {
            return;
        }

        categoryId = parseInt(categoryId);
        if (categoryId == generator.current_id) {
            return;
        }

        generator.collection.selectCategory(2, categoryId);
    },

    toggleDark: function() {
        document.body.classList.toggle('dark');
        var dark = document.body.classList.contains('dark') ? '1' : '0';
        try {
            window.localStorage.generatorDark = dark;
        } catch (e) {
            console.error('Cannot use localStorage:', e);
        }
    },

    changeTab: function(tab) {
        var oldTab = this.currentTab;
        if (tab == oldTab) {
            return;
        }

        if (tab == 'collection') {
            this.collection.setTabsVisibility(true);
        } else if (tab == 'new_smiles') {
            this.collection.setTabsVisibility(false);
            this.collection.showGroup(this.newSmilesGroup);
        } else {
            return;
        }

        this.tabs[oldTab].classList.remove('current');
        this.tabs[tab].classList.add('current');
        this.currentTab = tab;
    },

    _changeVersionEvent: function(event) {
        window.location = event.target.value;
    },

    importUserscript: function(options) {
        if (!options.form || !options.form.file.value) {
            return {error: 'Выберите файл'};
        }

        var onend = options.onend;
        ajax.import_userscript(
            options.form,
            function(data) {
                this.importedUserscriptEvent(data, onend);
            }.bind(this),
            function(data) {
                console.log(data);
                if (onend) {
                    onend({error: data.error || data});
                }
            }
        );
        return {success: true};
    },

    importedUserscriptEvent: function(data, onend) {
        if (!data.categories || data.categories.length < 1) {
            console.log(data);
            if (onend) {
                onend({error: data.notice || 'Кажется, что-то пошло не так'});
            }
            return;
        }
        if (data.notice) {
            console.log(data.notice);
        }
        this.replaceSmilepackData({categories: data.categories}, data.ids);

        if (onend) {
            onend({success: true, data: data, notice: data.notice});
        }
    },

    openSavingDialog: function(mode) {
        var smileIds = this.smilepack.getLevelSmileIds(0);
        if (!smileIds || smileIds.length < 1) {
            alert('Добавьте хотя бы один смайлик!');
            return;
        }

        var data = {mode: mode || 'create'};
        if (this.lastSavedPack !== null) {
            data.hid = this.lastSavedPack.smilepack_id;
            data.version = this.lastSavedPack.version;
        }
        dialogsManager.open('saving', data, this.saveSmilepack.bind(this));
    },

    saveSmilepack: function(options) {
        if (this.saveStatus !== null) {
            return {error: 'Кажется, уже что-то сохраняется'};
        }
        if (options.mode == 'fork') {
            if (!options.hid) {
                return {error: 'Кого форкаем?'};
            }
        } else if (options.mode == 'edit') {
            if (!options.hid) {
                return {error: 'Кого редактируем?'};
            }
        } else if (options.mode != 'create') {
            return {error: 'Неверный режим'};
        }
        var smileIds = this.smilepack.getLevelSmileIds(0);

        var rawCategories = this.smilepack.getCategoriesWithHierarchy({short: true});
        var categories = [];
        var categoryIdsTable = {};
        var i;
        for (i = 0; i < rawCategories.length; i++) {
            categories.push({name: rawCategories[i].name, icon: rawCategories[i].icon.id});
            categoryIdsTable[rawCategories[i].id] = i;
        }

        var smiles = [];
        var smilesToCreate = [];
        for (i = 0; i < smileIds.length; i++) {
            var smile = this.smilepack.getSmileInfo(smileIds[i], {withoutIds: true, withParent: true});
            if (smileIds[i] >= 0) {
                smile.id = smileIds[i];
                delete smile.url;
                delete smile.description;
            } else {
                smilesToCreate.push(smile);
            }
            smile.category = categoryIdsTable[smile.categoryId];
            delete smile.cateogryLevel;
            delete smile.categoryId;
            smiles.push(smile);
        }

        dialogsManager.open('smilepack', {mode: 'saving'});

        this.saveStatus = {
            name: options.name || '',
            lifetime: options.lifetime || 0,
            categories: categories,
            smiles: smiles,
            smilesToCreate: smilesToCreate,
            createPos: 0,
            mode: options.mode,
            parent: options.hid
        };
        this._saveSmilepackProcessing();
        return {success: true};
    },

    _saveSmilepackProcessing: function(data) {
        var pos = null;
        if (data !== undefined) {
            pos = this.saveStatus.createPos;
            if (data.error || !data.smile) {
                return this._saveSmilepackError(data);
            }
            this.saveStatus.smilesToCreate[pos].id = data.smile.id;
            delete this.saveStatus.smilesToCreate[pos].url;
            this.saveStatus.createPos++;
        }

        if (this.saveStatus.createPos < this.saveStatus.smilesToCreate.length){
            pos = this.saveStatus.createPos;
            setTimeout(function() {
                ajax.create_smile(
                    {
                        url: this.saveStatus.smilesToCreate[pos].url,
                        w: this.saveStatus.smilesToCreate[pos].w,
                        h: this.saveStatus.smilesToCreate[pos].h
                    },
                    this._saveSmilepackProcessing.bind(this),
                    this._saveSmilepackProcessingSmileError.bind(this)
                );
            }.bind(this), 350);
            dialogsManager.open('smilepack', {
                mode: 'begin',
                current: this.saveStatus.createPos,
                count: this.saveStatus.smilesToCreate.length
            });
            return;
        }

        dialogsManager.open('smilepack', {mode: 'saving'});

        ajax.create_smilepack(
            this.saveStatus.mode,
            this.saveStatus.parent,
            this.saveStatus.name,
            this.saveStatus.lifetime,
            this.saveStatus.categories,
            this.saveStatus.smiles,
            this.savedSmilepackEvent.bind(this),
            this._saveSmilepackError.bind(this)
        );
    },

    _saveSmilepackProcessingSmileError: function(data) {
        if (!data.error) {
            return this._saveSmilepackError(data);
        }
        var smile = this.saveStatus.smilesToCreate[this.saveStatus.createPos];
        var msg = 'Не удалось создать смайлик ' + smile.url + ':\n';
        msg += data.error;
        msg += '\nПропустить его и продолжить?';
        if (confirm(msg)) {
            this.saveStatus.smiles.splice(this.saveStatus.smiles.indexOf(smile), 1);
            this.saveStatus.smilesToCreate.splice(this.saveStatus.createPos, 1);
            return this._saveSmilepackProcessing();
        }
        this.saveStatus = null;
        dialogsManager.close('smilepack');
    },

    _saveSmilepackError: function(data) {
        this.onerror(data);
        this.saveStatus = null;
        dialogsManager.close('smilepack');
    },

    savedSmilepackEvent: function(data) {
        this.saveStatus = null;
        this.lastSavedPack = data;
        this.repaintPageForSmilepack(data);

        var options = {mode: 'saved', savedData: data};
        dialogsManager.open('smilepack', options);

        this.modified = false;
    },

    repaintPageForSmilepack: function(pack) {
        if (!pack) {
            document.getElementById('settings-new').style.display = '';
            document.getElementById('settings-edit').style.display = 'none';
            document.getElementById('smp-versions-area').style.display = 'none';
            // url and title are missing
            return;
        }
        if (pack.path && window.history) {
            document.title = pack.name || pack.smilepack_id;
            window.history.replaceState(null, null, pack.path + location.hash);
        }
        document.getElementById('settings-new').style.display = 'none';
        document.getElementById('settings-edit').style.display = '';

        var smpName = document.getElementById('smp-name');
        smpName.style.display = '';
        smpName.textContent = '"' + (pack.name || pack.smilepack_id) + '"';

        var lastUrl = document.getElementById('smp-last-url');
        lastUrl.href = pack.download_url;
        lastUrl.style.display = '';

        var editBtn = document.querySelector('.action-edit');
        editBtn.style.display = pack.can_edit ? '' : 'none';

        var deletionDate = document.getElementById('smp-delete-container');
        if (pack.fancy_deletion_date) {
            deletionDate.style.display = '';
            document.getElementById('smp-delete-date').textContent = pack.fancy_deletion_date;
        } else {
            deletionDate.style.display = 'none';
        }

        var versions = document.getElementById('smp-versions');
        var versionsArea = document.getElementById('smp-versions-area');
        if (versions.dataset.hid != pack.smilepack_id) {
            versions.innerHTML = '';
            versions.dataset.hid = pack.smilepack_id;
        }

        var option = document.createElement('option');
        option.value = pack.extended_path || pack.path;
        option.textContent = pack.version.toString() + ' (' + pack.fancy_created_at + ')';
        versions.appendChild(option);
        versions.value = option.value;

        if (versions.querySelectorAll('option').length > 1) {
            versionsArea.style.display = '';
        } else {
            versionsArea.style.display = 'none';
        }
    },

    modifySmilepackCategory: function(options) {
        if (options.name.length > 128) {
            return {error: 'Длинновато имя у категории!'};
        }
        if (options.iconType === 'url' && !options.iconUrl) {
            return {error: 'Укажите ссылку для иконки'};
        } else if (options.iconType === 'file' && !options.iconFile) {
            return {error: 'Выберите файл для иконки'};
        } else if (options.iconType === 'id' && (options.iconId === undefined || options.iconId === null || !options.iconUrl)) {
            return {error: 'Не выбрана иконка'};
        }

        if (options.iconType === 'id' || options.iconType === 'nothing') {
            setTimeout(function() {
                this._modifySmilepackCategoryFinish(options, options.iconId, options.iconUrl, options.onend);
            }.bind(this), 0); // call onend after return
        } else if (options.iconType === 'url') {
            ajax.create_icon(
                {url: options.iconUrl, compress: true},
                function(data) {
                    this._modifySmilepackCategoryFinish(options, data.icon.id, data.icon.url, options.onend);
                }.bind(this),
                options.onend
            );
        } else if (options.iconType === 'file') {
            ajax.upload_icon(
                {file: options.iconFile, compress: '1'},
                function(data) {
                    this._modifySmilepackCategoryFinish(options, data.icon.id, data.icon.url, options.onend);
                }.bind(this),
                options.onend
            );
        } else {
            return {error: '?'};
        }

        return {success: true};
    },

    _modifySmilepackCategoryFinish: function(options, iconId, iconUrl, onend) {
        var id;
        if (options.categoryId === undefined || options.categoryId === null) {
            id = this.smilepack.addCategory(0, 0, {
                name: options.name || '',
                icon: {id: iconId, url: options.iconUrl}
            });
            this.smilepack.createGroupForCategory(0, id);
        } else if (iconId !== undefined && iconId !== null) {
            id = this.smilepack.editCategory(0, options.categoryId, {
                name: options.name || '',
                icon: {id: iconId, url: iconUrl}
            });
        } else {
            id = this.smilepack.editCategory(0, options.categoryId, {
                name: options.name || ''
            });
        }

        if (id === null) {
            if (onend) {
                onend({error: 'Кажется, что-то пошло не так'});
            }
            return;
        }
        if (options.hasOwnProperty('before')) {
            if (!this.smilepack.moveCategory(0, id, options.before)) {
                if (onend) {
                    onend({error: 'Кажется, что-то пошло не так'});
                }
                return;
            }
        }
        if (options.categoryId === undefined || options.categoryId === null) {
            this.smilepack.selectCategory(0, id);
        }
        this.modified = true;
        if (onend) {
            onend({success: true, categoryId: id});
        }
    },

    deleteSmilepackCategory: function(categoryId, interactive) {
        if (interactive && !confirm('Удалить категорию «' + this.smilepack.getCategoryInfo(0, categoryId).name + '»?')) {
            return false;
        }
        var unusedSmiles = this.smilepack.removeCategory(0, categoryId);
        for (var i = 0; unusedSmiles && i < unusedSmiles.length; i++) {
            generator.collection.setDragged(unusedSmiles[i], false);
            generator.smilepack.removeSmile(unusedSmiles[i]);
            var j = this.usedSmiles.indexOf(unusedSmiles[i]);
            if (j >= 0) {
                this.usedSmiles.splice(j, 1);
            }
        }
        this.modified = true;
        return true;
    },

    selectAllSmiles: function() {
        this.collection.selectAll();
        return false;
    },

    copyCategory: function() {
        var category = this.collection.getCategoryInfo(2, this.collection.getSelectedCategory(2));
        if (category === null) {
            return false;
        }

        var smiles = this.collection.getSmileIds(this.collection.getCurrentGroupId());
        var usedSmiles = [];
        var i, smileId;
        for (i = 0; i < smiles.length; i++) {
            smileId = smiles[i];
            if (this.usedSmiles.indexOf(smileId) >= 0) {
                usedSmiles.push(smiles[i]);
            }
        }
        if (usedSmiles.length > 0) {
            if (!confirm('Некоторые смайлы уже есть в других категориях.\nПеренести их в новую?')) {
                return false;
            }
            for (i = 0; i < usedSmiles.length; i++) {
                smileId = usedSmiles[i];
                this.smilepack.removeSmile(usedSmiles[i]);
                this.usedSmiles.splice(this.usedSmiles.indexOf(smileId), 1);
                this.collection.setDragged(usedSmiles[i], false);
            }
        }
        this.modified = true;

        var catId = this.smilepack.addCategory(0, null, {
            name: category.name,
            icon: category.icon
        });
        if (catId === null) {
            alert('Кажется, что-то пошло не так');
            return false;
        }

        var groupId = this.smilepack.createGroupForCategory(0, catId);
        if (groupId === null) {
            alert('Кажется, что-то пошло не так');
            return false;
        }

        this.collection.deselectAll();
        this.moveSmiles(catId, smiles, false);
        this.smilepack.selectCategory(0, catId);
        return false;
    },

    addCustomSmile: function(options) {
        if (!options.smiles || options.smiles.length < 1) {
            return {error: 'Не выбраны смайлики'};
        }

        var results = [];
        var i = -1;
        var count = options.smiles.length;
        var categoryId = generator.smilepack.getSelectedCategory(0);
        var cancelled = false;

        var oncancel = function() {
            cancelled = true;
        };

        var upload = function() {
            i++;
            if (cancelled || i === count) {
                this._finishCustomSmile(results, options.onend);
                return;
            }
            if (options.onprogress) {
                options.onprogress({current: i + 1, count: count});
            }

            var startedAt = Date.now();
            var result = this._uploadSmile(
                options.smiles[i],
                categoryId,
                function(data) {
                    results.push(data);
                    var sleep = 350 - (Date.now() - startedAt);
                    if (i + 1 === count) {
                        setTimeout(upload, 0);
                    } else {
                        setTimeout(upload, sleep > 40 ? sleep : 40);
                    }
                }
            );
            if (!result.success) {
                results.push(result);
                upload();
            }
        }.bind(this);

        upload();
        return {success: true, cancelfunc: oncancel};
    },

    _uploadSmile: function(options, categoryId, onend) {
        if (options.error) {
            return {error: options.error};
        }
        if (!options.file && (!options.url || options.url.length < 9)) {
            return {error: 'Надо бы смайлик'};
        }
        if (options.url && options.url.length > 512) {
            return {error: 'Длинновата ссылка, перезалейте на что-нибудь поадекватнее'};
        }
        if (isNaN(options.w) || options.w < 1 || isNaN(options.h) || options.h < 1) {
            return {error: 'Размеры смайлика кривоваты'};
        }

        var onload = function(data) {
            this._uploadSmileEvent(data, options, categoryId, onend);
        }.bind(this);
        var onerror = function(data, x) {
            if (onend) {
                onend({success: false, error: data.error || data});
            } else {
                this.onerror(data, x);
            }
        }.bind(this);

        if (options.url) {
            ajax.create_smile({
                url: options.url,
                w: options.w,
                h: options.h,
                compress: options.compress,
                is_suggestion: options.is_suggestion ? true : false,
                category: options.suggestion_category,
                tags: options.tags || '',
                description: options.description || ''
            }, onload, onerror);
        } else if (options.file) {
            ajax.upload_smile({
                file: options.file,
                w: options.w,
                h: options.h,
                compress: options.compress ? '1' : '',
                is_suggestion: options.is_suggestion ? '1' : '',
                category: options.suggestion_category,
                tags: options.tags || '',
                description: options.description || ''
            }, onload, onerror);
        }

        return {success: true};
    },

    _uploadSmileEvent: function(data, options, categoryId, onend) {
        if (!data.smile) {
            console.log(data);
            if (onend) {
                onend({success: false, error: data.error || data});
            }
        }

        var notice = null;
        if (this.usedSmiles.indexOf(data.smile.id) >= 0) {
            var usedSmile = this.smilepack.getSmileInfo(data.smile.id, {withParent: true});
            var oldCategory = this.smilepack.getCategoryInfo(usedSmile.categoryLevel, usedSmile.categoryId);
            var category = this.smilepack.getCategoryInfo(0, this.smilepack.getSelectedCategory(0));

            if (oldCategory.id === category.id) {
                if (onend) {
                    onend({error: 'Этот смайлик уже есть, причём в этой самой категории!'});
                    return;
                }
            }

            this.smilepack.removeSmile(data.smile.id);
            this.usedSmiles.splice(this.usedSmiles.indexOf(data.smile.id), 1);
            notice = 'Перемещено из категории «' + oldCategory.name + '»';
        }

        var id = generator.smilepack.addSmile({
            id: data.smile.id,
            url: data.smile.url,
            description: data.smile.description,
            w: options.w,
            h: options.h,
            categoryLevel: 0,
            categoryId: categoryId
        }, true);

        if (id !== null) {
            this.usedSmiles.push(id);
            this.modified = true;
            if (!data.created && this.collection.getSmileInfo(data.smile.id)) {
                this.collection.setDragged(data.smile.id, true);
            }
        }
        if (onend) {
            onend({success: true, smileId: id, notice: notice});
        }
    },

    _finishCustomSmile: function(results, onend) {
        var msg = '';
        var success = false;
        for (var i = 0; i < results.length; i++) {
            if (results[i].error) {
                msg += (i + 1).toString() + ': ' + results[i].error + '\n';
            } else {
                success = true;
            }
            if (results[i].notice) {
                msg += (i + 1).toString() + ': ' + results[i].notice + '\n';
            }
        }
        if (onend) {
            if (success) {
                onend({success: true, notice: msg.length > 0 ? msg : null});
            } else {
                onend({success: false, error: msg.length > 0 ? msg : 'Кажется, что-то пошло не так'});
            }
        }
    },

    storageSave: function(interactive) {
        var data = {storageVersion: this.storageVersion, ids: this.smilepack.getLastInternalIds()};

        var smileIds = this.smilepack.getLevelSmileIds(0);
        if (smileIds.length < 1) {
            if (interactive && !confirm("Нет ни одного смайлика. Сохранить пустоту?")) {
                return;
            }
        }

        var categories = this.smilepack.getCategoriesWithHierarchy({short: true});

        var i;
        var catsById = {};
        for (i = 0; i < categories.length; i++) {
            catsById[categories[i].id] = categories[i];
            categories[i].smiles = [];
        }

        for (i = 0; i < smileIds.length; i++) {
            var smile = this.smilepack.getSmileInfo(smileIds[i], {withParent: true});
            catsById[smile.categoryId].smiles.push(smile);
            delete smile.categoryId;
        }

        data.categories = categories;
        var jdata = JSON.stringify(data);
        try {
            window.localStorage.smiles = jdata;
            this.modified = false;
            if (interactive) {
                alert('Сохранено!');
            }
        } catch (e) {
            console.error('Cannot use localStorage:', e);
            if (interactive) {
                alert('Нет доступа к localStorage :(');
            }
        }
    },

    storageLoad: function(interactive) {
        var data;
        try {
            data = window.localStorage.smiles;
        } catch (e) {
            if (interactive) {
                alert('Нет доступа к localStorage :(');
            }
            return false;
        }

        if (!data || data.length < 3) {
            if (interactive) {
                alert('Нечего загружать!');
            }
            return false;
        }

        data = JSON.parse(data);
        if (data.storageVersion != this.storageVersion) {
            if (interactive) {
                alert('С момента сохранения база данных поменялась, не могу загрузить :(');
            }
            return false;
        }

        if (interactive && this.modified && !confirm('При загрузке потеряются несохранённые изменения, продолжить?')) {
            return false;
        }

        this.replaceSmilepackData({categories: data.categories}, data.ids);
        this.modified = false;

        return true;
    },

    /* data management */

    moveSmiles: function(smpId, smiles, deselect) {
        for (var i = 0; i < smiles.length; i++){
            if (this.usedSmiles.indexOf(smiles[i]) >= 0) {
                continue;
            }

            var smile = this.collection.getSmileInfo(smiles[i]);
            smile.categoryLevel = 0;
            smile.categoryId = smpId;

            var newId = this.smilepack.addSmile(smile, true);
            if (newId === null) {
                continue;
            }

            this.usedSmiles.push(smiles[i]);
            this.collection.setDragged(smiles[i], true);
            if (deselect) {
                this.collection.setSelected(smiles[i], false);
            }
            this.modified = true;
        }
    },

    replaceSmilepackData: function(data, lastIds) {
        var i;
        var oldCategories = this.smilepack.getCategoriesWithHierarchy({short: true, withoutIconUrl: true});
        for (i = 0; i < oldCategories.length; i++) {
            this.smilepack.removeCategory(0, oldCategories[i].id);
        }
        for (i = 0; i < this.usedSmiles.length; i++) {
            this.collection.setDragged(this.usedSmiles[i], false);
            this.smilepack.removeSmile(this.usedSmiles[i]);
        }

        this.usedSmiles = [];
        this.smilepack.setLastInternalIds([0], 0);

        this.smilepack.loadData(data);

        for (i = 0; i < data.categories.length; i++) {
            var cat = data.categories[i];
            this.smilepack.createGroupForCategory(0, cat.id);
            for (var j = 0; j < cat.smiles.length; j++) {
                var sm = cat.smiles[j];
                sm.categoryLevel = 0;
                sm.categoryId = cat.id;
                this.smilepack.addSmile(sm, false);
            }
        }

        this.usedSmiles = this.smilepack.getLevelSmileIds(0);
        for (i = 0; i < this.usedSmiles.length; i++) {
            this.collection.setDragged(this.usedSmiles[i], true);
        }

        if (data.categories.length == 1) {
            this.smilepack.selectCategory(0, data.categories[0].id);
        }

        if (lastIds) {
            this.smilepack.setLastInternalIds(lastIds[0], lastIds[1]);
        }
    },

    set_collection_smiles: function(collection, options) {
        var callbackCategory = function(data) {
            for (var i = 0; i < data.smiles.length; i++) {
                data.smiles[i].categoryLevel = 2;
                data.smiles[i].categoryId = options.categoryId;
                var localId = this.collection.addSmileIfNotExists(data.smiles[i]);
                if (localId === null) {
                    continue;
                }

                if (this.usedSmiles.indexOf(data.smiles[i].id) >= 0) {
                    this.collection.setDragged(localId, true);
                }
            }
            collection.showCategory(2, options.categoryId, true);
        }.bind(this);

        var callbackNewSmiles = function(data) {
            this.newSmilesLoadedEvent(data);
            collection.showGroup(this.newSmilesGroup, true);
        }.bind(this);

        var onerror = this.getSmilesErrorEvent.bind(this);

        if (options.groupId === this.newSmilesGroup) {
            ajax.get_new_smiles(0, 100, callbackNewSmiles, onerror);
        } else {
            ajax.get_smiles(options.categoryId, false, callbackCategory, onerror);
        }

        return true;
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

    loadMoreNewSmiles: function() {
        var moreNewBtn = document.querySelector('.additional-new-smiles .action-more-new');
        if (moreNewBtn.classList.contains('new-loading')) {
            return;
        }
        moreNewBtn.classList.add('new-loading');

        this.collection.setLoadingVisibility(true);
        ajax.get_new_smiles(
            this.collection.getSmilesCount(this.newSmilesGroup),
            100,
            this.newSmilesLoadedEvent.bind(this),
            this.getSmilesErrorEvent.bind(this),
            function() {
                this.collection.setLoadingVisibility(false);
                moreNewBtn.classList.remove('new-loading');
            }.bind(this)
        );
    },

    newSmilesLoadedEvent: function(data) {
        for (var i = 0; i < data.smiles.length; i++) {
            data.smiles[i].groupIds = [this.newSmilesGroup];
            var localId = this.collection.addSmileIfNotExists(data.smiles[i]);
            if (localId === null) {
                continue;
            }

            if (this.usedSmiles.indexOf(data.smiles[i].id) >= 0) {
                this.collection.setDragged(localId, true);
            }
        }
    },

    initCollectionData: function() {
        this.collection.loadData(this.collectionData);
        var categories = this.collection.getCategoryIds()[2];
        for (var i = 0; i < categories.length; i++) {
            this.collection.createGroupForCategory(2, categories[i]);
        }
        if (this.collectionData.sections.length == 1) {
            this.collection.selectCategory(0, this.collectionData.sections[0].id);
        }
        this.check_hash();
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
                events: {onchange: this.onchange.bind(this)},
                callbacks: {
                    onload: this.set_collection_smiles.bind(this),
                    ondropto: this.dropToCollectionEvent.bind(this)
                },
                selectable: true,
                selectableDragged: false,
                useCategoryLinks: true
            }
        );

        this.newSmilesGroup = this.collection.createGroup({openedClass: 'new-smiles-opened'});

        this.smilepack = new Collection(
            [
                ['categories', 'category_id', 'Категории:']
            ],
            {
                editable: true,
                container: document.getElementById('smilepack'),
                events: {onaction: this.onaction.bind(this)},
                callbacks: {ondropto: this.dropToSmilepackEvent.bind(this)},
                selectable: true
            }
        );
    },

    initPanels: function() {
        this.collectionPanel = new ActionPanel(
            this.collection,
            [
                {action: 'add'}
            ],
            {
                container: document.getElementById('collection-action-panel'),
                hideIfEmpty: true,
                buttonClassName: 'button',
                onaction: this.onactionCollection.bind(this)
            }
        );
        this.smilepackPanel = new ActionPanel(
            this.smilepack,
            [
                {action: 'move', categorySelect: true},
                {action: 'remove'}
            ],
            {
                container: document.getElementById('smilepack-action-panel'),
                hideIfEmpty: true,
                buttonClassName: 'button',
                onaction: this.onactionSmilepack.bind(this)
            }
        );
    },

    initData: function() {
        if (this.collectionData) {
            this.initCollectionData();
        } else {
            ajax.get_categories(function(data) {
                this.collectionData = data;
                this.initCollectionData();
            }.bind(this));
        }
        if (this.smilepackData) {
            this.replaceSmilepackData(this.smilepackData);
        }
    },

    bindButtonEvents: function() {
        var moveBtn = this.collection.getDOM().querySelector('.additional .action-select-all');
        moveBtn.addEventListener('click', this.selectAllSmiles.bind(this));

        var copyBtn = this.collection.getDOM().querySelector('.additional .action-copy');
        copyBtn.addEventListener('click', this.copyCategory.bind(this));

        var moreNewBtn = this.collection.getDOM().querySelector('.additional-new-smiles .action-more-new');
        moreNewBtn.addEventListener('click', function(event) {
            this.loadMoreNewSmiles();
            event.preventDefault();
            return false;
        }.bind(this));

        var addSmileBtn = this.smilepack.getDOM().querySelector('.additional .action-add-smile');
        addSmileBtn.addEventListener('click', function() {
            dialogsManager.open('smile', {collection: this.collection}, this.addCustomSmile.bind(this));
        }.bind(this));

        var openSavingDialog = this.openSavingDialog.bind(this);
        var openEvent = function() {
            var mode = 'create';
            if (this.classList.contains('action-edit')) {
                mode = 'edit';
            } else if (this.classList.contains('action-fork')) {
                mode = 'fork';
            }
            openSavingDialog(mode);
            return false;
        };
        document.querySelector('.action-create').addEventListener('click', openEvent);
        document.querySelector('.action-edit').addEventListener('click', openEvent);
        document.querySelector('.action-fork').addEventListener('click', openEvent);

        document.getElementById('action-storage-save').addEventListener('click', function() {this.storageSave(true);}.bind(this));
        document.getElementById('action-storage-load').addEventListener('click', function() {this.storageLoad(true);}.bind(this));

        var importBtn = document.getElementById('action-import-userscript');
        importBtn.addEventListener('click', function() {
            dialogsManager.open('import_userscript', {}, this.importUserscript.bind(this));
        }.bind(this));

        document.getElementById('action-toggle-dark').addEventListener('click', this.toggleDark.bind(this));

        var tabs = this.collection.getDOM().querySelectorAll('.collection-tabs > li');
        var changeTabEvent = function(event) {
            if (!event.target.dataset.tab) {
                return;
            }
            this.changeTab(event.target.dataset.tab);
            return false;
        }.bind(this);
        for (var i = 0; i < tabs.length; i++) {
            this.tabs[tabs[i].dataset.tab] = tabs[i];
            tabs[i].addEventListener('click', changeTabEvent);
        }

        document.getElementById('smp-versions').addEventListener('change', this._changeVersionEvent.bind(this));
    },

    registerDialogs: function() {
        dialogsManager.init(document.getElementById('dialog-background'), {
            category: new CategoryDialog(),
            smile: new SmileDialog(),
            import_userscript: new ImportUserscriptDialog(),
            saving: new SmilepackSavingDialog(),
            smilepack: new SmilepackDialog()
        });
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
        this.initData();
        this.initPanels();
        this.bindButtonEvents();
        this.registerDialogs();

        window.addEventListener('hashchange', this.check_hash);
        window.addEventListener('beforeunload', function(e) {
            if (!this.modified) {
                return;
            }
            var s = 'Есть несохранённые изменения в смайлопаке.';
            if (e) {
                e.returnValue = s;
            }
            return s;
        }.bind(this));
    }
};


module.exports = generator;
