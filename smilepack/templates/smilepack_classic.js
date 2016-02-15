// ==UserScript==
// @name         Смайлопак «{{ pack_name }}»
// @version      1.21
// @description  Создан {{ pack.created_at.strftime('%Y-%m-%d') }}
{% if websites_mode == 'blacklist' -%}
// @match        http://*/*
// @match        https://*/*
{% endif -%}
{% for site in websites_list -%}
    // @{{ 'match        ' if websites_mode == 'whitelist' else 'exclude      ' }}{{ site }}
{% endfor -%}
// @exclude      http://*.google.*
// @exclude      https://*.google.*

// @author       Код: EeyupBrony, Dark_XSM, Dotterian; адаптировал andreymal
// ==/UserScript==
{% raw %}
(function(document, fn) {
    var script = document.createElement('script');
    script.setAttribute('type', 'text/javascript');
    script.textContent = '(' + fn + ')(window, window.document)';
    document.body.appendChild(script); // run the script
    document.body.removeChild(script); // clean up
})(document, function(window, document) {

// Во избежание запуска в куче iframe'ов, например, в Gmail
// К сожалению, нельзя запустить это извне: после этого Опера не пробрасывает скрипт хоть ты убейся
if (window.top !== window.self) {
    return;
}
{% endraw %}
// Генерируемые данные
var data = {
    version: '1.21',
    timestamp: 'optional',
    sections: {{ pack_json_compat|tojson|safe }},
    sites: []
};

// Некоторые константы
var consts = {
    host: {{ host|tojson|safe }},
    generatorUrl: {{ generator_url|tojson|safe }},
    packIcoUrl: {{ pack_ico_url|tojson|safe }},{% raw %}
    smileUrlTemplate: 'http://smiles.smile-o-pack.net/{{id}}.gif',
    sectionIcoUrlTemplate: '{{url}}',
    categoryIcoUrlTemplate: '{{url}}',
    prefix: 'smilepack-'
}


/**
 * Как было бы хорошо без кастомных разделов: у всех был бы id и он был уникальный :)
 * Сейчас это уже не так, так что эта функция - попытка сделать более-менее
 * постоянный и уникальный id для разделов. В первую очередь для сохранения в localStorage,
 * так-то можно было бы и индексом обойтись
 */
function getSectionIdentity(s) {
    if (s.id != null) { // не null и не undefined
        return s.id;
    } else {
        return 'name:' + s.name;
    }
}

function getSectionIcoUrl(s) {
    if(s.icon.toString().split('.').length!=2) {
        return s.icon;
    } else {
        s.icon = s.icon.toString();
        return consts.sectionIcoUrlTemplate.replace('{{url}}', s.icon);
    }
}

function getCategoryIcoUrl(c) {
    if(c.icon.toString().split('.').length!=2) {
        return c.icon;
    } else {
        c.icon = c.icon.toString();
        return consts.categoryIcoUrlTemplate.replace('{{url}}', c.icon);
    }
}

function getSmileUrl(s) {
    if(!s.url) {
        //sid = s.id.toString().split('.');
        //console.log(aid);
        //section = data.structure[sid[0]].code;
        //category = data.structure[sid[0]].categories[sid[1]].code;
        return consts.smileUrlTemplate.replace('{{id}}',s.id);
    } else {
        return s.url;
    }
}


// Хеш для доступа к разделам не по номеру, а по 'id' или суррогатному 'id'
var sectionsById = {};
data.sections.forEach(function(s) {
    sectionsById[getSectionIdentity(s)] = s;
});


// Дополнительные hook'и для сайтов.
var sites = {
    'tabun.everypony.ru': {
        defaultEnabled: true, // по умолчанию - false: ждём, пока пользователь кликнет по иконке над текстареей
        smileType: 'HTML',
        alterHtmlSmileAttributes: function(attrs) {
            attrs.class = 'smp';
        }
    },
    'forum.everypony.ru': {
        defaultEnabled: true,
        smileType: 'BB'
    },
    'habrahabr.ru': {
        smileType: 'HTML'
    },
    'freehabr.ru': {
        smileType: 'HTML'
    }
}
sites['news.playground.ru'] = sites['pix.playground.ru'] = sites['forums.playground.ru'] = sites['www.playground.ru'] = sites['playground.ru'] = {
    smileType: 'HTML'
}


// Состояние смайлопака: по сути большая каша переменных, сгруппированная в одном месте
var state = {
    siteConfig: {}, // конфиг текущего сайта, по умолчанию, пустой
    enabled: false, // включён ли смайлопак на данном сайте
    currentTextarea: null, // textarea, к которой присосалась плашка на данный момент
    smileType: 'HTML', // тип вставляемых смайлов, по умолчанию, 'HTML', может быть 'BB'
    currentSection: null, // текущий раздел
    currentCategoryIndex: null,
    blockWrapperMaxHeight: '600px', // максимальная высота блока (пока не реализована)
    ckeClickHack: false, // в редакторе CKE клик перехватывается раньше нашего. Обрабатываем mousedown
}

var elements = {
    wrapper: null, // html-элемент, оборачивающий textarea вместе с верхней и нижней панелями
    bottomWrapper: null, // html-элемент: внешняя обёртка для всех элементов ниже текстареи
    panel: null, // html-элемент: плашка смайлопака
    panelCategories: null,
    menu: null,
    topWrapper: null, // html-элемент: кнопка, плавающая поверх textarea
    blockContainer: null, // html-элемент: обёртка для блоков категорий
    currentBlock: null,
    blockCache: {}, // html-элементы: блоки категорий со смайлами (создаются по мере надобности)
    mnuSmileType: null,
    mnuSection: null,
    btnHide: null,
    btnEnable: null,
    newTopTableRow: null, // в тех редких случаях, когда нижняя панель добавляется в новом (следующем за textarea'ей) ряду таблицы, сохраним этот новый tr тут
    newBottomTableRow: null, // в тех редких случаях, когда верхняя панель добавляется в новом ряду таблицы, сохраним этот новый tr тут
}



// Вспомогательные функции

/**
 * Выполняет функцию, когда DOM оказывается полностью загружен
 */
function domReady(fun) {
    // TODO: проверить, работает ли вообще
    // TODO: добавить поддержку старых, немощных и больных браузеров, в т.ч. IE8
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        fun();
    } else {
        document.addEventListener('DOMContentLoaded', fun, false);
    }
}

function getElement(id) {
    return document.getElementById(consts.prefix + id);
}

function htmlEscape(str) {
    return str && str.replace(/[&<>"]/g, function(c) {
        if (c === '&') return '&amp;'
        if (c === '<') return '&lt;'
        if (c === '>') return '&gt;'
        if (c === '"') return '&quot;'
    });
}

function getLocalStorageString(key) {
    return window.localStorage ? window.localStorage[consts.prefix + key] : null;
}
function setLocalStorageStringIfPossible(key, val) {
    if (window.localStorage && typeof window.localStorage === 'object') {
        window.localStorage[consts.prefix + key] = val;
    }
}

// http://stackoverflow.com/a/442474
function getOffset(el) {
    var _x = 0;
    var _y = 0;
    while(el && el != document.body && !isNaN(el.offsetLeft) && !isNaN(el.offsetTop)) {
        _x += el.offsetLeft - el.scrollLeft;
        _y += el.offsetTop - el.scrollTop;
        el = el.offsetParent;
    }
    return { top: _y, left: _x };
}

/**
 * Проверяет, а не стоит ли по умолчанию использовать формат HTML на этом сайте
 */
function doesSiteProbablyUseHtml() {
    if (window.ls && window.ls.settings) {
        // LiveStreet CMS
        return true;
    }
    // TODO: другие признаки
    return false;
}

/**
 * Вызывает hook для текущего сайта, если он существует
 * Первым аргументом принимает имя хука, остальные - аргументы хука
 * Возвращает результат выполнения хука
 */
function invokeHook(name /*, arguments */) {
    if (state.siteConfig[name]) {
        return state.siteConfig[name].apply(null, Array.prototype.slice.call(arguments, 1));
    }
}


/**
 * Главная функция: вставляет смайл в текущую textarea
 */
function insertSmileToCurrentTextarea(src, w, h) {
    // TODO: возможно, заставить работать под IE8
    var ta = state.currentTextarea
      , s = ta.selectionStart
      , e = ta.selectionEnd
      , smileSource;

    if (state.smileType == 'HTML') {
        // Без высоты: сама подгонится, а пользователю не надо пересчитывать пропорции
        var attrs = { src: src, width: w };
        invokeHook('alterHtmlSmileAttributes', attrs);
        smileSource = '<img ';
        for (var a in attrs) {
            smileSource += a + '="' + htmlEscape(attrs[a]) + '" ';
        }
        smileSource += '/>';
    } else /* BB */ {
        smileSource = '[IMG]' + src + '[/IMG]'
    }
    ta.value = ta.value.substr(0, s) + smileSource + ta.value.substr(e);
    ta.selectionStart = ta.selectionEnd = s + smileSource.length;
    ta.focus();
}


// Изменение состояния смайлопака (выбор раздела/типа смайлов)

function fixWidth() {
    var ta = state.currentTextarea;
    if (ta) {
        elements.topWrapper.style.width = elements.bottomWrapper.style.width = '' + ta.offsetWidth + 'px';
        var computedStyles = getComputedStyle ? getComputedStyle(ta) : ta.currentStyle;
        ['margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'position', 'box-sizing'].forEach(function(a) {
            elements.topWrapper.style.setProperty(a, computedStyles.getPropertyValue(a));
            elements.bottomWrapper.style.setProperty(a, computedStyles.getPropertyValue(a));
        });
    }
}

