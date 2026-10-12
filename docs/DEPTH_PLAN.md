# Depth plan: closing the gap with Football Manager

The second competitive review ([COMPETITIVE_REVIEW.md](./COMPETITIVE_REVIEW.md)) found twelve areas where Football Manager is still deeper than Touchline. Each one is designed here as a full mechanic, not a cosmetic version. The work is split into two phases.

- **Phase D1 (done):** match preparation, tactical familiarity and player development, plus the balance problems found in long-run testing (development inflation, money inflation, generous match ratings).
- **Phase D2 (core systems done; remaining gaps below):** a deeper match engine with 37 attributes and trainability, emotions in matches, AI managers who adapt, squad dynamics and conversations, and the calendar, club, analysis and media layers of the manager game.
- **Phase D3 (later):** contract depth, more competitions, match presentation.

Status key: ✅ done · 🟨 in progress · ⬜ not started

---

## Phase D1

### 1. Player development ✅

**Goal:** players grow, peak and decline the way real footballers do. Growth depends on who they are and how they're handled, so managing young players is a real skill.

**Ability scale.** Current ability (CA) is the position-weighted attribute average × 10, on a scale of 10–200. Potential ability (PA) is the ceiling. Development moves CA toward PA. Most players never quite reach it.

**Weekly growth.** Each week a player gains `G` CA points:

```
G = ageBase(age) × room × personality × experience × training × facilities × variance
```

| Driver | Range | Notes |
|---|---|---|
| Age base | 0.38/wk at 17 → 0 at 28 | Most growth happens from 16 to 21. It slows to almost nothing by 26 to 27. |
| Room | `clamp((PA − CA) / 30, 0.1, 1.3)` | Growth slows as the player nears his ceiling. |
| Professionalism | × 0.55 – 1.45 | The strongest personality driver, as in FM. |
| Determination | × 0.85 – 1.15 | Also speeds the bounce-back from long injuries. |
| Ambition | × 0.92 – 1.08 | Also affects transfer interest and wage demands. |
| Match experience | × 0.75 – 1.35 | His share of recent minutes. Top-division football counts ×1.08. Good form (rating ≥ 7.2) ×1.08, poor form ×0.95. |
| Coaching | × 0.7 – 1.3 per attribute group | The first-team coach's skill in that area: attacking, defending, technical, tactical, physical or goalkeeping. |
| Training facilities | × 0.88 – 1.12 | Club facility level 1–5, which can be upgraded. |
| Youth facilities | × 0.95 – 1.15 | Applies up to age 18 only (academy level). |
| Intensity | × 0.75 / 1 / 1.2 | Light, normal or intense, traded against recovery and injury risk. |
| Match preparation | × 0.8 | Applies when the week includes match-specific preparation (§3). |
| Variance | weekly × 0.6 – 1.4 · season trajectory × 0.75 – 1.25 | Late bloomers and players who stall happen. |

**Where the growth goes.** The CA gain is spread across attributes using these weights:
- How much his position needs each attribute.
- The team training focus (×2) and his individual focus (×2.5).
- The coach's skill in each area.
- His age: physical attributes grow mostly up to 23, technical up to 26, mental up to 30.

The increments are then scaled so the position-weighted CA rises by exactly `G`.

**Experience.** From 24 to 31, players with regular minutes keep gaining decisions, composure and positioning slowly, even after their ceiling is reached.

**Decline.** It starts by attribute class: physical at 29, technical at 31, mental at 33. Goalkeepers start 3 years later. The rate grows each year past the onset age. High professionalism slows decline (× 0.6), and injury proneness speeds it up.

**Injuries.** No growth while injured. After a long injury (8+ weeks) there's a chance of losing a little pace or stamina permanently. Very long injuries (12+ weeks) can reduce PA. High determination halves both risks.

**Mentoring.** A senior player passes on composure, decisions and positioning. His professionalism and determination slowly rub off on the youngster's personality (FM's "personality transfer").

**Breakthroughs.** Rarely, a young player with good professionalism and minutes makes a breakthrough: a sudden jump in growth that week, announced in the inbox.

