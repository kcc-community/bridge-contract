'use strict';

// Dependency regression tests: local values and a mocked redirect only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const rootRequire = createRequire(path.join(root, 'package.json'));

function consumers(name) {
  const found = new Map();
  for (const [location, pkg] of Object.entries(lock.packages)) {
    if (!(pkg.dependencies || {})[name]) continue;
    const manifest = path.join(root, location, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const localRequire = createRequire(manifest);
    const resolved = localRequire.resolve(name);
    if (!found.has(resolved)) found.set(resolved, {location, localRequire, resolved});
  }
  assert.ok(found.size > 0, `No installed consumers of ${name}`);
  return [...found.values()];
}

function packageOf(entry) {
  let dir = path.dirname(entry);
  while (dir !== path.dirname(dir)) {
    const file = path.join(dir, 'package.json');
    if (fs.existsSync(file)) {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (pkg.name) return {pkg, dir};
    }
    dir = path.dirname(dir);
  }
  throw new Error(`No package identity for ${entry}`);
}

async function checkDecoding() {
  for (const {location, localRequire, resolved} of consumers('decode-uri-component')) {
    const decode = localRequire('decode-uri-component');
    const {pkg, dir} = packageOf(resolved);
    assert.equal(pkg.name, '@kcc-community/decode-uri-component-cjs');
    const adapterRequire = createRequire(path.join(dir, 'package.json'));
    const upstreamEntry = adapterRequire.resolve('patched-decoder');
    const upstream = packageOf(upstreamEntry).pkg;
    assert.equal(upstream.name, 'decode-uri-component');
    assert.equal(upstream.version, '0.5.0');
    assert.equal(decode('a%20b'), 'a b');
    assert.equal(decode('%E4%BD%A0%E5%A5%BD'), '\u4f60\u597d');
    assert.equal(decode('100%25'), '100%');
    assert.throws(() => decode(null), TypeError);
    // Bound the malformed-input test in a separate process; it cannot hang CI.
    const child = spawnSync(process.execPath, ['-e', 'const d=require(process.argv[1]); for(const s of ["%E0%A4%A", "%", "%FF", "%E0".repeat(2000)]) { if(typeof d(s)!=="string") process.exit(2); }', resolved], {timeout: 3000, encoding:'utf8'});
    assert.equal(child.error, undefined, `Decoder regression timed out: ${child.error}`);
    assert.equal(child.status, 0, child.stderr);
    console.log('PASS patched decoder CommonJS export, UTF-8 and bounded malformed input:', location);
  }
  for (const {location, localRequire} of consumers('query-string')) {
    const imported = localRequire('query-string');
    const qs = imported.default || imported;
    const parsed = qs.parse(qs.stringify({q:'\u4f60\u597d',space:'a b',percent:'100%'}));
    assert.equal(parsed.q, '\u4f60\u597d');
    assert.equal(parsed.space, 'a b');
    assert.equal(parsed.percent, '100%');
    console.log('PASS existing query-string caller:', location);
  }
}

async function checkRedirectAgent() {
  for (const {location, resolved} of consumers('request')) {
    const {pkg, dir} = packageOf(resolved);
    assert.equal(pkg.name, '@cypress/request');
    assert.ok(Number(pkg.version.split('.')[0]) >= 3);
    const {Redirect} = rootRequire(path.join(dir, 'lib/redirect.js'));
    const agent = {marker:'preserve-the-caller-agent'};
    let initialized = false;
    const request = {
      uri: new URL('https://fixture.invalid/start'),
      originalHost:'fixture.invalid', agent, method:'GET', headers:{},
      debug(){}, setHeader(){}, removeHeader(){}, emit(){},
      init(){ initialized = true; },
    };
    const redirect = new Redirect(request);
    const response = {statusCode:302, resume(){}, caseless:{has:()=>true, get:()=> 'http://fixture.invalid/target'}};
    await new Promise((resolve, reject) => redirect.onResponse(response, error => error ? reject(error) : resolve()));
    assert.equal(request.agent, agent, 'Cross-protocol redirect discarded the caller-supplied agent');
    assert.equal(initialized, true);
    console.log('PASS cross-protocol redirect preserves caller agent (mocked, no network):', location);
  }
}

function checkUuid() {
  for (const {location, localRequire, resolved} of consumers('uuid')) {
    const {pkg} = packageOf(resolved);
    const uuid = localRequire('uuid');
    const v4 = uuid.v4 || uuid;
    assert.match(v4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    if (Number(pkg.version.split('.')[0]) >= 7) {
      assert.ok(Number(pkg.version.split('.')[0]) >= 11, `Modern caller still uses vulnerable uuid ${pkg.version}`);
      assert.throws(() => uuid.v5('bridge', uuid.v5.DNS, new Uint8Array(8), 4), RangeError);
      console.log('PASS modern UUID v4 and bounds regression:', location, pkg.version);
    } else {
      console.log('REMAINS legacy UUID caller; no unsupported major override:', location, pkg.version);
    }
  }
}

(async()=>{
  await checkDecoding();
  await checkRedirectAgent();
  checkUuid();
  console.log('All targeted dependency regressions passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
