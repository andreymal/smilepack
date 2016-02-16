'use strict';
var viewer = require('./viewer.js');

window.addEventListener('DOMContentLoaded', viewer.init.bind(viewer));
window.viewer = viewer;
