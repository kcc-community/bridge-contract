'use strict';

// Bounded regression fixtures only: local files, generated TLS, loopback servers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

function consumers(name) {
  const result = new Map();
  for (const [location, pkg] of Object.entries(lock.packages)) {
    if (!pkg.dependencies?.[name]) continue;
    const manifest = path.join(root, location, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const localRequire = createRequire(manifest);
    const entry = localRequire.resolve(name);
    if (!result.has(entry)) result.set(entry, { location, require: localRequire, value: localRequire(name) });
  }
  assert.ok(result.size, `No installed consumers for ${name}`);
  return [...result.values()];
}

function checkDecoding() {
  for (const { value: decode, require: req, location } of consumers('decode-uri-component')) {
    assert.equal(typeof decode, 'function');
    for (const [input, expected] of [
      ['', ''], ['bridge', 'bridge'], ['a+b', 'a b'], ['a%2Bb', 'a+b'],
      ['%E4%B8%AD%E6%96%87', '中文'], ['%F0%9F%8C%8D', '🌍'], ['%ZZ', '%ZZ'],
      ['%FE%FF', '\uFFFD\uFFFD'], ['%C2', '\uFFFD'], ['%FF', '%FF'],
    ]) assert.equal(decode(input), expected, input);
    assert.throws(() => decode(null), TypeError);
    // Run malformed input only against the patched implementation, in a process
    // with a hard timeout. The vulnerable baseline is never given this fixture.
    execFileSync(process.execPath, ['-e',
      'const d=require(process.argv[1]); for(let i=0;i<5;i++) d("%FF".repeat(1000));',
      req.resolve('decode-uri-component')], { timeout: 3000, stdio: 'pipe' });
    console.log('PASS patched decoder, legacy plus behavior, bounded malformed input:', location);
  }
  const queryString = require('query-string');
  const data = { word: 'a+b', text: '中文', blank: '' };
  assert.deepEqual({ ...queryString.parse(queryString.stringify(data)) }, data);
  assert.equal(queryString.parse('word=a+b').word, 'a b');
  console.log('PASS real query-string consumer roundtrip');
}

function checkUuid() {
  for (const { value: uuid, require: req, location } of consumers('uuid')) {
    assert.equal(typeof uuid.v4, 'function');
    const value = uuid.v4();
    assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const buffer = Buffer.alloc(20, 0x5a);
    assert.equal(uuid.v4({}, buffer, 4), buffer);
    assert.deepEqual([...buffer.subarray(0, 4)], [0x5a, 0x5a, 0x5a, 0x5a]);
    for (const version of ['v3', 'v5']) {
      assert.equal(typeof uuid[version], 'function');
      assert.throws(() => uuid[version]('bridge', uuid[version].DNS, new Uint8Array(8), 4), RangeError);
      assert.throws(() => uuid[version]('bridge', uuid[version].DNS, new Uint8Array(16), -1), RangeError);
      assert.match(uuid[version]('bridge', uuid[version].DNS), /^[0-9a-f-]{36}$/);
    }
    if (typeof uuid === 'function') {
      assert.match(uuid(), /^[0-9a-f-]{36}$/);
      assert.equal(uuid('binary').length, 16);
      assert.equal(req('uuid/v4'), uuid.v4);
      assert.equal(req('uuid/v1'), uuid.v1);
      assert.equal(uuid.unparse(uuid.parse(value)), value);
      assert.throws(() => uuid.parse(value, Buffer.alloc(8)), RangeError);
    }
    console.log('PASS UUID consumer entry points and output-buffer bounds:', location);
  }
}

const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const close = server => new Promise(resolve => {
  server.closeAllConnections();
  server.close(resolve);
});

async function checkRequests(temp) {
  const keyPath = path.join(temp, 'fixture.key');
  const certPath = path.join(temp, 'fixture.crt');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', keyPath, '-out', certPath, '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore', timeout: 10000 });
  const cert = fs.readFileSync(certPath);
  let downgradedHits = 0;
  const plain = http.createServer((req, res) => {
    if (req.url === '/downgrade-target') downgradedHits++;
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/echo' }); return res.end(); }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Set-Cookie', 'fixture=ok; Path=/');
      res.end(JSON.stringify({ ok: true, cookie: req.headers.cookie || '', body, method: req.method }));
    });
  });
  await listen(plain);
  const base = `http://127.0.0.1:${plain.address().port}`;
  const secure = https.createServer({ key: fs.readFileSync(keyPath), cert }, (req, res) => {
    if (req.url === '/downgrade') res.writeHead(302, { Location: base + '/downgrade-target' });
    res.end('TLS fixture');
  });
  const agents = [];
  try {
    await listen(secure);
    for (const { value: request, require: req, location } of consumers('request')) {
      const metadata = req('request/package.json');
      assert.equal(metadata.name, '@cypress/request');
      assert.match(metadata.version, /^3\./);
      const jar = request.jar();
      const send = options => new Promise((resolve, reject) => {
        request({ timeout: 4000, proxy: null, ...options }, (error, response, body) =>
          error ? reject(error) : resolve({ response, body }));
      });
      assert.equal((await send({ url: base + '/redirect', json: true, jar })).body.ok, true);
      const post = await send({ url: base + '/echo', method: 'POST', json: true, body: { hello: 'bridge' }, jar });
      assert.equal(post.body.method, 'POST');
      assert.equal(JSON.parse(post.body.body).hello, 'bridge');
      assert.match(post.body.cookie, /fixture=ok/);
      const streamed = await new Promise((resolve, reject) => {
        let body = '';
        request.get({ url: base + '/echo', proxy: null, timeout: 4000 })
          .on('error', reject).on('data', chunk => { body += chunk; }).on('end', () => resolve(body));
      });
      assert.equal(JSON.parse(streamed).ok, true);
      const agent = new https.Agent({ ca: cert, keepAlive: false });
      agents.push(agent);
      const tlsBase = `https://127.0.0.1:${secure.address().port}`;
      assert.equal((await send({ url: tlsBase + '/echo', agent })).body, 'TLS fixture');
      const hitsBefore = downgradedHits;
      await assert.rejects(send({ url: tlsBase + '/downgrade', agent }));
      assert.equal(downgradedHits, hitsBefore, 'Custom TLS agent was bypassed on cross-protocol redirect');
      console.log('PASS Request callback, JSON POST, cookies, streams, redirects and TLS-agent preservation:', location);
    }
  } finally {
    for (const agent of agents) agent.destroy();
    await close(secure);
    await close(plain);
  }
}

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-security-fixtures-'));
  try {
    checkDecoding();
    checkUuid();
    await checkRequests(temp);
    console.log('All security compatibility fixtures passed.');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