function isTheOnlyChild(el) {
    if (!el || el == document.body || !el.parentNode) {
        return false;
    }
    var res = true;
    Array.prototype.forEach.call(el.parentNode.childNodes, function(n) {
        if (n.nodeType == 1 && n != el) res = false
    });
    return res;
}

function attachToTextarea(ta) {
    if (state.currentTextarea) {
        // detach: remove wrappers
        if (elements.topWrapper.parentNode) {
            elements.topWrapper.parentNode.removeChild(elements.topWrapper);
        }
        if (elements.bottomWrapper.parentNode) {
            elements.bottomWrapper.parentNode.removeChild(elements.bottomWrapper);
        }
        if (elements.newTopTableRow && elements.newTopTableRow.parentNode) {
            elements.newTopTableRow.parentNode.removeChild(elements.newTopTableRow);
            elements.newTopTableRow = null;
        }
        if (elements.newBottomTableRow && elements.newBottomTableRow.parentNode) {
            elements.newBottomTableRow.parentNode.removeChild(elements.newBottomTableRow);
            elements.newBottomTableRow = null;
        }
    }
    state.currentTextarea = ta;
    if (ta) {

        state.ckeClickHack = !!(/(^|\s)cke_source(\s|$)/.exec(ta.className));

        fixWidth();

        // Найдём, куда присоседиться. При этом считаем, что если textarea - единственное дитё узла, то присоседиваться надо к её родителю
        // Если присоседится надо к единственной дите, но она - дитё TD, придётся дофигачить TR
        if (!isTheOnlyChild(ta)) {

            ta.parentNode.insertBefore(elements.topWrapper, ta);
            if (ta.nextSibling) {
                ta.parentNode.insertBefore(elements.bottomWrapper, ta.nextSibling);
            } else {
                ta.parentNode.appendChild(elements.bottomWrapper);
            }

        } else if (ta.parentNode.nodeName.toUpperCase() != 'TD') {

            var n = ta.parentNode;

            n.parentNode.insertBefore(elements.topWrapper, n);
            if (n.nextSibling) {
                n.parentNode.insertBefore(elements.bottomWrapper, n.nextSibling);
            } else {
                n.parentNode.appendChild(elements.bottomWrapper);
            }


        } else {

            var topParent, bottomParent, tr = ta.parentNode.parentNode;

            elements.newTopTableRow = document.createElement('TR');
            elements.newBottomTableRow = document.createElement('TR');
            Array.prototype.forEach.call(tr.childNodes, function(td) {
                var newTopTd = document.createElement('TD')
                  , newBottomTd = document.createElement('TD');
                if (td.hasAttribute('colspan')) {
                    newTopTd.setAttribute('colspan', td.getAttribute('colspan'))
                    newBottomTd.setAttribute('colspan', td.getAttribute('colspan'))
                }
                elements.newTopTableRow.appendChild(newTopTd);
                elements.newBottomTableRow.appendChild(newBottomTd);
                if (td == ta.parentNode) {
                    topParent = newTopTd;
                    bottomParent = newBottomTd;
                }
            });

            tr.parentNode.insertBefore(elements.newTopTableRow, tr);
            if (tr.nextSibling) {
                tr.parentNode.insertBefore(elements.newBottomTableRow, tr.nextSibling);
            } else {
                tr.parentNode.appendChild(elements.newBottomTableRow);
            }

            if (topParent) {
                topParent.appendChild(elements.topWrapper);
            } // ELSE: probably, impossible
            if (bottomParent) {
                bottomParent.appendChild(elements.bottomWrapper);
            } // ELSE: probably, impossible

        }
    }
}

