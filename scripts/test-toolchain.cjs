'use strict';

// These checks use temporary files and loopback-only servers. No live RPC or keys.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');
const { pipeline } = require('node:stream/promises');
const root = path.resolve(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

function consumers(name) {
  const found = new Map();
  for (const [location, pkg] of Object.entries(lock.packages)) {
    if (!(pkg.dependencies || {})[name] && !(pkg.optionalDependencies || {})[name]) continue;
    const manifest = path.join(root, location, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const localRequire = createRequire(manifest);
    let resolved;
    try { resolved = localRequire.resolve(name); }
    catch (error) {
      if ((pkg.optionalDependencies || {})[name]) continue;
      throw error;
    }
    if (!found.has(resolved)) found.set(resolved, { location, module: localRequire(name), resolved });
  }
  assert.ok(found.size > 0, `No installed consumers found for ${name}`);
  return [...found.values()];
}

async function checkArchives(temp) {
  let index = 0;
  for (const { module: tar, location } of consumers('tar')) {
    const dir = path.join(temp, `tar-${index++}`);
    const input = path.join(dir, 'input');
    const output = path.join(dir, 'output');
    const streamed = path.join(dir, 'streamed');
    for (const d of [input, output, streamed]) fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(input, 'fixture.txt'), 'bridge archive compatibility\n');
    const file = path.join(dir, 'fixture.tgz');
    await tar.create({ cwd: input, file, gzip: true }, ['fixture.txt']);
    const entries = [];
    await tar.list({ file, onentry: entry => entries.push(entry.path) });
    assert.deepEqual(entries, ['fixture.txt']);
    await tar.extract({ file, cwd: output });
    await pipeline(tar.create({ cwd: input }, ['fixture.txt']), tar.extract({ cwd: streamed }));
    for (const d of [output, streamed]) {
      assert.equal(fs.readFileSync(path.join(d, 'fixture.txt'), 'utf8'), 'bridge archive compatibility\n');
    }
    console.log('PASS tar file and streaming APIs:', location);
  }
}

async function checkHttp() {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}/fixture?value=bridge`;
  try {
    for (const { module, location } of consumers('axios')) {
      const axios = module.default || module;
      const response = await axios.get(url, { proxy: false, timeout: 5000 });
      assert.equal(response.data.ok, true);
      console.log('PASS axios GET:', location);
    }
    for (const { module, location } of consumers('got')) {
      const got = module.default || module;
      const response = await got(url, { timeout: { request: 5000 }, retry: { limit: 0 } });
      assert.equal(JSON.parse(response.body).ok, true);
      console.log('PASS got GET:', location);
    }
    const request = require('request');
    const body = await new Promise((resolve, reject) => {
      request.get({ url, json: true, timeout: 5000, proxy: null, jar: request.jar() },
        (error, response, data) => error ? reject(error) : resolve(data));
    });
    assert.equal(body.ok, true);
    console.log('PASS legacy request/tough-cookie integration (not an SSRF security assertion)');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

async function checkUtilities() {
  for (const { module: tmp, location } of consumers('tmp')) {
    const file = tmp.fileSync();
    assert.ok(fs.existsSync(file.name));
    file.removeCallback();
    assert.ok(!fs.existsSync(file.name));
    console.log('PASS tmp cleanup:', location);
  }
  for (const { module: qs, location } of consumers('qs')) {
    assert.deepEqual(qs.parse(qs.stringify({ a: 'bridge', b: ['1', '2'] })), { a: 'bridge', b: ['1', '2'] });
    console.log('PASS qs roundtrip:', location);
  }
  for (const { module: cookie, location } of consumers('tough-cookie')) {
    const jar = new cookie.CookieJar();
    await new Promise((resolve, reject) => jar.setCookie('session=fixture; Path=/', 'http://localhost/', error => error ? reject(error) : resolve()));
    const value = await new Promise((resolve, reject) => jar.getCookieString('http://localhost/', (error, value) => error ? reject(error) : resolve(value)));
    assert.equal(value, 'session=fixture');
    console.log('PASS cookie jar:', location);
  }
}

function rpc(provider, method, params) {
  return new Promise((resolve, reject) => {
    provider.send({ jsonrpc: '2.0', id: 1, method, params }, (error, response) => {
      if (error || response.error) reject(error || new Error(JSON.stringify(response.error)));
      else resolve(response.result);
    });
  });
}

async function checkSigning() {
  // Public disposable test mnemonic, never a production account.
  const mnemonic = 'test test test test test test test test test test test junk';
  const Ganache = require('ganache');
  const HDWalletProvider = require('@truffle/hdwallet-provider');
  const ethers = require('ethers');
  const server = Ganache.server({
    wallet: { mnemonic, totalAccounts: 3 },
    chain: { chainId: 1337, networkId: 1337, hardfork: 'istanbul' },
    logging: { quiet: true },
  });
  let signer;
  await server.listen(0, '127.0.0.1');
  try {
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    signer = new HDWalletProvider({ mnemonic: { phrase: mnemonic }, providerOrUrl: endpoint, numberOfAddresses: 3, chainId: 1337, pollingInterval: 100 });
    const accounts = await rpc(signer, 'eth_accounts', []);
    const rawAccounts = await server.provider.request({ method: 'eth_accounts', params: [] });
    assert.deepEqual(accounts.map(a => a.toLowerCase()), rawAccounts.slice(0, 3).map(a => a.toLowerCase()));
    const payload = '0x6272696467652d74657374';
    const signature = await rpc(signer, 'personal_sign', [payload, accounts[0]]);
    const recovered = ethers.utils.verifyMessage(ethers.utils.arrayify(payload), signature);
    assert.equal(recovered.toLowerCase(), accounts[0].toLowerCase());
    const before = BigInt(await server.provider.request({ method: 'eth_getBalance', params: [accounts[1], 'latest'] }));
    const hash = await rpc(signer, 'eth_sendTransaction', [{ from: accounts[0], to: accounts[1], value: '0x1', gas: '0x5208', gasPrice: '0x3b9aca00' }]);
    const receipt = await server.provider.request({ method: 'eth_getTransactionReceipt', params: [hash] });
    assert.equal(receipt.status, '0x1');
    const after = BigInt(await server.provider.request({ method: 'eth_getBalance', params: [accounts[1], 'latest'] }));
    assert.equal(after - before, 1n);
    console.log('PASS HD wallet derivation, personal signing, and local transaction signing');
  } finally {
    if (signer) signer.engine.stop();
    await server.close();
  }
}

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-toolchain-'));
  try {
    await checkArchives(temp);
    await checkHttp();
    await checkUtilities();
    await checkSigning();
    console.log('All dependency-consumer compatibility checks passed.');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
