// SPDX-License-Identifier: GPL-3.0-or-later
//
// Product manifest for `@polkadot-community-foundation/polkadot-app-deploy`
// (the Bulletin app-deploy CLI / its reusable GitHub workflow). The tool
// auto-discovers this file by name (`polkadot-app-deploy.config.{ts,js,mjs}`)
// when run from the repo root and reads the default export.
//
// `defineConfig` is vendored as an identity function rather than imported from
// the deploy CLI: the tool is a global/npx CLI, not a package.json dependency,
// so importing from it would make config resolution fragile.
const defineConfig = <T>(config: T): T => config;

declare const process: { env?: Record<string, string | undefined> };

// APP_DOTNS_DOMAIN lets CI/preview deploys override the bare label (e.g.
// `feedback` for production). Defaults to the production label.
const domain = process.env?.APP_DOTNS_DOMAIN ?? "feedback";
const label = domain.toLowerCase().replace(/\.dot$/, "");

export default defineConfig({
  domain: `${label}.dot`,
  displayName: "Feedback Board",
  description:
    "A decentralized sticky-note board on Polkadot. Pin feedback, notes, or thoughts to a shared board — notes live on Bulletin, the ordered list of them on an Asset Hub contract.",
  icon: { path: "./assets/icon.png", format: "png" },
  executables: [
    {
      kind: "app",
      path: "./dist",
      appVersion: [0, 1, 0],
    },
  ],
});
