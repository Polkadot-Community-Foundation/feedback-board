// SPDX-License-Identifier: GPL-3.0-or-later
//
// Leg C — list feedback.dot in the playground Apps grid (moddable), on Summit.
//
// This is an ADMIN/SUDO operation, NOT something the app CI can do: the playground
// registry's `publish` is authorization-gated, and the playground-cli `--suri` path
// signs as a *product-derived* account (mnemonic + "/product/…"), which is NOT the
// registry sudo — so a self-publish reverts `Unauthorized`. This script instead signs
// with the **bare keyring account** (`seedToAccount(mnemonic, "")`), i.e. 5Fk8 itself,
// which is the `@polkadot/playground-registry` sudo + the DotNS owner of feedback.dot.
//
// It uploads a feedback-specific AppMetadata (name/description/icon/repo/tag) to Summit
// Bulletin and calls `registry.publish(...)` — the same call playground-app-community's
// publish-metadata.ts makes for playground.dot (which succeeded on Summit), with
// is_moddable=true so attendees can `playground mod feedback.dot`.
//
//   Usage (on the VM / wherever the key lives — no `playground` binary needed):
//     MNEMONIC="<bare 5Fk8 mnemonic>" npx tsx scripts/publish-to-playground.ts        # DRY RUN
//     MNEMONIC="<bare 5Fk8 mnemonic>" RUN=1 npx tsx scripts/publish-to-playground.ts  # broadcast
//
//   Env overrides: ASSET_HUB_WS_URL, BULLETIN_WS_URL (default Summit), PLAYGROUND_TAG.

import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";
import { ContractManager, type CdmJson } from "@parity/product-sdk-contracts";
import { seedToAccount } from "@parity/product-sdk-keys";
import { calculateCid } from "@parity/product-sdk-cloud-storage";
import { AsyncBulletinClient } from "@parity/bulletin-sdk";
import { summit_asset_hub } from "@parity/product-sdk-descriptors/summit-asset-hub";
import { summit_bulletin } from "@parity/product-sdk-descriptors/summit-bulletin";
import registryCdm from "./playground-registry.cdm.json" with { type: "json" };

const REGISTRY = "@polkadot/playground-registry";
const DOMAIN = "feedback.dot";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ASSET_HUB_WS = process.env.ASSET_HUB_WS_URL ?? "wss://summit-asset-hub-rpc.polkadot.io";
const BULLETIN_WS = process.env.BULLETIN_WS_URL ?? "wss://summit-bulletin-rpc.polkadot.io";
const TAG = process.env.PLAYGROUND_TAG ?? "social";
const RUN = process.env.RUN === "1";

const mnemonic = process.env.MNEMONIC;
if (!mnemonic) {
  console.error("MNEMONIC env var required (bare 5Fk8 sr25519 mnemonic — the registry sudo).");
  process.exit(1);
}

// Bare keyring account (NOT a product derivation) — this is the registry sudo.
const { signer, ss58Address: origin } = seedToAccount(mnemonic, "");

function gitRemoteUrl(): string | undefined {
  try {
    const raw = execSync("git remote get-url origin", { encoding: "utf-8", stdio: "pipe" }).trim();
    return raw.startsWith("git@")
      ? raw.replace(/^git@([^:]+):/, "https://$1/").replace(/\.git$/, "")
      : raw.replace(/\.git$/, "");
  } catch {
    return undefined;
  }
}

// AppMetadata for the grid card.
const uploads: { label: string; bytes: Uint8Array }[] = [];
let iconCid: string | undefined;
const iconPath = resolve(root, "assets/icon.png");
if (existsSync(iconPath)) {
  const iconBytes = new Uint8Array(readFileSync(iconPath));
  iconCid = (await calculateCid(iconBytes)).toString();
  uploads.push({ label: "icon", bytes: iconBytes });
  console.log(`Icon: ${iconPath} -> ${iconCid}`);
}
const readmePath = resolve(root, "README.md");
const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf-8") : undefined;

const metadata = {
  name: "Feedback Board",
  description:
    "A decentralized sticky-note board on Polkadot. Pin feedback, notes, or thoughts to a shared board — notes live on Bulletin, the ordered list of them on an Asset Hub contract.",
  ...(gitRemoteUrl() && { repository: gitRemoteUrl() }),
  ...(iconCid && { icon_cid: iconCid }),
  tag: TAG,
  ...(readme && { readme }),
};
const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
const metadataCid = (await calculateCid(metadataBytes)).toString();
uploads.push({ label: "metadata", bytes: metadataBytes });

console.log("\nRegistry:   ", REGISTRY, registryCdm.contracts[REGISTRY].address);
console.log("Domain:     ", DOMAIN);
console.log("Signer:     ", origin, "(bare keyring — must be the registry sudo)");
console.log("AssetHub:   ", ASSET_HUB_WS);
console.log("Bulletin:   ", BULLETIN_WS);
console.log("MetadataCID:", metadataCid);
console.log("Metadata:   ", JSON.stringify(metadata, (k, v) => (k === "readme" ? `<${(v as string).length} chars>` : v), 2));

if (!RUN) {
  console.log("\nDRY RUN (set RUN=1 to upload + publish). Nothing was broadcast.");
  process.exit(0);
}

// Upload AppMetadata (+ icon) to Summit Bulletin.
console.log("\nUploading to Bulletin...");
const bulletinClient = createClient(getWsProvider(BULLETIN_WS));
const bulletinApi = bulletinClient.getTypedApi(summit_bulletin);
const bulletinUploader = new AsyncBulletinClient(bulletinApi as never, signer, bulletinClient.submit);
for (const { label, bytes } of uploads) {
  console.log(`  ${label} (${bytes.length} bytes)...`);
  await bulletinUploader.store(bytes).send();
}
bulletinClient.destroy();
console.log("Upload complete.");

// Publish to the playground registry (signed by the bare sudo account).
const chainClient = createClient(getWsProvider(ASSET_HUB_WS));
const manager = await ContractManager.fromClient(
  registryCdm as unknown as CdmJson,
  chainClient,
  summit_asset_hub,
  { defaultSigner: signer, defaultOrigin: origin, registryOrigin: origin, libraries: [REGISTRY] },
);
try {
  const registry = manager.getContract(REGISTRY);
  console.log(`\nPublishing ${DOMAIN} as ${origin}...`);
  const result = await registry.publish.tx(
    DOMAIN,
    metadataCid,
    1, // visibility (public) — matches playground-app-community's publish-metadata.ts
    { isSome: false, value: "0x0000000000000000000000000000000000000000" as const }, // owner = none
    "", // modded_from — this is an original, not a mod
    true, // is_moddable — list it as moddable so `playground mod feedback.dot` works
    true, // is_dev_signer — keep the sudo signer off the leaderboard
  );
  if (!result.ok) throw new Error("Registry publish transaction failed (reverted?)");
  console.log(`Tx: ${result.txHash}`);
  console.log(`\n✓ Published ${DOMAIN} to the playground Apps grid (tag: ${TAG}, moddable).`);
} finally {
  chainClient.destroy();
  process.exit(0);
}
