# Architecture

## Current application

Touchline is a Next.js 16.4 / React 19.3 / Tailwind 4 PWA. Gameplay runs locally; there is no implemented Supabase backend, authentication or online match service. Framework routes are thin wrappers around client screens. `next.config.ts` enables Cache Components and Partial Prefetching, so visited pages can be kept alive through React Activity. Effects must clean up and resume correctly when pages become inactive.

```text
app/ routes → components/screens + CareerShell
                         ↕
              lib/store/save-store.ts
              useSyncExternalStore + localStorage
                         ↕
                 game/ pure TypeScript
          career / development / club / transfers
                         ↕
            game/engine + setup / roles / prep
                         ↕
          components/match/MatchViewer.tsx
       simulation accumulator → interpolated canvas

lib/sim/sim.worker.ts        background rounds and season rollover
lib/sim/highlights.worker.ts deterministic look-ahead for highlights
public/sw.js                shell/asset caching
```

`game/` has no React or browser dependencies. Seeded `Rng` state drives match and career randomness. Given the same setup, seed and command sequence on the same engine implementation, simulation results are reproducible. The rendering frame rate does not change the simulation rules.

## Source map

| Location | Responsibility |
|---|---|
| `app/(career)/` | Career routes under the shared shell; club, squad, player, tactics, training, prep, fixtures, reports, competitions, transfers, scouting, staff, finances, manager, jobs, dynamics, analytics, media and settings. |
| `components/screens/` | Screen composition and manager interactions. |
| `components/match/` | Mutable match viewer, canvas projection, commentary/stat/ratings/tactics panels and playback pacing. |
| `components/Slider.tsx` | Accessible range, filled track, current value, keyboard input and step buttons. |
| `components/TrainingProgress.tsx` | Current-ability progress toward the next OVR boundary. |
| `lib/store/save-store.ts` | Five-slot persistence, migration, export/import and React subscription. |
| `lib/sim/` | Worker requests for expensive career work and highlight look-ahead, with main-thread fallbacks. |
| `game/save.ts`, `game/migrate.ts` | Save schema v9 and sequential migrations plus idempotent repairs. |
| `game/engine/` | Engine v2 state, seeded per-second simulation, commands, emotions, stats and ratings. |
| `game/generate.ts`, `rng.ts`, `constants.ts`, `ratings.ts` | Fictional world, seeded generation, 37 attributes, formations and rating calculations. |
| `game/career.ts`, `competition.ts`, `cup.ts`, `calendar.ts` | Calendar advancement, competitions, match completion and season rollover. |
| `game/development.ts`, `training.ts`, `progress.ts`, `familiarity.ts` | Weekly growth/decline, recovery, mentoring, retraining, development reports and tactical learning. |
| `game/setup.ts`, `prep.ts`, `roles.ts`, `managers.ts` | Frozen match setups, opposition reports, roles and AI management. |
| `game/club.ts`, `staff.ts`, `economy.ts`, `board.ts`, `transfers.ts`, `scouting.ts`, `youth.ts` | Club operations, recorded staff appointments, economy, deals, knowledge and academy. |
| `game/analysis.ts`, `analytics.ts`, `dynamics.ts`, `media.ts`, `news.ts` | Match reports, season analysis, squad relationships and narrative. |

## Career and persistence flow

New careers generate two divisions with 12 clubs each, players, staff, AI managers and a calendar containing pre-season, league, cup and international-break weeks. Manager actions mutate cloned saves through store helpers. Advancing a week resolves fixtures, applies weekly systems and persists the updated save. Expensive round completion and season rollover use a worker when available.

`touchline.slots.v1` stores the slot index and active id; `touchline.save.<id>` stores each JSON `SaveGame`. The legacy `touchline.career.v1` key is migrated on load. Storage failures keep the in-memory career playable and expose an error; export is the recovery path. IndexedDB and cloud sync are not implemented.

The authoritative schema is `game/save.ts`. In addition to clubs and players it holds `leagues[]`, cup/Super Cup, `calendar` and `calendarIndex`, training, board and manager, scouting knowledge, transfers/loans, staff market, development logs, reports, media, dynamics, pre-season and optional analytics. `game/types.ts` defines the domain entities. Staff history is an optional array of club/role/start/end appointments. Additive v9 repairs initialise existing incumbents at the load week and preserve their former rating-based fitness-coach effects by setting missing Physical/Recovery skills to the overall rating.

Career match kick-off freezes the setup and seed into `liveMatch`; commands are logged with ticks. Progress is saved periodically (300 game ticks), after commands, at half-time and when leaving/hiding the page. `replayLiveMatch` reconstructs that state from the frozen setup, seed and commands. Finished matches feed compact reports and season records.

`ENGINE_VERSION` currently identifies v2, but old engine implementations are **not** bundled or pinned for replay. Migrations that change the engine discard incompatible in-progress matches. General shareable replay links and clips remain planned.

## Match playback and identification

The engine advances one second of game time per `stepMatch`. The viewer keeps mutable state in one animation loop, with React panel refreshes about every 220 ms. A time accumulator advances fixed simulation steps independently of canvas rendering; player and ball coordinates interpolate from previous to current positions.

