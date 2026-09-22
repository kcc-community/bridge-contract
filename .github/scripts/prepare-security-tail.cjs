'use strict';

// One-time candidate preparation. Do not modify contracts, migrations or assertions.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(p.dependencies['@openzeppelin/contracts'], '3.4.2');
assert.equal(p.devDependencies.solc, '0.7.4');
assert.equal(p.devDependencies.ganache, 'npm:@ganache/core@0.10.2');

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function manifest(file, value) { write(file, JSON.stringify(value, null, 2) + '\n'); }

// Keep the old CommonJS entry point, but execute the official patched decoder.
// The old 0.2 API also replaces '+' with a space; preserve that behavior.
manifest('tools/compat/decode-uri-component/package.json', {
  name: '@kcc-community/decode-uri-component-compat', version: '1.0.0', private: true,
  description: 'CommonJS and plus-sign compatibility around the official patched decoder',
  license: 'ISC', main: 'index.cjs', engines: { node: '>=22.22.2 <23' },
  dependencies: { 'decoder-patched': 'npm:decode-uri-component@0.5.0' }
});
write('tools/compat/decode-uri-component/index.cjs', `'use strict';
const { default: decode } = require('decoder-patched');
if (typeof decode !== 'function') throw new TypeError('Patched decoder did not export a function');
module.exports = function decodeLegacy(input) {
  return decode(typeof input === 'string' ? input.replace(/\\+/g, ' ') : input);
};
`);

// Legacy entry points delegate to the maintained UUID implementation. No
// vulnerable implementation is copied, renamed, or patched in node_modules.
manifest('tools/compat/uuid-legacy/package.json', {
  name: '@kcc-community/uuid-legacy-compat', version: '1.0.0', private: true,
  description: 'Legacy UUID entry points backed by the official patched UUID package',
  license: 'ISC', main: 'index.cjs',
  dependencies: { 'uuid-patched': 'npm:uuid@11.1.1' }
});
write('tools/compat/uuid-legacy/index.cjs', `'use strict';
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
  write('tools/compat/uuid-legacy/' + name + '.js', "'use strict';\nmodule.exports = require('./index.cjs')." + name + ';\n');
}

// This 3.x release was verified against the official Cypress repository.
const version = '3.0.10';
let metadata = JSON.parse(execFileSync('npm', ['view', '@cypress/request@' + version, '--json'], { encoding: 'utf8', timeout: 60000 }));
if (Array.isArray(metadata)) metadata = metadata[0];
assert.equal(metadata.name, '@cypress/request');
assert.equal(metadata.version, version);
assert.match(JSON.stringify(metadata.repository), /cypress-io\/request/);
manifest('request-upstream-metadata.json', metadata);

// Direct local dependencies provide stable root-level links. Unanchored file:
// overrides were incorrectly resolved relative to each transitive consumer.
p.devDependencies['decode-uri-component'] = 'file:tools/compat/decode-uri-component';
p.devDependencies.uuid = 'file:tools/compat/uuid-legacy';
Object.assign(p.overrides, {
  request: 'npm:@cypress/request@' + version,
  'decode-uri-component': '$decode-uri-component',
  uuid: '$uuid'
});
p.scripts['test:security-compat'] = 'node scripts/test-security-compat.cjs';
manifest('package.json', p);
console.log('Prepared anchored adapters backed by decode-uri-component@0.5.0 and uuid@11.1.1, plus @cypress/request@' + version + '.');
