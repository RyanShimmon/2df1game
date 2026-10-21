# V10 — Grand Prix

Version **1.4.1**.

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
| F                     | Cycle save / balanced / push                             |
| M                     | Toggle circuit overview                                  |
| T                     | Cycle next pit compound (S/M/H/I/W)                       |
| Escape                | Pause / resume                                           |

Touch pedals, steering and reverse are available on touch devices. Sound is opt-in. Switching away from the browser pauses the game.

## Driving and strategy

Power builds progressively toward 330 km/h. Steering and sliding reduce acceleration and scrub speed; a clean corner exit helps carry momentum onto the straight. A controlled low-fuel acceleration test takes approximately nine seconds to reach 330. Career starter cars are slower; upgrades improve power, grip, tyre conservation and service time. Wider red-and-white inside kerbs identify corner apexes. The track has no painted centre line or driving-line assist.

Soft tyres are fastest but last roughly 9 race laps; mediums 13; hards 19. Actual life depends on driving, upgrades and water. Out laps and pit travel are gentler on tyres. A complete dry qualifying outing generally leaves about 80–85% soft condition, allowing the same physical set to be used for another session.

Fuel is expressed in fuel laps. Balanced driving uses approximately 1.1 per circuit lap. Save reduces pace, fuel use and wear; push trades resources for speed. Fuel weight reduces pace. There is no battery or race refuelling.

Dry races require two different dry compounds. Using intermediate or wet tyres waives that requirement. Qualifying compounds do not count toward race tyre usage.

## Weather

Quick race offers dry, showers, wet-to-dry and late-rain patterns. Career weather is assigned by weekend. Each Grand Prix starts a new forecast timeline while retaining the surface water and tyre condition from qualifying. Forecast, rainfall, track wetness and penalties appear in the HUD. A scrolling six-minute timebar along the bottom shows rainfall and predicted surface water, using the live drainage model.

Rain adds water to 32 track sectors. Different drainage rates and a drying racing line affect local grip. Rain stops before the road becomes dry: water disappears gradually. Slicks lose grip in rain; intermediates are best in damp conditions; wets are best in deeper water. Intermediates and wets wear faster on a drying road. AI drivers react to crossover conditions and retain the same finite inventory as the player.

Weather uses deterministic evolving profiles rather than external weather data. It is an arcade water/grip model, with rendered wet asphalt and rain, not a full fluid simulation.

## Pit stops

Request a stop before crossing the pit-entry point. A late request waits for the next lap rather than teleporting back to entry. Steering through the lane is assisted; the player controls acceleration, braking and reverse.

The highlighted outline marks your team's pit box. Brake to a full stop inside it to begin service. Passing over the box at speed does **not** start the stop. If you miss it, brake and hold R to reverse. You cannot exit the lane without service, and throttle/reverse are ignored until the tyre change finishes. Team boxes are spaced along the lane, with cars moving into an outside bay to stop. A busy teammate's box delays service.

P enables the 80 km/h limiter. Speeding incurs five seconds, served during the stop. Tyre service is random between 2.3 and 5.5 seconds. Each crew upgrade lowers the maximum by 0.5 seconds, to 3.5 seconds at level four; the minimum stays 2.3 seconds. Penalty service is additional. Pit loss includes lane travel, your braking and service. Race stops mount an actual available tyre set without refreshing its wear. Qualifying stops also refuel to a new outing load.

## Track limits and contact

Leaving the circuit triggers a warning once per continuous excursion; returning fully to the track rearms detection. Three warnings are allowed. The fourth infringement adds five seconds; another four infringements add another five. Qualifying excursions delete the affected flying lap. The HUD shows warnings and total penalty seconds, with engineer messages for each incident.

AI passing choices stay committed for a short period and lateral movement is capped. Oriented car bounds resolve overlaps gradually while retaining AI position/offset changes, instead of snapping cars back to the centreline. Damage and punctures are not yet simulated.

## Career and weekends

Name your driver and choose one of 11 teams. Every team starts with £7,000 and a slower development car. Sign one sponsor per race, earn position money and upgrade your car. The top ten score 25/18/15/12/10/8/6/4/2/1. A six-round season pays an additional £150 per season point.

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

The playable weekend pool is deliberately limited: two general-use Softs (S1–S2), one Medium (M1), one Hard (H1), two Intermediates (I1–I2) and one Wet (W1), plus a Soft (S4) reserved for Q3. Q3 participants return S4 afterwards; eliminated drivers retain it for the race. Unissued historical IDs remain marked as returned for save compatibility. Older weekends keep selected and used sets within the same compound quotas for every driver; excess stock is returned while its wear/history remains saved. Every physical set stores wear, distance and used status. Starting set choice is free among remaining sets. The pit selector chooses exact sets; compound keys choose the freshest available set of that type.

