'use strict';

var shuffle = {
    element: document.getElementById('new-smiles'),
    available: true,
    interval: 6500,
    smiles: {},
    smileIds: [],

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
        while(this.element.lastElementChild) this.element.removeChild(this.element.lastElementChild);

        var temp, index;
        for(var c=this.smileIds.length-1; c>=0; c--) {
            index = Math.floor(Math.random() * (c + 1));
            temp = this.smileIds[c];
            this.smileIds[c] = this.smileIds[index];
            this.smileIds[index] = temp;
        }

        for(var i=0; i<25 && i<this.smileIds.length; i++){
            var smile = this.smiles[this.smileIds[i]];
            if(!smile.dom){
                var a = document.createElement('a');
                a.href = '/generate#' + smile.smile.category[0];
                var img = document.createElement('img');
                img.src = smile.smile.url;
                img.title = smile.smile.category[1];
                if(smile.smile.h <= 120){
                    img.width = smile.smile.w;
                    img.height = smile.smile.h;
                }else{
                    img.width = Math.round(smile.smile.w * 120 / smile.smile.h);
                    img.height = 120;
                }
                a.appendChild(img);
                smile.dom = a;
            }
            this.element.appendChild(smile.dom);
        }

        this.element.style.opacity = 1.0;
    },

    fetch: function(callback){
        var x = new XMLHttpRequest();
        x.open('GET', '/smiles/new');

        x.onreadystatechange = function(){
            if(x.readyState != 4) return;
            if(x.status === 0 || x.status >= 400){
                if(callback) callback(false, x);
                return;
            }

            var data;
            try{
                data = JSON.parse(x.responseText);
            }catch(e){
                console.error(e);
                if(callback) callback(false, x);
            }
            for(var i=0; i<data.smiles.length; i++){
                var smile = data.smiles[i];
                if(!this.smiles[smile.id]) this.smiles[smile.id] = {dom: null, smile: null};
                this.smiles[smile.id].smile = smile;
                this.smileIds.push(smile.id);
            }
            if(callback) callback(true, x);
        }.bind(this);

        x.send(null);
    },

    fetchAndStart: function(){
        this.fetch(function(){this.start();}.bind(this));
    },

    init: function(start_now){
        this.element.addEventListener('mouseover', this.mouseover.bind(this));
        this.element.addEventListener('mouseout', this.mouseout.bind(this));
        if(start_now) this.start();
    },

    start: function(){
        this.shuffle();
        setInterval(this.shuffle.bind(this), this.interval);
    }
};


window.addEventListener('load', function(){
    if(shuffle.element){
        shuffle.init();
        setTimeout(function(){shuffle.fetchAndStart();}, 3500);
    }
});
