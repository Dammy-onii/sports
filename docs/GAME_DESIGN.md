# Game Design Document — Working title: **Touchline**

> A social football club management game. You don't play the match, you *manage* it:
> build a club, develop players, out-think rival managers, and win trophies.

Status: living document. Decisions are logged in [ROADMAP.md](./ROADMAP.md#decision-log).

---

## 1. Pillars

1. **The club is yours.** Every player you develop, every tactic you tune and every trophy you lift persists. Progress happens between matches, not only during them.
2. **Compete against people.** The best opponent is another manager. Leagues, cups, ladders and federations give every match stakes.
3. **Decisions over dexterity.** Matches are won by preparation and in-game calls (shape, pressing, substitutions), never by reflexes.
4. **Play anywhere.** Full single-player career offline; online when you want rivals.
5. **Fair by design.** Money can buy looks and convenience, never results.

## 2. Core loops

```
          ┌──────────── weekly loop ─────────────┐
          │                                      │
 Train ──► Pick XI & tactics ──► Match ──► Review stats/ratings
   ▲                                              │
   └──── transfers / youth / morale ◄─────────────┘

 Season loop: league + cups → prize money & reputation → stronger squad → harder competitions
 Social loop: friends → private leagues / cups → federation events → bragging rights & trophies cabinet
```

- **Session (5–15 min):** set training, play/sim a fixture, check the table, make a transfer bid.
- **Week (real time, online):** async league fixtures run on a schedule; live friendlies and cup ties are arranged with rivals.
- **Season:** promotion/relegation, trophies, player aging, youth intake, finances.

## 3. Modes

| Mode | Connectivity | Description |
|---|---|---|
| **Career** | Offline | Your club in a generated league pyramid vs AI clubs. Full season, training, finances, transfers with AI clubs. |
| **Quick Match** | Offline | One-off friendly vs any AI club to test tactics. |
| **Local Head-to-Head** | Offline | Two managers, one device (hot-seat). Each picks tactics privately; both can intervene at pauses. |
| **Online Async** | Online | Your saved setup vs another manager's. Server simulates at kick-off time; you watch replay/highlights. Used for scheduled league fixtures. |
| **Online Live** | Online | Both managers connected; server runs the engine and streams frames; both can change tactics/subs in real time. Used for cup finals, friendlies, ladder. |
| **Tournaments** | Online | User-created: Knockout, League (round-robin), Groups + Knockout, Swiss/ladder. |

## 4. The club

- **Identity:** name, short name, colours, crest (template + colours), stadium name. All editable.
- **Squad:** 22–30 players. First team + youth academy (Phase 3).
- **Staff:** assistant, coaches by area, goalkeeping coach, fitness coach, data analyst, youth coach, scout, physio.
- **Stadium:** capacity, ticket price and expansions. Attendance depends on reputation, form, position, opponent, derbies, price and the supporters' mood.
- **Finances:** balance, wage budget and a separate seasonal transfer budget (which can be rebalanced). Income comes from gate receipts (attendance × price), TV, sponsors and prize money; costs are wages, staff, operations and facilities. You can make requests to the board.
- **Calendar:** four pre-season weeks (friendlies, training camp, rest), two international breaks, and match sharpness separate from fitness.
- **AI clubs** each have a manager with a style, adaptability and tactical knowledge. They plan for each opponent, change tactics during matches, remember your system and can be sacked.
- **Media:** press conferences, news, the supporters' mood, and monthly and season awards.
- **Reputation:** grows with results; affects transfer interest, sponsor money and AI respect.

## 5. Players (FM-lite)

37 attributes on a **1–20 scale**:

| Technical | Mental | Physical | Goalkeeping |
|---|---|---|---|
| Crossing, Dribbling, Finishing, First touch, Free kicks, Heading, Long shots, Marking, Passing, Penalties, Tackling, Technique | Anticipation, Bravery, Composure, Concentration, Decisions, Flair, Leadership, Off the ball, Positioning, Teamwork, Vision, Work rate | Acceleration, Agility, Balance, Jumping reach, Natural fitness, Pace, Stamina, Strength | Reflexes, Handling, One-on-ones, Aerial reach, Kicking |

- **Trainable:** everything except the experience and innate attributes. Training (team focus, individual focus or a single-attribute focus) grows them.
- **Experience** (composure, concentration, bravery, leadership): grow with minutes, age and big matches.
- **Innate** (flair, natural fitness): set at birth. Flair never changes; natural fitness slows physical decline.

What each attribute does in the match engine is listed in [DEPTH_PLAN.md](./DEPTH_PLAN.md) §5.

Plus **personality traits** (1–20, not trainable, shown on the player profile):

| Trait | Effect |
|---|---|
| Temperament (aggression) | Fouls per challenge, tactical fouls, yellow/red cards, how reckless a foul is (injury risk to the victim) |
| Injury proneness | Contact and non-contact (muscle) injuries in matches, training injuries, length of layoffs |
| Consistency | How far a player's match-day form swings from the team's (good and bad days) |
| Professionalism | The biggest driver of development; professionals also decline more slowly |
| Determination | Development, and bouncing back from long injuries |
| Ambition | A little development; transfer interest and wage demands |
| Pressure | Nerves in big matches |
| Loyalty | Wage demands and desire to stay |
| Adaptability | How quickly a new signing settles |
| Sportsmanship | Dissent and frustration fouls |

Personality is hidden for other clubs' players until scouted, and always known for your own.

Plus hidden or semi-hidden values:

- **Potential (1–200 ability scale):** the ceiling. Shown as a star range: your scouts' knowledge for other clubs' players, your coach's judgement for your own.
- **Current Ability:** a weighted sum of attributes for the player's best position. Displayed as an **Overall (1–99)**.
- **Age curve:** fast growth from 16 to 21, slowing from 22 to 26, a plateau from 27 to 30, then decline: physical attributes from 29, technical from 31, mental from 33 (goalkeepers three years later).
- **State:** fitness (0–100), morale (0–100), sharpness, injury (weeks out), form (average of the last 5 ratings).
- **Positions:** GK, CB, LB, RB, DM, CM, AM, LM, RM, LW, RW, ST, each with a familiarity level.
- **Contract:** wage and years left (release clauses and bonuses are planned for Phase D3).
- **Role experience:** 0–100 for each role he has played (see §6, tactical familiarity).
- **Career history:** a record of each season (club, apps, goals, assists, average rating, OVR).
- **Squad dynamics:** influence and hierarchy tier, social group, rapport with the manager, settling in, weekly training rating. You can talk to players one-to-one (9 topics) or hold team meetings, and players come to you with requests.
- **In-match emotions:** confidence, nerves and frustration change during a match with events and personality, and they change how a player plays (DEPTH_PLAN §6).

### Training

- Weekly **team focus**: Balanced / Attacking / Defending / Physical / Technical / Tactical (each one boosts a different attribute group).
- **Intensity**: Light / Normal / Intense. Higher intensity means faster growth, but more fatigue and injury risk.
- **Individual plans:** a personal focus, a new position to learn, or a senior mentor (who also passes on professionalism and determination).
- **Match preparation** for the coming fixture can replace some sessions (§6). It costs about a fifth of the week's development.
- **Growth** depends on age, room to the ceiling, personality, recent minutes (and the level of football), the coach's skill in each area, the training ground and academy, and intensity. Full model and calibration in [DEPTH_PLAN.md](./DEPTH_PLAN.md) §1.
- A **development report** every four weeks shows who is progressing, who is stalling and why.

## 6. Tactics

- **Formation:** 4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 5-3-2 (more later). Each slot has a role position and a base pitch coordinate.
- **Team instructions (1–5 sliders):**
  - *Mentality:* defensive ↔ attacking. Sets how far up the shape sits and how much risk the passing takes.
  - *Pressing:* how often and how many players close down the ball carrier. Costs stamina.
  - *Defensive line:* deep ↔ high. A high line squeezes space but is vulnerable to pace.
  - *Width:* narrow ↔ wide.
  - *Tempo:* patient ↔ quick. Sets how fast decisions are made and how forward-looking passes are.
  - *Directness:* short passing ↔ long balls.
- **Roles** per position change real engine behaviour, and **player instructions** per slot (shooting, dribbling, passing, crossing, forward runs, width, closing down, tackling, tight marking, roaming) adjust them.
- **Tactical familiarity:** the squad learns each formation, each instruction level and each player's role through matches and tactical training, and forgets what it stops using. Low familiarity means slower reads, a looser shape, a weaker press, a leakier offside line and roles carried out only half-right. Details in [DEPTH_PLAN.md](./DEPTH_PLAN.md) §2.
- **Match preparation:** an opposition report (form, predicted XI, how they play, strengths and weaknesses, key players), the assistant's recommendations, opposition instructions (tight marking, closing down, tackling) and a match training focus. Details in [DEPTH_PLAN.md](./DEPTH_PLAN.md) §3.
- **In-match:** change any slider, swap formation, change roles and player or opposition instructions, make up to 5 substitutions, use touchline shouts, and give pre-match, half-time and full-time team talks.
- **Set pieces:** penalty, free-kick and corner takers; corner routines (mixed, near post, far post, short).

## 7. Match engine

- A **deterministic, seeded simulation** written in pure TypeScript. The same engine runs in the browser (offline) and on the server (online), so the same seed and inputs always produce the same match.
- Steps of **1 second of game time**. Each tick, every player moves toward a tactical target (shaped by formation, ball position, phase of play and sliders), and the ball carrier picks an action: pass, dribble, shoot, or hold.
- Outcomes are attribute-driven contests (passing vs pressure and interception, dribbling vs tackling, finishing vs goalkeeping, with xG from distance and angle). Fatigue lowers effective attributes.
- **Outputs:** frames (positions for 2D playback), events (goals, shots, fouls, cards, corners, subs), stats (possession, shots, xG, passes, tackles and more) and player ratings.
- **Who does what is decided by the players involved.** A few outcomes are luck by design: which of two equal options a player picks, a deflection's bounce, and the assistant referee missing roughly 15% of offsides.

| Event | Driven by |
|---|---|
| Pass completes / is cut out | Passer's passing, vision, distance, pressure; lane defender's positioning + decisions (reads the pass) |
| Dribble / take-on | Dribbling + pace vs tackling + pace; only confident dribblers attempt it |
| Tackle attempt and win | Defender's work rate, team pressing; tackling + strength vs dribbling + strength |
| Foul | Defender's tackling (lower = more), temperament, fatigue; attacker's dribbling/pace (draws fouls) |
| Tactical foul when beaten | Temperament + decisions |
| Yellow / red card | Foul location × temperament; booked players with good decisions calm down |
| Injury | Victim's injury proneness and fatigue, offender's temperament; muscle injuries from proneness × fatigue |
| Offside | Forward's decisions (lower = mistimed runs) and pace (gambles), defensive line shape |
| Shot quality and outcome | Position, angle, pressure, bodies in the way; finishing/long shots/heading, composure vs goalkeeping |
| Blocked shot | Nearest defender's positioning; goes behind more if he lacks composure |
| Save held / parried for a corner | Goalkeeping |
| Ball turned behind (corner) | Defender's composure (interceptions) or heading (crosses) |
| Corner target / header | Weighted towards strong headers; heading + strength vs marker; keeper claims with goalkeeping |
| Free kick shot or pass | Best long-shot taker's long shots |
| Fatigue | Stamina, distance covered, pressing |
| Daily form | Team form plus each player's consistency |

- **Presentation:** a **2D top-down pitch** with tokens, plus tabbed **commentary** and **live stats** panels. Playback speed runs from 1× to 32×, with skip to the end.
- **Replays:** stored as `seed + inputs + engine version`, not as frames, so they are cheap to share and re-render anywhere.

## 8. Transfers & economy

- **Global transfer market:** every human and AI club can list, bid and negotiate. AI clubs value players from ability, age, potential and contract.
- Anti-exploit rules: no transfers between linked accounts, a value floor on human-to-human deals, and transfer windows.
- Money sources: prize money, gate receipts (stadium × reputation), in-game sponsors. **Real money never converts into in-game money.**

## 9. Competitions

| Format | Notes |
|---|---|
| Knockout cup | Single or two-legged ties, extra time, penalties. Seeded or random draw. |
| League | Round-robin (single or double), points table, tiebreakers (GD, GF, H2H). Optional promotion/relegation between divisions. |
| Groups + Knockout | Group sizes of 3–6, top N advance, then a knockout bracket. |
| Swiss / Ladder | Pairs managers with similar records each round, or by Elo-like rating for an ongoing ladder. |

Organisers can set the entry rules (squad-rating cap, invite-only or public), the schedule (async kick-off times or live windows) and the prize, which is a trophy for the cabinet plus in-game money.

## 10. Social

- **Friends** and **private leagues/cups** that you join with a code.
- **Federations:** clan-like groups with a crest, roster and chat. They play federation-vs-federation events, where aggregate results across member matches decide the winner.
- **Co-managed clubs:** several users per club with roles. *Owner* controls finance and staff, *Manager* controls tactics and selection, *Coach* controls training, and *Scout* controls the transfer shortlist. Permissions are enforced on the server.
- **Chat and sharing:** league and federation chat, plus shareable match replays and highlight clips (the seed-based replay link).
- **Trophy cabinet and profile:** public manager profile with honours, records and win rate.

## 11. User-editable data

- Everything is fictional and generated by default.
- Users can rename and edit players, clubs, kits and crests in their **own** saves.
- **Edit packs** (Phase 4) let users share edit files. Moderation and reporting are required, and the platform never hosts real club logos or likenesses. A DMCA/takedown process is needed before launch. See the risks in §13.

## 12. Monetisation (free to play, never pay-to-win)

The ideas are ordered by how well they fit the game. All of them keep competition fair.

1. **Cosmetics store:** kit designs, crest frames, stadium skins, pitch themes (snow, retro, night), token styles, goal celebrations, commentary voice and text packs, manager avatar items.
2. **Season "Club Pass":** a free track plus a paid track of cosmetic rewards, unlocked by playing (matches, trophies, training streaks). Refreshed each real-world season.
3. **"Director" subscription (quality of life, not power):** cloud sync for offline careers, extra save slots, advanced analytics (heatmaps, pass networks, xG timelines, opponent scouting reports from public match data), longer replay history, more tactic preset slots, no ads.
4. **Tournament hosting tiers:** free hosting up to 16 clubs. Paid hosting adds 32–256 clubs, custom trophy art, branding, scheduling tools and a spectator/stream overlay. Targets creators, Discord communities and offices.
5. **Federation upgrades:** bigger member caps, custom federation trophies, federation-branded kits.
6. **Sponsored competitions and brand partnerships:** real brands sponsor cups (with sponsor boards and kit sleeve patches inside that cup) and provide real-world prizes. Requires legal review and age gating.
7. **Creator program / edit-pack marketplace:** curated cosmetic packs from creators with revenue share. Only original IP.
8. **Optional ads (free tier only):** rewarded ads for *cosmetic currency only*, plus non-intrusive placements on menus. Never during matches.
9. **B2B / white label:** run private competitions for schools, companies, betting-free fan communities and football-content creators.

**Hard rules:** no selling players, coins, training boosts, energy timers or anything else that changes results. Loot boxes are avoided entirely because of regulation in many countries.

## 13. Risks & open questions

- **Engine credibility:** results must *feel* like football (scorelines, xG, possession ranges). We calibrate against real-world distributions. See the engine tests.
- **Live-match scheduling** across time zones. Async mode is the fallback, and live mode is opt-in.
- **Cheating:** online matches are always simulated server-side, and the client is never trusted for results.
- **User-edited real names and logos:** IP exposure. Needs moderation, reporting and a takedown policy.
- **Co-managed clubs:** conflict resolution, such as an owner veto or a manager vote.
- **Retention without a match:** training, transfers, scouting and the social feed have to carry the days between fixtures.