function setEnabled(enabled) {
    state.enabled = enabled;
    setLocalStorageStringIfPossible('enabled', enabled);
    elements.bottomWrapper.style.display = enabled ? 'block' : 'none';
    elements.btnEnable.style.display = enabled ? 'none' : 'block';
}

function setSmileType(type /* HTML/BB */) {
    state.smileType = type;
    setLocalStorageStringIfPossible('smileType', type);
    if (elements.mnuSmileType) { // null if siteConfig.smileType is set
        Array.prototype.slice.call(elements.mnuSmileType.getElementsByTagName('LI')).forEach(function(li) {
            if (li.getAttribute('data-' + consts.prefix + 'smile-type') == type) {
                li.setAttribute('class', consts.prefix + 'current');
            } else {
                li.removeAttribute('class');
            }
        });
    }
}

function setCurrentSection(id) {
    if (!sectionsById[id]) {
        // на случай, если такой раздел уже был удалён пользователем
        id = getSectionIdentity(data.sections[0]);
    }
    state.currentSection = sectionsById[id];
    setLocalStorageStringIfPossible('currentSectionId', id);
    setCurrentCategory(null);
    // быстро сносим оттуда все кнопочки
    elements.panelCategories.innerHTML = '';
    state.currentSection.categories.forEach(function(category, idx) {
        var img = document.createElement('IMG');
        img.setAttribute('src', getCategoryIcoUrl(category));
        img.setAttribute('data-' + consts.prefix + 'category-index', idx);
        img.setAttribute('title', category.name);
        img.setAttribute('alt', category.name);
        img.addEventListener('click', onCategoryIconClick);
        elements.panelCategories.appendChild(img);
    });
    if (elements.mnuSection) { // null if there is a single section only
        Array.prototype.slice.call(elements.mnuSection.getElementsByTagName('LI')).forEach(function(li) {
            if (li.getAttribute('data-' + consts.prefix + 'section-identity') == id) {
                li.setAttribute('class', consts.prefix + 'current');
            } else {
                li.removeAttribute('class');
            }
        });
    }
}

