'use strict';
var generator = require('./generator.js');

window.addEventListener('DOMContentLoaded', generator.init.bind(generator));
window.generator = generator; // Temporary expose generator object
