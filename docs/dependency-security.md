# Dependency security maintenance

## Verified follow-up — 2026-09-22

After the maintainer reported 69 remaining GitHub Dependabot alerts, the second remediation was validated in [Actions run 35695738953](https://github.com/kcc-community/bridge-contract/actions/runs/35695738953). The tested manifest and lockfile were committed as `aa598c6b08d2d8c26a56b5d164f934e382f982e1` on the review branch. The baseline is `dfd5bfd36049b2578682d65c17feab572241b8c0`, including the Actions updates from PR #7.

Both audits used npm 12.0.2 and included development dependencies. The audit contains two different counting units:

### Distinct vulnerability advisories

Deduplicated by advisory URL/GHSA identifier, not by affected package or dependency path:

| Severity | Before this follow-up | After |
| --- | ---: | ---: |
| Critical | 2 | 0 |
| High | 38 | 2 |
| Moderate | 39 | 7 |
| Low | 11 | 3 |
| Total | 90 | 12 |

The candidate removes 78 previously reported advisory identifiers and introduces none. **These are npm audit advisory counts, not a verified change from 69 to 12 GitHub Dependabot alerts.** The GitHub alerts endpoint was not available through the connector used for this work.

### Vulnerable-package records, including propagated findings

| npm audit package severity | Before this follow-up | After |
| --- | ---: | ---: |
| Critical | 2 | 0 |
| High | 31 | 5 |
| Moderate | 37 | 30 |
| Low | 26 | 66 |
| Total | 96 | 101 |

The package-record total increases despite removal of 78 distinct advisories. npm propagates findings to packages depending on affected packages; changing from bundled Ganache to its modular dependency graph changes that counting surface. The larger low-severity total must not be hidden. The full before/after JSON and deduplication result are in the validation artifact. See [npm audit's description of metavulnerabilities](https://docs.npmjs.com/cli/v12/commands/npm-audit/#calculating-meta-vulnerabilities-and-remediations).

### Verification actually completed

- A generated lockfile followed by a clean `npm ci` on Linux, Node 22.23.2 and npm 12.0.2.
- Compilation with Solidity `0.7.4+commit.3f05b770.Emscripten.clang`.
- All **94 active contract tests passed**. The six pre-existing skips remain; no assertions were removed or weakened.
- All **14 compiled artifacts** have identical ABI, creation bytecode and deployed bytecode compared with the baseline build for this follow-up. This does not establish equivalence with historical on-chain deployments.
- Archive creation, listing and extraction using file and streaming APIs; local HTTP calls through the installed Axios/Got consumers; Request/cookie integration; temporary-file cleanup and query-string roundtrips.
- HD wallet address derivation, personal-signature recovery and a signed transfer of one test-chain unit between disposable local accounts.
- Project Solidity sources, migration scripts, existing test files and `truffle-config.js` remained unchanged.

All execution tests used in-process or loopback-only fixtures. No production signing secrets, live RPC endpoints or deployed contracts were used. Coverage, lint, Swarm service integration, browser bundles, Ganache CLI compatibility, Windows/macOS installations and production deployment remain outside this verification. Passing fixture checks does not prove every API of a cross-major override is compatible.

## What changed

### Remove unpatchable bundled copies from the test provider

The `ganache` dependency is an npm alias to the official upstream `@ganache/core@0.10.2` package. This is the modular core used by Ganache 7.9.2, verified against upstream commit `547c900a50d19b094ef636a9aeccf4f7f2356430` and its [release manifest](https://github.com/ConsenSys-archive/ganache/blob/547c900a50d19b094ef636a9aeccf4f7f2356430/packages/ganache/package.json).

The modular package allows npm to resolve updated dependencies instead of leaving vulnerable copies inside the bundled distribution. It is still a legacy Ganache release, not a newly maintained replacement. Its actual package name and all resolved transitive versions remain visible in the lockfile and full audit. The alias is not a vulnerability exclusion.

A scoped override pins the VM's transaction dependency to `@ethereumjs/tx@4.1.1`, matching Ganache's release. Allowing that old VM to resolve 4.2.0 caused a removed transaction-class check to fail at runtime. This was caught before any candidate was persisted.

The modular API also reports `DEV` unless its upstream `VERSION` environment value is supplied. OpenZeppelin's old test helper tries to parse that value as a semantic version. `scripts/run-contract-tests.cjs` supplies `7.9.2-core.0.10.2` only to the disposable Truffle test process and checks the installed core's package identity first. This identifies the release without changing RPC execution results, bypassing revert assertions or changing audit metadata.

### Update remaining transitive dependencies

Explicit overrides update archive handling, HTTP clients, WebSocket handling, temporary files, query parsing, serialization, pattern matching and native cryptographic bindings. The old critical `tar` record and Ganache's bundled critical `elliptic` copy no longer occur in the validated audit. The root `elliptic@6.6.1` still has a separate low-severity advisory; this is retained and reported below.

Some overrides cross a dependency consumer's declared range. The added `test:toolchain` fixtures and existing contract suite validate the repository's tested paths; they are not a claim of universal compatibility. npm generated the lockfile through a real installation. No lockfile entries were manually removed, no dependencies were omitted from the audit, and no alerts were dismissed.

## Remaining 12 advisory identifiers

These findings remain open for remediation or a separately justified applicability decision; the list is not a blanket risk acceptance.

| Package/component | Advisory identifiers | Remaining consideration |
| --- | --- | --- |
| OpenZeppelin 3.4.2 | [GHSA-9c22-pwxw-p6hx](https://github.com/advisories/GHSA-9c22-pwxw-p6hx), [GHSA-88g8-f5mf-f5rj](https://github.com/advisories/GHSA-88g8-f5mf-f5rj), [GHSA-7grf-83vw-6f5x](https://github.com/advisories/GHSA-7grf-83vw-6f5x), [GHSA-mx2q-35m2-x2rh](https://github.com/advisories/GHSA-mx2q-35m2-x2rh) | Initializers, ERC165Checker and TransparentUpgradeableProxy are not in this project's successful compile graph. Upgrading the whole package requires a separately reviewed Solidity migration. |
| Apollo Server / core | [GHSA-mp6q-xf9x-fwf7](https://github.com/advisories/GHSA-mp6q-xf9x-fwf7), [GHSA-9q82-xgwf-vj6h](https://github.com/advisories/GHSA-9q82-xgwf-vj6h) | Retained through the Truffle database toolchain. Do not expose that legacy service to untrusted clients. Replacing Truffle avoids retaining this server dependency. |
| decode-uri-component | [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | Retained through older URL/request dependencies; malformed-input handling still needs remediation. |
| elliptic | [GHSA-848j-6mx2-7j84](https://github.com/advisories/GHSA-848j-6mx2-7j84) | Low-severity cryptographic implementation concern remains in version 6.6.1. Local signature checks are compatibility evidence, not a security proof. |
| request | [GHSA-p8p7-x288-28g6](https://github.com/advisories/GHSA-p8p7-x288-28g6) | SSRF finding remains in the legacy client. Local HTTP tests do not resolve the vulnerability or justify accepting untrusted URLs. |
| uuid | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Legacy callers use incompatible older APIs; no unverified global major-version override was applied. |
| web3-core-method / subscriptions | [GHSA-2j4c-9qqq-896r](https://github.com/advisories/GHSA-2j4c-9qqq-896r), [GHSA-hhf6-3xpg-pggx](https://github.com/advisories/GHSA-hhf6-3xpg-pggx) | Low-severity prototype-pollution findings remain in old Web3 dependencies. Replacing that toolchain is preferable to hiding these records. |

The imported OpenZeppelin modules are `Ownable`, `SafeMath`, `ERC20`, `IERC20`, `Context` and `Pausable`. Absence of the affected modules from this build is limited applicability evidence, not a general guarantee about future imports or deployed contracts.

The next larger change should replace the retired Truffle/Web3 tooling and migrate its consumers under regression tests. A maintained OpenZeppelin major version requires a separate contract-language/semantic review. Neither transition should be performed by relaxing pragmas or suppressing test failures just to reduce counts.

## Initial remediation history

[PR #6](https://github.com/kcc-community/bridge-contract/pull/6) first reduced npm vulnerable-package records from 173 to 96: critical 57 to 2; high 60 to 31; moderate 38 to 37; low 18 to 26. It removed unused Chainlink and the duplicate OpenZeppelin test environment, restored reproducible installation and preserved the existing tests through Truffle's runner.

That initial pass changed OpenZeppelin **4.7.3 to 3.4.2 as a compatibility downgrade, not a security upgrade**: the repository's Solidity 0.7 source imports did not compile against 4.x. This follow-up does not change the OpenZeppelin version, compiler version or contract sources.

## Reproduce and maintain

```sh
nvm install
nvm use
npm install --global npm@12.0.2
npm ci
npm run compile
npm test
npm run test:toolchain
npm run audit:dependencies
```

Use Node 22.22.2 or newer in the 22.x line. `npm test` uses the checked-in local test runner; it does not deploy to configured live networks. The final audit command still exits nonzero while advisories remain. Ganache may use its JavaScript uWS fallback on Node 22; the recorded tests passed with that fallback.

Permanent CI uses read-only permissions, no persisted checkout credentials and no deployment secrets. Clean installation, compilation, contract assertions and toolchain fixture checks must pass. All vulnerabilities remain reported, and any critical finding now fails CI. High/moderate/low findings are not automatically dismissed or treated as harmless. The temporary write-enabled remediation workflow was removed after the tested manifest and lockfile were committed.

Dependabot configuration continues to separate contract-library and tooling security PRs. Its weekly version-check schedule is not an email-notification schedule. This work has not changed personal email preferences, disabled security alerts or verified the post-merge GitHub alert count. The 69-alert report remains a user-observed GitHub count, not a number independently reconciled through the alerts API.