function createBlock(sectionId, categoryIndex) {
    var block = document.createElement('DIV')
        , imgTemplate = document.createElement('IMG')
        , buf = []
        , i
        , timer;

    block.addEventListener('mousedown', function(ev) {
        if (state.ckeClickHack) {
            onSmileBlockClick(ev);
        }
    });
    block.addEventListener('click', function(ev) {
        if (!state.ckeClickHack) {
            onSmileBlockClick(ev);
        }
    });
    // Для начала проставим шаблону простой src, равный однопиксельному гифу
    // Его отрисовка происходит почти мгновенно, зато лиса не будет плющить вёрстку из-за того,
    // что src пока пуст (а она это делает, даже не смотря на то, что ей размеры прописали)
    imgTemplate.setAttribute('src', 'data:image/gif;base64,R0lGODdhAQABAIABAP///+dubiwAAAAAAQABAAACAkQBADs=');
    // Теперь пробежимся по всем смайлам, создадим и добавим их в DOM
    sectionsById[sectionId].categories[categoryIndex].smiles.forEach(function(smile) {
        var img = imgTemplate.cloneNode(false);
        img.setAttribute('width', smile.w);
        img.setAttribute('height', smile.h);
        block.appendChild(img);
        // хак для уменьшения лага: оказалось, что проставление url'а картинке - длительный процесс
        // и выгоднее отложить его для скорейшего появления блока
        buf.push({ img: img, url: getSmileUrl(smile) });
    });
    // А вот теперь, запускаем проставление реальных src: по десять за раз с минимальным интервалом
    i = 0;
    timer = setInterval(function() {
        for (var j = i; j < buf.length && j < i + 10; j++) {
            buf[j].img.setAttribute('src', buf[j].url);
        }
        i = j;
        if (i >= buf.length) {
            clearInterval(timer);
        }
    }, 0);
    return block;
}

