# V10 — Grand Prix

Version **1.6.0**.

A local browser game with top-down V10 racing, 22 cars, five tyre types, dynamic weather, qualifying and a saved career. Requires Node.js 18 or newer; no dependency installation is needed.

## Play

```sh
npm run dev
```

Open http://127.0.0.1:5173. Use `PORT=5174 npm run dev` for a separate preview/save. Career data is stored in browser localStorage, scoped to host and port.

| Control               | Action                                                   |
| --------------------- | -------------------------------------------------------- |
| W / Up                | Accelerate                                               |
| S / Down              | Brake                                                    |
| A / D or Left / Right | Steer                                                    |
| B                     | Request/cancel a pit stop, including in qualifying       |
| P                     | In manual limiter mode, toggle the 80 km/h limiter                               |
| R                     | Reverse in the pit lane if you overshoot the box         |
| 1 / 2 / 3 / 4 / 5     | Next compound: soft / medium / hard / intermediate / wet |
| F                     | Pace left: Push → Balanced → Save (stops at Save)         |
| G                     | Pace right: Save → Balanced → Push (stops at Push)        |
| M                     | Toggle circuit overview                                  |
| T                     | Cycle next pit compound (S/M/H/I/W)                       |
| Escape                | Pause / resume                                           |

Touch pedals, steering and reverse are available on touch devices. Sound is opt-in. Switching away from the browser pauses the game.

## Driving and strategy

Power builds progressively toward a 330 km/h balanced-package ceiling. Steering and sliding reduce acceleration and scrub speed; a clean corner exit helps carry momentum onto the straight. A controlled low-fuel acceleration test takes approximately nine seconds to reach 330. Career starter cars are slower; upgrades improve power, grip, tyre conservation and service time. Wider red-and-white inside kerbs identify corner apexes. The track has no painted centre line or driving-line assist.

Soft tyres are fastest but last roughly 9 race laps; mediums 13; hards 19. Actual life depends on driving, upgrades and water. Out laps and pit travel are gentler on tyres. A complete dry qualifying outing generally leaves about 80–85% soft condition, allowing the same physical set to be used for another session.

Fuel is expressed in fuel laps. Balanced driving uses approximately 1.1 per circuit lap. Save reduces pace, fuel use and wear; push trades resources for speed. Fuel weight reduces pace. There is no battery or race refuelling.

Dry races require two different dry compounds. Using intermediate or wet tyres waives that requirement. Qualifying compounds do not count toward race tyre usage.

## Weather

Quick race offers Varied weather, Changeable showers, Light rain (intermediate conditions), Sustained rain, Wet start → drying, Rain arriving later and Dry. Front timing, intensity and duration are generated once per event from a weather seed and saved with the weekend; different races get different forecasts. Quick Race shows the actual starting conditions before tyre selection, and starting the race uses that same forecast. Rain spells last several minutes, with duration also reflecting race length. Lighter rain can sustain intermediate conditions instead of inevitably saturating the circuit. Changeable fronts can strengthen, clear or return after a dry spell. Career rounds include the new weather types. Each Grand Prix receives a different forecast from qualifying while retaining current rainfall, surface water and tyre condition. Forecast, rainfall, track wetness and penalties appear in the HUD. The scrolling six-minute timebar and AI tyre forecasts use the same rainfall and runoff model as live physics. Older saves preserve their current surface and rain when migrating to the new weather model.

Rain adds water to 32 track sectors. Different drainage rates and a drying racing line affect local grip. Rain stops before the road becomes dry: water disappears gradually. Slicks lose grip in rain; intermediates are best in damp conditions; wets are best in deeper water. Intermediates and wets wear faster on a drying road. AI drivers react to crossover conditions and retain the same finite inventory as the player.

Weather uses deterministic evolving profiles rather than external weather data. It is an arcade water/grip model, with rendered wet asphalt and rain, not a full fluid simulation.

## Pit stops

Request a stop before crossing the pit-entry point. A late request waits for the next lap rather than teleporting back to entry. Steering through the lane is assisted; the player controls acceleration, braking and reverse.

The highlighted outline marks your team's pit box. Brake to a full stop inside it to begin service. Passing over the box at speed does **not** start the stop. If you miss it, brake and hold R to reverse. You cannot exit the lane without service, and throttle/reverse are ignored until the tyre change finishes. Team boxes are spaced along the lane, with cars moving into an outside bay to stop. A busy teammate's box delays service.

