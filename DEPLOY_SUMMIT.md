# Deploying the canonical instance to Summit

This is the operator guide for the **PCF-run Feedback Board on the Summit
network** — distinct from [DEPLOYMENT.md](./DEPLOYMENT.md), which is the tutorial
for remixers deploying their *own* copy via the Polkadot Playground on Paseo.

The repo on `main` is already retargeted to Summit. "Deploy" is **two legs**:

| Leg | What | Where | How | When |
|---|---|---|---|---|
| **A — contract** | `@polkadot/feedback` (Rust → PolkaVM) | Summit Asset Hub, registered in the CDM `ContractRegistry` | `cdm deploy -n w3s` — **manual, on the operator VM** | one-time (greenfield) |
| **B — frontend + Apps grid** | the Vite SPA | Summit Bulletin (bound to `feedback.dot`) **+ the playground registry** (`@polkadot/playground-registry` `0x14C27954…`, moddable) | the PCF **`playground-cli`** fork — `playground deploy --env summit --playground --moddable` — **CI on push to `main`** | every frontend change |

Feedback Board is a **playground sample app**, so Leg B uses the **playground-cli**
(not `polkadot-app-deploy`): it is the only tool that hosts + binds the name **and**
writes the moddable Apps-grid entry into the playground registry, so the app shows
in the Apps grid and can be `playground mod feedback.dot`'d. The Summit publish leg
requires the **env-aware-publish fix** (PCF playground-cli #2) — the CI pins that
SHA; earlier commits published the registry entry to Paseo, not Summit.

The SPA resolves the contract address from the **on-chain CDM registry at boot**
(`ContractManager.fromLiveClient`, `libraries: ["@polkadot/feedback"]`), so once
the contract is registered, the frontend never needs a hardcoded address — a
redeploy of either leg is independent.

## Network & accounts

| Field | Value |
|---|---|
| Network | Summit Asset Hub (PolkaVM / `pallet-revive`), EVM chain id `420420417` |
| Asset Hub RPC | `wss://summit-asset-hub-rpc.polkadot.io` |
| Bulletin RPC | `wss://summit-bulletin-rpc.polkadot.io` |
| IPFS gateway | `https://summit-ipfs.polkadot.io/ipfs` |
| CDM `ContractRegistry` | `0xa5747e60ae27f93e92019e4021abfc4957050141` (in `cdm.json`) |
| Asset Hub genesis | `0xf388dc6d6cdf6fb77eac3c4a91f31bc0c8642b142f1a757512ab7849f9f70660` |
| Signer (both legs) | **5Fk8** `5Fk8FBTqBpAyBReZPse2wn8Lf4ADzdNVAsrGoNMSTxKedN8f` (W3S publisher) — Bulletin-authorized uploader + owner of `feedback.dot` |

## Prerequisites (operator)

- **`SUMMIT_DEPLOYER_KEY`** repo secret = the 5Fk8 mnemonic. Used by CI for Leg B.
- 5Fk8 funded with SUM, **Revive-mapped**, and **Bulletin-authorized** (allowance
  expires ~14 days; refresh via the authorizer — see the OPS bulletin-renewal
  runbook).
- **`feedback.dot` pre-registered to 5Fk8.** `feedback` is **8 chars** → DotNS
  `PopRules` gates 6–8 char labels behind **PoP-Full**, which isn't effective on
  Summit (5Fk8 reads `NoStatus`). So the SPA deploy can **not** self-register it —
  it must be registered ahead of time via the **`registerReserved` owner-override**
  (signed by the DotNS owner key `0x8c78b53f…`, name granted to 5Fk8), exactly like
  `browse.dot`/`t3rminal.dot`. After that, the deploy sees `already-owned-by-us` and
  only sets the contenthash. (≥9-char labels are not gated; an alternative is to use
  `feedback-board.dot`.)
- CDM toolchain on the VM (`cdm --version`) that knows the `w3s` preset
  (`@polkadot-community-foundation/cdm-cli`). If `cdm deploy -n w3s` errors
  `Unknown chain "w3s"`, the CLI predates the preset.

## Leg A — deploy the contract (manual, VM, one-time)

```sh
cdm account set -n w3s --mnemonic "<5Fk8 mnemonic>"   # save signer for -n w3s
cdm account map  -n w3s                                # Revive map (idempotent)
cdm account bal  -n w3s                                # MUST print 5Fk8…; cdm uses hdkd derivation

npm run build:contracts                                # cdm build → PolkaVM blob + ABI
npm run deploy:w3s                                     # cdm deploy -n w3s

# cdm deploy does NOT write cdm.json — pull the new address in, then commit:
cdm i -n w3s @polkadot/feedback
git add cdm.json && git commit -m "chore: deploy @polkadot/feedback to Summit"
```

Notes:
- `cdm deploy` instantiates on Asset Hub **and** publishes the ABI to Bulletin
  with the *same* signer — hence 5Fk8 must be Bulletin-authorized.
- The contract is **permissionless** (anyone can `postFeedback`; no owner/admin
  roles), so there is no post-deploy ownership handoff.
- Committing `cdm.json` to `main` triggers the CI frontend deploy (Leg B) with
  the real address baked in (belt-and-suspenders; the SPA also live-resolves it).

## Leg B — deploy the frontend + Apps-grid entry (CI)

`.github/workflows/deploy-summit.yml` builds the playground-cli fork from source
(pinned to the env-aware-publish fix SHA) and runs, signed by `SUMMIT_DEPLOYER_KEY`:
build SPA → assert Paseo-free → host on Bulletin + bind `feedback.dot` + publish
the moddable entry into the playground registry. **Run the first (greenfield)
publish via `workflow_dispatch`** so it can be watched; day-2 changes redeploy on
push to `main`.

Manual equivalent on the VM (needs the PCF `playground` fork on PATH):

```sh
npm run build:frontend
export MNEMONIC="<5Fk8 mnemonic>"
npm run deploy:frontend:summit
# = playground deploy --env summit --no-build --buildDir dist --domain feedback
#     --signer dev --suri "$MNEMONIC" --no-contracts --playground --moddable --tag social
```

- **`--no-contracts`** — the contract is deployed separately (Leg A); the SPA
  live-resolves its address.
- **`--moddable`** records the repo's `git origin` as the public source so attendees
  can `playground mod feedback.dot`.
- The publish leg writes to `@polkadot/playground-registry` (`0x14C27954…`); 5Fk8 is
  the registry sudo, so it may publish. Use the **fix SHA** — earlier playground-cli
  commits publish the entry to Paseo instead of Summit.

## Verify

- `cdm i -n w3s @polkadot/feedback` resolves to the deployed address.
- `curl -sSI https://feedback.dot.li | head -1` → `200`.
- Open `feedback.dot` inside Polkadot Desktop/Mobile: sign in, the board loads,
  posting a note writes to the contract and uploads the note JSON to Bulletin.
- Record the contract address, ABI metadata CID, SPA root CID, and `feedback.dot`
  in the Summit deployments register.