/**
 * Отображает блок со смайлами из указанной категории текущего раздела
 */
function setCurrentCategory(categoryIndex) {

    state.currentCategoryIndex = categoryIndex;

    if (categoryIndex === null) {
        elements.btnHide.style.visibility = 'hidden';
        if (elements.currentBlock) {
            elements.blockContainer.removeChild(elements.currentBlock);
            elements.currentBlock = null;
        }
        elements.blockContainer.style.display = 'none';
    } else {
        // сначала спрячем то, что уже есть
        if (elements.currentBlock) {
            elements.blockContainer.removeChild(elements.currentBlock);
        }


        var sectionId = getSectionIdentity(state.currentSection);

        // в случае, если для данного раздела ещё ни одной категории в кеше нет, надо
        // создать там пустой объект
        elements.blockCache[sectionId] = elements.blockCache[sectionId] || {};

        // если блок в кеше - пользуемя им, если пока нет - создаём
        var block = elements.blockCache[sectionId][categoryIndex];
        if (!block) {
            block = elements.blockCache[sectionId][categoryIndex] = createBlock(sectionId, categoryIndex);
        }

        elements.currentBlock = block;

        elements.blockContainer.appendChild(block);
        elements.btnHide.style.visibility = 'visible';
        elements.blockContainer.style.display = 'block';
        // TODO: проставить максимальную высоту и дать пользователю возможность ресайзить blockContainer
    }
}


// Обработчики кликов

function onSmileBlockClick(evt) {

    var img = evt.srcElement || evt.originalTarget;

    if (img.nodeName.toUpperCase() === 'IMG') {
        insertSmileToCurrentTextarea(
            img.getAttribute('src'),
            img.getAttribute('width'),
            img.getAttribute('height')
        );
    }

    return false;
}

function onCategoryIconClick() {
    var categoryIndex = this.getAttribute('data-' + consts.prefix + 'category-index');

    if (state.currentCategoryIndex === categoryIndex) {
        setCurrentCategory(null);
    } else {
        setCurrentCategory(categoryIndex);
    }
    return false;
}


/**
 * Обрабатывает событие фокуса любого фокусируемого элемента
 */
function onAnyElementFocus(evt) {
    // периодически лиса на этой строчке пишет, что permission denied
    // при этом, ловить exception бесполезно. Ну и пофик
    var target = evt.srcElement || evt.originalTarget;

    if (target && target.nodeName.toUpperCase() == 'TEXTAREA') {
        if (state.currentTextarea != target) {
            attachToTextarea(target);
        } else {
            fixWidth();
        }
    }

    return true;
}

/**
 * Создаёт DOM-модель смайлопака для последующего встраивания в документ и отображения
 */
