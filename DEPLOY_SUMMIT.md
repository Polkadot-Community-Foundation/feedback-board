# Deploying the canonical instance to Summit

This is the operator guide for the **PCF-run Feedback Board on the Summit
network** — distinct from [DEPLOYMENT.md](./DEPLOYMENT.md), which is the tutorial
for remixers deploying their *own* copy via the Polkadot Playground on Paseo.

The repo on `main` is already retargeted to Summit. "Deploy" is **three legs**:

| Leg | What | Where | How | When |
|---|---|---|---|---|
| **A — contract** | `@polkadot/feedback` (Rust → PolkaVM) | Summit Asset Hub, registered in the CDM `ContractRegistry` | `cdm deploy -n w3s` — **manual, on the operator VM** | one-time (greenfield) |
| **B — frontend** | the Vite SPA | Summit Bulletin Chain, bound to `feedback.dot` | `polkadot-app-deploy --env summit` — **CI on push to `main`** | every frontend change |
| **C — Apps-grid listing** | the moddable registry entry | the playground registry (`@polkadot/playground-registry` `0x14C27954…`) | **admin-side** — a registry sudo publishes/pins it | once |

Leg B host+binds the name reliably via **`polkadot-app-deploy`**. The **Apps-grid
listing (Leg C) is intentionally NOT in this repo's CI**: the playground registry's
`publish` is authorization-gated, and an app's own CI signer (the playground-cli
`--suri` hdkd account) is **not** the registry sudo, so a self-publish reverts
`Unauthorized`. The listing is done by a **registry admin** signing as the sudo.

The SPA resolves the contract address from the **on-chain CDM registry at boot**
(`ContractManager.fromLiveClient`, `libraries: ["@polkadot/feedback"]`), so once the
contract is registered the frontend never needs a hardcoded address — the legs are
independent.

## Network & accounts

| Field | Value |
|---|---|
| Network | Summit Asset Hub (PolkaVM / `pallet-revive`), EVM chain id `420420417` |
| Asset Hub RPC | `wss://summit-asset-hub-rpc.polkadot.io` |
| Bulletin RPC | `wss://summit-bulletin-rpc.polkadot.io` |
| IPFS gateway | `https://summit-ipfs.polkadot.io/ipfs` |
| CDM `ContractRegistry` | `0xa5747e60ae27f93e92019e4021abfc4957050141` (in `cdm.json`) |
| `@polkadot/feedback` (deployed) | `0x86Cc121993A2B7Aa53EC8222B63D2053eF352f32` |
| Signer (legs A + B) | **5Fk8** `5Fk8FBTqBpAyBReZPse2wn8Lf4ADzdNVAsrGoNMSTxKedN8f` (W3S publisher) — Bulletin-authorized uploader + owner of `feedback.dot` |

## Prerequisites (operator)

- **`SUMMIT_DEPLOYER_KEY`** repo secret = the 5Fk8 mnemonic. Used by CI for Leg B.
- 5Fk8 funded with SUM, **Revive-mapped**, and **Bulletin-authorized** (allowance
  expires ~14 days; refresh via the authorizer — OPS bulletin-renewal runbook).
- **`feedback.dot` registered to 5Fk8.** `feedback` is **8 chars** → DotNS `PopRules`
  gates 6–8 char labels behind **PoP-Full** (not effective on Summit, 5Fk8 reads
  `NoStatus`), so it was registered via the **`registerReserved` owner-override**
  (DotNS owner key `0x8c78b53f…`, granted to 5Fk8). Done. `polkadot-app-deploy` then
  sees `already-owned-by-us`.

## Leg A — deploy the contract (manual, VM, one-time) — DONE

```sh
cdm account set -n w3s --mnemonic "<5Fk8 mnemonic>"
cdm account map  -n w3s
cdm account bal  -n w3s                  # MUST print 5Fk8…; cdm uses hdkd derivation
npm run build:contracts                  # cdm build (needs the committed .cargo target spec)
npm run deploy:w3s                       # cdm deploy -n w3s
```