`components/match/playback.ts` defines four paces (Relaxed 18, Normal 12, Quick 7, Fast 3½ real minutes per 90; `tps = 5400 / seconds`, Normal by default). Near either goal, for shots, crosses, corners and penalties the viewer runs at `KEY_MOMENT_SLOWDOWN` (0.55) of the chosen pace. Seeded stoppage, pauses and goal holds add elapsed time. Rendering remains independently selectable at 30 or 60 fps.

The canvas targets 60 fps by default, with a separate 30 fps option and a once-per-second measured canvas-frame readout. The render target does not change the match clock. RAF gaps are capped at 100 ms; hidden documents do not advance, and visibility changes reset timing. Per-frame simulation budgets prevent long catch-up loops monopolising the UI. These are performance targets, not hardware-independent guarantees. Canvas pixel ratio is capped at 2 to bound rendering cost.

Highlight windows are computed in a dedicated worker from a structured-cloned match. Generation ids discard stale responses after commands. Playback waits for the current look-ahead; gaps are simulated in small, time-budgeted batches. Browsers without workers use a synchronous fallback, which can still pause the UI during look-ahead. Worker/timer cleanup handles Activity deactivation and resumption.

Pitch tokens show larger shirt numbers; optional surname labels prioritise the ball carrier and selected player when crowded. Hit testing uses the same pitch dimensions and second-half projection. A selectable roster provides a keyboard-accessible alternative to clicking the canvas. The on-ball strip and selected-player summary show identity, club, role and live stats. Tactics shows shirt numbers with OVR separately.

### Presentation motion

`components/match/motion.ts` interpolates players and the ball from the same simulation snapshots. A possessed ball uses its carrier’s rendered coordinates exactly; flights use previous/current ball coordinates. There is no separate speed-limited chase or accumulated positional lag. Drawing and hit-testing share the last painted positions. Highlight cuts and half changes reset the view; manual pause freezes motion. Simulation rules and replay outcomes are unchanged.

## Training and staff effects

Training advances with career weeks, not wall-clock time. `currentAbility` is the weighted natural-position attribute score ×10; `overall` rounds that score into 1–99. The progress bar measures the fraction between the current and next OVR rounding boundaries, capped at maximum OVR. It does not read hidden potential. Position learning retains its separate 0–100 progress and estimates remaining healthy training weeks from the same age/Decisions learning rate. `TrainingTiming` exposes the next weekly update; focus and mentoring are ongoing assignments. Only Player → Attributes displays the improvements summary. Personal-focus progress uses the mean of trainable focused attributes, and attribute-focus progress uses its single attribute value; both show fractional progress to the next whole point. Player profiles show actual fractional attribute deltas from `save.dev[playerId].start`, including changes too small to affect rounded attributes.

`game/training-session.ts` stores optional season/week-bound match-preparation sessions: focus, start timestamp and duration (60 seconds). `prepSessionProgress` derives elapsed percentage and readiness from wall-clock time without granting attributes. `activeMatchPrep` gates match setup, analyst quality and weekly preparation bonuses. Match entry waits for readiness or an explicit opt-out; existing live setups remain frozen. Plan selection restarts changed/expired sessions. Sessions survive saving/reloading; plans with no session preserve their pre-update ready status. The optional field is additive to save schema v9.

Fitness coaches have Physical and Recovery skills. Physical development uses the better of the general coach and fitness specialist. Ordinary recovery uses the specialist's Recovery skill, with the former overall rating as a compatibility fallback. The physio still controls training-injury risk and early injury returns. Staff appointment history records actual game events and does not alter development rates. See [Playing guide](./PLAYING_GUIDE.md) and [Depth plan](./DEPTH_PLAN.md) for selection and formulas.

## Offline / PWA

`app/manifest.ts` supports installation. `public/sw.js` attempts to precache a subset of shell routes, caches immutable `/_next/static/` assets first, and uses network-first responses with cached fallbacks elsewhere. Routes/assets visited successfully can work offline. Not every newer career route and its dependencies are guaranteed precached; complete cold-start offline coverage is still a roadmap item.

## Planned online architecture (Phase 2+)

The intended backend is Supabase Auth, Postgres/RLS, Realtime and authoritative workers. `game/` would move into a shared workspace package so browser and server use the same rules. Proposed entities include profiles, clubs and memberships, players, tactics, competitions and entries, fixtures/results, match commands, transfers, federations and messages. Managers should only write to their own clubs; the server should own official results.

Live matches require one server clock and a competition-defined duration. Clients would render buffered authoritative frames and submit validated commands, without local pace/pause/skip controls. Planned stoppages: three requests per half, stop at the next dead ball, resume when both managers are ready or after 45 seconds, with a 60-second half-time window. Disconnects should leave the assistant managing and reconnects should resynchronise. None of this protocol is currently deployed.

## Validation and balance

`npm run typecheck`, `npm run lint` and Vitest cover deterministic matches, attribute effects, fixtures, career progression, transfers, club operations, migrations and presentation-related rules. Engine-heavy suites should run with `npm test -- --maxWorkers=1` to reduce worker contention.

`scripts/calibrate.ts` measures match averages; `scripts/longrun.ts [seasons] [seed]` measures multi-season finances, development, age distributions and squad balance. Run these after substantive engine/economy/development changes; previous measured targets and known gaps are in [DEPTH_PLAN.md](./DEPTH_PLAN.md).
