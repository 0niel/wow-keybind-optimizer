# WoW Keybind Optimizer — Design Document

Status: draft for review, no application code written yet.
Date: 2026-07-04. All game-state facts below were verified against live sources on this date.

## 1. Verified game state (July 2026)

| Fact | Value | Source |
|---|---|---|
| Live retail expansion | Midnight (Worldsoul Saga ch. 2), launched 2026-03-02 | warcraft.wiki.gg/Midnight |
| Live retail patch / build | 12.0.7, build `12.0.7.68367` (12.1 on PTR, not live) | wago.tools `/api/builds/latest` |
| Level cap | 90 | wowhead.com Midnight overview |
| Talent system | Class tree + spec tree + hero tree, unchanged model; **new: Apex Talents** (spec-tree capstone section, 4 points, unlocks L81); hero trees gained a column; class-tree gate now 23 points | news.blizzard.com |
| Loadout export string | Still exists, `LOADOUT_SERIALIZATION_VERSION = 2` (since 10.1.0, unchanged through TWW; 12.x bump unverified — decoder validates the version byte instead of assuming) | Gethe/wow-ui-source, simc |
| Classes / specs | 13 classes, **39 specs** — new: Devourer (Demon Hunter), intellect-based ~25yd ranged caster | news.blizzard.com |
| PvP talents | 3 slots per spec (unlock 20/30/40) | warcraft.wiki.gg |
| New race | Haranir; combat-relevant active racial: Thorn Bloom (3 min CD, AoE nature DoT + ally HoT) | icy-veins.com |
| Classic progression | MoP Classic, build `5.5.4.68317`, namespace `static-classic-{region}` | wago.tools |
| Classic Era | `1.15.8.67156`, namespace `static-classic1x-{region}` | wago.tools |
| Wrath 3.3.5 | No live Blizzard/wago branch (Wrath Classic ended). Adapter stays stubbed; viable future data source: wowsims/wotlk APL protos + emulator DBC dumps | github.com/wowsims |

Implication: the "wrath-3.3.5" adapter ships as a documented stub. The realistic second target is Classic (MoP progression / Era) where Blizzard static namespaces and wago branches exist today.

## 2. Product overview

A fully static Next.js site. The user provides: talent import string (retail) or manual talent picks (classic), PvP talents, race, game mode, hardware config, and constraints. A Web Worker runs a QAP solver over a baked data snapshot and returns an assignment with per-bind explanations. No runtime API calls; all game data is baked at snapshot time into versioned JSON under `public/data/`.

Pipeline:

```
talent string ──► decoder ──► TalentSelection
                                   │
snapshot data ──► ability extraction (Stage 1) ──► AbilityPool
                                   │
mode + race + pvp picks ──► ability scoring (Stage 2) ──► ScoredAbility[]
hardware config ──► keyboard model + key scoring (Stage 3) ──► ScoredSlot[]
                                   │
constraints ──► assignment QAP (Stage 4, Web Worker) ──► Layout
                                   │
explanation (Stage 5) ──► UI: keyboard viz, heatmaps, score panel, exports
```

## 3. Repository layout

```
/
├─ DESIGN.md, ARCHITECTURE.md, README.md
├─ next.config.ts, tsconfig.json (strict), eslint, vitest.config.ts
├─ .github/workflows/ci.yml         typecheck → lint → test → build → deploy Pages
├─ scripts/
│  ├─ snapshot-data.ts              orchestrator, per-adapter snapshot
│  ├─ sources/                      blizzard-api.ts, wago-db2.ts, wcl.ts, simc-apl.ts, murlok.ts
│  └─ fixtures/                     committed golden inputs for offline dev
├─ public/data/
│  ├─ retail/{build}/               manifest, specs/{specId}.json, spells.{locale}.json, racials.json
│  ├─ classic/{build}/              same shape, stub until sourced
│  └─ hardware/                     keyboards.json, mice.json, movement-schemes.json
├─ src/
│  ├─ core/                         framework-free pure TS, no DOM imports
│  │  ├─ model/                     types: Ability, Slot, Layout, constraints
│  │  ├─ decoder/                   loadout string bit-stream decoder
│  │  ├─ adapters/                  GameVersionAdapter: retail/, classic/, wrath335/ (stub)
│  │  ├─ scoring/                   modules/ frequency.ts, reactivity.ts, fitts.ts, ...
│  │  ├─ solver/                    strategies/ greedy.ts, hungarian.ts, annealing.ts
│  │  └─ explain/
│  ├─ workers/solver.worker.ts
│  ├─ app/[locale]/                 next-intl segments, generateStaticParams
│  ├─ components/                   keyboard viz, talent tree, score panel, pickers
│  ├─ i18n/messages/{en,ru}.json
│  └─ state/                        URL-serializable input state
└─ tests/ + bench/
```

