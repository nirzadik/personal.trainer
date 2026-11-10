# Personal Trainer app

A private claude.ai Artifact for one owner: a chat coach, workout history and a weekly plan. It covers gym, running and HIIT. Claude is called through the `sample` capability on the owner's Claude plan; data lives in the artifact's `db`.

- **Live app:** https://claude.ai/artifact/KqESMFqUQDTYnM7axLPMqd (private to the owner)
- **Contract / architecture:** [CONTRACT.md](CONTRACT.md), [CONTRACT-v2.md](CONTRACT-v2.md) (addendum)
- **Reviews:** [docs/reviews/](docs/reviews/) (latest: [2026-11 architecture review](docs/reviews/2026-11-architecture-review.md))
- **Platform contracts:** [docs/runtime-types/](docs/runtime-types/) (`sample`, `db`, `user`, `downloads`; authoritative)

## Develop
```bash
cd app
npm install          # esbuild (dev only)
npm test             # node --test: core, catalog, store, brain, progress, swap, plan generation, review regressions
npm run dev          # http://localhost:8080/index.html  (mock mode; add ?seed for sample data)
npm run build        # → dist/personal-trainer.html (the page that gets published)
```
On localhost (or a `file:` URL, or with `?mock`) there is no `window.claude`, so the app runs on in-memory mocks (`store-mock.js`, `sample-mock.js`). On any other host without `window.claude` it starts with nothing available and says so, so a re-hosted copy can never collect workouts into browser-only storage.

## Module map
```
src/core.js, catalog.js      pure training logic and the exercise catalog (no I/O)
src/progress.js, swap.js     pure: progression digest for planning, exercise swaps
src/store.js                 all persistence, under data/users/<uid>/ (undo on every write)
src/brain.js, prompts/*      every Claude call (chat, plan, review, comment, summary) and the 10 chat tools
src/knowledge/*              coaching rules as prompt text
src/ui/*, main.js            the three tabs; reads through store subscriptions
src/env.js, *-mock.js        runtime detection and dev mocks
```
Dependencies point one way: ui → brain → prompts / progress / core → catalog; store depends on nothing.

## Publish
Publish `dist/personal-trainer.html` to the same artifact URL with capabilities
`{ sample: {}, db: { rules: [{ path: "", read: "owner", write: "owner" }] }, user: {}, downloads: true }`.
Data in `db` survives republishes.
