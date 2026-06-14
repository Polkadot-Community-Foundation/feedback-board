# Deploying the canonical instance to Summit

This is the operator guide for the **PCF-run Feedback Board on the Summit
network** — distinct from [DEPLOYMENT.md](./DEPLOYMENT.md), which is the tutorial
for remixers deploying their *own* copy via the Polkadot Playground on Paseo.

The repo on `main` is already retargeted to Summit. "Deploy" is **two legs**:

| Leg | What | Where | How | When |
|---|---|---|---|---|
| **A — contract** | `@polkadot/feedback` (Rust → PolkaVM) | Summit Asset Hub, registered in the CDM `ContractRegistry` | `cdm deploy -n w3s` — **manual, on the operator VM** | one-time (greenfield) |
| **B — frontend** | the Vite SPA | Summit Bulletin Chain, bound to `feedback.dot` | `polkadot-app-deploy --env summit` — **CI on push to `main`** | every frontend change |

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

## Leg B — deploy the frontend (CI, automatic)

Merging to `main` runs `.github/workflows/deploy-summit.yml`:
build → assert the bundle is Paseo-free → `polkadot-app-deploy --env summit
--direct-signer` to `feedback.dot`, signed by `SUMMIT_DEPLOYER_KEY`.

Manual equivalent on the VM:

```sh
npm run build:frontend
export MNEMONIC="<5Fk8 mnemonic>"
npm run deploy:frontend:summit        # polkadot-app-deploy --env summit --mnemonic ./dist feedback.dot
```

- **`--mnemonic` (direct signer), never `--suri`** — `--suri` falls back to the
  unauthorized public pool and the Bulletin upload fails on Summit.
- **Never `--publish`** — Summit has no Publisher.

## Verify

- `cdm i -n w3s @polkadot/feedback` resolves to the deployed address.
- `curl -sSI https://feedback.dot.li | head -1` → `200`.
- Open `feedback.dot` inside Polkadot Desktop/Mobile: sign in, the board loads,
  posting a note writes to the contract and uploads the note JSON to Bulletin.
- Record the contract address, ABI metadata CID, SPA root CID, and `feedback.dot`
  in the Summit deployments register.
