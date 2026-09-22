'use strict';
const { default: decode } = require('decoder-patched');
if (typeof decode !== 'function') throw new TypeError('Patched decoder did not export a function');
module.exports = function decodeLegacy(input) {
  return decode(typeof input === 'string' ? input.replace(/\+/g, ' ') : input);
};