function createElements() {
    function createElement(tag, baseId, parent, innerHTML) {
        var res = document.createElement(tag);
        if (baseId) res.setAttribute('id', consts.prefix + baseId);
        if (parent) parent.appendChild(res);
        if (innerHTML) res.innerHTML = innerHTML;
        return res;
    }

    function onBtnHideClick() {
        setCurrentCategory(null);
        return false;
    }

    function showMenu() {
        if (!state.currentTextarea) {
            return; // вообще-то, такого не будет, конечно
        }
        //elements.menu.style.display = 'block';
        document.body.appendChild(elements.menu);

        var off = getOffset(elements.panel);
        elements.menu.style.setProperty('left', (off.left + elements.panel.offsetWidth - elements.menu.offsetWidth) + 'px')
        elements.menu.style.setProperty('top', (off.top + elements.panel.offsetHeight) + 'px')

        window.setTimeout(function() {
            document.addEventListener('click', onDocumentClickWhenMenuIsShown);
        }, 0);
    }

    function hideMenu() {
        document.body.removeChild(elements.menu);
        document.removeEventListener('click', onDocumentClickWhenMenuIsShown);
    }

    function onDocumentClickWhenMenuIsShown() {
        hideMenu();
        return false;
    }

    function onMenuClick(e) {
        // не дадим событию дойти до document
        e.stopPropagation();
        return false;
    }

    function onBtnMenuClick() {
        if (elements.menu.offsetHeight > 0 || elements.menu.offsetWidth > 0) {
            hideMenu();
        } else {
            showMenu();
        }
        return false;
    }

    function onMniSmileTypeClick() {
        setSmileType(this.getAttribute('data-' + consts.prefix + 'smile-type'));
        hideMenu();
        return false;
    }

    function onMniSectionClick() {
        setCurrentSection(this.getAttribute('data-' + consts.prefix + 'section-identity'));
        hideMenu();
        return false;
    }

    function onMniTurnOffClick() {
        setEnabled(false);
        hideMenu();
        return false;
    }

    elements.topWrapper = createElement('DIV', 'top-wrapper');

    elements.btnEnable = createElement('IMG', 'btn-enable', elements.topWrapper);
    elements.btnEnable.src = consts.packIcoUrl;
    elements.btnEnable.addEventListener('click', function() { setEnabled(true) });

    elements.bottomWrapper = createElement('DIV', 'bottom-wrapper');

    elements.panel = createElement('DIV', 'panel', elements.bottomWrapper);

    var panelRight = createElement('DIV', 'panel-right', elements.panel);

    elements.btnHide = createElement('A', 'btn-hide', panelRight, 'скрыть');
    elements.btnHide.setAttribute('href', 'javascript:void(0)');
    elements.btnHide.addEventListener('click', onBtnHideClick);

    var btnMenu = createElement('A', 'btn-menu', panelRight, '&nbsp;&#9660;&nbsp;');
    btnMenu.setAttribute('href', 'javascript:void(0)');
    btnMenu.addEventListener('click', onBtnMenuClick);

    elements.menu = createElement('DIV', 'menu');
    elements.menu.addEventListener('click', onMenuClick);

    // Tипы смайлов
    if (!state.siteConfig.smileType) {

        createElement('H6', null, elements.menu, 'Тип смайлов');
        elements.mnuSmileType = createElement('UL', null, elements.menu);

        var mniSmileTypeHTML = createElement('LI', null, elements.mnuSmileType, '&lt;HTML&gt;');
        mniSmileTypeHTML.setAttribute('data-' + consts.prefix + 'smile-type', 'HTML');
        mniSmileTypeHTML.addEventListener('click', onMniSmileTypeClick);

        var mniSmileTypeBB = createElement('LI', null, elements.mnuSmileType, '[BB-Code]');
        mniSmileTypeBB.setAttribute('data-' + consts.prefix + 'smile-type', 'BB');
        mniSmileTypeBB.addEventListener('click', onMniSmileTypeClick);

    }

    // Разделы смайлопака
    if (data.sections.length > 1) {

        createElement('H6', null, elements.menu, 'Раздел');
        elements.mnuSection = createElement('UL', null, elements.menu);

        data.sections.forEach(function(s) {
            var li = createElement('LI', null, elements.mnuSection)
              , ico = getSectionIcoUrl(s);

            if (ico) {
                createElement('IMG', null, li).setAttribute('src', ico);
            }
            li.innerHTML += ' ' + s.name; // ugly :(

            li.setAttribute('data-' + consts.prefix + 'section-identity', getSectionIdentity(s));

            li.addEventListener('click', onMniSectionClick);
        });

    }

    var generatorLink = createElement('A', null, null, 'Генератор');
    generatorLink.setAttribute('href', consts.generatorUrl);
    createElement('H6', null, elements.menu).appendChild(generatorLink);

    var turnOffLink = createElement('A', null, null, 'Выключить');
    turnOffLink.setAttribute('href', 'javascript:void(0)');
    turnOffLink.addEventListener('click', onMniTurnOffClick);
    createElement('H6', null, elements.menu).appendChild(turnOffLink);


    // После меню добавим саму панель

    elements.panelCategories = createElement('DIV', 'panel-categories', elements.panel);
    elements.blockContainer = createElement('DIV', 'block-container', elements.bottomWrapper);
}

/**
 * Пробрасывает необходимые стили в документ
 */