P enables the 80 km/h limiter. Speeding incurs five seconds, served during the stop. Tyre service is random between 2.3 and 5.5 seconds. Each crew upgrade lowers the maximum by 0.5 seconds, to 3.5 seconds at level four; the minimum stays 2.3 seconds. Penalty service is additional. Pit loss includes lane travel, your braking and service. Race stops mount an actual available tyre set without refreshing its wear. Qualifying stops also refuel to a new outing load.

## Track limits and contact

Leaving the circuit triggers a warning once per continuous excursion; returning fully to the track rearms detection. Three warnings are allowed. The fourth infringement adds five seconds; another four infringements add another five. Qualifying excursions delete the affected flying lap. The HUD shows warnings and total penalty seconds, with engineer messages for each incident.

AI commits to one target and side for an overtake, follows slower traffic when both lanes are occupied, and waits for space before merging back. Steering is damped and follows the racing line without time-based wandering. Oriented car bounds resolve overlaps gradually while retaining AI position/offset changes, instead of snapping cars back to the centreline. Damage and punctures are not yet simulated.

## Career and weekends

Name your driver and choose one of 11 teams. Every team starts with £7,000 and a slower development car. Sign one sponsor per race, earn position money and upgrade your car. The top ten score 25/18/15/12/10/8/6/4/2/1. A 12-round season visits every circuit once and pays an additional £150 per season point.

Career race distance is fixed by the weekend, not selected by the player:

| Weekend | Circuit | Laps | Weather |
| --- | --- | --- | --- |
| Northline Opener | Northline Motor Park | 24 | Showers |
| Velocity Trophy | Velocity International | 24 | Wet → dry |
| Sunset Grand Prix | Sunset Speedway | 20 | Dry |
| Harbour Sprint | Harbour Street Circuit | 14 | Late rain |
| Crossover Challenge | Crossover Park | 24 | Showers |
| Alpine Finale | Alpine Ridge | 24 | Late rain |

The quick-race circuit selector offers all 12 circuits. Existing active weekends retain their saved track (older weekends remain at Northline). New career weekends use the varied calendar. Reset career clears identity, cash, upgrades, sponsor, points, history and the active weekend after confirmation.

Each career round requires Q1 → Q2 → Q3 knockouts: 22 → 16 → 10 cars. Stage clocks are 18, 15 and 13 minutes; best times reset between stages. Grid positions 17–22 come from Q1, 11–16 from Q2, and 1–10 from Q3. Equal times favour the earlier lap. All cars start in their pit garages. Press W / ↑ to leave whenever you choose; AI drivers leave at independently random times and wait again after each run. Each outing includes an out lap, one timed lap and an in lap. Additional laps cannot count until you return to your box and complete service. Fuel covers those three laps in Push mode, including the pit detour. Service refuels the car; a tyre change is optional and KEEP FITTED is the default. Actual set wear and distance persist. After service, release the throttle and press forward again to leave. You can finish the run early or end the stage to simulate the remainder. Eliminated players can simulate the remaining qualifying. No valid time means the back of that stage; the prototype allows a race start rather than modelling stewards' 107% waivers. Inter-session waiting breaks are skipped.

The playable weekend pool is deliberately limited: two general-use Softs (S1–S2), one Medium (M1), one Hard (H1), two Intermediates (I1–I2) and one Wet (W1), plus a Soft (S3) reserved for Q3. Q3 participants return S3 afterwards; eliminated drivers retain it for the race. Unissued historical sets remain marked as returned for save compatibility. Older Soft IDs are relabelled consecutively without changing their wear, distance or eligibility; saved selections follow the same physical set. Older weekends keep selected and used sets within the same compound quotas for every driver; excess stock is returned while its wear/history remains saved. Every physical set stores wear, distance and used status. Starting set choice is free among remaining sets. The pit selector chooses exact sets; compound keys choose the freshest available set of that type.

Quick-race and career setup both show estimated tyre life at Balanced pace in suitable conditions, including upgrades and the selected physical set's remaining wear. Heat, sliding and other driving modes change the actual distance. Qualifying AI use a slower off-line route on out and in laps, hold their side for approaching timed cars, and merge for the final corner of an out lap when clear.

Weekend state, weather, tyres, timing and grid save automatically. Reloading returns to the garage while preserving consumed tyres and completed laps. Finishing or retiring the race settles the round and starts a fresh allocation next weekend. Quick race uses unlimited replacement tyres. Upgrades are locked after the weekend starts.

Simulated AI qualifying outings use the same driving, pit, weather, temperature and wear model as live outings. All 22 drivers use the same stock and eligibility rules. Wear is charged for actual physical distance, with the same fuel-mode, sliding and braking effects; AI personalities receive no hidden wear discount. Player and AI braking share the same front-tyre grip calculation (compound, permanent wear, heat and surface water); low grip also extends AI braking lookahead. Used sets retain aggregate and individual-wheel wear through sessions, service, saves and the race. Exhausted stock cannot create replacement tyres. Expired qualifying sessions can close even when an opponent has no tyres left to set a time.