`src/core` compiles standalone (used by the worker, by Node-based tests and by the bench CLI). React never imports solver internals directly, only worker messages.

## 4. Data layer

### 4.1 Sources per concern

| Concern | Primary source | Fallback |
|---|---|---|
| Talent tree topology (nodes, entries, ranks, choice indices, subtrees) | wago.tools DB2 CSV pinned to build: `TraitNode`, `TraitNodeEntry`, `TraitNodeXTraitNodeEntry`, `TraitDefinition`, `TraitSubTree`, `TraitCond`, `TraitNodeGroupXTraitNode` | Blizzard `/data/wow/talent-tree/{id}/playable-specialization/{specId}` for cross-check |
| Baseline spec spellbook | DB2 `SpecializationSpells` + `SkillLineAbility` (class-wide) | curated overrides file |
| Spell metadata (cooldown, GCD, range, passive flag, replacement) | DB2 `SpellCooldowns`, `SpellCategories`, `SpellMisc` (attr `SPELL_ATTR0_PASSIVE`), `TraitDefinition.OverridesSpellID` | Blizzard `/data/wow/spell/{id}` |
| Localized names/descriptions | Blizzard API, locale omitted → multi-locale object per region cluster; EU host for ru_RU/de_DE/fr_FR, US host for en_US/es_MX/pt_BR; merged at snapshot time | — |
| Icons | Blizzard `/data/wow/media/spell/{id}` | wago `ManifestInterfaceData` |
| PvP talents | Blizzard `/data/wow/pvp-talent/*` + `playable-class/{id}/pvp-talent-slots` | DB2 |
| Racials (actives only) | DB2 `SkillLineAbility` filtered by `ChrRaces` skill lines, passives dropped via spell attributes; curated category map (defensive / cc-break / burst / mobility) | — |
| Cast frequency (CPM) | Warcraftlogs v2: `worldData.encounter.characterRankings` → top-N report codes → `reportData.report.table(dataType: Casts)` aggregated per spec | SimC APL priority rank → cooldown heuristic |
| Rotation adjacency (synergy pairs) | SimC APL text (`profiles/M1_*.simc` on `midnight` branch; `TWW3_*` fallback), parsed action lists | curated combo list |
| Default PvP talents | Blizzard PvP leaderboard top characters → character specializations aggregation | Murlok.io scrape as cross-check only |

Key API facts baked into the snapshot script design: Blizzard OAuth client-credentials at `https://oauth.battle.net/token`, ~24h token, 100 rps / 36k rph limit; WCL client-credentials at `warcraftlogs.com/oauth/token`, 3600 points/hour budget, points monitored via `rateLimitData`; wago CSV endpoint `https://wago.tools/db2/{Table}/csv?build={build}` with the build taken from `https://wago.tools/api/builds/latest`.

### 4.2 Snapshot output schema

```ts
type LocaleText = Record<Locale, string>

interface SpellMeta {
  id: number
  icon: string
  cooldownMs: number
  gcd: 'normal' | 'off' | 'special'
  rangeYd: number
  targeting: 'self' | 'enemy' | 'ally' | 'ground' | 'none'
  passive: boolean
  replaces?: number
  charges?: number
}

interface SpecSnapshot {
  specId: number
  classId: number
  role: 'dps' | 'healer' | 'tank'
  traitTreeId: number
  nodes: TraitNodeRecord[]
  baselineSpellIds: number[]
  pvpTalents: PvpTalentRecord[]
  defaultPvpTalentIds: number[]
  frequency: Record<number, { cpm: number | null, aplRank: number | null }>
  synergyPairs: Array<[number, number, number]>
}

interface TraitNodeRecord {
  id: number
  posX: number
  posY: number
  type: 'single' | 'choice' | 'subtree-selection'
  maxRanks: number
  subTreeId: number | null
  entries: Array<{ entryId: number, definitionId: number, spellId: number, overridesSpellId: number | null, index: number }>
}
```

