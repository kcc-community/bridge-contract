'use strict';

// Node 22 supports synchronous require(ESM). Older query-string consumers
// require a callable CommonJS export, not an ESM namespace object.
// All decoding remains in upstream decode-uri-component 0.5.0; no copied code.
const decoder = require('patched-decoder').default;
if (typeof decoder !== 'function') {
  throw new TypeError('The patched URI decoder must export a default function');
}
module.exports = decoder;