⚠️ **`cdm install` does NOT write `cdm.json`** for this repo — the published metadata
carries an **empty Solidity ABI** (a known family-wide abi-gen/.cargo toolchain quirk:
`serde` won't compile under the forced PolkaVM target; shared with simple-survey/RPS).
**Benign:** the committed `cdm.json` already holds the correct 4-method ABI, and the
frontend live-resolves the address. The deployed address (`0x86Cc1219…2f32`) and
`metadataCid` were patched into `cdm.json` by hand (resolved via
`ContractManager.fromLiveClient` with 5Fk8's mapped origin). The contract is
**permissionless** (no owner/admin) → no ownership handoff.

## Leg B — deploy the frontend (CI, automatic)

`.github/workflows/deploy-summit.yml` runs on push to `main`: build → assert the
bundle is Paseo-free → `polkadot-app-deploy --env summit --mnemonic … --config
--js-merkle --no-transfer-to-signedin-user ./dist feedback.dot`, signed by
`SUMMIT_DEPLOYER_KEY`.

Manual equivalent on the VM:

```sh
npm run build:frontend
export MNEMONIC="<5Fk8 mnemonic>"
npm run deploy:frontend:summit
# = polkadot-app-deploy --env summit --mnemonic "$MNEMONIC" --config ./polkadot-app-deploy.config.ts
#     --js-merkle --no-transfer-to-signedin-user ./dist feedback.dot
```

- **`--mnemonic` (direct signer), never `--suri`** — `--suri` rides the unauthorized
  public pool and the Bulletin upload fails on Summit.
- **Never `--publish`** — Summit has no Publisher.

## Leg C — Apps-grid listing (admin-side, one-time)

Feedback Board is a playground sample app, so it should appear in the playground
**Apps grid** as moddable. This can't be done from this repo's CI (self-publish
reverts `Unauthorized` — the deploy signer is not the registry sudo). A **registry
admin** (the `@polkadot/playground-registry` sudo) lists it, signing as the sudo:

**⚠️ Not the playground-cli `--suri` path** — that signs as a *product-derived*
account (`mnemonic + "/product/…"`), which is NOT the registry sudo, so it reverts
`Unauthorized`. The listing must be signed by the **bare keyring 5Fk8** (the sudo).

This repo ships a self-contained script that does exactly that (no `playground`
binary needed — just `npm install` + the key):

```sh
npm install                                            # pulls tsx + the publish deps
MNEMONIC="<bare 5Fk8 mnemonic>" npm run publish:playground         # DRY RUN — prints args
#   confirm "Signer: 5Fk8FBTqBp…" (must be the registry sudo), then:
MNEMONIC="<bare 5Fk8 mnemonic>" RUN=1 npm run publish:playground   # upload metadata + publish
```

It signs with `seedToAccount(mnemonic, "")` (bare 5Fk8), uploads a feedback-specific
AppMetadata (name/icon/repo/tag `social`) to Summit Bulletin, and calls
`registry.publish(feedback.dot, …, is_moddable=true)` on `@polkadot/playground-registry`
(`0x14C27954…`) — the same call `playground-app-community`'s `publish-metadata.ts`
makes for `playground.dot`. Afterwards an admin can optionally feature it with
`pin-apps.ts feedback.dot`.

`feedback.dot` is already live and `--moddable` will record this repo's `git origin`
as the public source, so `playground mod feedback.dot` works after the listing.

## Verify

- `https://feedback.dot.li` → 200; open `feedback.dot` in Polkadot Desktop/Mobile,
  sign in, pin a note → writes to `@polkadot/feedback` + uploads the note to Bulletin.
- (after Leg C) the app card shows in the playground Apps tab, tagged `social`.
- Record the SPA root CID + `feedback.dot` in the Summit deployments register.