**Who sees what.**
- Your own players' potential appears as a star range. It's as narrow as your coach is good at judging potential.
- Other clubs' players keep their scouting-based ranges.
- Personality (professionalism, determination, ambition) is hidden until scouted. It's always known for your own players.

**History.**
- Every player keeps a season-by-season career record: club, age, appearances, goals, assists, average rating, OVR.
- Your squad also keeps a weekly ability log for the development chart, plus a start-of-season attribute snapshot so the profile can show ↑/↓ changes.
- Every 4 weeks the coach files a development report: who is progressing, who is stalling and why (no minutes, low professionalism, injury), and how close prospects are to their ceiling.

**Calibration targets.**

| Age | Average OVR change per season |
|---|---|
| 16–18 | +4 to +5 |
| 19–21 | about +3 |
| 22–23 | about +2 |
| 24–26 | about +0.5 |
| 27–29 | about 0 |
| 30–31 | about −1 |
| 32–33 | about −2 |
| 34+ | about −3 |

Over five seasons, the median club's best-XI OVR should stay within ±2 of where it started.

**Measured** (`scripts/longrun.ts`, 7 seasons, seeds 7 and 21):

| Age | OVR change per season |
|---|---|
| 16–18 | +4.0 to +4.8 |
| 19–21 | +1.6 to +3.0 |
| 22–23 | +0.4 to +1.7 |
| 24–26 | +0.2 to +0.5 |
| 27–29 | −0.1 |
| 30–31 | −0.7 to −1.6 |
| 32–33 | −1.5 to −3.5 |
| 34+ | −2.5 to −7 |

The median best-XI OVR moved from 59.5 to 61.7 (seed 7) and from 58.4 to 61.3 (seed 21), staying between about 60 and 61.5 from season 2. This is close to the ±2 target, with a slight upward creep. Growth at 19–23 ends up below the targets above. That is the price of a stable world: potential is now centred on each club's current standard (generation and youth intake), and the trade-off can be tuned in `game/youth.ts` and `game/development.ts`.

The Training Plan and Development tables now show progress toward the next OVR rounding boundary, based on current ability. It updates weekly and resets on a rating increase; it does not measure hidden potential or guarantee future growth. Player → Attributes contains the improvements summary. The personal-focus bar measures the average of its trainable attributes; attribute-focus progress measures the single attribute’s fractional point. Both update with weekly development. Retraining has a separate percentage bar and estimated remaining training weeks. Match training has a saved 60-second drill countdown and gates preparation bonuses on completion; it also exposes the next fixture, costs and effect timing.

