# Roadmap & Progress Tracker

Legend: ✅ done · 🚧 in progress · ⬜ not started

## Phase 0 — Design & architecture ✅
- ✅ Discovery questions (12) and decisions (see Decision log)
- ✅ [Game Design Document](./GAME_DESIGN.md)
- ✅ [Architecture](./ARCHITECTURE.md)
- ✅ This roadmap

## Phase 1 — Offline vertical slice ✅
Goal: one manager can create a club, play a season against AI clubs offline, train players, set tactics and watch matches on a 2D pitch with commentary and stats.
- ✅ Seeded RNG + core domain types
- ✅ Fictional world generator (names, players, clubs, league)
- ✅ Ratings: overall per position, value
- ✅ Match engine v1: tick-based, deterministic, fatigue, fouls, cards, corners, xG, ratings
- ✅ Commentary generator
- ✅ Training v1: weekly focus + intensity, age curve, fitness, injuries
- ✅ League: double round robin fixtures, table, matchday advance (AI vs AI instant sim)
- ✅ Local save (versioned) in localStorage
- ✅ UI: new club, dashboard, squad, tactics (formation + sliders + lineup), training, league table
- ✅ Match viewer: 2D pitch, speed controls, commentary tab, stats tab, in-match tactic changes + subs
- ✅ Quick match vs any AI club
- ✅ PWA manifest + service worker
- ✅ Engine tests (determinism + calibration)

## Phase 1.5 — Offline polish ✅
- ✅ Local head-to-head (hot-seat): pick clubs, private team setup with a "pass the device" screen, both managers control tactics and subs, rematch with ends swapped (`/local`)
- ✅ Multiple save slots (5), export to file and import from file; the old single save migrates into a slot automatically
- ✅ Season end: aging, retirements, youth intake; 2-division pyramid (Premier / First) with 2 up / 2 down, prize money, reputation swings; choose your starting division; division tabs and promotion/relegation markers on the League screen
- ✅ AI transfer market: windows (pre-season, matchdays 11–13, summer), scouting with full profiles, bids with accept/counter/reject, AI offers for listed players, AI-to-AI deals, history (`/transfers`)
- ✅ Editor: rename any club or player, shirt numbers, kit colours, crest builder (4 shapes × 6 patterns) (`/editor`); AI clubs get random crests
- ✅ Match highlights mode: looks ahead on a copy of the deterministic match and plays only key moments, recalculating after tactical changes

## Phase 1.6 — Competitive-review improvements 🟨
Source: [COMPETITIVE_REVIEW.md](./COMPETITIVE_REVIEW.md) (vs Football Manager, Top Eleven, Hattrick, OSM).
- ✅ Quick wins: muted-text contrast fix, global Continue button, actionable inbox, 5-tab mobile nav, team talks + shouts
- ✅ Matchday depth: player roles per position, set-piece takers/routines, assistant feedback card, post-match report (xG timeline, momentum, pass network, heatmaps), live timeline + momentum, half-time and full-time team talks, shouts, in-match role changes
- ✅ Between-match loop: scouting with masked attributes and assignments, domestic cup + bracket, youth intake day, individual training / retraining / mentoring
- ✅ Club management: contracts, squad status + promises, board, staff hire/fire, academy upgrades, finances ledger, manager profile + trophy cabinet, delegation settings, job offers after a sacking
- ✅ New screens: player profile, compare, academy, cup, fixtures & results, match report, scouting, finances, staff, manager, settings, jobs
- ✅ Rebuilt: Tactics (drag and drop + tap, role picker per position, 3 saved tactics, set-piece takers and corner routines, plain-language instruction previews), Training (team plan + individual plans table), League (table / fixtures / stat leaders), Transfers (scouted ranges only, shortlist, loans tab, wage room), mobile bottom-sheet tactics in matches, onboarding ticks on Tactics, Training, Scouting and Transfers
- ⬜ Offline hardening: precache every shell route and its static assets in `public/sw.js`

