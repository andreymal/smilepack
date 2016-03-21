'use strict';

var utils = {
    genCategoryOptionsDOM: function(collection, options) {
        options = options || {};

        var categories = collection ? collection.getCategoryIdsWithSmiles() : [];
        var optionsDOM = document.createDocumentFragment();
        var i;

        var option;
        if (!options.disableEmptyValue) {
            option = document.createElement('option');
            option.value = '';
            option.textContent = '---';
            optionsDOM.appendChild(option);
        }

        for (i = 0; i < categories.length; i++) {
            var level = categories[i][0];
            var id = categories[i][1];
            if (level !== 2) {
                console.warn('genCategoryOptionsDOM: category level is not 2, ignored.', categories[i]);
                continue;
            }
            var catInfo = collection.getCategoryInfo(level, id, {withParent: true});
            var catTitle = catInfo.name || id.toString();
            if (catInfo.parentId !== null) {
                var parentInfo = collection.getCategoryInfo(level - 1, catInfo.parentId);
                catTitle = (parentInfo.name || catInfo.parentId.toString()) + ' -> ' + catTitle;
            }

            option = document.createElement('option');
            option.value = id.toString();
            option.textContent = catTitle;
            optionsDOM.appendChild(option);
        }

        return optionsDOM;
    }
};

module.exports = utils;
