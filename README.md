# Pomelo

Pomelo is a work-in-progress agent harness. The project began as an independent AI-native Chromium browser. No compiled browser release is available yet.

## Built on Friday

Pomelo is a fork of Friday, the MIT-licensed agent harness by Arun Dass and contributors. Pomelo's hooks into Friday are listed in [PATCHES.md](PATCHES.md). [Upstream Friday](https://github.com/splashxmoon/friday)

## What works today

- The local chat app can run installed coding tools such as Claude Code, Codex, and OpenCode.
- Pomelo's agent tools can open threads, start sub-agents, and tag threads by project.

## What's still in progress

The source includes helpers for browser jobs, masking, and Chrome import. End-to-end support for Chrome import, 1Password fills, and cloud browser jobs is UNKNOWN.

## Run from source

From a Pomelo checkout with Node.js 22 or newer, install the locked dependencies and start the app.

```sh
npm ci
npm start
```

Open the local URL printed in the terminal. The default is `http://127.0.0.1:4321`. To run an agent, install and sign in to its CLI first.

## License

[MIT](LICENSE)