Quick-race and career setup both show estimated tyre life at Balanced pace in suitable conditions, including upgrades and the selected physical set's remaining wear. Heat, sliding and other driving modes change the actual distance. Qualifying AI use a slower off-line route on out and in laps, hold their side for approaching timed cars, and merge for the final corner of an out lap when clear.

Weekend state, weather, tyres, timing and grid save automatically. Reloading returns to the garage while preserving consumed tyres and completed laps. Finishing or retiring the race settles the round and starts a fresh allocation next weekend. Quick race uses unlimited replacement tyres. Upgrades are locked after the weekend starts.

Simulated AI qualifying outings use the same driving, pit, weather, temperature and wear model as live outings. All 22 drivers use the same stock and eligibility rules. Wear is charged for actual physical distance, with the same fuel-mode, sliding and braking effects; AI personalities receive no hidden wear discount. Player and AI braking share the same front-tyre grip calculation (compound, permanent wear, heat and surface water); low grip also extends AI braking lookahead. Used sets retain aggregate and individual-wheel wear through sessions, service, saves and the race. Exhausted stock cannot create replacement tyres. Expired qualifying sessions can close even when an opponent has no tyres left to set a time.

## Car and team development

The garage has nine development paths. Each purchase opens a review with measured before/after estimates before charging the quoted price. Levels persist across seasons; prices rise by 60% of the base cost per existing level. Parts and package choices lock for the whole weekend at the start of Q1. Existing four-path careers migrate without losing purchases, money, identity, results or physical tyre condition.

| Path | Base cost | Maximum | Effect |
| --- | ---: | ---: | --- |
| V10 development | £6,000 | 5 | More power, with extra emphasis on low/mid-speed acceleration |
| Fuel efficiency | £5,000 | 5 | 2% less fuel per level; qualifying receives a correspondingly lighter three-lap load |
| Aerodynamics | £5,000 | 5 | More speed-dependent downforce; level 1 unlocks specialist packages |
| Suspension & differential | £5,000 | 5 | Better traction and active countersteer recovery |
| Brakes & balance | £4,500 | 5 | Better use of available tyre grip and steadier combined braking/cornering |
| Tyre engineering | £4,500 | 5 | 7% less wear per level, gentler grip cliff and improved excess-heat dissipation |
| Pit crew training | £3,500 | 4 | Lower maximum service time and warmer prepared replacement tyres |
| Race engineer | £3,500 | 3 | Fuel/tyre estimates, then weather windows, then estimated pit rejoin traffic |
| Commercial development | £4,500 | 3 | 10% more income per level on successfully completed sponsor contracts |

Balanced, High downforce and Low drag aero packages can be switched without cost before a weekend. High downforce adds high-speed corner support but increases drag and lowers the clean-air speed ceiling. Low drag improves straight-line performance at the expense of cornering support. Normal clean-air speed remains capped at 330 km/h; a slipstream can exceed it. Brake and suspension upgrades never remove the underlying compound, wear, temperature and water penalties.

Performance previews use a deterministic solo test car on the selected circuit, with ideal Medium tyres, six fuel laps and Balanced pace. They are comparisons, not promised lap times. Tyre-life and fuel figures use the same resource formulas as the game. Tyre engineering still extends life and softens the grip cliff with temperature simulation disabled; crew service improvements also remain active.

Engineer advice appears through the race radio. The pause menu includes the full briefing, using your current pace, tyres, available stock, forecast, time penalties, teammate box occupancy and traffic. Weather crossover and rejoin positions are estimates. Commercial bonuses appear in sponsor offers, results and saved income, and never bypass contract conditions.

AI teams use saved, seeded development preferences and their own budgets. Each starts with £7,000 per car and pays the same escalating upgrade costs as the player. Subsequent funding uses the average classification and earned contract income of the team's drivers at race end. They can buy up to two affordable parts before the next weekend and choose their aero package for the circuit. The garage's Team development view shows installed levels, budget, package and latest purchases. Both cars share their team's parts; the player's teammate shares the player's development. Weekend snapshots keep all equipment consistent across Q1, Q2, Q3 and the race. Team development never changes the equal physical tyre allocation or wear rules.

## Verify

```sh
npm run check
npm test
```

Tests cover player/AI races, tyre strategy, weather/drainage, tyre crossover grip, manual pit stops and overshoots, qualifying pit/refuelling, track-limit warnings, collision continuity, progressive acceleration, apex placement, scheduled distances, finite tyre inventories, knockouts, saves, career reset, sponsors and upgrades.

