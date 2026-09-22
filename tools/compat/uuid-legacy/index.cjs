'use strict';
const uuid = require('uuid-patched');
function legacy(options, buffer, offset) {
  if (options === 'binary') return uuid.v4({}, new Array(16), 0);
  return uuid.v4(options, buffer, offset);
}
Object.assign(legacy, uuid);
legacy.parse = function parse(value, buffer, offset = 0) {
  const bytes = uuid.parse(value);
  if (buffer === undefined) return Array.from(bytes);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + 16 > buffer.length) {
    throw new RangeError('UUID output buffer is too small');
  }
  for (let i = 0; i < 16; i++) buffer[offset + i] = bytes[i];
  return buffer;
};
legacy.unparse = (buffer, offset = 0) => uuid.stringify(buffer, offset);
module.exports = legacy;