*Code:* `game/development.ts` (model), `game/training.ts` (weekly loop), `game/progress.ts` (log, career history, coach's report, perceived potential), Training → Development and Player → Development / Career in the UI.

### 2. Tactical familiarity ✅

**Goal:** a tactic is something a squad learns. Switching systems has a cost. A new signing needs time in his role. Sticking with a well-drilled system pays off.

**What the club tracks** (0–100 each):
- **Formations:** familiarity with each formation it has used.
- **Instructions:** familiarity with each level (1–5) of each of the six team instructions. Drilling one level also teaches its neighbours at half the rate.

**What each player tracks:** role experience (0–100) for each role he has played. New and generated players start with experience that fits their age and position.

**The team score.** Overall familiarity weights the formation at 35%, the six current instruction levels at 35%, and the average role experience of the XI in their current roles at 30%.

**How it grows each week.**
- **Matches:** the formation and instruction levels used gain +6 and +5. Each player gains role experience in proportion to his minutes, faster for players with good decisions.
- **Training:** a tactical team focus, or "Tactical familiarity" match preparation, gains +4 to +7. The coach's tactical skill scales it (× 0.6 – 1.4).
- **Decay:** anything unused loses 1 to 1.5 a week. Anything once learned never drops below 25.

**Effect in matches.**
- **Team familiarity `f`:**
  - Decisions, positioning, marking and vision play at × (0.9 + 0.1·f).
  - Defensive shape loosens: players drift from their spots by up to 3% of the pitch.
  - High-pressing teams commit fewer extra pressers.
  - A high line mistimes its offside trap more often.
- **Role experience `r`:** a role's effects (runs, width, carries, playmaking…) apply at × (0.4 + 0.6·r). An unfamiliar inverted full-back half-inverts.
- **Mid-match changes:** the team's familiarity is recalculated whenever the formation, instructions or roles change. Switching to an unfamiliar shape at 70′ has a real cost.

**Shown in the game:**
- **Tactics:**
  - An overall familiarity meter with a breakdown by formation, each instruction and roles.
  - Familiarity on every formation button and slider.
  - Each player's experience in the role you pick.
- **Matches:** the in-match formation buttons show familiarity.
- **Match preparation:** squad readiness includes familiarity.

**AI clubs** start with high familiarity in their main formation and learn the same way.

**Measured effect:** a side at 95% familiarity averaged +0.45 goal difference and 1.59 points per match against average opposition; the same side at 15% averaged −0.07 and 1.34. That is about the size of home advantage. At 70% (competent) the cost is almost nothing.

*Code:* `game/familiarity.ts`, engine hooks in `game/engine/sim.ts` (`refreshTeam`, `eff`, defensive shape, pressing), Tactics → Familiarity and the in-match tactics panel in the UI.

### 3. Match preparation ✅

**Goal:** the days before a match matter. You study the opponent, plan for them, and train for the specific game.

**Opposition report** (a new Match preparation screen):
- **Opponent form:** last five results, league position, goals for and against, home/away record.
- **Predicted line-up** on a pitch, with their likely formation and style (mentality, pressing, line, tempo, passing, width). A poor assistant or analyst only gives ranges or "unclear"; a good one is exact.
- **Strengths and weaknesses,** derived from their players and tactic. Examples: "Quick wingers (LW pace 16)", "Slow centre-backs playing a high line: vulnerable in behind", "Weak in the air", "Poor passers at the back: press them".
- **Key players:** their three most dangerous, with key attributes as scouted ranges. Preparing the report adds scouting knowledge of their XI.
- **Assistant recommendations:** concrete advice tied to the weaknesses, e.g. "Press high: their centre-backs average 8 for passing", "Mark Okoro tightly", "Play balls in behind their slow line".

**Opposition instructions** (per opposing player, for this match):
- **Tight marking:** the nearest suitable defender shadows him when he's in your half.
- **Closing down (more / less):** more means he's pressed whenever he has the ball, with an extra presser joining.
- **Tackling (harder / softer):** harder means more tackle attempts and better odds against him, but more fouls and cards.

How well these work scales with the opposition-analysis match preparation (below).

**Player instructions** (per position slot, kept with your tactic):

| Instruction | Options | Engine effect |
|---|---|---|
| Shooting | Less / More | Shot preference × 0.65 / × 1.35 |
| Dribbling | Less / More | Carry and take-on preference × 0.6 / × 1.4 |
| Passing | Shorter / More direct | Long-pass preference for this player |
| Crossing | Less / More | Cross preference × 0.6 / × 1.5 |
| Forward runs | Hold position / Get further forward | Run frequency and attacking position shift |
| Width | Narrower / Wider | Tuck in or hug the touchline when attacking |
| Closing down | Less / More | Pressing radius ±4 m, pressing trigger |
| Tackling | Ease off / Harder | Tackle attempts, win chance, foul risk |
| Marking | Mark tighter | Stronger pull toward the nearest attacker |
| Roam | Roam from position | More freedom to find space |

Player and opposition instructions can also be changed during a match.

**Match training focus** (set for the week before a match; it costs some development time, × 0.8 growth):

| Focus | Effect this match |
|---|---|
| Tactical familiarity | +7 to the current formation and instruction levels; role experience for the XI |
| Attacking set pieces | +12% effectiveness on your corners and free kicks |
| Defending set pieces | −12% effectiveness on theirs |
| Opposition analysis | Opposition instructions work 30% better; the report is more accurate |

**Pre-match team talk:** given before kick-off, using the same reaction model as the half-time talk. Big matches (derbies, cup ties, top of the table) magnify reactions.

**Squad readiness:** fitness, morale and familiarity for your XI. The assistant suggests resting tired regulars and points out unfamiliar roles.

**AI managers** apply sensible opposition instructions too: tight marking on the opponent's best attacker, pressing weak passers. Their reliability depends on club reputation.

*Code:* `game/prep.ts` (report, recommendations, readiness), `game/setup.ts` (AI opposition instructions, preparation effects), `game/roles.ts` (`effectiveRole`: role familiarity + player instructions), engine commands `pi` / `oi` / pre-match `teamTalk`, the Match prep screen, the Tactics slot panel and the in-match tactics panel in the UI.

### 4. Balance fixes ✅

Found by `scripts/longrun.ts`, which plays whole careers and reports the numbers that drift.

| Problem | Before | Fix |
|---|---|---|
| Development inflation | Under-19s +16 OVR in one season; best player 73 → 96 in three seasons | §1 above |
| Money inflation | Every club gains every season (top-division median £10m → £29m in 3 seasons) | Weekly operating costs scale with reputation and facilities; wages rise with division and reputation; AI clubs reinvest surplus in transfers |
| Generous ratings | Season-average max 9.4; 19 players averaging 8+ | Ratings compress above 7.0 and below 6.0 |
| Thin AI squads | Squads fell to 13 players; a side with too few players crashed the corner routine | AI clubs promote youth players to keep 18–20; the user's club gets emergency call-ups when it can't field 13 fit players; corners cope with depleted sides |

**After the fixes** (7 seasons, two seeds):
- **Money:** each division's median season result stays within about ±£1m. Individual clubs range from about −£6m to +£7m depending on results and transfers. Clubs in debt sell first, and clubs with spare money buy.
- **Ratings:** season-average median 6.5, p90 7.2, best about 8.2–8.9, with 1–9 players averaging 8+.

---

## Phase D2

Requested after the third review: deeper match engine and attributes, emotional players, AI managers who adapt, squad dynamics and conversations, and the calendar, club, analysis and media layers of the manager game.

### 5. Attributes and match engine depth ✅

**37 attributes** (from 16), on the familiar 1–20 scale:

| Technical | Mental | Physical | Goalkeeping |
|---|---|---|---|
| Crossing, Dribbling, Finishing, First touch, Free kicks, Heading, Long shots, Marking, Passing, Penalties, Tackling, Technique | Anticipation, Bravery, Composure, Concentration, Decisions, Flair, Leadership, Off the ball, Positioning, Teamwork, Vision, Work rate | Acceleration, Agility, Balance, Jumping reach, Natural fitness, Pace, Stamina, Strength | Reflexes, Handling, One-on-ones, Aerial reach, Kicking |

**Trainability:**
- **Trainable** (all technical, physical except natural fitness, all goalkeeping, and the tactical mentals: positioning, decisions, teamwork, off the ball, work rate, anticipation, vision): they grow through training. Team focus, individual focus and a single-attribute individual focus all target them.
- **Experience** (composure, concentration, bravery, leadership): not trained. They grow with match minutes, age and mentoring, and big-match experience adds composure.
- **Innate** (flair, natural fitness): set at birth. Flair never changes; natural fitness only declines with age.

**What each new attribute does in the engine:**

| Attribute | Effect |
|---|---|
| Acceleration | How fast a player reaches top speed. Players now carry momentum, so pace is top speed and acceleration is the first few strides. |
| Agility | Beating a man; keeper reactions |
| Balance | Staying on the ball in duels; riding challenges |
| Jumping reach | Aerial duels together with heading, strength and bravery |
| Natural fitness | Weekly recovery; slower physical decline; a little less energy drain |
| First touch | Controlling passes under pressure (a heavy touch loses the ball); how quickly he can play the next ball |
| Technique | Executing difficult passes, crosses and shots cleanly |
| Crossing | Cross accuracy (it used to be passing) and corner delivery |
| Free kicks | Direct free-kick quality; the default free-kick taker |
| Penalties | Penalty conversion; the default penalty taker |
| Anticipation | Reading misplaced passes and interceptions; reacting to loose balls |
| Off the ball | Timing runs against the offside line; finding space for team-mates |
| Teamwork | Holding the shape; how many players press together; learning familiarity |
| Bravery | Contesting headers; blocking shots |
| Concentration | Fewer lapses late in games and when tired (marking, passing errors) |
| Flair | Trying the unexpected: take-ons, through balls and shots others wouldn't |
| Leadership | Steadies team-mates' emotions; a captain's influence |
| Reflexes / handling / one-on-ones / aerial reach / kicking | Shot-stopping; holding rather than parrying into danger; one-on-one duels; claiming crosses and corners; distribution |

**Ratings:** OVR still comes from position-weighted attributes. The weights are rebalanced so existing players keep about the same OVR after migration.

**Measured** (`npm run calibrate`, 2-division worlds): 2.86 goals, 2.94 xG and 25.5 shots per match, 48% home wins, 25% draws, average rating 6.68. Red cards are about 0.22 per match, still above the real ~0.15. Per-tick attribute caching and a cheaper distance function cut a match from 307 ms to 212 ms.

*Code:* `game/constants.ts` (groups, labels, `TRAINABILITY`), `game/generate.ts` (`rollAttributes`), `game/development.ts`, `game/engine/sim.ts`, save v8 migration in `game/migrate.ts`.

### 6. Emotions in matches ✅

Every player carries three emotional values through a match:
- **Confidence** (−1 to +1).
- **Nerves** (0 to 1).
- **Frustration** (0 to 1).

**What moves them** (weighted by personality):
- Scoring, assisting or a big save lift confidence.
- Missing a sitter, a mistake that leads to a goal, or being dribbled past lowers it.
- Big occasions, away crowds and low *pressure* (a new hidden trait) raise nerves.
- Fouls suffered, losing late, being booked and decisions going against him build frustration. *Temperament* (aggression) and *sportsmanship* shape how much.
- Team-mates conceding or scoring spread emotion through the side. Captains and high-leadership players damp it down.
- Team talks and shouts move it, as do substitutions: a player taken off early sulks.

**What they change:**
- Confident players play their technical game better and take more risks: they shoot, dribble and try killer passes.
- Nervous players lose composure and decisions.
- Frustrated players foul more, go in recklessly, risk red cards and argue.

**Visible reactions:**
- The commentary shows them: "Okoro is buzzing after that goal", "Santos slams the turf in frustration", "the young keeper looks rattled".
- An emotion marker appears next to each player in the ratings panel, and the assistant comments on emotions.
- After the match, emotions turn into morale changes and post-match reactions: anger at being subbed, pride after a big win.

*Built as planned.* Confidence effects are deliberately soft: the first version snowballed (a scorer kept scoring) and pushed goals to 3.3 per match. *Code:* `feel`, `teamFeel`, `initialEmotions`, `emotionMinute` and `emotionLabel` in `game/engine/sim.ts`.

### 7. AI managers who adapt ✅

- **A manager for every AI club:** a name, a style (attacking, possession, counter, defensive, pressing), adaptability (1–20), tactical knowledge (1–20), two or three preferred formations, and patience.
- **Before the match:** the manager weighs both teams' strength, home or away, the occasion and the opponent's weaknesses, the same analysis as your opposition report. He picks a formation and instructions to suit:
  - Underdogs away sit deep and counter.
  - Favourites press.
  - Against slow centre-backs he plays balls in behind.
  - Against a high press he goes direct.
  - Against the user, he remembers their system from the last meeting.
- **During the match**, every few minutes:
  - He reads the score, the xG flow, possession, fatigue and red cards.
  - He responds to the user's changes. If the user goes all out attack, he drops deeper and counters.
  - He changes shape to a formation he knows when chasing or protecting a lead.
  - He puts tight marking on a player who is hurting him.
  - The better his tactical knowledge, the better the change. Adaptability sets how often he reacts.
- **Between matches:** he rotates tired players, plays youngsters in early cup rounds, and gets sacked after a poor run, to be replaced by a new manager with a different style.

*Tuning note:* strong pre-match plans inflated goals and favourite wins, because the engine punished deep blocks. Defending was fixed so that everyone closes down near the box, compactness follows mentality and crowded shots lose quality. Plans are now moderate: instruction values stay within 2–4, the manager makes one read of the opponent, and underdogs keep their mentality. The match-prep report shows the opposing manager's style and, with a good analyst, the reasoning behind his plan. *Code:* `game/managers.ts`, `aiReview` / `aiSubs` in `game/engine/sim.ts`, `planFor` in `game/setup.ts`.

### 8. Squad dynamics and conversations ✅

**Personality additions:**
- *Pressure* (big-match temperament).
- *Loyalty* (wage demands, desire to stay).
- *Adaptability* (settling after a transfer: new signings start unsettled).
- *Sportsmanship*.

**Hierarchy:** each player has influence (0–100) from status, tenure, age, leadership, reputation and quality. That sorts the squad into tiers: team leaders, highly influential, influential, others.

**Social groups:** players cluster by nationality, age bracket and tenure. Each group's mood is the influence-weighted mood of its members. An unhappy leader drags his group down; a happy core lifts it.

**Team cohesion** (0–100) grows with weeks of a stable squad and playing time together, and drops with mass signings or departures. In matches it improves link-up: short passes and support runs.

**Manager rapport:** each player has a relationship with you (0–100). It is built or broken by conversations, promises, playing time and how you treat his friends.

**Talking to players:**
- Praise or criticise form.
- Praise or criticise training (a weekly training rating per player).
- Discuss playing time.
- Warn about conduct after cards.
- Reassure after a poor run.
- Fire up before a big match.
- Discuss the future (ambitious players).

Reactions depend on personality, form, status, rapport and how often you've done it. The outcomes are delighted, motivated, accepting, indifferent, unhappy or angry. They change morale and rapport, and spread through social groups if he's influential.

**Players come to you:** complaints about playing time, wanting a new contract, upset at being criticised, unsettled by a bid, homesick. Each comes with three responses.

**Team meetings:** praise the squad, demand more, discuss the league position or the next match. The effect depends on results and the squad's mood. Too many lose impact.

**A dynamics screen** shows the hierarchy, groups, cohesion, happiness and the players you need to talk to.

*Built:* 9 conversation topics (from the player profile), 4 team meetings, and player requests about playing time, contracts, bids and settling in (homesickness is covered by settling in). A request ignored for three weeks costs morale and rapport. *Code:* `game/dynamics.ts`, `components/TalkDialog.tsx`, `components/screens/DynamicsScreen.tsx`.

### 9. Calendar: pre-season, friendlies, sharpness, international breaks ✅

- **Match sharpness** (0–100) is separate from fitness. It drops when a player isn't playing and rises with minutes, friendlies and match-prep training. It affects technique and decisions in matches by about ±6%.
- **Pre-season:** four weeks before each season:
  - Friendlies: you pick the opponent (stronger or weaker) and home or away.
  - A training camp: costs money, raises familiarity and cohesion.
  - Rest weeks.
  - Players come back from the summer with low sharpness.
- **International breaks:** two per season. The best players are called up by nationality and quality. They miss the break's training, come back tired, with some injury risk and a morale boost. You can arrange a friendly for the players who stay.

*Built*, except the friendly during international breaks (⬜). Those weeks are training-only for now. Pre-season and international weeks have no operating costs (wages are still paid). Without that change, the six extra weeks cost every top-division club about £1.5–2m a season. *Code:* `game/calendar.ts`, `buildCalendar` in `game/cup.ts`, `components/PreseasonCard.tsx`.

### 10. Clubs: stadium, budgets, board requests, staff ✅

- **Stadium:**
  - Capacity and ticket price.
  - Attendance from reputation, form, league position, opponent, derbies and price.
  - Gate income from the number of fans who actually come.
  - Expansion projects that take weeks and cost money.
- **Budgets:** the board sets a transfer budget each season, separate from the club balance, alongside the wage budget. You can rebalance between the two.
- **Board requests:** more transfer or wage budget, facility upgrades paid by the board, stadium expansion, a better youth setup. The answer depends on confidence, finances and how often you've asked. Asking too often costs confidence.
- **More staff posts:** goalkeeping coach (keeper training), fitness coach (physical training and recovery), data analyst (opposition reports and assistant insight), youth coach (academy development).
- **Fitness-coach selection:** Physical coaching and Recovery are separate 1–20 skills, with overall rating, wage/upfront cost and real appointment history shown on Staff. Physical coaching uses the better of the fitness specialist and general coach. Recovery changes the weekly fitness-deficit recovery rate by `(skill − 10) × 0.005`, capped with other contributions at 95%. Existing saves retain their old rating-based effects through skill backfills. Work history is recorded from appointments and has no gameplay multiplier; no past employers are invented.

**Measured** (`scripts/longrun.ts`, 5 seasons, seeds 7 and 21): the median club's result each season is between −£0.9m and +£1.0m in both divisions, apart from one −£1.5m season on seed 21. Individual clubs range from −£6m to +£8.5m. The median best-XI OVR goes from 57.6 to 60.3 (seed 7) and from 58.7 to 62.2 (seed 21), the same creep as after Phase D1. *Code:* `game/club.ts` (stadium, budgets, `askBoard`), `game/economy.ts`, `components/ClubOps.tsx`.

### 11. Analysis ✅

- **Season analytics hub:**
  - Per-match xG for and against, shots, possession and points trend.
  - Goals by period and source: open play, set piece, penalty.
  - Home/away splits.
  - A shot map from your recent matches.
- **League comparison:** your team's per-match averages as percentiles against every team in the division. Every fixture now stores team stats.
- **Player analytics:** per-90 output as percentiles against players in the same position group, plus a scatter view of the league.

*Built:* team trends, xG per match, goals by period and source, shot map, league percentile ranks, xG-difference table and player percentiles. Not yet: home/away splits in the UI (the data is recorded) and the league scatter view (⬜). Key passes now count only passes that lead directly to a shot; they used to count any completed pass into the final third. *Code:* `game/analytics.ts`, `components/screens/AnalyticsScreen.tsx`.

### 12. Media ✅

- **Press conferences:** before and after matches, with three contextual questions (form, opponent, a player, a rumour). Answers affect named players' morale, the squad, the board, the supporters and the rival manager (mind games). You can delegate them to your assistant.
- **News:**
  - Streaks.
  - Milestones (100 appearances, a first goal).
  - Transfer rumours.
  - Rivalries.
  - Managerial sackings.
- **Awards:** player and manager of the month; at season end, player of the season, young player, golden boot, golden glove and team of the season.

*Built as planned.* An unanswered press conference is delegated to the assistant when the next week starts. Pre-match press happens before big matches and otherwise every third week. *Code:* `game/media.ts`, `components/screens/MediaScreen.tsx`.

## Phase D3

- **Contract depth:** release clauses, bonuses, agents, rounds of negotiation, registration rules.
- **More competitions:** a third division, a continental cup, internationals as playable matches.
- **Match presentation:** replays, camera, shareable clips.

## Data model changes (save v7, Phase D1)

- **`Player.traits`:**
  - Gains `professionalism`, `determination` and `ambition`.
  - Gains `roleExp`: experience per role.
  - Gains `history`: one career-record entry per season.
- **`Club`:**
  - Gains `facilities.training` (level 1–5).
  - Gains `familiarity`: formation and instruction-level tables.
- **`StaffMember.skills`:** coaching areas plus judging potential, for coaches and assistants.
- **`Tactics.playerInstructions`:** one entry per slot.
- **`SaveGame` gains:**
  - `prep`: opposition instructions and match training focus for the next fixture.
  - `dev`: the weekly ability log and season-start attributes for your squad.
- **`MatchSetup` teams carry:**
  - familiarity tables;
  - player and opposition instructions;
  - preparation bonuses.

  These changes can be made during a match through the new `pi` and `oi` commands.
- **Migration from v6:**
  - Backfills personalities and role experience deterministically from player ids.
  - Seeds club familiarity from the current formation.
  - Gives staff skills around their rating.
  - Drops any in-progress live match, because the new engine would replay it differently.
