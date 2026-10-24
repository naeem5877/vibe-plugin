# Contributing to Vibe Plugin

First off, thanks for taking the time to contribute! ❤️

All types of contributions are encouraged and valued. Please read the relevant section below before contributing — it makes things easier for maintainers and smoother for everyone involved.

## Code of Conduct

This project and everyone participating in it is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold it.

## How Can I Contribute?

### Reporting Bugs

- **Check the existing [Issues](https://github.com/naeem5877/vibe-plugin/issues)** first to see whether it was already reported.
- If not, open a new one with a **clear title and description**, your **Premiere Pro version**, **OS**, the panel version, and a **public link** that reproduces the problem.
- If something failed while downloading, include the message shown on the download card.

### Suggesting Enhancements

- Open an issue with the `enhancement` label.
- Explain why it would be useful to most Vibe Plugin users.

### Pull Requests

- Fork the repo and create your branch from `main`.
- Keep the change focused — one fix or feature per pull request.
- If you touch the fast path or the track parsers, run `node test-innertube.js` and mention the result.
- Test inside Premiere Pro (see below) and say what you tried.
- Update the README and `CHANGELOG.md` when behaviour changes.

## Development Setup

There is no build step. Clone the repo, run `install-dev.bat` (Windows) or `./install-dev.sh` (macOS), restart Premiere, and open **Window → Extensions → Vibe Plugin**. After editing, close and reopen the panel to reload it. To debug, open `http://localhost:8088` in Chrome while the panel is open.

## Code Guidelines

- **Match the existing style** — small IIFE modules that attach to `window`, 4-space indentation, single quotes.
- **Stay compatible with older CEP Chromium builds.** Use `const`, arrow functions and `async`/`await`; avoid optional chaining (`?.`), nullish coalescing (`??`), `Promise.prototype.finally` and `AbortController`.
- **The fast path must never throw and must never be slower than `yt-dlp`.** Anything it isn't sure about returns `null` so `yt-dlp` answers. Downloads always go through `yt-dlp`.
- **Keep the panel light.** Don't add heavy dependencies, background timers or network calls beyond what's already documented in the README's Privacy section.
- ExtendScript (`jsx/host.jsx`) is **ES3** — no `let`, arrow functions or `JSON`.

## License & IP

By contributing, you agree that your contributions will be licensed under the project's **GNU GPLv3 License**.

**Note:** While the code is open source, the Vibe Plugin / VibeDownloader brand (name, logo, icons in `brand/`) remains the exclusive property of the maintainer. See [TRADEMARK.md](TRADEMARK.md).
