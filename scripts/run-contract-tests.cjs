'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

try {
  const ganache = require('ganache/package.json');
  assert.equal(ganache.name, '@ganache/core');
  assert.equal(ganache.version, '0.10.2');

  // @ganache/core 0.10.2 is the core shipped in Ganache 7.9.2 at upstream
  // commit 547c900a50d19b094ef636a9aeccf4f7f2356430. Unlike the webpack bundle,
  // the modular package reads process.env.VERSION and otherwise reports DEV.
  // Set a qualified release identifier only in this disposable test process.
  // No RPC results, revert checks, contract code or test assertions are mocked.
  const result = spawnSync(process.execPath, [
    require.resolve('truffle/build/cli.bundled.js'),
    'test', '--network', 'test', '--migrate-none',
  ], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, VERSION: '7.9.2-core.0.10.2' },
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Contract test process ended with ${result.signal}`);
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
