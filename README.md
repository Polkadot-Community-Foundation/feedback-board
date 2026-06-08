> [!WARNING]
> The following is a prototype, reference implementation, and proof-of-concept. This open source code is provided for research, experimentation, and developer education only. This code has not been audited, is actively experimental, and may contain bugs, vulnerabilities, or incomplete features. Use at your own risk.

# Feedback Board

This is experimental code developed and published by Parity to explore decentralized application patterns on Polkadot. It is not a Parity product or service. It is provided as-is, with no guarantees of maintenance, support, network uptime, or fitness for any purpose. Anyone who forks or deploys this code does so at their own discretion and operates their own deployment independently.

A decentralized sticky-note board on Polkadot. Pin your feedback, notes, or thoughts to a shared board — everyone using a remix of this app sees the same notes, because they all read from the same on-chain contract.

## How it works

- A **sticky note** is stored as JSON on the Bulletin Chain and gets a content-addressed CID.
- A **smart contract** on Asset Hub keeps an ordered list of those CIDs (plus the H160 of whoever posted each note).
- To render the board, the app reads all CIDs from the contract, fetches each note's JSON from a Bulletin IPFS gateway, and pins them up as sticky notes.
- Color and tilt of each note are derived deterministically from its CID — everyone sees the same board, but it still looks playfully random.

Because every remix uses the same `@example/feedback` contract, the board is shared across all forks.

## Setup

```bash
npm install
npm run dev
```

Open the app in Polkadot Desktop.

> Deploying **your own copy** (own contract, own `.dot` name, published to the
> playground)? Follow the step-by-step [DEPLOYMENT.md](./DEPLOYMENT.md).

## Remixing

This app is designed to be remixed via the Polkadot Playground. Forks keep the same contract address in `cdm.json`, so all remixes read and write to the same board.

Ideas to fork:

- Add reactions (like/heart counts per note)
- Group notes into columns by topic
- Add a "burn" countdown that fades notes after N days
- Allow image attachments stored on Bulletin

## Contributing

Contributions are welcome through standard open-source processes — open a public issue or submit a pull request. There is no private or preferential channel for this proof-of-concept; all discussion happens in the public issue tracker.

## Security

This is a reference proof-of-concept, **not a hardened production build**. Before
deploying it for any real use case, you are responsible for:

- Reviewing the code yourself.
- Checking that dependencies are up to date and free of known vulnerabilities.
- Securing your own fork or deployment environment (keys, secrets, network configuration).
- Tracking the latest tagged release / commits for security fixes — older releases
  are not backported (exceptions might apply).

For Parity's security disclosure process and Bug Bounty program, see
[parity.io/bug-bounty](https://parity.io/bug-bounty).

## License

Licensed under the [GNU General Public License v3.0 or later](./LICENSE) (`GPL-3.0-or-later`).
