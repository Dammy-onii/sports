# Match engine audit — 11 October 2026

This is a review of the current implementation, not a change to match rules. Findings below distinguish confirmed code paths from balance concerns. Existing local changes were preserved.

## How a match runs

`game/setup.ts` repairs lineups, assigns roles and set-piece takers, applies tactical familiarity, cohesion and completed match preparation, and builds AI opponent plans. `game/engine/sim.ts` copies these into independent match state. The seed controls kickoff, team/player form, stoppage and subsequent random decisions. A matching setup, seed and command sequence reproduces the match.

Each simulation tick represents one game second. The engine advances a dead-ball restart, a ball flight, a loose-ball contest or a carrier's action. Formation and instructions set movement targets; players accelerate toward them, expend fitness, and accumulate distance and minutes. It then records analytics, updates emotions and runs management rules. Half-time and full-time wait until open play has no ball flight.

Canvas rendering is separate. Regulation playback advances approximately 12.86 game seconds per real second to fit 90 minutes into seven minutes. Presentation limits travel to 7 m/s for players and 26 m/s for the ball. This protects visible pace but can leave the displayed scene behind the authoritative action. Thirty or sixty render frames per second do not change the probabilities.

## Decisions and probabilities

Effective attributes combine energy, home advantage, match-day form, morale, position suitability, sharpness, tactical/role familiarity, shouts and emotions. Home players receive a 1.065 attribute multiplier. Fitness contributes a multiplier of `0.7 + 0.3 × energy`; technical confidence, nervous decision-making and frustrated tackling receive additional adjustments.

The carrier scores available shots, passes and carries by expected attacking threat and turnover cost. Vision affects which passes are noticed. Mentality and confidence influence risk appetite. Roles and personal instructions bias shooting, crossing, carrying and progressive passing. A softmax draw selects an option: good Decisions makes the selection more consistent, rather than eliminating randomness.

Pass probability depends on distance, passing, vision, pressure, blocked lanes and receiver marking. Long balls, crosses and through balls have separate modifiers. Failed passes may be read by an interceptor or become loose/out-of-play balls. Receiving adds control-versus-marking checks and heavy touches. Dribble contests compare dribbling, acceleration, pace, agility and flair against the defender's tackling and balance; probability is bounded between 15% and 75%.

Shots start with distance/angle quality and reductions for pressure, defenders in the shooting cone and crowding. Finishing or long shots, technique, composure and goalkeeper ability modify goal probability. Blocks are rolled separately. Recorded xG is the final goal probability including blocking, shooter and goalkeeper ability. It is therefore an internal expected-outcome measure, not a shooter-independent chance-quality statistic. Goals are resolved at shot launch and applied when the flight arrives.

Tackles use proximity, pressing, work rate and aggression instructions for attempts, then tackling/strength against dribbling/balance for success. Foul, card and injury checks depend on technique, aggression, frustration, fatigue and injury proneness. Offside detection is probabilistic. Stoppage is seeded before play rather than calculated from actual interruptions.

## Player behaviour

Players defend as a ball-oriented block, press in limited groups, mark goal-side, recover when caught upfield, offer short support, run behind, overlap and attack box positions. Roles change these behaviours. Receivers move toward the selected landing point. Loose balls attract the nearest player on each side.

Confidence, nerves and frustration respond to goals, misses, tackles, cards, talks and shouts. Determination, composure, temperament, sportsmanship and the strongest on-pitch leader shape reactions. Emotions settle each minute. Morale and rapport affect team talks; familiarity and sharpness influence execution. These systems are numerical state/rule models, not independently learning characters.

## Assistant, managers and staff

Assistant notes are threshold rules over fatigue, ratings, cards, emotions, chances, passing, score and tactical familiarity. Advice begins after eight elapsed game minutes. The UI re-evaluates approximately every two displayed minutes and after selected events. Assistant overall rating plus one fifth of analyst overall rating determines quality, capped at 20. Better quality reveals more notes and actionable advice. Advice only changes tactics when the user clicks its action.

