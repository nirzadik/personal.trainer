# Personal Trainer app

A private claude.ai Artifact for one owner: a chat coach, workout history and a weekly plan. It covers gym, running and HIIT. Claude is called through the `sample` capability on the owner's Claude plan; data lives in the artifact's `db`.

- **Live app:** https://claude.ai/artifact/KqESMFqUQDTYnM7axLPMqd (private to the owner)
- **Contract / architecture:** [CONTRACT.md](CONTRACT.md)

## Develop
```bash
cd app
npm install          # esbuild (dev only)
npm test             # 140 tests: core, catalog, store, brain
npm run dev          # http://localhost:8080/index.html  (mock mode; add ?seed for sample data)
npm run build        # → dist/personal-trainer.html (the page that gets published)
```
Outside claude.ai there is no `window.claude`, so the app runs on in-memory mocks (`store-mock.js`, `sample-mock.js`).

## Publish
Publish `dist/personal-trainer.html` to the same artifact URL with capabilities
`{ sample: {}, db: { rules: [{ path: "", read: "owner", write: "owner" }] }, user: {}, downloads: true }`.
Data in `db` survives republishes.