Localized strings live in per-locale shards `spells.{locale}.json: Record<spellId, { name, desc }>` so a client downloads only its active locale. The multi-locale merge happens at snapshot time (two region-cluster passes: US for en_US, EU for ru_RU et al.; structure accepts any Blizzard locale).

Snapshots are committed to the repo. CI builds never need secrets; refresh runs locally or via a manual workflow with repo secrets `BLIZZARD_CLIENT_ID/SECRET`, `WCL_CLIENT_ID/SECRET`.

### 4.3 Snapshot script

`scripts/snapshot-data.ts --version retail --locale-clusters us,eu` steps:

1. Resolve live build from wago `/api/builds/latest`, create `public/data/retail/{build}/`.
2. Download and parse the DB2 CSV set; join Trait* tables into per-spec `TraitNodeRecord[]` (all nodes of the spec's tree, ascending node id — the decoder's required order).
3. Build baseline spellbooks from `SpecializationSpells` + `SkillLineAbility`, resolve replacement chains, drop passives.
4. Fetch localized name/desc/icon for the union of referenced spell ids from Blizzard (both region clusters), write per-locale shards.
5. Fetch PvP talents per spec; aggregate default picks from PvP leaderboard sample.
6. Parse SimC APLs → per-spec priority ranks and adjacency pairs.
7. Sample WCL top logs per spec (budgeted, resumable, cached to `scripts/.cache/`) → CPM table.
8. Emit `manifest.json` (build, dates, source hashes, locale list) and validate the whole snapshot with zod schemas.

Every step is independently cacheable and resumable; a failed WCL budget degrades to APL ranks, never blocks the snapshot.

## 5. GameVersionAdapter

```ts
interface GameVersionAdapter {
  id: 'retail' | 'classic' | 'classic-era' | 'wrath335'
  capabilities: {
    talentImportString: boolean
    heroTalents: boolean
    pvpTalents: boolean
    manualTalentPicker: boolean
  }
  loadData(loader: SnapshotLoader): Promise<VersionData>
  listSpecs(data: VersionData): SpecDescriptor[]
  parseTalentInput(input: TalentInput, data: VersionData): TalentSelection
  extractAbilityPool(sel: TalentSelection, ctx: ExtractionContext, data: VersionData): AbilityPool
}
```

- `retail`: import-string decoder, full pipeline. Ships first.
- `classic` (MoP progression): manual talent picker, legacy `Talent`/`TalentTab` DB2, no hero trees; snapshot stubbed until data lands.
- `wrath335`: stub with a documented feasibility note (no live data branch; wowsims/wotlk protos + emulator DBC dumps are the candidate sources, licensing to be reviewed).

Adding a version = new folder under `src/core/adapters/` + a snapshot source module; core scoring/solver/UI untouched.

## 6. Talent string decoder (retail)

Verified against two independent primary implementations that agree bit-for-bit: Blizzard's `Blizzard_ClassTalentImportExport.lua` + `ExportUtil.lua`, and SimC's `parse_traits_hash()` in `engine/player/player.cpp`.

Format:

- Standard base64 alphabet `A–Za–z0–9+/`, 6 bits per char, no padding, **LSB-first bit stream** (bit 0 of each char value is the earliest stream bit; multi-bit values assemble LSB-first). This is why RFC 4648 decoders fail on these strings.
- Header: `version` (8 bits, expect 2 — validated, not assumed), `specId` (16 bits), tree hash (128 bits, ignored on decode; zeroed on encode).
- Per node, in ascending `TraitNode.ID` order over all nodes of the spec's tree (class + spec + hero subtree nodes together):

```
isNodeSelected   : 1
  isNodePurchased  : 1        (selected && !purchased = granted, rank from grants)
    isPartiallyRanked : 1
      ranksPurchased  : 6     (only when partially ranked, else maxRanks)
    isChoiceNode      : 1     (type == choice || subtree-selection)
      choiceIndex     : 2     (0-based entry index)
```

- Hero-tree selection is an ordinary `subtree-selection` choice node; the chosen entry's `TraitSubTreeID` names the hero tree. No dedicated subtree bit block in the current format.
- Structural validation: total consumed bits must land within the final char's zero padding; the version byte and specId must match known data; on mismatch the decoder reports a precise error (unknown spec, wrong build, truncated string).