## Phase D1 — Football Manager depth ✅
Full design in [DEPTH_PLAN.md](./DEPTH_PLAN.md).
- ✅ Player development: growth driven by age, personality (professionalism, determination, ambition), minutes, coaching by area, facilities, intensity and match prep; experience in the late twenties; decline by attribute class; injury setbacks; mentoring that passes on personality; breakthroughs; coach's potential estimate; weekly ability log, season-start attribute arrows, career history and a coach's development report every four weeks
- ✅ Tactical familiarity: per formation, per instruction level and per player role; learned through matches and tactical training, forgotten when unused; real match effects (reading the game, shape, pressing, offside line, role execution)
- ✅ Match preparation: opposition report (form, predicted XI, tactics read by analysis quality, strengths and weaknesses, key players, recommendations), opposition instructions, player instructions per slot (also during matches), match training focus, pre-match team talk, squad readiness; AI managers prepare too
- ✅ Balance: development and money inflation fixed, ratings compressed, AI squads topped up; `scripts/longrun.ts` checks it all over multiple seasons

## Phase D2 — More depth ✅
Full design and measured results in [DEPTH_PLAN.md](./DEPTH_PLAN.md) §5–12.
- ✅ 37 attributes (technical, mental, physical, goalkeeping), each split into trainable, experience or innate, all used by the engine (momentum and acceleration, first touch, balance, aerial duels, keeper handling and claiming, set-piece specialists)
- ✅ In-match emotions (confidence, nerves, frustration) driven by events and personality, shown in commentary and ratings and read by the assistant
- ✅ AI managers with styles, adaptability and knowledge: pre-match plans, in-match changes with reasons, subs, memory of your system, sackings
- ✅ Squad dynamics: hierarchy, social groups, cohesion, rapport, 9 conversation topics, team meetings, player requests
- ✅ Calendar: pre-season (friendlies, camp, rest), match sharpness, international breaks
- ✅ Clubs: stadium (attendance, ticket price, expansion), transfer budget, board requests, 4 new staff roles
- ✅ Analytics hub (team, league comparison, player percentiles) and Media (press conferences, fans, news, awards)
- ⬜ International-break friendlies, home/away splits in the UI, league scatter view → Phase D3

## Phase T — Guided first season ⬜
New players find the game too complicated on the first try. Plan and visual storyboard: https://claude.ai/artifact/QZTCsnPrJQMbTLBLQQWHGU
- ⬜ Guided mode chosen on the new-career screen: the assistant runs everything except picking the team, and the sidebar starts at 4 items
- ⬜ Six-step first match: welcome, the big button, reading a player, picking a formation, a match with four timed hints, a three-line report
- ⬜ One feature unlocked per week (Training wk 2 → Academy & analytics wk 12, plus event-triggered unlocks), each with a card and an "assistant handles it" option
- ⬜ Guide components: spotlight, pulse, assistant bubble, "What's this?" terms, unlock card, progress strip
- ⬜ Settings: "Show everything now", "Replay tutorial"

## Phase D3 — Contracts, competitions, presentation ⬜
Contract depth (clauses, agents, negotiation rounds), a third division and a continental cup, match replays and clips. See [DEPTH_PLAN.md](./DEPTH_PLAN.md).

## Phase 2 — Online foundation ⬜
- ⬜ Supabase project, auth (email + OAuth), profiles
- ⬜ Move `game/` into `packages/engine` (workspace) for server reuse
- ⬜ Cloud club persistence + sync of offline career (opt-in)
- ⬜ Async online friendlies (server-simulated, replay link)
- ⬜ Live online matches over Realtime (authoritative server tick loop)
- ⬜ Friends list + invites

## Phase 3 — Competitions & depth ⬜
- ⬜ Tournament builder: Knockout, League, Groups + Knockout, Swiss/ladder
- ⬜ Scheduler (pg_cron) for async kick-offs
- ⬜ Global transfer market (human + AI), transfer windows, anti-collusion
- ⬜ Contracts, wages, finances, staff, youth academy
- ⬜ Set pieces, shouts, individual training
- ⬜ Trophy cabinet + public profiles, Elo ladder

## Phase 4 — Social ⬜
- ⬜ Federations (clans) + federation events
- ⬜ Co-managed clubs with roles & permissions
- ⬜ League/federation chat, shareable replays & highlight clips
- ⬜ Edit packs (with moderation)

## Phase 5 — Monetisation & launch ⬜
- ⬜ Cosmetics store, Club Pass
- ⬜ Director subscription (cloud sync, analytics, slots)
- ⬜ Tournament hosting tiers
- ⬜ Analytics, moderation tools, ToS / takedown policy

