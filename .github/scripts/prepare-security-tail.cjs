'use strict';

// One-time UUID-only candidate, preserving every file delivered by PR #9.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(p.dependencies['@openzeppelin/contracts'], '3.4.2');
assert.equal(p.devDependencies.solc, '0.7.4');
assert.equal(p.overrides.request, 'npm:@cypress/request@3.0.10');
assert.equal(p.devDependencies['decode-uri-component'], 'file:tools/decode-uri-component-cjs');
assert.equal(p.overrides['uuid@>=7 <11.1.1'], '11.1.1');
assert.equal(p.devDependencies.uuid, undefined);

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
const dir = 'tools/compat/uuid-legacy/';
write(dir + 'package.json', JSON.stringify({
  name: '@kcc-community/uuid-legacy-compat', version: '1.0.0', private: true,
  description: 'Legacy UUID entry points backed by the official patched UUID package',
  license: 'ISC', main: 'index.cjs',
  dependencies: { 'uuid-patched': 'npm:uuid@11.1.1' }
}, null, 2) + '\n');
write(dir + 'index.cjs', `'use strict';
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
`);
for (const name of ['v1', 'v3', 'v4', 'v5', 'parse', 'unparse']) {
  write(dir + name + '.js', "'use strict';\nmodule.exports = require('./index.cjs')." + name + ';\n');
}
// Anchor the local package once at the root. Only old UUID consumers use it;
// modern consumers keep PR #9's unwrapped official uuid@11.1.1 implementation.
p.devDependencies.uuid = 'file:tools/compat/uuid-legacy';
p.overrides['uuid@<7'] = '$uuid';
p.scripts['test:security-compat'] = 'node scripts/test-security-compat.cjs';
write('package.json', JSON.stringify(p, null, 2) + '\n');
console.log('Prepared UUID-only candidate on top of PR #9; Request, decoder and their regression suite are unchanged.');
