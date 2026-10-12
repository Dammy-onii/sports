# Touchline ⚽

An offline football **club management** game with a planned social multiplayer layer. Build a club, develop players, prepare tactics and manage matches against fictional AI clubs.

**Status:** the offline career includes Phases 1/1.5, the expanded management screens and most D1/D2 systems. Guided onboarding and online play remain planned. See the [roadmap](docs/ROADMAP.md).

- [Game design](docs/GAME_DESIGN.md): current rules and future product direction.
- [Architecture](docs/ARCHITECTURE.md): implementation, persistence and playback.
- [Development and deeper systems](docs/DEPTH_PLAN.md): formulas, calibration and remaining gaps.
- [Roadmap](docs/ROADMAP.md): delivery status and decisions.
- [Playing guide](docs/PLAYING_GUIDE.md): training progress, coach selection and match controls.

## Playable offline

- **Career:** a two-division pyramid with 12 clubs per division, promotion/relegation, domestic cup and Super Cup, four pre-season weeks and two international breaks. Seasons include aging, retirements, youth intake, finances and board objectives.
- **Match day:** a deterministic 2D engine, commentary, team/player stats, ratings, team talks, shouts, substitutions and live tactical changes. One steady playback pace maps 90 regulation minutes to seven real minutes, with normal-speed player/ball animation. Choose a separate 30 or 60 fps render target, highlights or skip to end. Stoppage, pauses and celebrations add time.
- **Player identification:** larger shirt numbers, optional pitch name labels, an on-ball identity display and selectable player details. Tactics shows shirt numbers separately from OVR.
- **Squad and training:** 37 attributes, individual/team focus, mentoring, position retraining, personality, fitness, sharpness, injuries, morale, development logs and progress toward the next OVR point, fractional improvements in Player → Attributes, individual-focus progress, weekly development timing and saved 60-second match-preparation drills.
- **Club management:** transfers and loans, scouting knowledge, staff skills and recorded appointments, academy, stadium, budget allocation, squad dynamics, media and analytics.
- **Quick match and local head-to-head:** test tactics, spectate or manage both sides on one device.
- **Saves and PWA:** five browser-local slots, export/import, resumable career matches and an installable app. Offline availability depends on assets having been cached; see architecture.

## Develop

```bash
npm install
npm run dev                   # http://localhost:3000
npm run typecheck
npm run lint
npm test -- --maxWorkers=1     # avoid contention in engine-heavy suites
npm run calibrate             # engine averages over seeded matches
npx tsx scripts/longrun.ts 3   # multi-season development/economy balance
npm run build
```

Next.js 16.4, React 19.3, Tailwind 4 and TypeScript. Follow `AGENTS.md` and the installed guides in `node_modules/next/dist/docs/` before framework changes. The pure TypeScript simulation and management rules live in `game/`; Next routes compose client screens. No backend credentials are required for offline play. Supabase and online matches are future work.
