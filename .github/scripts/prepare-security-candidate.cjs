'use strict';

// One-time migration. Preserve Solidity sources and every existing test case.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(manifest.dependencies['@openzeppelin/contracts'], '4.7.3');
assert.equal(manifest.devDependencies['@openzeppelin/test-environment'], '0.1.9');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sources = fs.readdirSync('contracts').filter(f => f.endsWith('.sol')).sort();
const sourceHashes = Object.fromEntries(sources.map(f => [f, hash('contracts/' + f)]));

// 4.x does not compile with this project's Solidity 0.7 sources. 3.4.2 restores
// their supported API; it is a compatibility correction, NOT a security upgrade.
// Package advisories that remain must stay visible in the full dependency audit.
manifest.dependencies = { '@openzeppelin/contracts': '3.4.2' };
manifest.devDependencies = {
  '@openzeppelin/test-helpers': '0.5.16',
  '@truffle/hdwallet-provider': '2.1.15',
  chai: '4.5.0',
  ganache: '7.9.2',
  mochawesome: '8.1.1',
  prettier: '3.9.8',
  'prettier-plugin-solidity': '2.4.1',
  solc: '0.7.4',
  solhint: '6.2.4',
  'solidity-coverage': '0.7.22',
  table: '6.9.0',
  truffle: '5.11.5'
};
manifest.engines = { node: '>=22.12.0 <23' };
manifest.scripts.test = 'truffle test --network test --migrate-none';
manifest.scripts.mocha = 'npm test';
manifest.scripts['audit:dependencies'] = 'npm audit --include=dev';
fs.writeFileSync('package.json', JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync('.nvmrc', '22\n');
fs.writeFileSync('.solcover.js', 'module.exports = { skipFiles: ["Migrations.sol"] };\n');

const testFiles = [
  'test/bridge.logic.test.js', 'test/bridge.pair.test.js',
  'test/bridge.storage.test.js', 'test/bridge.test.js'
];
for (const file of testFiles) {
  const original = fs.readFileSync(file, 'utf8');
  const header = /^const\s*\{\s*accounts,\s*contract,\s*\}\s*=\s*require\("@openzeppelin\/test-environment"\);\r?\n/;
  assert.match(original, header, 'Unexpected test environment import: ' + file);
  let updated = original.replace(header, '');
  assert.match(updated, /contract\.fromArtifact\(/);
  updated = updated.replaceAll('contract.fromArtifact(', 'artifacts.require(');
  assert.equal((updated.match(/^describe\(/gm) || []).length, 1, 'Unexpected root suites: ' + file);
  updated = updated.replace(/^describe\(("[^"]+"), function \(\) \{/m, 'contract($1, function (accounts) {');
  assert.ok(!updated.includes('@openzeppelin/test-environment'));
  assert.match(updated, /^contract\(/m);
  const cases = text => [...text.matchAll(/\bit(?:\.skip)?\s*\([^\n]+/g)].map(m => m[0]);
  assert.deepEqual(cases(updated), cases(original), 'Test cases must not be removed or skipped');
  fs.writeFileSync(file, updated);
}

let config = fs.readFileSync('truffle-config.js', 'utf8');
assert.match(config, /networks:\s*\{/);
assert.match(config, /version:\s*"0\.7\.4"/);
config = 'let testProvider;\n' + config;
config = config.replace(/networks:\s*\{/, `networks: {
        // Ephemeral, in-process test chain. Never use deployment credentials here.
        test: {
            provider: () => {
                if (!testProvider) {
                    testProvider = require("ganache").provider({
                        wallet: { deterministic: true, totalAccounts: 10 },
                        chain: { chainId: 1337, networkId: 1337, hardfork: "istanbul" },
                        logging: { quiet: true },
                    });
                }
                return testProvider;
            },
            network_id: 1337,
        },`);
config = config.replace(/version:\s*"0\.7\.4"/, 'version: require.resolve("solc/soljson.js")');
fs.writeFileSync('truffle-config.js', config);
for (const source of sources) assert.equal(hash('contracts/' + source), sourceHashes[source]);
fs.writeFileSync('source-hashes.json', JSON.stringify(sourceHashes, null, 2) + '\n');
console.log('Prepared dependency candidate. Solidity hashes and all test cases preserved.');
