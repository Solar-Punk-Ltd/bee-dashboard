# Jest → Vitest migration: before/after comparison

Measured against a full pre-migration snapshot restored from `HEAD` (same lockfile-cached
packages, real install) — these are actual measurements, not estimates.

| Metric | Before (Jest) | After (Vitest) | Change |
|---|---|---|---|
| Direct devDependencies | 51 | 45 | **−6** |
| Config files | `jest.config.cjs` + `.babelrc.js` (35 lines, 2 files) | `test` block in `vite.config.mts` (+8 lines) + 1-line `tsconfig.json` tweak | −2 files |
| Transform pipeline | Babel (7 presets/plugins: `@babel/core`, `preset-env`, `preset-react`, `preset-typescript`, `plugin-transform-runtime`, + full babel dep tree) | None — reuses Vite's esbuild, the same engine already compiling the app | One less toolchain |
| Test-only transitive packages (isolated subtree unique to that runner) | 248 packages, ~23.7 MB | 48 packages, ~15.1 MB | **−200 packages, −8.6 MB** |
| Whole `node_modules` | 612 MB / 1184 packages | 669 MB / 969 packages | −215 packages overall, but **+57 MB** — not from this migration (see note) |
| Test run, steady-state wall time (7 files / 74 tests) | ~1.1–1.3s | ~1.37–1.4s | Vitest **~250–300ms slower**, dominated by Vite/esbuild environment bootstrap |
| Pure test-execution time | Jest reports ~1.0s "Time" | Vitest reports ~100ms "tests" phase (of an ~870ms total) | Comparable once startup is excluded |
| Test/lint/typecheck/build results | 74/74 passing, lint clean, types clean, build succeeds | Same | No behavior change |

## Notes

- The +57 MB whole-repo size increase is **not caused by the migration** — it's from
  unrelated upstream version drift, since the "before" lockfile was ~27 days old
  (e.g. `sass` 1.97.3→1.101.0, `puppeteer` 24.37→24.43, `vite` patch bump). The isolated
  jest-vs-vitest subtree comparison (248 pkgs/23.7 MB → 48 pkgs/15.1 MB) is the number
  attributable to the refactor itself, and it's a clear reduction — mostly because
  Babel's ~90-package plugin tree (needed for its own JS/TS/JSX compilation) is now
  completely gone; esbuild does that natively with zero extra packages.
- Vitest is not faster wall-clock for this specific tiny suite (74 tests) — the fixed
  cost of spinning up a Vite-based test environment (~870ms) outweighs Jest's leaner
  startup for a suite this small. The win here is dependency/toolchain simplicity (one
  less compiler, shared with the app's own Vite build), not raw speed at this scale.
