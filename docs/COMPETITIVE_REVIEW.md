# Competitive review: Touchline vs the best football management games

Compared against **Football Manager** (PC/console and Mobile/Touch), **Top Eleven** (social, real-time online), **Hattrick** (browser, slow-burn, community) and **Online Soccer Manager (OSM)**. The scope is the current build: Phases 1 and 1.5.

## Where Touchline already stands out

| Strength | Why it matters |
|---|---|
| Personality traits are visible and *provably* drive events | FM hides most of its personality. Ours is transparent and testable. |
| Deterministic engine: resume, replay, look-ahead highlights | Cheap replays and shareable matches. This becomes the backbone of fair online play. |
| Fully offline PWA, no pay-to-win | Top Eleven and OSM are widely criticised for paid boosts. This is our positioning. |
| Hot-seat head-to-head, in-save editor | FM supports several managers in one save, but not a quick "pass the device" friendly. |
| Fast sessions (a match in about 6 minutes, highlights in about 1) | Closer to FM Mobile and Top Eleven than to full FM, which suits a social game. |

## Gameplay gaps

Ranked by impact on the core loop: *prepare → match → react → develop*.

| # | Gap | What the leaders do | Suggestion for Touchline | Impact | Effort |
|---|---|---|---|---|---|
| 1 | **Shallow tactics** (formation + 6 team sliders) | FM: player **roles and duties** per position, individual instructions, opposition instructions, set-piece routines | 2–3 roles per position (e.g. ST: *Poacher / Target man / False 9*; FB: *Defensive / Wing-back / Inverted*), each changing real engine behaviour. Add set-piece takers and 2–3 corner routines. | ★★★ | M |
| 2 | **No in-match "voice"** | FM: touchline **shouts** and **team talks**; Top Eleven: live subs and tactics | Half-time and full-time team talks (Praise / Demand more / Stay calm) that move morale by player personality, plus 4–5 shouts (Push higher, Calm down, Get stuck in…). | ★★★ | S |
| 3 | **No analysis of what's going wrong** | FM: assistant feedback, Data Hub, heatmaps, pass maps, average positions | An "Assistant" card during the match ("Their LW is beating our RB, 4 dribbles"), plus post-match pass network, heatmap, xG timeline and a momentum bar. The engine already tracks the data. | ★★★ | M |
| 4 | **Every attribute is fully visible** | FM: scouting knowledge, attribute **ranges** until scouted | Mask other clubs' attributes as ranges (e.g. 11–15) until scouted. Add scout assignments (region, position, budget). This creates a reason to come back between matches. | ★★★ | M |
| 5 | **No contracts, wages or board** | FM and Hattrick: wages, renewals, release clauses, board confidence, sacking | Wage budget, contract expiry and renewals (player demands scale with form and morale), a board confidence meter with season objectives. Already in GDD Phase 3. | ★★★ | L |
| 6 | **Transfers resolve instantly** | FM: interest → negotiation → agent → medical; loans; deadline day | Two-step deals (club fee, then player terms), player willingness by club tier, **loans**, a shortlist, and a deadline-day final matchday of the window. | ★★ | M |
| 7 | **Squad has no emotional layer** | FM: playing-time promises, squad status, hierarchy, dynamics | Squad status (Key / Rotation / Backup / Prospect). Morale follows minutes vs status. Unhappy players ask to leave. | ★★ | M |
| 8 | **Training is team-wide only** | FM: individual focus, new-position training, mentoring | Individual attribute focus, position retraining (familiarity grows), veteran-to-youngster mentoring. | ★★ | S |
| 9 | **Only league football** | FM, Hattrick, Top Eleven: domestic cup + continental + super cup | Offline domestic **cup** (knockout, both divisions) using the tournament code planned for Phase 3, and a season-opening Super Cup. | ★★ | S |
| 10 | **Youth intake is a silent replacement** | FM and Hattrick: youth intake day, academy, regens with potential | A yearly intake event with 3–6 prospects to sign or release. Academy facilities raise quality. | ★★ | S |
| 11 | **No staff** | FM and Hattrick: coaches, scouts, physios with ratings | 4 staff slots (Assistant, Coach, Scout, Physio) that affect training speed, scouting accuracy and injury recovery. | ★ | M |
| 12 | **Thin narrative** | FM: press conferences, news feed, rivalries, trophy cabinet, manager reputation | Trophy cabinet and manager profile (history is already stored), rival clubs, a short news feed. Optional press conferences that nudge morale. | ★ | S–M |
| 13 | **No delegation** | FM: delegate training, press, friendlies to staff | "Let the assistant handle…" toggles. Vital for short mobile sessions. | ★ | S |
| 14 | **No daily reason to open the app** (online) | Top Eleven: scheduled match times, daily tasks; Hattrick: weekly rhythm | For online: fixed weekly kick-off slots (async), a daily training check-in and federation events, with cosmetic rewards only (GDD §12). | ★★ | M (Phase 2–4) |

