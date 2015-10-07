'use strict';

var ajax = {
    getXmlHttp: function(){
        if(typeof XMLHttpRequest != 'undefined'){
            return new XMLHttpRequest();
        }
        var xmlhttp;
        try {
            xmlhttp = new ActiveXObject("Msxml2.XMLHTTP");
        } catch (e) {
            try {
                xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
            } catch (E) {
                xmlhttp = null;
            }
        }
        return xmlhttp;
    },

    request: function(options){
        var x = this.getXmlHttp();
        x.open(options.method || 'GET', options.url);
        for(var header in options.headers || {}){
            x.setRequestHeader(header, options.headers[header]);
        }

        x.onreadystatechange = function(){
            if(x.readyState != 4) return;
            if(x.status >= 400){
                if(options.onerror) options.onerror(x.responseText, x);
            }else{
                var data;
                if(options.format == 'json'){
                    if(typeof JSON != 'undefined') data = JSON.parse(x.responseText);
                    else data = eval('(' + x.responseText + ')');
                }else{
                    data = x.responseText;
                }
                if(options.onload) options.onload(data, x);
            }
        };

        x.send(options.data || null);
        return x;
    },

    get_categories: function(onload, onerror){
        return this.request({
            url: '/smiles/',
            format: 'json',
            onload: onload,
            onerror: onerror
        });
    },

    get_smiles: function(categoryId, onload, onerror){
        return this.request({
            url: '/smiles/' + parseInt(categoryId).toString(),
            format: 'json',
            onload: onload,
            onerror: onerror
        });
    },

    create_smilepack: function(name, lifetime, categories, smiles, onload, onerror){
        return this.request({
            method: 'POST',
            url: '/smilepack/',
            format: 'json',
            onload: onload,
            onerror: onerror,
            data: JSON.stringify({
                name: name,
                lifetime: lifetime,
                categories: categories,
                smiles: smiles
            }),
            headers: {'Content-Type': 'application/json'}
        });
    }
};
