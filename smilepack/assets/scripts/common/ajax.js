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
        for (var i = 0; i < metas.length; i++) {
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
        if (options.format == 'json') {
            x.setRequestHeader('Accept', 'application/json');
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

    get_smiles: function(categoryId, extended, onload, onerror, onend) {
        return this.request({
            url: '/smiles/' + parseInt(categoryId).toString() + (extended ? '?extended=1' : ''),
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

    get_unpublished_smiles: function(filter, older, offset, count, onload, onerror, onend) {
        return this.request({
            url: '/admin/smiles/unpublished?' + this.buildQS({filter: filter || 'all', older: older || '', offset: offset, count: count}),
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend
        });
    },

    create_smilepack: function(mode, parent, name, lifetime, categories, smiles, onload, onerror, onend) {
        var data = {
            name: name,
            lifetime: lifetime,
            categories: categories,
            smiles: smiles
        };
        if (mode === 'edit') {
            data.edit = parent;
        } else if (mode === 'fork') {
            data.fork = parent;
        }
        return this.request({
            method: 'POST',
            url: '/smilepack/',
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend,
            data: JSON.stringify({smilepack: data}),
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

    create_icon: function(data, onload, onerror, onend) {
        return this.request({
            method: 'POST',
            url: '/icons/',
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend,
            data: JSON.stringify(data),
            headers: {'Content-Type': 'application/json'}
        });
    },

    upload_icon: function(data, onload, onerror, onend) {
        var fdata = new FormData();
        for (var x in data) {
            fdata.append(x, data[x]);
        }

        return this.request({
            method: 'POST',
            url: '/icons/',
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend,
            data: fdata
        });
    },

    edit_icon: function(id, data, onload, onerror, onend) {
        return this.request({
            method: 'POST',
            url: '/admin/icons/' + parseInt(id),
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend,
            data: JSON.stringify({csrf_token: this.get_csrf_token(), icon: data}),
            headers: {'Content-Type': 'application/json'}
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

    edit_many_smiles: function(items, onload, onerror, onend) {
        return this.request({
            method: 'POST',
            url: '/admin/smiles/edit',
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend,
            data: JSON.stringify({csrf_token: this.get_csrf_token(), items: items}),
            headers: {'Content-Type': 'application/json'}
        });
    },

    create_category: function(level, data, onload, onerror, onend) {
        var url = '/admin/unknown_url';
        if (level === 0) {
            url = '/admin/sections';
        } else if (level === 1) {
            url = '/admin/subsections';
        } else if (level === 2) {
            url = '/admin/categories';
        }

        var reqData = {csrf_token: this.get_csrf_token()};
        var name = 'item';
        if (level === 0) {
            name = 'section';
        } else if (level === 1) {
            name = 'subsection';
        } else if (level === 2) {
            name = 'category';
        }
        reqData[name] = data;

        return this.request({
            method: 'POST',
            url: url,
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend,
            data: JSON.stringify(reqData),
            headers: {'Content-Type': 'application/json'}
        });
    },

    edit_category: function(level, id, data, onload, onerror, onend) {
        var url = '/admin/unknown_url/';
        if (level === 0) {
            url = '/admin/sections/';
        } else if (level === 1) {
            url = '/admin/subsections/';
        } else if (level === 2) {
            url = '/admin/categories/';
        }

        var reqData = {csrf_token: this.get_csrf_token()};
        var name = 'item';
        if (level === 0) {
            name = 'section';
        } else if (level === 1) {
            name = 'subsection';
        } else if (level === 2) {
            name = 'category';
        }
        reqData[name] = data;

        return this.request({
            method: 'POST',
            url: url + parseInt(id),
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend,
            data: JSON.stringify(reqData),
            headers: {'Content-Type': 'application/json'}
        });
    },

    delete_category: function(level, id, onload, onerror, onend) {
        var url = '/admin/unknown_url/';
        if (level === 0) {
            url = '/admin/sections/';
        } else if (level === 1) {
            url = '/admin/subsections/';
        } else if (level === 2) {
            url = '/admin/categories/';
        }

        return this.request({
            method: 'DELETE',
            url: url + parseInt(id),
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend,
            data: JSON.stringify({csrf_token: this.get_csrf_token()}),
            headers: {'Content-Type': 'application/json'}
        });
    },

    get_users: function(params, onload, onerror, onend) {
        return this.request({
            url: '/admin/users/?' + this.buildQS(params),
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend
        });
    },

    create_user: function(data, onload, onerror, onend) {
        return this.request({
            method: 'POST',
            url: '/admin/users/',
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend,
            data: JSON.stringify({csrf_token: this.get_csrf_token(), user: data}),
            headers: {'Content-Type': 'application/json'}
        });
    },

    edit_user: function(id, data, onload, onerror, onend) {
        return this.request({
            method: 'POST',
            url: '/admin/users/' + parseInt(id),
            format: 'json',
            onload: onload,
            onerror: onerror,
            onend: onend,
            data: JSON.stringify({csrf_token: this.get_csrf_token(), user: data}),
            headers: {'Content-Type': 'application/json'}
        });
    }
};


module.exports = ajax;
