# Playing guide

## Training progress

Training → Plan and Development, plus Player → Attributes, show each player's progress **toward the next overall-rating point**. This measures current ability between the rounding boundaries of OVR; it updates when development runs at the end of a career week. It is not a timer or an estimate of remaining potential. The bar resets when OVR increases and can go backwards with decline. At 99 OVR it shows maximum OVR.

For example, a player at 50 OVR has a bar labelled “Toward 51 OVR”. A nearly full bar means current ability is near that threshold; it does not guarantee an improvement next week. Attributes can improve without changing rounded OVR. Review weekly/season changes and the coach's development report alongside it. Injured players do not train that week.

Player profiles list actual attribute changes to two decimal places since the season baseline (or since the player joined your club). These include development, experience and decline; they are not rounded match stats. The focused attribute also shows its decimal value and progress toward the next whole attribute point.

**Duration and waiting:** one training cycle takes **one career week**. Complete the current matchday or advance the week to resolve it; waiting in real time does not award player attribute gains. The timing panel names the week whose end will deliver the next update. Team/individual focus and mentoring repeat until changed and have no fixed finish date. Injuries pause development and position learning while recovery continues. Gains vary; no guaranteed countdown to the next rating is shown.

**Individual focus progress:** the personal focus bar appears under the focus selector in Player → Development and Training → Plan, and in the Attributes improvements section. It averages the focus’s **trainable** attributes and measures the decimal part toward the next whole average. For example, a defending-group average of 8.75 shows 75% toward focus level 9. Attributes outside the selected focus do not affect this bar. No personal focus means no personal-focus bar.

**Attribute focus progress:** the bar measures that attribute’s decimal part toward its next whole point. Vision 8.75 shows 75% toward 9. These progress percentages are independent of the OVR bar and are improvement measures, not elapsed session time. They reset at their next whole-point threshold. Team focus weights attributes ×2, personal focus ×2.5 and attribute focus ×4; these are distribution weights, not guaranteed gain multipliers. Age, coaching, facilities, personality, matches, intensity, injuries and development headroom determine the actual weekly gains.

**Match training:** selecting a preparation plan starts a **60-second real-time drill**, shown as an elapsed percentage and seconds remaining. The start timestamp is saved; the drill can finish while you are away. Changing plans restarts it. Re-selecting an active plan in the same week does not restart it. Start a fresh drill each career week. No match preparation means no drill. Existing saved preparation plans retain their ready status until changed.

Only a completed drill supplies the selected plan’s match bonuses. The match screen waits for readiness before creating its setup; you can choose **Play now without prep bonuses**. An already-started match retains its frozen preparation. Opposition analysis sharpens the report after the drill finishes; familiarity learning and attribute development are still applied at the weekly update. Choosing a preparation plan allocates 20% of that week’s development time even if you start the match before the drill finishes. The selected-plan card explains effects, timing, cost and opponent.

Position retraining has a separate **% learned** bar. Reaching 100% adds the position and ends the retraining assignment. The player profile estimates remaining training weeks using the current Decisions value and age; injuries delay that estimate. Young players and players with better Decisions learn faster. Choose team/individual focus, intensity, mentoring and facilities based on development needs, recent minutes and fitness.

## Choosing a fitness coach

Look at specialist skills before the overall rating:

| Information | How to use it |
|---|---|
| **Physical coaching (1–20)** | Helps development of trainable physical attributes, such as Pace, Stamina and Strength. The higher of your general coach's Physical skill and your fitness coach's Physical skill is used. Hiring below your general coach's skill does not improve this area. Natural Fitness is innate and is not trained. |
| **Recovery (1–20)** | Restores fitness between matches. Each point above/below 10 changes the weekly deficit-recovery rate by ±0.5 percentage points, subject to the 95% cap. Training intensity, the physio and a player's Natural Fitness also matter. |
| **Overall rating (1–20)** | A quick quality indicator used to generate specialist skills and determine wage demands; it is not an average recalculated from the skills. Compare the skills that affect the job. |
| **Wage and upfront cost** | Signing costs four weeks of the new coach's wages. Replacing an incumbent also costs eight weeks of the incumbent's wages. Staff wages are paid weekly. |
| **Work history** | Shows club, role, start and end season/week for appointments recorded in this career. It gives context and has no separate performance bonus. |

The Staff screen compares each fitness-coach candidate's skills with the incumbent. With a vacant fitness post, the physical baseline is your general coach and the recovery baseline is 10 (no specialist recovery bonus). A **physio** handles training-injury risk and early returns from injury; a fitness coach's Recovery skill is for ordinary fitness recovery.

Newly generated candidates may have no recorded previous jobs. Existing saves begin recording an incumbent's history at the season/week when this update first loads. Earlier employers and dates are not fabricated. Replacing, sacking and rehiring preserve recorded jobs.

## Following the match

Shirt numbers stay on the pitch tokens. **Player names** toggles surname labels; crowded labels are reduced, prioritising the ball carrier and selected player. The **On the ball** strip identifies the carrier by number, name and club. A free ball is marked as in flight/restart.

Tap a player on the pitch, or open **Identify players** and select a name, to highlight that player and see position, assigned role, energy, passes, shots and rating. The Ratings tab gives the fuller individual stat sheet. Tactics pitch circles and squad choices show shirt numbers, with OVR shown separately.

## Duration and frame rate

Matches use one steady normal pace: **90 regulation minutes = 7 real minutes of active playback**. There are no ×2/×3 controls. Added-time minutes, half-time, pauses and celebrations add elapsed time. Highlights skip sections and therefore take less time.

**30 fps / 60 fps** changes rendering, independently of the seven-minute game clock. Player animations have a 7 m/s top speed with gradual acceleration and turns; ball animation is capped at 26 m/s. The clock’s compression does not multiply these visual speeds. The presentation follows the simulated match with smoothing, so live events and statistics can lead the drawn positions. Highlight cuts and changes of ends reset the view. Pausing freezes movement. Selection uses the last painted player positions.

The default render target is 60 fps; 30 fps reduces rendering work. The live fps readout shows what the device achieves. Both targets produce the same seeded match results. Hidden tabs pause the match, preventing a large time jump when you return.

## Sliders

Tactical instructions, ticket price, budget allocation and loan wage contribution use a filled track, a current-value readout and −/+ buttons. Keyboard arrow keys work on the range input. Tactical sliders show five explicit levels and endpoint meanings; their hints explain the instruction and familiarity. Changes to budget allocation still require **Apply**.