Implementation: pure `BitReader` + `decodeLoadout(string, treeIndex): TalentSelection`. Unit tests: ≥5 golden strings across different classes (collected from the live game / Wowhead calculator and committed as fixtures with expected node lists), plus property tests (round-trip with our own encoder, truncation, garbage chars, wrong version byte, all-zero hash acceptance).

## 7. Stage 1 — ability extraction

1. Start from `baselineSpellIds` of the spec.
2. Apply `TalentSelection`: for each purchased/granted node entry add `TraitDefinition.SpellID`; apply `OverridesSpellID` replacement chains (last writer wins along the chain).
3. Add the 3 chosen PvP talents (Arena/RBG/BG modes only).
4. Add active racials for the chosen race with curated categories; passives are already filtered at snapshot time.
5. Add synthetic entities: trinket slots (1 defensive by default; Human PvP default allows a DPS on-use), potion/healthstone optional.
6. Drop passives, auras, and non-bindable procs via spell flags + curated denylist.
7. Macro variant expansion (Arena modes): for abilities flagged `interrupt` or `instant-cc`, spawn `@focus` variants and, when the arena123 school is enabled, `@arena1/2/3` triplets. Variants are first-class assignment entities carrying a link to their base ability and a variant kind.

Output: `AbilityPool = Ability[]` where

```ts
interface Ability {
  key: string
  spellId: number
  category: AbilityCategory
  variant: { kind: 'base' } | { kind: 'focus', of: string } | { kind: 'arena', of: string, index: 1 | 2 | 3 }
  features: { frequency: number, reactivity: number, panic: number, offGcd: boolean, targeting: Targeting }
}
```

## 8. Stage 2 — ability scoring

Categories: `rotational-core`, `rotational-proc`, `cooldown-burst`, `defensive-major`, `defensive-minor`, `external`, `heal-utility`, `interrupt`, `cc-hard`, `cc-soft`, `dispel`, `mobility`, `utility`, `trinket`. Racials map into these (Stoneform → defensive-minor/cc-break, Berserking/Blood Fury → cooldown-burst, War Stomp → cc-hard, Will of the Forsaken → cc-break panic, Rocket Jump → mobility, Thorn Bloom → cooldown-burst).

Feature computation:

- `frequency ∈ [0,1]`: `min(1, cpm / 10)` from WCL; fallback APL rank mapped linearly to `[0.15, 0.9]`; fallback `min(1, 60 / cooldownSec)`.
- `reactivity`: interrupt/Grounding/reflect 1.0, offensive dispel 0.7, proc-reactive rotation 0.5, else 0.
- `panic`: major defensive / trinket / CC-break 1.0, minor defensive 0.6, self-heal 0.5, else 0.
- CC-break racials (WotF, Stoneform vs bleeds) get `panic = 1.0` explicitly.

Importance (noisy-OR blend so any dominant feature carries the ability, then mode-weighted):

```
base(a) = 1 − (1 − frequency) · (1 − 0.9·reactivity) · (1 − 0.75·panic)
I(a)    = M[category(a)][mode] · base(a)
```

Mode weight matrix `M` (initial values, a tunable data table):

| category | Raid | M+ | Arena | RBG | BG |
|---|---|---|---|---|---|
| rotational-core | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| rotational-proc | 0.95 | 0.95 | 0.95 | 0.95 | 0.95 |
| cooldown-burst | 0.90 | 0.90 | 1.10 | 1.00 | 0.95 |
| defensive-major | 0.70 | 0.95 | 1.30 | 1.15 | 1.05 |
| defensive-minor | 0.55 | 0.80 | 1.10 | 1.00 | 0.90 |
| external | 0.75 | 0.85 | 1.15 | 1.00 | 0.85 |
| heal-utility | 0.50 | 0.75 | 1.05 | 1.00 | 0.90 |
| interrupt | 0.80 | 1.30 | 1.50 | 1.20 | 1.00 |
| cc-hard | 0.30 | 1.10 | 1.40 | 1.20 | 1.05 |
| cc-soft | 0.25 | 0.60 | 1.10 | 1.00 | 0.95 |
| dispel | 0.40 | 0.90 | 1.30 | 1.10 | 0.95 |
| mobility | 0.60 | 0.80 | 1.20 | 1.30 | 1.20 |
| utility | 0.35 | 0.55 | 0.80 | 0.85 | 0.75 |
| trinket | 0.50 | 0.70 | 1.35 | 1.15 | 1.05 |

