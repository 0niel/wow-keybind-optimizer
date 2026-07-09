# Architecture

Static Next.js app (App Router, `output: 'export'`) with a pure-TypeScript optimization core that runs in a Web Worker. All game data is baked at snapshot time; the deployed site makes no API calls beyond fetching its own JSON and spell icons from the Wowhead CDN.

## Layers

```
scripts/            snapshot pipeline (Node, runs offline, needs credentials)
public/data/        baked, versioned game data (committed)
src/core/           framework-free domain core (decoder, extraction, scoring, solver)
src/workers/        Web Worker wrapper around the core
src/components/     React UI
src/i18n/           UI message catalogs + locale registry
```

`src/core` never imports React or DOM APIs. It is exercised directly by vitest and by `bench/run.ts` under Node, and bundled into the worker for the browser.

## Data flow

1. `scripts/snapshot-data.ts` downloads DB2 CSVs from wago.tools (pinned to a build from `wago.tools/api/builds/latest`), samples Warcraftlogs v1 for casts-per-minute, parses SimulationCraft APL profiles for priority ranks and adjacency pairs, and fetches localized names/descriptions/icons from Wowhead tooltips.
2. The pipeline emits `public/data/retail/{build}/`: `manifest.json`, `classes.json`, `races.json`, `spell-meta.json` (categorized ability metadata), `specs/{specId}.json` (trait nodes, baseline spellbook, PvP talents, frequency, synergy pairs), and `text/{locale}.json` shards. The baseline spellbook merges class `SkillLineAbility` rows restricted to auto-learn acquire methods (2/4 — anything else is trainer/quest/removed-content residue such as old covenant or artifact spells) with per-spec `SpecializationSpells` actives; specialization overrides evict the overridden class spell, tree/spec spell names evict same-named class rows, and `data/curated/denylist.json` filters the rest.
3. The client decodes the user's talent export string (`src/core/decoder`), extracts the ability pool (`src/core/extract`), builds a quadratic assignment problem (`src/core/problem`), and solves it (`src/core/solver`) inside the worker.
4. Export: `src/lib/exports.ts` turns solved assignments into a plain bind list, macro list, and a generated Lua addon. `src/lib/placement.ts` maps `(modifier, physical key)` pairs to logical action-bar slots so the bars mirror the keyboard: the main bar is the number row (digits keep their columns, gaps preserved), the shift layer stacks right above it (shift digits share their base columns, shift letters align with their base letter's column on the letters bar when free), the next bar holds base-layer letter/mouse keys in keyboard order, and ctrl/alt overflow packs onto the remaining bars (side bars first, extra hidden bars last) — never into main-bar gaps. The addon ships every solver variant as a selectable profile with a content hash; in game it verifies the current bars/bindings against the applied hash (drift includes stray copies of profile spells or orphaned KO macros on unclaimed managed slots) and re-applies only on drift (idempotent login apply), places spells with identity verification (`C_Spell.PickupSpell` → cursor spellID check → `GetActionInfo` match), reconciles managed bars after placing (every unclaimed non-protected slot is cleared, so leftovers from previous layouts, manual drags, or Blizzard auto-push cannot duplicate abilities), hides the `KO%02d` macro name text on owned buttons, and exposes an in-game layout browser (icon grid per bar, per-character profile selection) plus a settings panel.

## Arena data model

In arena mode the pool gains pseudo-abilities beyond spells: `target:arena1..3` (bound to `TARGETARENA*` commands) and, under the focus scheme, `focus:set` (a `/focus` macro). Cast variants (`[@focus]` / `[@arena1..3]` macros) are capped to interrupts plus the top hard-CC to respect macro limits and key budgets. PvP-talent spells de-duplicate same-named baseline/talent spells by localized name (`spellNames` passed into the worker). Guide-derived rules: base interrupts are hard-constrained to unmodified keys; focus variants get a strong same-key synergy (`VARIANT_SYNERGY`) so they land on another layer of the base key; trinkets attract major defensives; defensives and burst cooldowns cluster.

## Extension points

### Game version

`src/core/adapters` is reserved for `GameVersionAdapter` implementations. Retail is currently wired directly through the worker; Classic (MoP progression, namespace `static-classic-*`, wago product `wow_classic`) and Wrath 3.3.5 land as adapters that own:

- talent input parsing (manual picker instead of export strings),
- ability extraction rules,
- a snapshot source module under `scripts/`.

Wrath 3.3.5 stays a stub: no live Blizzard namespace or wago branch carries 3.3.5 data anymore. The candidate source is wowsims/wotlk APL protos plus emulator DBC dumps; licensing and data quality need review before wiring it.

### Scoring factors

Ability importance lives in `src/core/scoring/importance.ts` (noisy-OR over frequency/reactivity/panic, mode-weighted by `mode-weights.ts`). Slot quality lives in `src/core/scoring/slots.ts` (ergonomic tier + Fitts + modifier factor + movement penalty). A new factor (latency model, hand-size model) is a new module feeding either the ability features or the slot accessibility — existing modules stay untouched.

### Solver strategies

`src/core/solver/index.ts` dispatches by `strategyId`: `greedy` (benchmark baseline) and `qap-annealing` (Hungarian seed on the linear relaxation, then seeded simulated annealing over the quadratic objective). A future exact solver plugs in as a third strategy. Determinism contract: fixed move budget, `mulberry32(seed)`, no wall-clock decisions.

### Hardware

Keyboard geometries (`src/core/hardware/keyboards.ts`), movement schemes with ergonomic tier tables (`movement-schemes.ts`), and mouse models (`mice.ts`) are declarative data. A new keyboard or mouse is a new entry, not new logic.

### Locales

UI: drop `src/i18n/messages/{locale}.json` and register the locale in `src/i18n/locales.ts`. Game data: add the locale to the snapshot pipeline's `LOCALES` list; wago CSV exports accept `?locale=` and Wowhead tooltips accept a numeric locale id.

### Modes

Game modes are columns in the mode-weight matrix (`src/core/scoring/mode-weights.ts`) plus an entry in the UI mode picker.

## Curated data

`data/curated/ability-traits.json` keys ability categories, reactivity, and panic by normalized English spell name — readable, reviewable domain knowledge that survives spell-id churn between patches. `data/curated/denylist.json` removes hidden procs and non-combat spells that leak through DB2 filters. Both are applied at snapshot time.

## Quality gates

- Decoder golden tests against live 12.0.7 export strings from five classes.
- Solver property tests: hard-constraint satisfaction, determinism, locked binds, QAP ≥ greedy.
- `bench/run.ts`: QAP vs greedy across every spec × 2 modes, must win or match everywhere and stay under 1 s per solve; CI fails otherwise.
- Pro-layout sanity: an expert-style Enhancement layout is scored with the same objective; the optimizer must match or beat it.
- i18n completeness: message key parity across locales.
