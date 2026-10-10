# Touchline ⚽

A social football **club management** game. Build a club, develop players, make tactical calls, and compete against other managers for trophies. You manage the match rather than play it.

**Status:** Phase 1 (offline vertical slice) is complete. See the [roadmap](docs/ROADMAP.md).

- 📘 [Game Design Document](docs/GAME_DESIGN.md)
- 🏗️ [Architecture](docs/ARCHITECTURE.md)
- 🗺️ [Roadmap, decision log & improvements](docs/ROADMAP.md)

## What's playable now (fully offline)

- **Career:** create your club (name, colours, formation), inherit a generated squad, and play a 22-round league against 11 AI clubs. Seasons roll over with aging, retirements and youth intake.
- **Match day:** a 2D top-down match engine with live commentary, stats (possession, shots, xG and more) and player ratings. You can change tactics, formation and subs mid-match, at speeds from 1× to 16×, or skip to the end.
- **Tactics:** 5 formations, a tap-to-swap pitch, and 6 team-instruction sliders.
- **Squad & training:** FM-lite attributes (16, on a 1–20 scale), potential, fitness, morale, injuries, a weekly training focus and intensity, and player renaming.
- **Quick match:** any two clubs. Manage either side or just watch.
- **PWA:** installable, with the app shell cached by a service worker.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine determinism, calibration, fixtures, full season
npm run calibrate  # print engine averages vs real football over N matches
npm run typecheck
npm run lint
```

The match engine in `game/` is pure, deterministic TypeScript, so the same seed and commands always produce the same match. That same code will run server-side for online play (Phase 2, Supabase).