Macro variants inherit the base ability's features with `I(variant) = 0.8 · I(base)` for focus and `0.65 · I(base)` per arena member, and carry pairing preferences (section 10).

## 9. Stage 3 — keyboard model and key scoring

### 9.1 Geometry as data

`public/data/hardware/keyboards.json`: per form factor (full/TKL/60%) × physical layout (ANSI/ISO), each key as `{ id, x, y, w, h, row, finger, hand }` in key-unit coordinates. `mice.json`: `none`, `2-button` (M4/M5), `mmo-12` (4×3 grid with per-button thumb-reach scores). `movement-schemes.json`: per scheme (WASD, ESDF, custom) the anchor position of each finger and the set of movement keys (unbindable).

### 9.2 Slot enumeration

Slots = bindable keys × modifier layers `none | shift | ctrl | alt` (chord layers like shift+ctrl excluded v1, extension point). Mouse buttons get the same modifier layers. Banned keys and movement keys are excluded; locked binds pre-occupy their slot.

### 9.3 Slot accessibility

```
K(k)      = 0.65 · tier(k) + 0.35 · (1 − fittsNorm(k))
A(k, m)   = K(k) · modFactor(m) − movePenalty(k)
fitts(k)  = log2(1 + D(k) / W(k))
```

- `tier(k) ∈ [0,1]`: encoded community ergonomic tier table per movement scheme. WASD initial table: S = 1.0 {Q, E, R, F, C, X, V, M4, M5}; A = 0.82 {1, 2, 3, 4, T, G, Z, B, Tab, CapsLock, mouse-grid top row}; B = 0.55 {5, `, Y, H, N, F1, F2, F3, mouse-grid mid}; C = 0.30 {6, F4, F5, mouse-grid bottom}; D = 0.10 {7+, everything farther}. ESDF shifts the table one column right.
- `D(k)`: Euclidean distance from the assigned finger's anchor (per movement scheme) to key center; `fittsNorm` is min-max normalized over bindable keys. Mouse buttons use thumb-reach scores in place of Fitts.
- `modFactor`: none 1.00, shift 0.85, ctrl 0.72, alt 0.60 — reorderable and maskable from the hardware config (e.g. "Alt unreachable").
- `movePenalty`: 0.25 for keys whose assigned finger is a movement-anchored finger forced off its anchor mid-strafe; 0 otherwise.

Scoring is a plugin chain: `frequency`, `reactivity-panic`, `mode-weights`, `ergonomic-tier`, `fitts`, `modifier`, `movement-conflict`, `switching-cost` are separate `ScoringModule`s with declared weights; a latency or hand-size model is a new module, not an edit.

```ts
interface ScoringModule {
  id: string
  abilityFeatures?(a: Ability, ctx: Ctx): Partial<AbilityFeatures>
  slotScore?(s: Slot, ctx: Ctx): number
  pairSynergy?(a: Ability, b: Ability, ctx: Ctx): number
}
```

## 10. Stage 4 — assignment (QAP)

### 10.1 Objective

Over assignments `σ: Ability → Slot` (injective):

```
F(σ) = Σₐ I(a) · A(σ(a))
     − δ · Σₐ moved(a)
     + λq · Σ_{a<b} S(a,b) · P(σ(a), σ(b))
     + λt · Σ_triplets arenaClusterBonus(σ)
```

with `δ = 0.15` (switching cost per ability moved off a preserved existing bind, applied only in "preserve my binds" mode), `λq = 0.25`, `λt = 0.20`.

Synergy `S(a,b) ∈ [0,1]`:
- APL adjacency: normalized co-occurrence of the pair in adjacent APL lines / observed cast sequences, capped 0.6.
- Semantic group (CC set, totem set, heal set, movement set): 0.4.
- Base ↔ focus variant of the same spell: 1.0.

Proximity `P(s₁,s₂)`:
- Same physical key, different modifier: 1.0.
- Adjacent keys (center distance ≤ 1.1u), same modifier: 0.6.
- Adjacent keys, different modifier: 0.3.
- Else 0.

`arenaClusterBonus`: for each `@arena1/2/3` triplet, +1.0 if the three slots are colinear consecutive keys on one row (or one mouse-grid column) in index order, +0.5 if a permuted or gapped cluster, 0 otherwise.

### 10.2 Hard constraints

1. `panic = 1.0` ⇒ modifier `none`.
2. `reactivity ≥ 0.9` ⇒ slot with `A ≥ 0.75` (S-tier); if the S pool is exhausted, relax threshold by 0.05 steps and record a warning into the explanation.
3. `frequency ≥ 0.5` ⇒ slots with `tier ≥ 0.55` only (bans 5/6/7 and worse).
4. Locked binds are fixed; banned keys/slots removed; movement keys unbindable.
5. Injectivity: one ability per slot.

### 10.3 Solver strategies

`SolverStrategy` interface with three implementations:

```ts
interface SolverStrategy {
  id: 'greedy' | 'qap-annealing' | string
  solve(p: AssignmentProblem, opts: { seed: number, moveBudget: number }): SolveResult
}
```

- `greedy` (benchmark baseline): sort abilities by `I` desc, slots by `A` desc, zip respecting hard constraints.
- `qap-annealing` (default):

```
solve(p, seed):
  mask hard-constraint-violating (a, s) pairs to −∞
  cost[a][s] ← I(a)·A(s) − switchCost(a, s)
  σ ← hungarian(cost)                        maximization on the linear part
  best ← σ; T ← T0
  rng ← mulberry32(seed)
  for i in 1..N:
    move ← rng-pick: swap σ(a), σ(b) | relocate a to a free feasible slot
    if move violates hard constraints: continue
    Δ ← ΔF(move)                             incremental, O(synergy degree)
    if Δ ≥ 0 or rng() < exp(Δ / T): apply move
    if F(σ) > F(best): best ← σ
    T ← T0 · (Tend / T0)^(i / N)
  return best, per-ability contributions
```

Parameters: `T0 = 0.35 · mean|I·A|`, `Tend = 0.001`, `N = 150 000` (fixed — determinism forbids wall-clock cutoffs). Problem size ≈ 40–70 entities × ≈ 150–200 slots; incremental Δ keeps a full run well under 1 s in a worker on mid hardware. `bench/` measures every spec and fails CI above the budget.

Determinism: seeded mulberry32, fixed move budget, stable input ordering, no `Date.now`/`Math.random`. Same inputs + seed ⇒ byte-identical layout.

By construction annealing starts at the Hungarian optimum of the linear part, and the accepted-best tracking never returns anything below its start, so `F(qap) ≥ F(hungarian) ≥ F(greedy)` on the linear part; the benchmark suite asserts the full-objective inequality `F(qap) ≥ F(greedy)` across all 39 specs × 5 modes.

### 10.4 Stage 5 — explanation

`SolveResult` carries, per bind: `I(a)`, `A(s)`, realized synergy terms with partner names, applied constraints, and the marginal contribution `F(σ) − F(σ \ a)`. The UI renders these as human sentences via i18n templates ("reactive interrupt → S-tier key, no modifier"; "shares Q with base spell as Shift-layer focus variant"). Also emitted: objective value, greedy baseline value, per-category key-quality distribution.

## 11. UI and visualization

Screens (single-page flow, all state in the URL):

1. **Input panel**: version → class/spec (auto from string) → import string field with live decode status → PvP talent picker (defaults pre-selected from leaderboard data) → race picker → mode segmented control → hardware config (form factor, ANSI/ISO, mouse, modifiers, movement scheme) → constraints editor (lock/ban/preserve).
2. **Result view**:
   - Interactive keyboard + mouse render (SVG), modifier layer tabs base/Shift/Ctrl/Alt with animated transitions, category color coding, hover card: localized spell name, icon, localized description, bind reasoning, marginal contribution.
   - Heatmap toggles: accessibility heatmap, predicted press-frequency heatmap.
   - Talent tree view highlighting which picks produced which binds (click a bind ⇒ highlight node; click a node ⇒ highlight bind).
   - Score panel: objective vs greedy baseline, per-category distribution charts, constraint warnings.
   - Arena targeting school toggle (focus ↔ arena123) re-runs the solver.
3. **Export**: human-readable list (per layer), Lua addon zip / paste-in `SetBinding` script, and the full macro set the layout assumes (@focus, @mouseover, @arena1/2/3 for interrupts and instant CC).

Design language: flat, borderless, Yandex-Go-like — generous whitespace, large type (Inter/Golos), soft surface tints + elevation levels instead of borders, 16–24px radii, one accent color, subtle micro-interactions (150–200ms ease-out), no 1px hairlines, no decorative gradients. Dark mode via CSS custom properties from day one; fully responsive (keyboard viz scales, collapses to scrollable layers on mobile).

## 12. Internationalization

- `next-intl` with `app/[locale]/` segments and `generateStaticParams` (built-in Next i18n routing is incompatible with `output: 'export'`).
- UI messages: `src/i18n/messages/{en,ru}.json`; adding a locale = adding a message file + listing it in the locale registry.
- Game data: per-locale shards `spells.{locale}.json` baked from Blizzard multi-locale responses (ru_RU + en_US minimum, structure holds any Blizzard locale); the client fetches only the active locale's shard. Locale fallback: missing shard/entry → en_US.
- i18n completeness test: message key parity across locale files, and snapshot validation that every referenced spell id exists in every shipped locale shard.

## 13. GitHub Pages deployment

- `next.config.ts`: `output: 'export'`, `basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? ''`, `assetPrefix` same, `images: { unoptimized: true }`, `trailingSlash: true`.
- `.github/workflows/ci.yml`: on PR — typecheck, lint, vitest, bench (assert mode), build. On push to main — same, then `touch out/.nojekyll`, `actions/upload-pages-artifact`, `actions/deploy-pages` (Pages "GitHub Actions" source).
- `NEXT_PUBLIC_BASE_PATH=/<repo-name>` set in the workflow; empty locally.
- Share URLs: all inputs (version, spec, talent string, pvp picks, race, mode, hardware, constraints, seed) serialize into the query/hash; loading a URL reproduces the exact layout deterministically.

## 14. Testing and quality

- **Decoder**: ≥5 golden export strings across classes (fixtures with expected selections), round-trip encode/decode, malformed-input errors, version-byte gate, zero-hash acceptance.
- **Solver**: hard-constraint satisfaction on randomized pools (property tests), determinism (same seed ⇒ identical layout), injectivity, locked-bind respect.
- **Benchmark suite** (`bench/`): QAP vs greedy on all 39 specs × 5 modes; asserts `F(qap) ≥ F(greedy)` and per-run time < 1 s; regression-tracked.
- **Pro-layout sanity fixtures**: 2–3 published layouts encoded as assignments; if a pro layout outscores the optimizer on the same pool, CI fails with a diff of the dominating terms — a signal to fix weights, not to ignore.
- **i18n completeness**, snapshot zod validation, ESLint (incl. a no-comments rule), strict TS.

## 15. Extension points (to be expanded in ARCHITECTURE.md)

| Axis | Mechanism |
|---|---|
| Game version | `GameVersionAdapter` + snapshot source module |
| Scoring factor | new `ScoringModule` with declared weight |
| Solver | new `SolverStrategy` |
| Keyboard / mouse / movement scheme | data rows in `hardware/*.json` |
| Locale | message file + baked shard |
| Mode | column in the mode weight matrix |

## 16. Milestones

1. Decoder + golden fixtures.
2. Snapshot pipeline (retail) + committed snapshot.
3. Scoring modules + weight tables.
4. Solver strategies + tests + bench.
5. UI shell + design system + i18n skeleton.
6. Keyboard/talent visualizations + heatmaps + explanations.
7. Exports (list, Lua, macros) + share URLs.
8. CI + Pages deploy + ARCHITECTURE.md.

## 17. Open questions

1. **Repo/Pages**: what repository name should I assume for `basePath` (e.g. `wow-keybind-optimizer`)? Should I `git init` and set up the repo right away?
2. **Credentials**: do you have Blizzard API and Warcraftlogs client id/secret available for the snapshot run? Until then I develop the pipeline against committed fixtures for 2–3 specs and bake the full snapshot once keys arrive.
3. **Fixture specs**: which 3 specs should get golden decoder fixtures + pro-layout sanity fixtures first? My proposal: Enhancement Shaman (interrupt/utility-heavy), Retribution Paladin, Frost Mage (CC/casting mix).
4. **Second version target**: Wrath 3.3.5 has no live data branch (Classic progression is MoP 5.5.4 now). I propose Classic MoP as the real second adapter and keeping wrath-3.3.5 a documented stub. Confirm?
5. **Mouse wheel**: include wheel up/down (+modifiers) as bindable slots, off by default?
6. **Arena default**: which targeting school is the default toggle state — focus-based or arena123-based? My proposal: focus-based default.
