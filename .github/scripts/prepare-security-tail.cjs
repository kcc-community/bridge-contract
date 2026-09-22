'use strict';

// One-time UUID-only candidate, preserving every file delivered by PR #9.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
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

// A version-range override cannot coexist with this root file dependency in
// npm 12. Use consumer-scoped rules to retain the already-patched modern APIs.
const modernParents = new Set(['web3-eth-accounts', 'apollo-server-core', 'pouchdb', 'pouchdb-utils', 'request']);
for (const [location, pkg] of Object.entries(lock.packages)) {
  const range = pkg.dependencies?.uuid;
  if (!range) continue;
  const match = /^[~^]?(\d+)\./.exec(range);
  assert.ok(match, 'Unexpected UUID version range: ' + range);
  if (Number(match[1]) >= 7) {
    const name = location.split('node_modules/').at(-1);
    assert.ok(modernParents.has(name), 'Unclassified modern UUID consumer: ' + name);
  }
}
p.devDependencies.uuid = 'file:tools/compat/uuid-legacy';
delete p.overrides['uuid@>=7 <11.1.1'];
p.overrides.uuid = '$uuid';
p.overrides['web3-eth-accounts@>=1.10.0 <2'] = { uuid: '11.1.1' };
p.overrides['apollo-server-core'] = { uuid: '11.1.1' };
p.overrides.pouchdb = { uuid: '11.1.1' };
p.overrides['pouchdb-utils'] = { uuid: '11.1.1' };
p.overrides.request = { '.': 'npm:@cypress/request@3.0.10', uuid: '11.1.1' };
p.scripts['test:security-compat'] = 'node scripts/test-security-compat.cjs';
write('package.json', JSON.stringify(p, null, 2) + '\n');
console.log('Prepared UUID-only candidate; modern consumer APIs, Request version and decoder remain unchanged.');