## UI / UX gaps

| # | Issue in the current build | Leader pattern | Suggestion | Effort |
|---|---|---|---|---|
| 1 | **Secondary text contrast fails accessibility.** Muted grey on the page is 3.41:1, and the "draw" grey is 2.50:1 (the standard is 4.5:1). | — | Darken `--muted` to `#6b6860` (5.0:1). Give the draw colour a darker ink for text. | XS |
| 2 | **No single "advance" action.** Play or sim only lives on the Club card. | FM: a persistent **Continue** button that always shows the next event | A global top-right button that is context aware: "Play Matchday 5", "Resume 37′", "Respond to offer", "Start Season 2". | S |
| 3 | **Inbox is read-only** | FM: inbox items carry actions | Actionable messages: accept or reject offers, open the injured player, jump to the match report. | S |
| 4 | **Squad table has fixed columns; no comparison** | FM: views (Overview / Attributes / Stats / Fitness), custom columns, compare players | View presets for the table, plus a side-by-side **player comparison** (two players, attribute radar overlay). | M |
| 5 | **Player profile is a text list** | FM: attribute polygon, position-suitability pitch, rating history | Radar chart of attribute groups, a mini pitch shading suitability for every position, a form sparkline. | S–M |
| 6 | **Tactics: tap-to-swap only, no presets, no explanations** | FM: drag and drop, roles per slot, familiarity, 3 saved tactics | Drag and drop on desktop, a role picker per slot, 3 saved tactic presets, and plain-language previews per slider ("High line: squeezes space, vulnerable to pace in behind"). | M |
| 7 | **Match screen: everything in one side panel** | FM: widgets + timeline; Top Eleven: big pitch, quick actions | Event timeline under the pitch (goals, cards, subs as markers), a momentum bar, the assistant card. On mobile, tactics as a bottom sheet so the pitch stays visible. | M |
| 8 | **Mobile bottom nav has 6 items** | FM Mobile: a few primary tabs + "More" | Club / Squad / Tactics / Match + More (Training, Transfers, League, Editor). | S |
| 9 | **No onboarding** | FM: assistant tips; Top Eleven: guided first week | A first-season checklist (set tactics → play → train → scout) with dismissible tips. | S |
| 10 | **Pitch canvas is invisible to screen readers; bars rely on colour** | — | Live-region commentary for key events; numeric labels already exist on the bars, so add `aria` descriptions. | S |

## Recommended order

1. **Quick wins (1–2 days):** contrast fix (UI-1), global Continue button (UI-2), actionable inbox (UI-3), 5-tab mobile nav (UI-8), team talks + shouts (G-2).
2. **Matchday depth:** player roles + set pieces (G-1), assistant feedback + post-match analytics (G-3), match timeline + momentum (UI-7).
3. **Between-match loop:** scouting with masked attributes (G-4), domestic cup (G-9), youth intake day (G-10), individual training (G-8).
4. **Club management (Phase 3):** contracts/wages/board (G-5), deeper transfers + loans (G-6), squad status + promises (G-7), staff (G-11).
5. **Online retention (Phase 2–4):** scheduled kick-offs, daily check-ins, federation events (G-14). Cosmetic rewards only.
