'use strict';

var shuffle = {
    element: document.getElementById('new-smiles'),
    available: true,
    interval: 6500,

    mouseover: function(){
        this.available = false;
    },

    mouseout: function(){
        this.available = true;
    },

    shuffle: function(){
        if(!this.available) return;
        this.element.style.opacity = 0.0;
        setTimeout(this._shuffleEnd.bind(this), 250);
    },

    _shuffleEnd: function(){
        for (var i=this.element.children.length; i>=0; i--) {
            this.element.appendChild(this.element.children[Math.random() * i | 0]);
        }
        this.element.style.opacity = 1.0;
    },

    init: function(start_now){
        this.element.addEventListener('mouseover', this.mouseover.bind(this));
        this.element.addEventListener('mouseout', this.mouseout.bind(this));
        setInterval(this.shuffle.bind(this), this.interval);
        if(start_now) this.shuffle();
    }
};


window.addEventListener('load', function(){
    if(shuffle.element) setTimeout(function(){shuffle.init(true);}, 4000);
});
