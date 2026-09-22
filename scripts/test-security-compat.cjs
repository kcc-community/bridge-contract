'use strict';

// Legacy UUID regression tests. HTTP and URI checks remain in the separate,
// unchanged test:dependency-patches suite from PR #9.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const seen = new Set();
let legacyCount = 0;
let modernCount = 0;
for (const [location, pkg] of Object.entries(lock.packages)) {
  if (!pkg.dependencies?.uuid && !pkg.devDependencies?.uuid) continue;
  const file = path.join(root, location, 'package.json');
  if (!fs.existsSync(file)) continue;
  const req = createRequire(file);
  const entry = req.resolve('uuid');
  if (seen.has(entry)) continue;
  seen.add(entry);
  const uuid = req('uuid');
  const metadata = req('uuid/package.json');
  if (metadata.name === '@kcc-community/uuid-legacy-compat') {
    legacyCount++;
    const shimRequire = createRequire(entry);
    const upstream = shimRequire('uuid-patched/package.json');
    assert.equal(upstream.name, 'uuid');
    assert.equal(upstream.version, '11.1.1');
    assert.equal(typeof uuid, 'function');
    assert.match(uuid(), /^[0-9a-f-]{36}$/);
    assert.equal(uuid('binary').length, 16);
    for (const v of ['v1', 'v3', 'v4', 'v5', 'parse', 'unparse']) assert.equal(req('uuid/' + v), uuid[v]);
    const value = uuid.v4();
    assert.equal(uuid.unparse(uuid.parse(value)), value);
    assert.throws(() => uuid.parse(value, Buffer.alloc(8)), RangeError);
    assert.throws(() => uuid.parse(value, Buffer.alloc(16), -1), RangeError);
    console.log('PASS legacy callable/deep-import APIs backed by official uuid@11.1.1:', location || 'root');
  } else {
    modernCount++;
    assert.equal(metadata.name, 'uuid');
    assert.equal(metadata.version, '11.1.1');
    console.log('PASS modern caller retains unwrapped official uuid@11.1.1:', location);
  }
  assert.match(uuid.v4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  const buffer = Buffer.alloc(20, 0x5a);
  assert.equal(uuid.v4({}, buffer, 4), buffer);
  assert.deepEqual([...buffer.subarray(0, 4)], [0x5a, 0x5a, 0x5a, 0x5a]);
  for (const version of ['v3', 'v5']) {
    assert.equal(typeof uuid[version], 'function');
    assert.throws(() => uuid[version]('bridge', uuid[version].DNS, new Uint8Array(8), 4), RangeError);
    assert.throws(() => uuid[version]('bridge', uuid[version].DNS, new Uint8Array(16), -1), RangeError);
    const out = new Uint8Array(20);
    out.fill(0xa5);
    assert.equal(uuid[version]('bridge', uuid[version].DNS, out, 4), out);
    assert.deepEqual([...out.subarray(0, 4)], [0xa5, 0xa5, 0xa5, 0xa5]);
  }
}
assert.ok(legacyCount > 0, 'No legacy adapter was exercised');
assert.ok(modernCount > 0, 'Modern UUID consumers unexpectedly changed to the legacy adapter');
console.log('All UUID compatibility and output-buffer regression checks passed.');