## Car and team development

The garage has nine development paths. Each purchase opens a review with measured before/after estimates before charging the quoted price. Levels persist across seasons; prices rise by 60% of the base cost per existing level. Purchased development levels lock for the weekend at the start of Q1; aero packages can still be changed through pit service. Existing four-path careers migrate without losing purchases, money, identity, results or physical tyre condition.

| Path | Base cost | Maximum | Effect |
| --- | ---: | ---: | --- |
| V10 development | £6,000 | 5 | 7% more engine power per level across the full speed range |
| Fuel efficiency | £5,000 | 5 | 2% less fuel per level; qualifying receives a correspondingly lighter three-lap load |
| Aerodynamics | £5,000 | 5 | More speed-dependent downforce with all packages |
| Suspension & differential | £5,000 | 5 | Better traction and active countersteer recovery |
| Brakes & balance | £4,500 | 5 | Better use of available tyre grip and steadier combined braking/cornering |
| Tyre engineering | £4,500 | 5 | 7% less wear per level, gentler grip cliff and improved excess-heat dissipation |
| Pit crew training | £3,500 | 4 | Lower maximum service time and warmer prepared replacement tyres |
| Race engineer | £3,500 | 3 | Fuel/tyre estimates, then weather windows, then estimated pit rejoin traffic |
| Commercial development | £4,500 | 3 | 10% more income per level on successfully completed sponsor contracts |

Balanced, High downforce and Low drag aero packages can be switched without cost before a weekend. High downforce gives +10% reference cornering speed and −10% top speed; Low drag gives −10% reference cornering speed and +10% top speed under the same conditions. Lateral force scales with the square of the corner-speed multiplier. The package scales both drag and the clean-air speed ceiling, including for AI; the fully powered ceilings are 297 / 330 / 363 km/h respectively for High downforce / Balanced / Low drag, before slipstream. Brake and suspension upgrades never remove the underlying compound, wear, temperature and water penalties.

Performance previews use a deterministic solo test car on the selected circuit, with ideal Medium tyres, six fuel laps and Balanced pace. The high-speed engine comparison uses Push at 75–95% of the package ceiling. Engine upgrades add 7% power per level across the entire speed range without adding drag. They are comparisons, not promised lap times. Tyre-life and fuel figures use the same resource formulas as the game. Tyre engineering still extends life and softens the grip cliff with temperature simulation disabled; crew service improvements also remain active.

Engineer advice appears through the race radio. The pause menu includes the full briefing, using your current pace, tyres, available stock, forecast, time penalties, teammate box occupancy and traffic. Weather crossover and rejoin positions are estimates. Commercial bonuses appear in sponsor offers, results and saved income, and never bypass contract conditions.

AI teams use saved, seeded development preferences and their own budgets. Each starts with £7,000 per car and pays the same escalating upgrade costs as the player. Subsequent funding uses the average classification and earned contract income of the team's drivers at race end. They can buy up to two affordable parts before the next weekend and choose their aero package for the circuit. The garage's Team development view shows installed levels, budget, package and latest purchases. Hover or focus an installed upgrade to see its effects at that level; tap to open or dismiss the same popup on mobile. Escape dismisses the popup first, then closes the garage panel. Both cars share their team's parts; the player's teammate shares the player's development. Weekend snapshots keep purchased upgrade levels consistent across Q1, Q2, Q3 and the race; completed player aero changes update that driver’s package. Team development never changes the equal physical tyre allocation or wear rules.

## Verify

```sh
npm run check
npm test
```

Tests cover player/AI races, tyre strategy, weather/drainage, tyre crossover grip, manual pit stops and overshoots, qualifying pit/refuelling, track-limit warnings, collision continuity, progressive acceleration, apex placement, scheduled distances, finite tyre inventories, knockouts, saves, career reset, sponsors and upgrades.

