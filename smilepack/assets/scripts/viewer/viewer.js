'use strict';

var Collection = require('../common/widgets/Collection.js');


var viewer = {
    smilepack: null,
    smilepackData: null,

    init: function() {
        this.smilepack = new Collection(
            [
                ['categories', 'category_id', 'Категории:']
            ],
            {
                editable: false,
                container: document.getElementById('smilepack'),
                selectable: false
            }
        );

        var data = this.smilepackData;
        this.smilepack.loadData(data);

        for (var i = 0; i < data.categories.length; i++) {
            var cat = data.categories[i];
            this.smilepack.createGroupForCategory(0, cat.id);
            for (var j = 0; j < cat.smiles.length; j++) {
                var sm = cat.smiles[j];
                sm.categoryLevel = 0;
                sm.categoryId = cat.id;
                this.smilepack.addSmile(sm, false);
            }
        }

        if (data.categories.length == 1) {
            this.smilepack.selectCategory(0, data.categories[0].id);
        }
    }
};


module.exports = viewer;
