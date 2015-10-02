'use strict';

function getXmlHttp(){
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
}

var ajax = {
    get_categories: function(callback, error_callback){
        var x = getXmlHttp();
        x.open('GET', '/smiles/');
        x.onreadystatechange = function(){
            if(x.readyState != 4) return;
            if(x.status >= 400) {
                if(error_callback) error_callback(x.responseText);
            }else{
                var data;
                if(typeof JSON != 'undefined') data = JSON.parse(x.responseText);
                else data = eval('(' + x.responseText + ')');
                callback(data);
            }
        }
        x.send(null);
    },

    get_smiles: function(category_id, callback, error_callback){
        var x = getXmlHttp();
        x.open('GET', '/smiles/' + parseInt(category_id));
        x.onreadystatechange = function(){
            if(x.readyState != 4) return;
            if(x.status >= 400) {
                if(error_callback) error_callback(x.responseText);
            }else{
                var data;
                if(typeof JSON != 'undefined') data = JSON.parse(x.responseText);
                else data = eval('(' + x.responseText + ')');
                callback(data);
            }
        }
        x.send(null);
    },

    create_smilepack: function(name, lifetime, categories, smiles, callback, error_callback){
        var x = getXmlHttp();
        x.open('POST', '/smilepack/');
        x.setRequestHeader('Content-Type', 'application/json');
        x.onreadystatechange = function(){
            if(x.readyState != 4) return;
            if(x.status >= 400) {
                if(error_callback) error_callback(x.responseText);
            }else{
                var data;
                if(typeof JSON != 'undefined') data = JSON.parse(x.responseText);
                else data = eval('(' + x.responseText + ')');
                callback(data);
            }
        }
        x.send(JSON.stringify({
            "name": name,
            "lifetime": lifetime,
            "categories": categories,
            "smiles": smiles
    }));
    }
};
