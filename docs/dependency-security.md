# Dependency security maintenance

## Current verified result — 2026-09-22

The maintainer reported **11 GitHub Dependabot alerts** after PR #8. That page count is user-observed; the connector used here cannot independently read or dismiss the alert list. It must not be substituted with npm's counts.

The targeted follow-up in [PR #9](https://github.com/kcc-community/bridge-contract/pull/9) was validated by [Actions run 35697960652](https://github.com/kcc-community/bridge-contract/actions/runs/35697960652). Its baseline is `fd8f6310454fc518f67c3168117f437acd9a4f6a`. The tested dependency files were persisted as `ce4cc7ab47dacf7ec9bdd91ed82ad122a6f5ebf4`.

Both audits used npm 12.0.2 and included all development dependencies:

| Measurement | Before this targeted follow-up | After |
| --- | ---: | ---: |
| Distinct GHSA identifiers | 12 | 10 |
| Distinct critical advisories | 0 | 0 |
| Distinct high advisories | 2 | 2 |
| Distinct moderate advisories | 7 | 5 |
| Distinct low advisories | 3 | 3 |
| Vulnerable-package records, including propagation | 101 | 89 |

The two removed identifiers are Request [GHSA-p8p7-x288-28g6](https://github.com/advisories/GHSA-p8p7-x288-28g6) and decode-uri-component [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr). No new advisory identifiers were introduced.

The propagated package-record distribution changed from critical/high/moderate/low **0/5/30/66** to **0/5/12/72**. The larger low-severity package count is reported, not omitted: npm propagates a remaining advisory to its dependency consumers. Neither counting unit is a verified post-merge GitHub alert count. This is not a clean security audit.

### Verification

- A generated npm lockfile followed by a clean `npm ci` succeeded on Linux, Node 22.23.2 and npm 12.0.2.
- Solidity 0.7.4 compilation succeeded. All **14 artifacts** have identical ABI, creation bytecode and deployed bytecode compared with the baseline build above. This does not prove equivalence with historical on-chain deployments.
- All **94 active contract tests passed**; six pre-existing skipped tests remain. No existing test assertions were removed or weakened.
- Existing archive, HTTP, cookie, query, temporary-file, HD wallet derivation, signature recovery and transaction-signing fixtures passed on disposable local resources.
- New regressions passed for UTF-8/query-string roundtrips, timeout-bounded malformed decoding, caller-agent preservation on a mocked cross-protocol redirect, and modern UUID buffer bounds.
- Solidity sources, migration scripts, existing contract tests and `truffle-config.js` are unchanged in this follow-up. No production keys, live RPC endpoints or on-chain deployments were used.

The manifest blob `03eddd1c1f469bc922adac46b9597033e9c63994` and lockfile blob `4f0dc88f5f3827276353219ba79dbdab6e633e01` match the validated artifact bytes. The run's `targeted-security-evidence` artifact includes both full audit JSON files, the summary, bytecode comparison, upstream metadata and install/build/test logs. Artifact retention is finite; permanent CI uploads a fresh full audit on each run.

Coverage, lint, browser bundles, Swarm service integration, Ganache CLI, macOS/Windows installation and production deployment have not been validated. Local fixture success is not proof of compatibility with every API or of general cryptographic security.

## Targeted changes

### Request

The `request` dependency now resolves to the upstream Cypress fork `@cypress/request@3.0.10` through an npm alias. The actual upstream package identity and transitive versions remain in the lockfile and full audit. The original vulnerable implementation is not retained under another name.

The regression checks that a cross-protocol redirect does not discard the caller-supplied agent by default. Existing local HTTP/cookie and signing tests also pass with the replacement. This addresses the cited redirect/agent advisory; it is **not a universal SSRF defense**. Applications still need URL, redirect and network-access policies before accepting untrusted URLs.

### URI decoding

Upstream `decode-uri-component@0.5.0` fixes the cited malformed-input problem but exports an ESM default function. Old query-string callers expect a callable CommonJS export.

`tools/decode-uri-component-cjs/index.cjs` is a small export adapter, not a copied decoder. It delegates every call to the upstream package, installed as `patched-decoder` with its real `decode-uri-component` name and version in the lockfile. Node 22 supplies synchronous ESM loading. The direct root dependency uses the name `decode-uri-component` expected by callers, while the adapter itself has the distinct private package name `@kcc-community/decode-uri-component-cjs`.

Keep the `tools/decode-uri-component-cjs` directory with the manifest and lockfile in build contexts. Removing it breaks a clean install. The local package and upstream alias are not audit exclusions, and no dependency entries were removed by hand.

### UUID

Consumers requesting UUID 7.x–10.x are moved to patched **11.1.1**, with tests for UUID generation and output-buffer bounds. Legacy **2.0.1 and 3.3.2** callers remain because their APIs are not safely replaced by the same global override. The UUID advisory is therefore **still open**, not claimed fixed. Its references to v3/v5/v6 concern UUID generation methods, not npm package major versions.

## Remaining 10 advisory identifiers

This list records the current full npm audit. It is not a blanket risk acceptance and is not an independently reconciled list of GitHub alerts.

| Component | Advisory identifiers | Treatment |
| --- | --- | --- |
| OpenZeppelin 3.4.2 | [GHSA-9c22-pwxw-p6hx](https://github.com/advisories/GHSA-9c22-pwxw-p6hx), [GHSA-88g8-f5mf-f5rj](https://github.com/advisories/GHSA-88g8-f5mf-f5rj), [GHSA-7grf-83vw-6f5x](https://github.com/advisories/GHSA-7grf-83vw-6f5x), [GHSA-mx2q-35m2-x2rh](https://github.com/advisories/GHSA-mx2q-35m2-x2rh) | Affected initializer, ERC165Checker and TransparentUpgradeableProxy modules are absent from the successful compile graph. Any not-used dismissal should name the individual advisory and this evidence, not exempt the whole package. No dismissal was performed. |
| Apollo Server / core | [GHSA-mp6q-xf9x-fwf7](https://github.com/advisories/GHSA-mp6q-xf9x-fwf7), [GHSA-9q82-xgwf-vj6h](https://github.com/advisories/GHSA-9q82-xgwf-vj6h) | Retained through the old Truffle database stack. Do not expose the legacy service to untrusted clients; remove or replace its consumers rather than force a renamed server package into incompatible APIs. |
| elliptic 6.6.1 | [GHSA-848j-6mx2-7j84](https://github.com/advisories/GHSA-848j-6mx2-7j84) | The low-severity cryptographic implementation concern remains. Signing fixtures demonstrate compatibility, not a security proof. |
| Legacy UUID callers | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | The 2.0.1/3.3.2 consumers need an API migration or individually justified reachability analysis. Upgrading only modern callers does not close this advisory. |
| Old Web3 method / subscriptions | [GHSA-2j4c-9qqq-896r](https://github.com/advisories/GHSA-2j4c-9qqq-896r), [GHSA-hhf6-3xpg-pggx](https://github.com/advisories/GHSA-hhf6-3xpg-pggx) | Prototype-pollution advisories remain in the legacy stack. Replace the affected toolchain under regression tests; do not label the records harmless simply because they are development dependencies. |

The compiled OpenZeppelin imports are `Ownable`, `SafeMath`, `ERC20`, `IERC20`, `Context` and `Pausable`. Absence of the affected modules is evidence limited to this build; it is not a guarantee for future imports, other projects or deployed contracts.

The next structural remediation is migration away from the retired Truffle/Web3 consumers, preserving compilation, deployment semantics, signing behavior and all regression tests. A maintained OpenZeppelin major version also needs a separately reviewed Solidity-language/semantic migration. Neither should be replaced by relaxing pragmas, suppressing tests, omitting development dependencies or removing lockfile entries to reduce counts.

## Earlier remediation history

[PR #6](https://github.com/kcc-community/bridge-contract/pull/6) reduced vulnerable-package records from 173 to 96 (critical 57 to 2). It removed unused Chainlink and the duplicate OpenZeppelin test environment and restored reproducible installation and the existing test suites. It changed OpenZeppelin **4.7.3 to 3.4.2 as a compatibility downgrade, not a security upgrade**, because the original Solidity 0.7 imports did not compile against 4.x.

[PR #7](https://github.com/kcc-community/bridge-contract/pull/7) upgraded the pinned Actions dependencies; those changes are retained.

[PR #8](https://github.com/kcc-community/bridge-contract/pull/8) reduced distinct advisories from 90 to 12 and critical findings from 2 to 0. Propagated package records changed from 96 to 101 and were disclosed. It replaced bundled Ganache with official modular `@ganache/core@0.10.2`, the core used by Ganache 7.9.2, and patched archive/HTTP/utility dependencies. Validation runs: [35695738953](https://github.com/kcc-community/bridge-contract/actions/runs/35695738953) and [35696132528](https://github.com/kcc-community/bridge-contract/actions/runs/35696132528).

The modular Ganache dependency remains a legacy release. Its VM transaction override (`@ethereumjs/tx@4.1.1`) preserves the compatible API. `scripts/run-contract-tests.cjs` supplies the upstream release identifier `7.9.2-core.0.10.2` only in the disposable test process; the default `DEV` string breaks the old helper's semantic-version parsing. This does not alter RPC results, revert assertions or audit metadata. Ganache can use its JavaScript uWS fallback on Node 22; tests passed with that fallback.

## Reproduce and maintain

```sh
nvm install
nvm use
npm install --global npm@12.0.2
npm ci
npm run compile
npm test
npm run test:toolchain
npm run test:dependency-patches
npm run audit:dependencies
```

Use Node 22.22.2 or newer in the 22.x line. The audit command intentionally exits nonzero while advisories remain. Tests use disposable in-process or loopback-only resources, not configured live networks.

Permanent CI has read-only repository permissions, no persisted checkout credentials, no automatic dependency cache and no deployment secrets. It requires clean installation, compilation, unchanged contract assertions and both toolchain test suites. Critical findings and recurrence of the two fixed Request/decoder advisories fail CI; all other findings remain visible and are not automatically accepted. The temporary write-enabled candidate workflow is removed from the final diff.

Dependabot still separates contract-library and tooling security-update PRs. Its weekly version-check schedule is not an email-notification schedule. No security alerts have been disabled or dismissed and no personal email preferences have been changed. Exact post-merge GitHub counts and notification delivery require separate verification.
