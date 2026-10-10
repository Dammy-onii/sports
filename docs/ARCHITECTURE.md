# Architecture

## Overview

```
┌──────────────────────────── Next.js 16 PWA (app/) ────────────────────────────┐
│  UI routes (React 19, Tailwind 4)      Local store (lib/store)                │
│  /  /new  /club  /squad  /tactics      versioned JSON save → localStorage      │
│  /training  /league  /match             (IndexedDB when saves outgrow it)     │
│            │                                     ▲                            │
│            ▼                                     │                            │
│     ┌──────────────── game/ (pure TypeScript, no DOM, no Node APIs) ───────┐  │
│     │ rng · generate · ratings · tactics · engine · commentary · training  │  │
│     │ competition · career                                                 │  │
│     └──────────────────────────────────────────────────────────────────────┘  │
│  Service worker (public/sw.js): caches the app shell + static assets offline  │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │ Phase 2+
                                        ▼
┌──────────────────────────────── Supabase ─────────────────────────────────────┐
│ Auth · Postgres (RLS) · Realtime channels · Edge Functions / worker           │
│  - match-runner: imports game/engine, simulates async fixtures at kick-off    │
│  - live-match: authoritative tick loop, broadcasts frames on a channel,       │
│    accepts tactic/sub commands from both managers                             │
│  - transfer-market, tournament scheduler (pg_cron), chat                      │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Key principle: one engine, everywhere

`game/` contains no React, DOM or Node imports. It is deterministic: a seeded RNG (`mulberry32`) drives every random choice. That gives us:

- **Offline:** the browser runs the engine directly.
- **Online async:** a server worker runs the *same* code with the same seed, so results are authoritative.
- **Online live:** the server steps the engine tick by tick and applies the managers' commands (`{tick, side, command}`) as they arrive. Clients only render.
- **Replays:** `{engineVersion, seed, homeSetup, awaySetup, commands[]}` is enough to re-run a match anywhere. When the engine changes, `ENGINE_VERSION` is bumped and old replays are pinned to the old version.

When the backend arrives, `game/` moves into a workspace package (`packages/engine`) so Edge Functions (Deno) and the web app share it.

## Directory layout

```
app/                 Next.js routes (thin; compose components)
components/          UI components (client components where interactive)
  match/             PitchCanvas, Commentary, MatchStats, MatchControls
lib/store/           save schema, persistence, React hook (useSyncExternalStore)
game/
  rng.ts             seeded RNG helpers
  types.ts           core domain types
  constants.ts       positions, formations, attribute groups
  generate.ts        names, players, clubs, leagues (fictional)
  ratings.ts         overall/ability per position, player value
  engine/            match simulation (state, step, decisions, stats)
  commentary.ts      event → text
  training.ts        weekly progression, fitness, injuries
  competition.ts     fixtures (round robin), tables
  career.ts          season orchestration (advance matchday)
docs/                GDD, architecture, roadmap
```

## Data model (offline save)

```ts
SaveGame {
  version: number            // schema version, migrations in lib/store/migrate.ts
  createdAt, updatedAt
  seed: number               // world seed
  userClubId: string
  clubs: Record<id, Club>
  players: Record<id, Player>
  league: { id, name, season, clubIds[], fixtures: Fixture[], currentRound }
  training: { focus, intensity }
  inbox: Message[]
}
```

## Backend schema (Phase 2 sketch)

```
profiles(id ⇄ auth.users, username, avatar, elo, created_at)
clubs(id, owner_id, name, short_name, colors jsonb, crest jsonb, reputation, balance, is_ai)
club_members(club_id, user_id, role enum[owner,manager,coach,scout])      -- co-managed clubs
players(id, club_id, name, nationality, birth_date, attributes jsonb, potential, positions jsonb,
        fitness, morale, injury_weeks, value, wage, contract_until)
tactics(club_id, formation, sliders jsonb, lineup jsonb, bench jsonb, updated_at)
competitions(id, owner_id, type enum[knockout,league,groups_knockout,swiss], rules jsonb,
             status, visibility, join_code, season)
competition_entries(competition_id, club_id, seed, group)
fixtures(id, competition_id, round, home_club_id, away_club_id, kickoff_at, mode enum[async,live],
         status, seed, result jsonb, replay jsonb)
match_commands(fixture_id, tick, side, command jsonb)                   -- live match inputs
transfers(id, player_id, from_club, to_club, fee, status, created_at)
transfer_listings(player_id, asking_price, listed_at)
federations(id, name, crest, owner_id) / federation_members(federation_id, user_id, role)
messages(id, channel_type, channel_id, user_id, body, created_at)       -- chat
```

RLS rules: users write only to clubs where they hold a role. Fixtures and results are written only by the service role (the server engine). Commands are inserted only by the manager of that side, and only while the fixture is live.

## Online live-match protocol (Phase 2)

**One clock, owned by the server.** Both managers must always see the same minute and the same play.

1. Both clients join the Realtime channel `match:{fixtureId}`. Kick-off waits until both are connected (or a 60 s grace period ends).
2. The server's live-match worker loads both frozen setups, seeds the engine and steps it at a **fixed rate**: 16 ticks/s by default, so a match takes about 6 minutes. The competition can choose 8 or 32. Clients have **no speed, pause or skip controls**; those exist offline only.
3. Each broadcast `frame` carries the authoritative `tick`. Clients render with a small buffer (~150 ms) and interpolate, so both screens show the same moment even with uneven latency. A late joiner gets a snapshot (seed + commands + tick, replayed locally), then live frames.
4. Clients send `command` messages (tactic change, substitution). The server validates them and applies them on the next tick, then echoes them to both clients.
5. **Stoppage requests** (the online version of offline "Sub at next break"):
   - A manager taps *Request stoppage*. The server stops play at the next dead ball (throw-in, foul, goal kick, goal) and broadcasts `paused { by, until }`.
   - Both managers can make subs and tactical changes and check stats while play is stopped.
   - Play resumes when both managers press *Ready*, or after **45 s**.
   - Each team gets **3 requests per half**. Half-time is a fixed 60 s window for both.
6. If a client disconnects, the match continues with that manager's saved setup, and the AI assistant handles injuries and subs. Reconnecting resyncs from the snapshot.

## Offline / PWA

- `app/manifest.ts` lets the app install to the home screen.
- `public/sw.js` pre-caches the shell and uses stale-while-revalidate for static assets, so the app reloads with no network.
- Every offline mode (career, quick match, local head-to-head) runs fully on the client with no network calls.
- `experimental.useOffline` can be enabled later for online-mode navigations.

## Long-run balance

`scripts/longrun.ts [seasons] [seed]` plays whole careers and prints club money by division, the season-rating distribution, OVR by age, each age group's OVR change, the spread of club strength and squad sizes. Run it after any change to development, the economy or generation (see the targets in DEPTH_PLAN.md).

## Testing

- `game/` gets unit tests (Vitest): determinism (same seed gives the same result) and calibration (average goals, shots and possession fall in realistic ranges over N simulated matches).