AI managers prepare from their style, known formations, opponent strength and remembered tactics. During matches they review roughly every 6–16 minutes according to Adaptability, with earlier goal reactions. Tactical Knowledge gates some choices. Rules respond to red cards, score, xG imbalance, sterile possession and dangerous opponents. Substitutions use fixed minute windows and injury checks. Bench selection uses average attributes and position familiarity, rather than position-specific skill weighting.

General, fitness, goalkeeping and youth coaches chiefly affect development and readiness outside the match. They do not each run a separate live decision system. Skipping a live match enables generic AI on the user side; hired assistant quality is not passed into this management logic.

## Confirmed issues and inconsistencies

1. **Presentation can disagree with events.** Real-time travel follows simulation targets while authoritative play advances about 12.86 times faster. An action can resolve while its visual participants are still elsewhere. Reception additionally shifts a player's coordinates 70% toward the landing point. Smoothing alone cannot guarantee a coherent visible sequence.
2. **Pass completion is recorded too early.** `startPass` increments completed passes and pass-network links before arrival. Reception can subsequently be intercepted or mishandled without reversing completion. Passing percentages and networks therefore describe the initial roll rather than successful controlled receptions.
3. **Some reception branches move players twice.** Flight handling already calls `movePlayers`; heavy-touch and goalkeeper-claim branches call it again. Movement, fitness drain, distance, cooldowns and played seconds all advance twice. A seed-1234 probe found 44 player updates with more than one played-second increment in a single tick.
4. **Injury management overrides human control.** `aiManage` immediately substitutes injured players on either side, even during open play. When substitution fails it clears `injured` and the player continues. This prevents that match-state flag from retaining the knock, although the injury event remains recorded.
5. **Shouts can stack repeatedly.** No cooldown or same-shout guard prevents repeated commands from reapplying confidence/frustration changes. Encourage can repeatedly increase low morale. Active attribute multipliers do not stack, but emotional adjustments do.
6. **Two clock definitions coexist.** Assistant analysis, fatigue thresholds and emotion rules use raw tick time. Display and manager scheduling use half-relative `minuteOf`. First-half stoppage shifts raw thresholds earlier in the displayed second half. Managers are also scheduled by raw tick modulo 60, so named minute actions occur at an offset within that minute.
7. **Several stats need clearer meanings.** Team Tackles counts won duels, while player Tackles counts attempts. Possession credits the last possession side during dead balls and loose-ball periods. Ratings grant a team-result adjustment to every used player, including substituted players, and pass efficiency has no minimum sample requirement.
8. **Match-prep percentages are not uniform.** Corner modifiers are +12%/-12%; direct free-kick quality modifiers are +10%/-10%. These are intermediate quality multipliers, not guaranteed changes in goals. Copy describing all set pieces as 12% overstates uniformity.

## Verification and limits

The engine and presentation suites passed: 20 tests across two files, including deterministic replay, aggregate match realism, aggression/injury traits, highlights and frame-rate-independent outcomes.

A separate existing calibration script simulated 30 AI matches across four generated worlds. Averages were 2.37 goals, 23.50 shots, 8.70 shots on target, 2.28 xG, 1,080.10 passes, 78.8% reported completion, 45.40 won tackles, 18.67 fouls, 10.47 corners, 3.10 yellows and 0.13 reds per match. Home wins were 47%, draws 27%, average rating 6.40, injuries 0.57 per match and outfield distance 11.3 km per 90.

Low/mid/high aggression groups produced 0.565/0.814/1.122 fouls per 90. Injury-proneness groups produced 0.009/0.024/0.065 injuries per 90. These observations support the intended direction of trait effects, but a small uncontrolled sample cannot establish causal balance or real-world calibration. Benchmark labels in the script are repository targets, not independently verified current football data.

Recommended order: align visible action sequences with authoritative outcomes; correct reception accounting and double movement; make injury delegation explicit; bound repeated shout effects; unify clock use; then recalibrate probabilities, ratings and manager choices. Changing engine rules requires replay/version compatibility planning for existing live saves.
