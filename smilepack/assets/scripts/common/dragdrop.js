'use strict';

var dragdrop = {
    transitionDuration: 175,
    startMargin: 4,
    _containers: [],

    _currentContainer: null,
    _currentElement: null,
    _overlay: null,
    _startPos: null,
    _startElementPos: null,
    _mouseOver: null,
    _started: false,

    _callbacks: null,


    add: function(container, options) {
        options.dom = container;
        this._containers.push(options);

        var mousedown = function(event) {
            return this._eventDown(event, options);
        }.bind(this);
        options._mousedown = mousedown;
        container.addEventListener('mousedown', mousedown);
    },

    _findContainer: function(element) {
        if (!element) {
            return null;
        }
        var container = null;
        for (var i = 0; i < this._containers.length; i++) {
            if (this._containers[i].dom.contains(element)) {
                container = this._containers[i];
                break;
            }
        }
        return container;
    },

    _buildOverlay: function(element, box) {
        var overlay = element.cloneNode(true);
        box = box || element.getBoundingClientRect();

        overlay.addEventListener('click', this._eventPrevent);
        overlay.addEventListener('mousedown', this._eventPrevent);
        // mouseup not prevented for Opera 12

        /* FIXME: optimize this */
        // var t1 = new Date().getTime();

        var copyQueue = [[element, overlay]];
        var elems, elemOld, elemNew, i, l;

        while (copyQueue.length > 0) {
            elems = copyQueue.pop();
            elemOld = elems[0];
            elemNew = elems[1];
            var style = getComputedStyle(elemOld);
            var ovStyle = getComputedStyle(elemNew);
            l = style.length;
            for (i = 0; i < l; i++) {
                var name = style[i];
                if (elemOld === element && (
                    name == "width" || name == "height" ||
                    name == "position" || name.indexOf("margin") === 0 ||  // Safari don't support startsWith
                    name == "box-sizing" || name.indexOf("transition") === 0 ||
                    name.indexOf('-webkit-animation') === 0  // Safari
                )) {
                    continue;
                }
                if (style[name] != ovStyle[name]) {
                    elemNew.style[name] = style[name];
                }
            }
            elemNew.style.pointerEvents = 'none';
            l = elemOld.children.length;
            for (i = 0; i < l; i++) {
                copyQueue.push([elemOld.children[i], elemNew.children[i]]);
            }
        }

        // console.log('style copy time', new Date().getTime() - t1);

        overlay.classList.add('overlay');
        overlay.style.margin = '0';
        overlay.style.position = 'fixed';
        overlay.style.width = box.width + 'px';
        overlay.style.height = box.height + 'px';
        overlay.style.boxSizing = 'border-box';
        overlay.title = "";

        return overlay;
    },

    _eventPrevent: function(event) {
        event.preventDefault();
        event.stopPropagation();
        return false;
    },

    _eventDown: function(event, container) {
        if (this._currentElement) {
            return;
        }
        if ((event.which || event.button) != 1) {  // button is 1 in IE
            return;
        }

        var element = event.target || event.srcElement;
        /* Получение разрешения на перетаскивание и правильного элемента */
        element = container.onstart({
            element: element,
            x: event.clientX,
            y: event.clientY
        });
        if (!element) {
            return;
        }

        /* Зачистка на всякий случай */
        this._stop();

        this._currentElement = element;
        this._currentContainer = container;
        this._startPos = [event.clientX, event.clientY];
        this._started = false;

        this._callbacks = [
            function(event) {return this._eventMove(event);}.bind(this),
            function(event) {return this._eventUp(event);}.bind(this)
        ];

        document.body.addEventListener('mousemove', this._callbacks[0]);
        document.body.addEventListener('mouseup', this._callbacks[1]);

        event.preventDefault();
        return false;
    },

    _eventMove: function(event) {
        if (!this._currentElement || !this._currentContainer) {
            return;
        }
        event.preventDefault();

        var dx = event.clientX - this._startPos[0];
        var dy = event.clientY - this._startPos[1];
        
        var starting = !this._started;
        if (starting) {
            if (dx > -this.startMargin && dx < this.startMargin && dy > -this.startMargin && dy < this.startMargin) {
                return false;
            }

            /* Включаемся */
            var box = this._currentElement.getBoundingClientRect();
            this._startElementPos = [box.left, box.top];

            this._overlay = this._buildOverlay(this._currentElement, box);
            document.body.appendChild(this._overlay);
            if (!document.body.classList.contains('drag-enabled')) {
                document.body.classList.add('drag-enabled');
            }
            this._currentElement.addEventListener('click', this._eventPrevent);

            this._started = true;
        }

        var newX = this._startElementPos[0] + dx;
        var newY = this._startElementPos[1] + dy;
        this._overlay.style.left = newX + 'px';
        this._overlay.style.top = newY + 'px';

        if (navigator.userAgent.indexOf('Presto') >= 0) {
            this._overlay.style.display = 'none';
        }

        var oldMouseOver = this._mouseOver;
        this._mouseOver = document.elementFromPoint(event.clientX, event.clientY);

        var to_container = this._mouseOver ? this._findContainer(this._mouseOver) : null;

        /* Сообщаем родному контейнеру о перемещении */
        if (this._currentContainer.onmove) {
            this._currentContainer.onmove({
                targetContainer: to_container ? to_container.dom : null,
                element: this._currentElement,
                x: event.clientX,
                y: event.clientY,
                mouseOver: this._mouseOver,
                oldMouseOver: oldMouseOver,
                starting: starting,
                overlay: this._overlay
            });
        }

        /* Сообщаем контейнру, на который перетаскивают, что на него перетаскивают */
        if (to_container && to_container.onmoveto) {
            to_container.onmoveto({
                sourceContainer: this._currentContainer.dom,
                element: this._currentElement,
                x: event.clientX,
                y: event.clientY,
                mouseOver: this._mouseOver,
                overlay: this._overlay
            });
        }
        if (navigator.userAgent.indexOf('Presto') >= 0) {
            this._overlay.style.display = '';
        }

        return false;
    },

    _eventUp: function(event) {
        if (!this._currentElement || !this._currentContainer) {
            return;
        }

        if (!this._started) {
            if (this._currentContainer.onclick) {
                this._currentContainer.onclick({element: this._currentElement, event: event});
            }
            this._stop();
            return;
        }
        event.preventDefault();

        var to_container = null;
        var dropAction = null;
        var accepted = false;

        /* Сообщаем контейнеру, на который перетаскивают, что на него всё-таки перетащили (им может оказаться и сам источник) */
        if (this._mouseOver) {
            to_container = this._findContainer(this._mouseOver);
            if (to_container && to_container.ondropto) {
                /* Возвращение объекта с описанием действия означает, что контейнер принял объект */
                dropAction = to_container.ondropto({
                    sourceContainer: this._currentContainer.dom,
                    element: this._currentElement,
                    overlay: this._overlay,
                    x: event.clientX,
                    y: event.clientY,
                });
            }
        }
        if (dropAction) {
            accepted = true;
        } else {
            dropAction = {name: 'animate', targetElement: this._currentElement};
        }

        /* Уведомляем родной контейнер */
        if (this._currentContainer.ondrop) {
            this._currentContainer.ondrop({
                targetContainer: accepted ? to_container.dom : null,
                targetElement: dropAction.element,
                element: this._currentElement,
                overlat: this._overlay,
                x: event.clientX,
                y: event.clientY,
                mouseOver: this._mouseOver
            });
        }

        this._stop(dropAction, (accepted ? to_container : this._currentContainer).ontransitionend);
    },

    _stop: function(dropAction, ontransitionend) {
        if (this._currentElement) {
            this._currentElement.removeEventListener('click', this._eventPrevent);
        }

        if (dropAction && dropAction.name == 'animate' && dropAction.targetElement) {
            this._animate(dropAction.targetElement, ontransitionend);
        } else if (dropAction && dropAction.name == 'fadeOut') {
            this._animateFadeOut();
        } else if (!dropAction || dropAction.name != 'nothing') {
            if (this._overlay) {
                (this._overlay.parentNode || this._overlay.parentElement).removeChild(this._overlay);
            }
            if (ontransitionend) {
                ontransitionend({element: dropAction ? dropAction.targetElement : null});
            }
        }

        this._currentElement = null;
        this._currentContainer = null;
        this._startPos = null;
        this._startElementPos = null;
        this._overlay = null;
        this._started = false;
        this._mouseOver = null;

        document.body.classList.remove('drag-enabled');
        if (this._callbacks) {
            document.body.removeEventListener('mousemove', this._callbacks[0]);
            document.body.removeEventListener('mouseup', this._callbacks[1]);
            this._callbacks = null;
        }
    },

    _animate: function(targetElement, ontransitionend) {
        var overlay = this._overlay;

        var box = targetElement.getBoundingClientRect();
        var stopX = box.left;
        var stopY = box.top;
        box = null;

        var endAnimation = function(event) {
            if (event && event.propertyName != 'top' && event.propertyName != 'left') {
                return;
            }
            var parent = overlay.parentNode || overlay.parentElement;
            if (!parent) {
                return;
            }

            parent.removeChild(overlay);

            if (ontransitionend) {
                ontransitionend({element: targetElement});
            }
        }.bind(this);

        overlay.classList.add('stopping');
        overlay.style.transitionDuration = this.transitionDuration + 'ms';
        overlay.style.transitionProperty = 'left, top';
        overlay.style.left = stopX + 'px';
        overlay.style.top = stopY + 'px';

        /* FIXME: ontransitionend не работает, когда начало анимации совпадает с концом анимации и как следствие её вовсе нет */
        setTimeout(endAnimation, this.transitionDuration);
    },

    _animateFadeOut: function() {
        var overlay = this._overlay;
        overlay.style.transitionProperty = 'opacity';
        overlay.style.transitionDuration = this.transitionDuration + 'ms';
        overlay.style.opacity = '0.0';
        setTimeout(function() {overlay.parentNode.removeChild(overlay);}, this.transitionDuration);
    }
};


module.exports = dragdrop;