Palette interpretations use the recognisable 2026 team colours, not licensed car models. Reference: [2026 teams](https://www.formula1.com/en/teams). Sporting-format reference: [FIA 2026 rules, B2.4 and B6](https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_06_-_2026-04-28.pdf). Opponent performance is game balance. Fonts are optional network downloads with system fallbacks.

The qualifying tower lists every driver’s PITS / OUT LAP / TIMED LAP / IN LAP state. A pinned cutoff card names the last advancing driver and shows your required improvement or buffer ahead of elimination; the boundary is marked in the scrollable results. Q3 shows the gap to pole.

Qualifying fuel is fixed at the defined three-lap amount. Its next-stop selector adds a coloured Current choice before Soft, selected by default to keep the fitted tyres. Replacement compounds automatically choose the best-condition available physical set; there is no duplicate next-set dropdown. Service hold displays its remaining seconds.

Selecting a sponsor locks the contract for that weekend and replaces the choices with its conditions and payout, preserving the current scroll position. Pit speed limiting defaults to automatic; the Settings preference persists across reloads. Wet asphalt retains a uniform surface tint without a centre stripe. Contacts transfer momentum along the impact normal, and AI retains lateral impact motion while avoiding occupied passing space.

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

The qualifying race screen includes Move to Q2 / Q3 or End qualifying in P… based on the current standings. Selecting it fast-forwards remaining AI outings, applies the actual knockout order, and opens the next session or race preparation immediately.


### Qualifying speed and physical tyre sets

Session advancement is locked until every active driver has attempted a timed lap. The button reports how many opponents still need their first run, or prompts the player to complete their own. Ending early simulates the rest of the session with repeated AI outings, tyre wear, weather and updated best times before applying knockouts. Time cycles 1× → 2× → 4× → 8× → 1× in qualifying only; physics still uses fixed simulation steps.

Choose tyre set opens a scrollable allocation popup with compound colours, set IDs, condition bars and fresh/used/fitted labels. A used set can be selected for another outing or the next qualifying stage without resetting its wear. The popup is also available from qualifying preparation; quick compound selection stays available. Simulation pauses while browsing. Reserved and exhausted sets are disabled.


### Race School

Race School is available from the main menu. Five clickable introduction cards explain the weekend, compounds and wet-weather grip, tyre temperature and its Settings toggle, fuel modes, controls, track limits and pit rules. Guided dry qualifying requires two out → timed → in training outings, including service after each. The first uses Softs; the second requires Mediums. Used sets retain their wear, and the lesson explicitly distinguishes its mandatory change from normal qualifying rules.

Optional race practice requires a grid launch, fuel-mode change, B pit request, physical pit entry, service and exit. Live coaching highlights relevant controls; explanations pause the lesson. Recover car rejoins asphalt and invalidates an assisted timed lap; Reset outing restores the last garage checkpoint. Race School uses its own saved progress and tyre allocation (`v10.race-school.v1`), without settling career money or results.

Automated play-tests drive both qualifying outings, verify the required change, checkpoint resume and wear retention, mark deleted laps without blocking training progress, and complete race-start/pit practice.


Race School now uses brief bullet prompts, an F fuel-mode reminder on out laps, and animated cues for the required physical Medium-set selection in Outing 2. A completed training outing advances the lesson even if its lap was deleted; deleted laps remain excluded from qualifying results. The popup must be used for the required change. After service, W / Up or Leave pit box starts the next outing.

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

Following a nearby, aligned car at racing speed reduces drag for the player and AI. Strength depends on separation, lateral position, heading and speed; cars in pits, stationary cars, distant road sections and separate bridge levels cannot provide a tow. A strong tow can carry the car a little above 330 km/h. Drag reduction disappears quickly after pulling out; the speed gained fades over roughly 2–5 seconds rather than being cut immediately. The speed readout turns lime while receiving a useful tow. This is a calibrated game approximation of aerodynamic drag and momentum, not a wind-tunnel simulation.

AI uses a continuous outside/apex/exit path built for each circuit. It plans braking from the actual path curvature, stopping distance and available tyre grip, with smooth lateral changes, space for cars alongside and individual pace, consistency and mistakes. Tyre condition and weather affect both braking and acceleration. The rendered racing-line assist remains removed.

Each new race receives a fresh random seed. Every driver has an independent random stream plus personal risk, tyre-life targets, forecast horizon and compound preferences. Pit decisions are reviewed against actual/projected surface water, measured wear, remaining distance, compound requirements, pit time and teammate box traffic. There are no fixed pit-lap schedules. Career grid preparation chooses each opponent's own available physical set instead of overriding the whole grid with one recommended compound. Qualifying release times, set reuse, fallback lap estimates and AI service durations are seeded too. Identical seeds and events reproduce decisions for debugging; player tyre-button selections do not control opponents. To replay a Quick Race in a simulation, use `race.setup.aiSeed` from the original run.

`tests/racecraft.test.js` exercises tow eligibility and momentum, real acceleration beyond 330, braking anticipation, dry/wet AI laps on all 12 circuits, driver independence, seeded replays, weather/wear/teammate reactions, and career/qualifying physical tyre allocation.