Palette interpretations use the recognisable 2026 team colours, not licensed car models. Reference: [2026 teams](https://www.formula1.com/en/teams). Sporting-format reference: [FIA 2026 rules, B2.4 and B6](https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_06_-_2026-04-28.pdf). Opponent performance is game balance. Fonts are optional network downloads with system fallbacks.

The qualifying tower lists every driver’s PITS / OUT LAP / TIMED LAP / IN LAP state. A pinned cutoff card names the last advancing driver and shows your required improvement or buffer ahead of elimination; the boundary is marked in the scrollable results. Q3 shows the gap to pole.

Qualifying fuel is fixed at the defined three-lap amount. Its next-stop selector adds a coloured Current choice before Soft, selected by default to keep the fitted tyres. Replacement compounds automatically choose the best-condition available physical set; there is no duplicate next-set dropdown. Service hold displays its remaining seconds.

Six stable offers rotate each weekend from a pool of 12 sponsors: finishing, clean driving, position targets, podiums, victories, places gained and a one-stop strategy. A legal finish is required for every payout, and the same contract rules apply to AI funding. Selecting a sponsor locks the contract for that weekend and replaces the choices with its conditions and payout, preserving the current scroll position. Pit speed limiting defaults to automatic; the Settings preference persists across reloads. Wet asphalt uses one opaque surface colour for both the circuit and flyovers, avoiding circular patches from overlapping translucent strokes. Contacts transfer momentum along the impact normal, and AI retains lateral impact motion while avoiding occupied passing space.

Off-track rolling resistance falls at low speed, allowing a fuelled car to accelerate and steer back onto the circuit even on wet slicks. Long excursions reacquire lap progress on rejoining. Player physics reads local surface water every step; grip limits lateral force without cancelling the skid threshold. Slicks slide heavily during fast wet cornering but retain low-speed control. Car poses interpolate between 60 Hz simulation steps, with a smoothed camera lookahead to prevent high-speed visual judder.

Pit entry and exit markings now share the exact assisted-route endpoints, and the merge guide remains visible over the main road. Automatic limiting starts at the entry line and releases at the exit line. Completed laps are tracked independently of wrapped route coordinates: being passed by a lapped car does not change your race position. Live order remains on-track; intervals include unserved penalties (with PEN shown), while final classification applies adjusted finishing times. Wet asphalt is drawn as one continuous road stroke, without sector rectangles or gaps.

Wet drifts now use a separate travel direction and body heading. Grip limits how quickly the velocity vector turns; sideways slip retains momentum and can be recovered with countersteering. Soft wear is increased by approximately 11% (nominal life 9 laps). Automatic pit mode now controls lane speed, brakes to the exact team box, holds for service and drives out without any pedal input. Qualifying auto stops refuel and automatically depart on an out lap, retaining the current set when selected. Disable Automatic pit stops in Settings to return to manual pedals, limiter and qualifying garage release.
The full pit-road surface is drawn through both merge tails, with no main-road clipping hiding its start or end. Pit activation and painted boundaries coincide with these visible endpoints. Telemetry (speed, tyre condition, fuel and drive mode) is centred at the top, with track/weather information directly beneath; position, lap/session and time sit above live timing on the left. The driving-line renderer, shortcut and help have been removed. All compounds use the same lateral-force drift physics; worn tyres and wet-weather tyres on dry asphalt visibly slide when grip is insufficient.

Countersteering gets additional yaw and lateral recovery authority, with a modest further boost when throttle is applied; normal turning retains its grip limits. Damp-to-wet slick grip now ranks Hard > Medium > Soft, with a pronounced Intermediate advantage. Dry slick ordering remains Soft > Medium > Hard. The player ring and YOU marker pulse four times during the four-second starting countdown, then disappear at lights out. The Northline building has moved outside the circuit and pit-road footprints.


## Circuit collection

Northline plus 11 new original layouts are playable: Velocity International, Harbour Street Circuit, Sunset Speedway, Alpine Ridge, Crossover Park, Dunes Grand Prix, Forest Run, Riviera Port, Metro Flyway, Copper Canyon and Aurora Grand Prix. Layouts include a high-speed triangle, banked oval, mountain course, tall serpentine, coastal kite, comb of switchbacks, L-shaped circuit and two different crossing layouts. Dunes has twin straights joined by stadium hairpins.

Crossover Park and Metro Flyway have elevated crossings. Level-aware nearest-path projection preserves player lap progress through the crossing; cars on different levels do not collide. The renderer draws lower cars under the elevated road and upper cars over it, using normal asphalt and track-edge colours without special flyover labels. Sunset, Copper Canyon and Aurora have smoothly banked sections with up to 16% additional cornering grip. Camera framing, minimaps, pit geometry, apex kerbs, local weather and qualifying fuel adapt to the chosen circuit.


### Circuit boundary audit and Quick Race grids

Quick Race has a starting-position dropdown below Race distance, from P1 to P22 (default P22). The player is inserted into the chosen slot and every AI car retains a distinct grid slot. Career positions still come from qualifying.

All 12 circuits have been checked for folded inside boundaries, kerb overlap and merged same-level road sections. Ten layouts had bends opened up; Metro's repaired layout and Sunset's oval already had sufficient clearance. Harbour retains distinct street esses; Crossover's adjacent sections have been separated without removing its flyover. Geometry tests cover the complete closed lap, including the start-line seam, with at least 40 units of radius beyond the road half-width and 50 units between non-adjacent same-level road surfaces.

Automated play-tests apply steering, throttle and braking through complete dry and wet player laps on every circuit, then enter each physical pit entrance, stop for service and exit automatically. Full 22-car races also complete on every circuit with legal tyre usage and fuel remaining. Browser checks inspect every circuit's rendered road edges and confirm Quick Race grid selection works and is hidden in Career.


### Qualifying pit-box control

An in lap automatically arms pit entry; steer into the physical pit entrance without pressing B. Qualifying service has a minimum wait and refuels the car, then keeps it parked in its box until a fresh W / Up press. Tyres can be selected while service is running or after it finishes; choosing another physical set runs a tyre-change wait before departure. Current retains the fitted set and its wear. Race automatic pit stops still exit immediately after service.

The qualifying race screen includes Move to Q2 / Q3 or End qualifying in P… based on the current standings. Selecting it fast-forwards the current stage’s remaining AI outings and applies its final knockout order. A successful Q1/Q2 result opens the next stage. An eliminated player sees the final classification and explicitly completes the other sessions before race preparation. One activation cannot complete several stages.


### Qualifying speed and physical tyre sets

Session advancement is locked until every active driver has attempted a timed lap. The button reports how many opponents still need their first run, or prompts the player to complete their own. Ending early simulates the rest of the session with repeated AI outings, tyre wear, weather and updated best times before applying knockouts. Time cycles 1× → 2× → 4× → 8× → 1× in qualifying only; physics still uses fixed simulation steps.

Choose tyre set opens a scrollable allocation popup with compound colours, set IDs, condition bars and fresh/used/fitted labels. A used set can be selected for another outing or the next qualifying stage without resetting its wear. The popup is also available from qualifying preparation; quick compound selection stays available. Simulation pauses while browsing. Reserved and exhausted sets are disabled.


### Race School

Race School is available from the main menu. Five clickable introduction cards explain the weekend, compounds and wet-weather grip, tyre temperature and its Settings toggle, fuel modes, controls, track limits and pit rules. Guided dry qualifying requires two out → timed → in training outings, including service after each. The first uses Softs; the second requires Mediums. Used sets retain their wear, and the lesson explicitly distinguishes its mandatory change from normal qualifying rules.

Optional race practice requires a grid launch, fuel-mode change, B pit request, physical pit entry, service and exit. Live coaching highlights relevant controls; explanations pause the lesson. Recover car rejoins asphalt and invalidates an assisted timed lap; Reset outing restores the last garage checkpoint. Race School uses its own saved progress and tyre allocation (`v10.race-school.v1`), without settling career money or results.

Automated play-tests drive both qualifying outings, verify the required change, checkpoint resume and wear retention, mark deleted laps without blocking training progress, and complete race-start/pit practice.


Race School now uses brief bullet prompts, an F/G pace-mode reminder on out laps, and animated cues for the required physical Medium-set selection in Outing 2. A completed training outing advances the lesson even if its lap was deleted; deleted laps remain excluded from qualifying results. The popup must be used for the required change. After service, W / Up or Leave pit box starts the next outing.

### Vercel deployment

Import the GitHub repository into Vercel. The committed `vercel.json` selects Other as the framework, runs `npm run build`, and serves `dist/`. The static build contains only `index.html` and `src/`; the local Node server and tests are not published. Production follows `main`, so future pushes redeploy automatically. Career and Race School saves remain local to each browser and site address; localhost saves do not transfer automatically to the hosted site.

### Four-wheel tyre temperature

The HUD shows FL/FR/RL/RR temperatures with a light-blue → green → yellow → orange → red scale. Hover or tap a wheel for its temperature and status; hovering also shows individual condition. Temperature and permanent wear are separate. Braking loads the fronts, acceleration and wheelspin load the rears, and sustained corners load the outside pair. Straights, gentle driving and water cool tyres. Cold/hot fronts change steering and braking; rear temperature changes traction and slide recovery. Overheating progressively reduces grip and increases wear, with capped slide heating to keep recovery possible.

Softs warm fastest, Hards take longer and tolerate more heat. Intermediates and Wets have lower operating windows and overheat on dry asphalt, while existing wet-surface suitability remains independent. Grid tyres are prepared warm; pit replacements are partially warmed. Retaining a qualifying set retains its heat; garage holding and removed sets cool it. Physical sets persist four temperatures and wheel wear, with older saves initialized automatically. AI drivers use the same temperature/grip model and ease off when overheated. Fuel modes influence heat through actual driving rather than adding heat directly.

Temperature balance is checked with controlled push laps on all 12 circuits: dry Mediums/Hards, damp Intermediates (18% and 40% water), and Wets (65% and 100%). Intermediates only receive extra dry-running heat below 18% surface water, with a 62–90°C working window. Pit warm-up and drying transitions are also covered; Wets continue to incur more dry-running wear than Intermediates.

Settings includes Tyre temperature simulation, enabled by default and saved per browser. Disabling it immediately pins all four wheels and stored sets at each compound’s ideal midpoint for every driver, removes thermal grip/wear penalties and hides the HUD. Physical wear, compound differences and weather grip remain active. Re-enabling resumes from those ideal temperatures without a sudden handling penalty. The setting applies to Quick Race, career qualifying/races and Race School.

### Mobile landscape play

Touch devices use a compact landscape race HUD, independent multi-touch pedals and a choice of thumbstick or left/right arrow steering in Settings. Thumbstick sensitivity is adjustable. Portrait racing is blocked with a rotate prompt; returning to landscape requires Resume. Menus remain usable in portrait. Backgrounding, interruptions, popups and control changes clear held inputs. The fullscreen button requests fullscreen and landscape locking where supported. On iPhone Safari or unsupported browsers it instead explains Home Screen web-app mode, which removes browser bars; manual rotation remains available. Short landscape viewports use a smaller HUD and controls.

Mobile tyre choices use the full paused tyre-set selector rather than compound shortcut icons, including Quick Race starting tyres. The timing board opens on demand and pauses driving, tyre-temperature details are tappable, and the weather forecast stays compact along the bottom. Race School replaces keyboard instructions with touch instructions for the selected steering mode. Rendering uses a lower pixel-density cap and fewer decorative/rain elements on mobile while retaining the same 22-car simulation and physics.

Double-tap zoom is disabled on touch devices while menu/dialog scrolling and independent driving fingers remain supported. Fullscreen help and Settings → Play from Home Screen show platform-specific installation steps for Safari on iPhone and Chrome on Android. The standalone manifest includes Home Screen icons for both platforms.


### Slipstream and adaptive opponents

Following a nearby, aligned car at racing speed reduces drag for the player and AI. Strength depends on separation, lateral position, heading and speed; cars in pits, stationary cars, distant road sections and separate bridge levels cannot provide a tow. A strong tow can carry the car a little above its chosen aero package’s clean-air ceiling. Drag reduction disappears quickly after pulling out; the speed gained fades over roughly 2–5 seconds rather than being cut immediately. The speed readout turns lime while receiving a useful tow. This is a calibrated game approximation of aerodynamic drag and momentum, not a wind-tunnel simulation.

AI uses a continuous outside/apex/exit path built for each circuit. It plans braking from the actual path curvature, stopping distance and available tyre grip, with smooth lateral changes, space for cars alongside and individual pace, consistency and mistakes. Tyre condition and weather affect both braking and acceleration. The rendered racing-line assist remains removed.

Each new race receives a fresh random seed. Every driver has an independent random stream plus personal risk, tyre-life targets, forecast horizon and compound preferences. Pit decisions are reviewed against actual/projected surface water, measured wear, remaining distance, compound requirements, pit time and teammate box traffic. There are no fixed pit-lap schedules. Career grid preparation chooses each opponent's own available physical set instead of overriding the whole grid with one recommended compound. Qualifying release times, set reuse, fallback lap estimates and AI service durations are seeded too. Identical seeds and events reproduce decisions for debugging; player tyre-button selections do not control opponents. To replay a Quick Race in a simulation, use `race.setup.aiSeed` from the original run.

`tests/racecraft.test.js` exercises tow eligibility and momentum, real acceleration beyond 330, braking anticipation, dry/wet AI laps on all 12 circuits, driver independence, seeded replays, weather/wear/teammate reactions, and career/qualifying physical tyre allocation. `tests/ai-pit-approach.test.js` checks race and qualifying pit approaches on every circuit at live and headless simulation time steps. `tests/ai-line-discipline.test.js` covers stable straight-line tracking, passing commitment, occupied lanes, traffic-order-independent side-by-side spacing, safe merging and qualifying courtesy.

Qualifying time and stage controls remain above the telemetry layer and wrap into the available screen space. Ending a session displays a progress dialog while the same AI lap, weather, service and tyre simulation runs in small chunks, keeping the page responsive. Repeated activation cannot advance a stage twice. AI pit approaches follow the original paved route’s on-track tail, stay inside the circuit before the entry, and hand over at the painted entrance without a sideways snap.

When a session is ended early, remaining AI outings keep the weather and surface water present at the moment of the click. Opponents still drive repeated laps with real tyre wear and can improve a provisional position, but cannot benefit from an AI-only drying track. Weather continues normally while the player stays in the session and resumes in the next stage. A Q1/Q2 knockout shows the final position, best lap, cutoff and confirmed race grid slot before the remaining sessions can be completed. The outcome is saved with the weekend; a successful Q1/Q2 finish still advances to the next stage.

## Racing line and difficulty calibration

The AI reference path minimizes an estimated whole-lap time using curvature limits and forward/backward acceleration and braking envelopes. Smooth lateral adjustments consider linked corners together, so a fast exit into the next bend can take priority over an isolated apex. Flat-out corners avoid unnecessary outside/inside swings. The driver follows that path directly, with damped recovery after traffic or a slide; passing sides remain committed until there is room to return. Out/in laps move away from the upcoming racing line only when nearby traffic permits, then hold their side for approaching timed cars. Pit requests target the next entrance, including a complete qualifying in lap on circuits whose entrance precedes the finish line.

Easy, Normal, Hard and Expert use separate corner commitment, braking margins and throttle application. They share the same car, tyre and speed limits. `tests/racing-line-pace.test.js` measures increasing pace and stable path tracking at every difficulty on all twelve circuits; `tests/qualifying-conditions.test.js` replays the 32.80-second Velocity Q1 case through live and saved-garage completion. `tests/season-calendar.test.js` checks the twelve-round season and migration of older team accounting without duplicate income or purchases.

### Steering, wet pace and compound checks

The racing arc is interpolated in world coordinates with a continuous tangent. Its actual curvature is used for braking; interpolating offsets against a curved centreline previously introduced steering reversals at sample boundaries. Body heading follows travel plus held slip, rather than displaying countersteering corrections as a left/right flick. Wet drivers use more of the shared grip budget and can hold a small slide, with the normal heat, wear and momentum costs. Difficulty and individual wet skill still affect execution.

Run `node scripts/benchmark-tyres.mjs` (or append a circuit ID) for reproducible fresh-lap and full-stint comparisons. The output records its controls: equal equipment, balanced Normal AI, fixed fuel, ideal temperature, dry surface and no traffic. Fresh dry grip is Soft 1.06, Medium 1.00 and Hard 0.98. Nominal wear life is 12/17/23 laps respectively; competitive stint estimates end earlier (about 9.8/14.6/20.7 balanced laps before upgrades). These are not guarantees of human lap times or an optimal race strategy; qualifying wear, traffic, heat, fuel and actual pit delays matter.

Flyover projection retains the current route even during a recoverable wide slide. The existing distance and lap guards still reject jumps between road levels. Elevated tarmac uses the same vertices and colour as the road, with inset shadows to avoid transverse seams. A labelled local cutaway reveals the lower road and cars while driving beneath a bridge; upper-deck approaches do not activate it.

### Pit setup and qualifying continuity

Advancing Q1 to Q2 or Q2 to Q3 keeps the driver on track, stationary in the pit garage. The next session retains the physical tyre set and its wear where eligible, the completed aero setup, fuel mode and time multiplier; timing resets for the new stage. Incomplete aero service is not granted by advancing.

Choose aero offers High downforce and Low drag; 6/7 provide desktop shortcuts beside the tyre controls. Both Career and Quick Race allow the packages from the start; paid aero upgrades improve grip rather than unlock setup choices. Queue a race change before entering the pits, or update it during service. Qualifying changes are made while stopped in the box. A change adds ten seconds after tyre and penalty service and applies only after the crew finishes. Pit crew upgrades do not reduce this aero work. Selecting the fitted package cancels the remaining aero task without cancelling tyre/penalty work. A completed package carries into later sessions and the race.

Tyre and aero dialogs pause the session, including AI and weather. Clicking a card stages a choice; Confirm applies it and resumes the previous pause state. Closing without confirmation discards the staged choice. Mobile exposes the two dialogs alongside Request pit; desktop keeps the quick shortcuts.

Qualifying completion, expired-session results, knockout classification and race preparation remain over the circuit. Returning after a stranded outing reopens the same session in the pit box; advancement uses the completed run and opens the next garage without a menu detour.


Final qualifying uses the archived stage classification for the results screen, garage grid and race placement. Completing Q3 shows the confirmed starting position only after opponent runs are resolved. Live and early-completion qualifying use the same 60 Hz physics step; unfinished outings are labelled provisional. Saved grids are reconciled with their Q1/Q2/Q3 classifications, preserving genuine lap times and eliminations. Regression checks cover all twelve circuits and both improving and worsening Q3 positions.

Grand Prix preparation includes a Weather forecast popup covering the expected race duration. Chronological cards show rainfall, surface-water ranges, approximate minutes/laps and tyre guidance. It projects the saved race plan with the same water model as driving, without advancing time or rerolling conditions. Lap ranges are estimates because driving pace and pit stops affect the timing.


### Pace and race strategy

Career Grands Prix are fixed at 32 laps; Harbour Sprint runs 12 laps with dynamically varied weather. Quick Race offers 12 (Sprint), 16, 24, 32 and 40 laps. Sprints award 8–1 points to the first eight and do not require a compound change. Grand Prix points and dry-compound rules remain in force elsewhere. Saved weekends migrate to the fixed distance while preserving qualifying classification and physical tyre wear.

`performance.js` defines the shared power maps, fuel estimates and compound-specific wear curves. Save/Balanced/Push have power multipliers 0.88/1/1.08, speed ceilings 0.94/1/1.02, fuel multipliers 0.90/1/1.12 and base wear multipliers 0.82/1/1.20. Pace ceilings apply after the engine ceiling, before aero and drafting; upgrades cannot erase their differences. Smooth throttle ramps differ by mode, lifting is immediate, and heat comes from delivered power and driving loads. Temperature-off still preserves power, fuel and wear effects.

The AI uses a bounded whole-race strategy search over actual available sets, used condition, mode, fuel, progressive stint pace, pit loss, nearby rejoin traffic and forecast water. It can extend a stint in Save or spend tyres/fuel attacking; it does not receive an extra mode-specific corner-speed bonus. Strategy reviews are staggered and only one car starts a review per simulation step. Quick-race opening estimates are cached; career set-specific plans never share mutable stock.

Run `node scripts/benchmark-tyres.mjs [circuit] [save|balanced|push]` for controlled tyre stints. Run `node scripts/benchmark-race-balance.mjs` for seeded grids at the calendar race distance using limited weekend sets, qualifying wear, temperature simulation and pit service. Both print JSON without touching saved games.


## Fair starts and career economy

Every track has a long, straight pit/grid corridor. Grid rows are 60 world units apart, staggered by 24, with 56 between columns; the rear row clears the approach corner. The start line, car poses and painted slots share one layout. Inner circuit topology and flyovers remain intact, with approach bends adjusted and checked for road/kerb clearance.

Position prizes range from £4,650 (P22) to £7,800 (P1), before the existing difficulty bonus. Sponsors pay £600–£3,000 before commercial upgrades. The player-only season cash bonus has been removed. Teams use the same per-car prize and sponsor rules, averaged across their drivers, and spend only earned cash at shared prices. Upgrade base costs are £4,000–£9,000; each installed level adds 85% of base price to the next. Team development shows last race income, sponsor income, spending and remaining cash. Existing saves are not erased; restart a career for progression from equal opening budgets.

The pre-qualifying weather popup uses the same seed and saved timeline as the session. Tyre wetness bands are calculated from fresh grip with a 5% overlap at weather crossovers (Soft 0–5%, Medium 0–12%, Hard 0–20%, Intermediate 14–65%, Wet 60–100%). They are guidance, not a hard traction switch. Soft grip fades from dry conditions; Medium keeps near-dry grip through 5% water and Hard through 12%, then both fade progressively. Grip continues declining smoothly beyond each suggested range. These bands appear in the garage and tyre selector, with a live water marker in the selector; the driving HUD shows weather without crossover bands. Individual tyre-temperature wheels are visual indicators, not buttons.

AI traffic planning searches for open corridors around side-by-side cars when the usual passing lanes are blocked. Choices still use actual compound grip, wear, weather, pace mode and car performance. A stalled attempt drops back in its existing lane before merging for another opportunity; adjacent cars retain physical clearance without being moved aside for a faster compound.


Directional pace controls use F to step toward Save and G to step toward Push, stopping at either end. The HUD, pause menu, briefing and Race School share this guidance; mobile lessons retain direct pace-button instructions.

AI passing uses the same compound, surface-water, axle wear and temperature limits as driving. Exit forecasts now use rear-axle grip, physical following clearance accounts for shortened inside-corner distances, and clearing one car keeps the attack active while another is still alongside. Regression battles cover Soft/Medium, Medium/Hard, Intermediate/Wet in damp conditions and Wet/Intermediate in heavy water; no compound receives a scripted overtaking bonus.