---

## Decision log
| # | Topic | Decision |
|---|---|---|
| 1 | Platform | Web app (PWA), Next.js |
| 2 | Match view | 2D top-down pitch + switchable commentary and stats |
| 3 | Online play | Both live (real-time) and async |
| 4 | Offline | Career vs AI, Quick match vs AI, Local multiplayer (hot-seat) |
| 5 | Player data | Fictional, generated, user-editable |
| 6 | Training depth | FM-lite (~16 attributes, focus, potential, age curve, morale, fitness, injuries) |
| 7 | Monetisation | Free; cosmetic + QoL monetisation ideas in GDD §12, never pay-to-win |
| 8 | Economy | Global transfer market |
| 9 | Tournament formats | Knockout, League, Groups + Knockout, Swiss/ladder |
| 10 | Social | Friends + private leagues, Federations, Co-managed clubs, Chat + match sharing |
| 11 | Backend | Supabase |
| 12 | First deliverable | Design doc + architecture, then playable vertical slice; track phases & improvements |

## Improvements log
Ideas and tuning notes found during development. Newest first.

- **2026-10-11 — Training, player identification, staff selection and match presentation.**
  - ✅ Training Plan/Development OVR bars, Attributes-only improvements summary, visible personal-focus and attribute progress, weekly development timing, saved 60-second match-training drills and estimated position-learning duration. Attribute gains advance weekly; match-preparation readiness advances on its saved timer.
  - ✅ Larger match shirt numbers, optional name labels, on-ball identity, selectable player detail/roster, and visible shirt numbers throughout tactics.
  - ✅ Fitness-coach Physical/Recovery skills, comparisons, overall rating and actual appointment history; existing v9 saves preserve previous effects.
  - ✅ One steady normal pace: 90 regulation minutes take seven real minutes; no speed multipliers. Separate 30/60 fps targets, interpolated and eased movement with normal presentation speeds and gradual acceleration, bounded per-frame work and worker highlight look-ahead. Pauses/celebrations add time; device performance affects actual fps.
  - ✅ Shared filled-track sliders with value readouts, endpoint labels and keyboard/step controls for tactics, loans, ticket prices and budgets.
  - ✅ README, architecture and rules refreshed; [Playing guide](./PLAYING_GUIDE.md) explains the controls and coach-selection criteria.

- **2026-10-10 — Phase D2: attributes, emotions, AI managers, dynamics, calendar, clubs, analytics, media.**
  - ✅ Save schema v9 (v8: new attributes derived from the old ones, potential re-anchored; v9: managers, stadiums, budgets, dynamics, media state). In-progress live matches from older saves are dropped.
  - ✅ The long-run script showed every club losing £1.5–2m a season once pre-season and international weeks were added. Operating costs now stop in those weeks; the median club's season result is back within about ±£1m.
  - ✅ Bug: key passes counted every completed pass into the final third (a striker had 19 in one match). They now count only the pass before a shot.
  - ✅ Bug: penalty commentary had no name ("PENALTY! is brought down…"), and match reports showed penalties won as goals in Key events.
  - ✅ Pre-season week selectors overflowed their cards at medium widths.
  - 📝 One friendly in the dev browser showed identical team stats (500 passes, 79%, 50% each). It didn't happen again in the next match or in Node replays of the same flow; probably a hot reload during the match. Watch for it.
  - ⬜ Red cards about 0.22 per match (real ~0.15); favourites with a 6+ OVR edge win 78%.

