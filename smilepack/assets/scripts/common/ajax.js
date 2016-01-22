'use strict';

var ajax = {
    _csrf_token: null,

    getXmlHttp: function() {
        if (typeof XMLHttpRequest != 'undefined') {
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

    get_csrf_token: function() {
        if (this._csrf_token !== null) {
            return this._csrf_token;
        }
        var metas = document.head.getElementsByTagName('meta');
        for (var i=0; i < metas.length; i++) {
            if (metas[i].name === 'csrf_token') {
                this._csrf_token = metas[i].content;
                break;
            }
        }
        return this._csrf_token;
    },

    request: function(options) {
        var x = this.getXmlHttp();
        x.open(options.method || 'GET', options.url);
        for (var header in options.headers || {}) {
            x.setRequestHeader(header, options.headers[header]);
        }

        x.onreadystatechange = function() {
            var data;
            var error = false;
            if (x.readyState != 4) {
                return;
            }

            if (x.status < 100) {
                error = true;
                data = {error: 'Request error ' + x.status.toString()};
                if (options.onerror) {
                    options.onerror(data, x);
                }
            } else if (x.status >= 400) {
                error = true;
                if (options.onerror) {
                    data = x.responseText;
                    if (options.format == 'json' && data.length > 1 && data[0] == '{') {
                        try {
                            data = JSON.parse(x.responseText);
                        } catch (e) {}
                    }
                    options.onerror(data, x);
                }

            } else {
                if (options.format == 'json') {
                    data = JSON.parse(x.responseText);
                } else {
                    data = x.responseText;
                }
                if (options.onload) {
                    options.onload(data, x);
                }
            }

            if (options.onend) {
                options.onend(error, data, x);
            }
        };

        x.send(options.data || null);
        return x;
    },

    buildQS: function(obj) {
        var result = [];
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                result.push(encodeURIComponent(key) + '=' + encodeURIComponent(obj[key]));
            }
        }
        return result.join('&');
    },

    get_categories: function(onload, onerror, onend) {
        return this.request({
            url: '/smiles/',
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend,
        });
    },

    get_smiles: function(categoryId, onload, onerror, onend) {
        return this.request({
            url: '/smiles/' + parseInt(categoryId).toString(),
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend
        });
    },

    get_new_smiles: function(offset, count, onload, onerror, onend) {
        return this.request({
            url: '/smiles/new?' + this.buildQS({offset: offset, count: count}),
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend
        });
    },

    get_nonapproved_smiles: function(older, offset, count, onload, onerror, onend) {
        return this.request({
            url: '/admin/smiles/nonapproved?' + this.buildQS({older: older || '', offset: offset, count: count}),
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend
        });
    },

    create_smilepack: function(name, lifetime, categories, smiles, onload, onerror, onend) {
        return this.request({
            method: 'POST',
            url: '/smilepack/',
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend,
            data: JSON.stringify({
                name: name,
                lifetime: lifetime,
                categories: categories,
                smiles: smiles
            }),
            headers: {'Content-Type': 'application/json'}
        });
    },

    import_userscript: function(form, onload, onerror, onend) {
        return this.request({
            method: 'POST',
            url: '/smilepack/import',
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend,
            data: new FormData(form)
        });
    },

    create_smile: function(data, onload, onerror, onend) {
        return this.request({
            method: 'POST',
            url: '/smiles/',
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend,
            data: JSON.stringify(data),
            headers: {'Content-Type': 'application/json'}
        });
    },

    upload_smile: function(data, onload, onerror, onend) {
        var fdata = new FormData();
        for (var x in data) {
            fdata.append(x, data[x]);
        }

        return this.request({
            method: 'POST',
            url: '/smiles/',
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend,
            data: fdata
        });
    },

    edit_smile: function(id, data, onload, onerror, onend) {
        return this.request({
            method: 'POST',
            url: '/admin/smiles/' + parseInt(id),
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend,
            data: JSON.stringify({csrf_token: this.get_csrf_token(), smile: data}),
            headers: {'Content-Type': 'application/json'}
        });
    },
};


module.exports = ajax;