function createStyles() {
    var style =
        '#prefix-bottom-wrapper, #prefix-bottom-wrapper *, #prefix-top-wrapper, #prefix-top-wrapper *, #prefix-menu * { margin:0; padding:0; border:none; font-size:10pt; font-family:sans-serif; color:#000; white-space:normal; } \n' +

        '#prefix-panel { background:#EEE; border-radius:2px; }                                      \n' +
        '#prefix-panel-categories { display: inline-block; }                                        \n' +
        '#prefix-panel-right { float:right; padding:7px 3px; overflow:visible; position:relative; } \n' +

        '#prefix-panel-categories IMG { margin:2px; cursor:pointer; width:25px; height:25px; }      \n' +

        '#prefix-btn-hide { visibility:hidden; color:#AAA; text-decoration:none; outline:none; }    \n' +
        '#prefix-btn-hide:hover { color:#555; text-decoration:none; }                               \n' +
        '#prefix-btn-menu { color:#AAA; text-decoration:none; outline:none; }                       \n' +
        '#prefix-btn-menu:hover { color:#555; text-decoration:none; }                               \n' +

        '#prefix-menu { display:block; position:absolute; background:#EEE; padding:5px; border-radius:2px; border:1px solid #CCC; z-index:100500; } \n' +
        '#prefix-menu H6 { white-space:nowrap; margin:5px 0; text-align:center; font-weight:bold; } \n' +
        '#prefix-menu UL { list-style:none; }                                                       \n' +

        '#prefix-menu LI { white-space:nowrap; line-height:25px; padding:2px 5px; cursor:pointer; border-radius:2px; }   \n' +
        '#prefix-menu LI:hover { background:#AAA; }                                                 \n' +

        '#prefix-menu LI.prefix-current { background:#CCC; cursor:default; }                        \n' +
        '#prefix-menu LI.prefix-current:hover { background:#CCC; cursor:default; }                  \n' +

        '#prefix-menu LI IMG { width:25px; height:25px; vertical-align:middle; }                    \n' +

        '#prefix-block-container { display:none; overflow-y:auto; position:relative; }              \n' +
        '#prefix-block-container DIV { padding:2px; }                                               \n' +
        '#prefix-block-container IMG { margin:0 2px; line-height:100%; cursor:pointer; border:1px solid #EEE; border-radius:5px; padding:2px; background:#FFF; } \n' +

        '#prefix-btn-enable { width:25px; height:25px; opacity:0.4; float:right; margin:5px 5px 0 -30px; cursor:pointer; } \n';

    var el = document.createElement('STYLE');
    el.innerHTML = style.replace(/prefix-/g, consts.prefix);
    document.head.appendChild(el);
}


function init() {
    if (window.location.host == consts.host) {
        // Вызываем заранее известную функцию, передающую данные генератору
        window.letsTalkFellowJS(data);

        return; // больше ничего делать не надо
    }

    if (data.sections.length == 0) {
        // В будущем, возможно, надо будет подгружать смайлы с сайта смайлопака, но пока это не надо,
        // выходим, если нечего показать
        return;
    }

    state.siteConfig = sites[window.location.host] || {};

    createElements();
    createStyles();

    // Проставляем сохранённые пользователем настройки
    setSmileType(getLocalStorageString('smileType') || state.siteConfig.smileType || (doesSiteProbablyUseHtml() ? 'HTML' : 'BB'));
    setCurrentSection(getLocalStorageString('currentSectionId') || state.siteConfig.defaultSection || getSectionIdentity(data.sections[0]));
    setEnabled(getLocalStorageString('enabled') == 'true' || state.siteConfig.defaultEnabled || false);

    // Присосёмся к активной TEXTAREA, если таковая есть
    if (document.activeElement &&
            document.activeElement.nodeName.toUpperCase() === 'TEXTAREA') {
        attachToTextarea(document.activeElement);
    }

    // Вот здесь - некоторая магия: приходится привязываться к двум событиям, чтобы
    // работало и в лисе и в хроме. В предельном случае, обработчик будет вызван
    // несколько раз, что, в принципе, не страшно.
    document.addEventListener('focus', onAnyElementFocus, true);
    document.addEventListener('focusin', onAnyElementFocus);

    invokeHook('onAfterInit');
}


domReady(init);

});
{% endraw %}