- **2026-10-09 — Phase D1: development, familiarity, match preparation, balance.**
  - ✅ The long-run script showed under-19s gaining 16 OVR a season, every club getting richer every season and season-average ratings up to 9.4. All fixed; measured results are in DEPTH_PLAN.md.
  - ✅ Save schema v7 (migration backfills personality, role experience, facilities, familiarity and staff skills from ids, so it's deterministic). Engine v2: in-progress live matches from older saves are dropped.
  - ✅ Bug: AI squads could fall below 11 fit players and crash the corner routine. AI clubs now promote youth players; the user gets emergency call-ups.
  - ✅ Potential is now shown everywhere as your coach (own players) or scouts (others) judge it, never the hidden true value, and sorting uses the same estimate.

- **2026-10-09 — Core screens rebuilt.**
  - ✅ Tactics, Training, League and Transfers rebuilt (see Phase 1.6). The transfer market never shows true ratings for unscouted players: filters and sorting use the midpoint of the scouted range.
  - ✅ Match tactics open as a bottom sheet on phones (with pause and shouts) so the pitch stays visible.
  - ✅ Bug: 9 pairs of clubs shared a short name (e.g. two "ASH"). Generation now picks unique codes; saves are repaired on load (migrations now run on every load since they're idempotent).

- **2026-10-09 — Phase 1.6 screens and matchday upgrade.**
  - ✅ Twelve new career screens (see Phase 1.6). `game/club.ts` adds staff hiring/sacking (signing fee 4 weeks, compensation 8 weeks), academy upgrades (£0.75m × level²) and capped scout assignments (1 + scout rating / 7).
  - ✅ Match viewer: half-time talk with the assistant's read of each tone and per-player reactions, full-time talk (passed to `completeRound` as `ftTalk`), shout bar, assistant notes, momentum timeline with event lanes, role changes, screen-reader live announcements. Career matches now finish on the match report.
  - ✅ Fitness fix: weekly recovery was a flat +14 against a ~24-point match cost, so a starting XI fell from 89% to 65% in five weeks. Recovery is now a share of the deficit (light 90%, normal 75%, intense 55%, ±1% per physio point): regulars settle around 97 / 92 / 80%.
  - ✅ Penalty shootouts are stored on match reports and shown on the report and fixtures list.

- **2026-10-09 — Playtest feedback round.**
  - ✅ Career bug: after a match, "Play match" reopened the finished match stuck on "Saving…". Cause: Next 16 keeps visited pages alive (React `<Activity>`). Fix: the match is keyed by fixture, the live match is only recorded after kick-off, and we navigate before saving.
  - ✅ More dribbling and movement. Players settle in position instead of drifting, forwards make timed runs along the last line, full-backs overlap, through balls go into runners' paths, players carry into open grass (and shield under pressure), and pressers and recovering defenders sprint. Ball carried per match 3.3 → **4.8 km** (real ~4–5), distance per outfield player 14.2 → **11.5 km/90** (real ~10.5). Goals 2.5, shots 25.7, draws 24%, home wins 44%.
  - ✅ Stats tab: crests for both teams, bars that stay visible for white kits, offsides and distance rows.
  - ✅ Substitutions show live rating and energy for players on the pitch, and OVR for the slot being filled plus fitness for the bench. The bench is always visible.
  - ✅ Per-player match stat sheets (tap a player in Ratings) and full season stats on the profile (general / attacking / passing / defending / goalkeeping / discipline). Save schema v5.
  - ✅ "Sub at next break": play stops at the next dead ball and opens Tactics, in career, quick match and head-to-head.
  - ✅ Consistent corner radius: controls 6px (`rounded-md`), containers 8px (`rounded-lg`), tags 4px (`rounded`), circles only for dots and tokens.
  - 📝 Online (Phase 2) requirements recorded in ARCHITECTURE: server-owned clock at a fixed speed with no client speed controls, plus stoppage requests (3 per half, 45 s, both-ready resume).
  - ⬜ Sim cost rose with the richer movement (~2× per match). It runs in the worker, but optimise `updateTargets` (marking and support loops) when convenient.
  - ⬜ Reds 0.27/match (real ~0.15): trim second-yellow frequency.

- **2026-10-09 — Visual identity.** Light editorial theme: warm paper `#f4f3ef`, ink `#141414`, hairline dividers, black pill buttons, Instrument Serif headings, mono caps labels, pale green `#cfefd7` for highlights (selections, your club's rows, goal banner, headline marker) and a pale-green striped pitch. Club kit colours stay as each club's identity.
- ✅ Duration-based playback replaces the old tick-rate labels (2026-10-11). Remembering pace/frame-rate preferences per device remains future work.

- **2026-10-09 — Characteristics drive every event.** Audited every random draw in the engine. Fouls, cards, injuries, offsides, interceptions, corners, blocks, free kicks and corner targets now depend on the players involved (table in GAME_DESIGN §7). New hidden **personality traits** (temperament, injury proneness, consistency) appear on the player profile and as squad badges (Hot-head / Fragile / Erratic). Save schema v4 backfills traits deterministically. Proof, from `npm run calibrate` (400 matches, low ≤7 / mid 8–13 / high ≥14):

  | Behaviour | Low | Mid | High |
  |---|---|---|---|
  | Fouls/90 by temperament | 0.62 | 0.95 | 0.99 |
  | Cards/90 by temperament | 0.08 | 0.16 | 0.23 |
  | Injuries/90 by injury proneness | 0.019 | 0.031 | 0.036 |
  | Foul % per tackle by tackling (defenders) | 34% | 19% | 16% |
  | Interception % per chance by positioning (defenders) | 58% | 64% | 70% |
  | Offsides/90 by decisions (forwards) | 0.84 | 0.84 | 0.41 |
  | Goals/90 by finishing (forwards) | 0.00 | 0.38 | 0.85 |
  | Save % by goalkeeping | – | 69% | 72% |

  Team-level calibration is unchanged (goals 2.76, fouls 20.9, yellows 3.4, draws 24%, home win 44%). Controlled tests: an all-hot-headed XI commits >2× the fouls and cards of an all-calm XI, and an injury-prone XI suffers >2× the injuries. Tests are split into three files (engine / career / transfers) so long runs don't starve the vitest worker.

- **2026-10-09 — Phase 1 gap sweep (all fixed)**. Engine re-calibrated over 400 AI-vs-AI matches across 4 worlds with random pairings (`npm run calibrate`):

  | Stat (per match) | Before | Now | Real football |
  |---|---|---|---|
  | Goals | 3.1 | **2.75** | ~2.7 |
  | Shots / on target | 23 / 8.9 | **23.3 / 8.9** | ~25 / ~8.5 |
  | Pass accuracy | 75% | **80%** | 80–85% |
  | Possession changes | ~380 | **234** | 200–280 |
  | Tackles won | ~260 ("duels") | **39** | ~35 |
  | Dribbles | ~130 | **23** | ~20 |
  | Fouls / yellows / reds | 23 / 3.1 / 0.33 | **21.5 / 3.3 / 0.20** | ~22 / ~3.5 / ~0.15 |
  | Corners | 5.6 | **8.7** | ~10 |
  | Offsides | none | **4.8** | ~4 |
  | Home win / draw | 41% / 25% | **44% / 25%** | ~45% / ~25% |
  | Favourite wins (OVR gap 6+) | ~80% (bad sample) | **57%** (draw 25%, upset 17%) | ~55–65% |

  - ✅ Duels and possession changes: defenders body-block the carry path, so the carrier has to pass or *choose* a take-on. Per-tick tackles are rare. Team-mates make support runs to offer short options, and losing the ball has a real cost in decisions, so passing is safer.
  - ✅ Pass accuracy and corners: long balls are a style choice (Directness slider), crosses happen (box runs to near post, spot and far post), and defenders' deflections and blocks go behind for corners. Stat restored to "Tackles won".
  - ✅ Goals calibrated (2.75).
  - ✅ Upset rate measured properly (random pairings across 4 worlds, bucketed by OVR gap).
  - ✅ Background matchdays and season rollover run in a Web Worker (`lib/sim/`), with a main-thread fallback.
  - ✅ Teams change ends at half-time (mirrored view in the second half).
  - ✅ Offside calls (assistant flags ~85% of offside receptions; occasional mistimed runs). Discipline: a straight red is a 3-match ban, a second yellow 1, every 5th booking 1. Banned players can't be selected and serve their ban the next matchday.
  - ✅ No more save-scumming: a started career match is frozen into `save.liveMatch` (setup, seed, commands, tick) and saved every 5 game-minutes, on every tactical change, at half-time, and on leaving or closing the tab. Coming back resumes at the exact moment. "Sim rest of match" finishes it with the assistant managing.
  - ✅ Expanded name pools (14 nations) and no duplicate surnames within a squad.
  - ✅ Instant-navigation validation: career pages now render their own loading state (`RequireCareer`) instead of the layout dropping the page segment. `instant = false` is removed.
  - Save schema v2 with a migration chain (`game/migrate.ts`). Existing v1 saves upgrade automatically.
- **2026-10-09 — Engine v1 calibration**: first pass (goals 3.1, shots 23, fouls 23). Superseded by the entry above.
