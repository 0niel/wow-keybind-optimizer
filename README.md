# WoW Keybind Optimizer

Computes a provably good keybind layout for World of Warcraft from your talent build, race, game mode, and hardware — as a quadratic assignment problem, not a hand-wavy template — and renders it as an interactive keyboard with per-bind explanations.

- Paste the in-game talent export string; class, spec, and hero tree are decoded locally (bit-exact port of Blizzard's serializer, validated against live 12.0.7 strings).
- Ability importance blends real casts-per-minute from Warcraftlogs, SimulationCraft APL priorities, and cooldown heuristics, weighted by game mode (Raid / Mythic+ / Arena / RBG / Battlegrounds).
- Key accessibility models community ergonomic tiers, Fitts's-law travel from your movement keys, modifier costs, and your actual keyboard/mouse.
- Interrupts demand top-tier keys, panic buttons refuse modifiers, focus and arena1/2/3 macro variants enter the assignment as first-class entities.
- Solver: Hungarian seed + seeded simulated annealing over synergy and cluster terms, deterministic, under 100 ms per spec in a Web Worker; benchmarked against a greedy baseline across all 40 specs on every CI run.
- Exports: bind list, ready-to-paste macros, and a generated Lua addon that applies everything in game. Layouts are shareable by URL.
- English and Russian UI with localized spell names and descriptions.

## Development

```bash
pnpm install
pnpm dev
pnpm test
pnpm bench
pnpm snapshot -- --build 12.0.7.68367
```

The snapshot pipeline needs `WCL_V1_KEY` in `.env.local` for casts data (optional — it degrades to APL priorities without it). Game data comes from wago.tools DB2 exports, SimulationCraft profiles, and Wowhead tooltips; the deployed site is fully static.

See [DESIGN.md](DESIGN.md) for the model and [ARCHITECTURE.md](ARCHITECTURE.md) for extension points.
