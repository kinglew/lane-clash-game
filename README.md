# Lane Rush

An original portrait lane game. A cannon at the bottom of a walled sand lane fires a crowd of blue soldiers. Steer through multiplier gates, grab the yellow jet and a weapon pickup, and fight red waves in real time until the boss.

Built with [Phaser 3](https://phaser.io) (MIT). No CDN.

## Art

Sprites (blue soldiers with run/shoot/recoil frames, red grunts with march/wind-up/strike frames, the mid-boss ogre and final-boss warlord with idle/wind-up/strike frames, cannon, jet, weapon crate, cannonball orb, mortar shell, boss rock, a 5-frame explosion) and the sand tile were generated for this project with Gemini's image generator through the `agy` CLI. They are original and ship with the game. `tools/build_atlas.py` keys out the flat magenta backgrounds, slices the sheets, and packs everything into one atlas: `assets/lr-atlas.png` + `.json` (~600 KB) and `assets/lr-sand.jpg` (~50 KB). The raw sheets are not in the repo. If the atlas fails to load, the game falls back to the code-drawn art in `src/art.js`.

## Run

```bash
cd lane-rush
npm install
npm test
npm run build
npm start
```

Open http://127.0.0.1:8765/

`npm start` serves the folder with Python on `127.0.0.1:8765`. The page loads `dist/game.js`, which already includes Phaser, so the game runs offline after the build.

## Controls

- Mouse move or touch drag steers the cannon left and right.
- A / D or the arrow keys steer as well.
- The cannon fires on its own.
- SFX / M toggles mute. The [ ] button toggles fullscreen.
- The game fills the whole window on desktop and phones and follows live resizes. The 540x960 play column is centered and scaled to fit; extra space shows more desert, and the HUD sticks to the screen edges.
- Play, Next, Retry, and Menu are buttons. Enter, Space, or a tap starts from the title screen.

## Rules

The crowd is one number. A gate changes that number once, not once per soldier. Add gates are purple, multiply gates are blue, and divide and subtract gates are red. The count caps at 20,000. One yellow jet sits on each lane and grants a bonus if you pass through it.

Multipliers are rare: two to five per lane, mostly x2 or x3, and each one sits out on an edge or squeezed between red gates. Most rows are add gates and red gates, some four wide. You win by stacking adds and picking the right gun, not by chaining multipliers.

The crowd starts with Shot in a three-slot rack. Pads and drops add Rapid Bolts, Spread Shot, Cannonball, Needle Volley, Twin Lance, and Arc Mortar. Running through a pad or a dropped gun equips it right away (a floater names it and flashes the icon of what it beats). A fourth distinct gun replaces a slot you are not using. Keys 1, 2, and 3, or the buttons by the cannon, switch which one fires. A duplicate shows FULL.

Each lane is a long march with waves, a labeled mid-boss, and a final boss. When a pack is in range, only the front ranks fight: blues fire the equipped weapon and reds swing back. Damage, fire rate, and pierce decide the trade.

Every mid-boss and final boss has a **type**. Each type has one weakness (that weapon family deals x1.8) and one resistance (x0.5). Everything else is x1, and no weapon ever drops below half damage, so a big enough crowd can win with any gun. The type and its counter show under the boss name, e.g. `WEAK: HEAVY   RESIST: RAPID`. Gold sparks and a `WEAK!` callout mean you picked the right gun. Grey sparks and `RESIST` mean switch. The wave just before each mid-boss drops (or the pad offers) its counter, and each mid-boss drops the counter for the final boss. Plain red packs have no type. Bosses also hit harder than packs, and attack faster on later lanes.

### Type icons

Each boss type has an icon, shown above the boss name: Armored = steel shield, Swarm = cluster of heads, Swift = lightning bolt, Bulky = fist. Under each weapon slot are the icons of the types that gun beats, best first (never a type that resists it). Shot shows a grey "=" badge because it is neutral to every type.

### Strengths and weaknesses

| Weapon family | Weapons |
|---|---|
| Shot | Shot (neutral to every type) |
| Rapid | Rapid Bolts, Needle Volley |
| Spread | Spread Shot |
| Pierce | Twin Lance |
| Heavy | Cannonball, Arc Mortar |

| Boss type | Weak to (x1.8) | Resists (x0.5) | Why |
|---|---|---|---|
| Armored | Heavy | Rapid | Thick plate: shells crack it, small rounds bounce. |
| Swarm | Spread | Heavy | Many small bodies: spread hits several, shells overkill one. |
| Swift | Rapid | Pierce | Quick and dodgy: volume of fire catches it, slow lances miss. |
| Bulky | Pierce | Spread | Deep ranks: lances run through, spread pellets scatter. |

Bosses telegraph special attacks. A red zone appears on the sand and fills as the boss winds up:

- **Slam**: the boss rears up and crashes down on one wide spot where you stand.
- **Volley**: three rocks arc toward three narrow spots. Stand in a gap.
- **Charge**: the boss shakes, then dashes down a wide strip of the lane.

Steer out of the zone before it fills to dodge. A special that lands takes a big chunk of the crowd. Tanking specials usually loses at the mid-boss.

The cannon still fires new soldiers on its own and the lane never pauses. Beating the final boss clears the level. If your count hits zero you can retry. An even trade that empties both sides is a loss. Six lanes, then a victory screen.

On-screen soldiers are capped around 100 sprites, and shots, sparks, shockwaves, and boss rocks come from fixed pools, so big numbers stay fast. The number itself is the real count.

## Branching paths

At each fork the lane splits into 2 (sometimes 3) side-by-side paths separated by
walls, then rejoins. A sign before the split previews each path: its name, the
troop gates (+N, ×N), any gun crate (with the icon of the boss type it beats) and
the foes waiting (FOES N). You commit to the branch you are in when the crowd
reaches the split; walls clamp you until the rejoin, and the other branch's gates,
waves and crates vanish. Fork logic (`branchSpans`, `laneBounds`, `rowGateIndex`,
`pickBranch`) lives in `src/logic.js`, so the scene and the tests run the same code.

| Level | Fork | Branches and tradeoff |
|---|---|---|
| 1 | 1 | TROOPS +24 vs ARMORY (14 foes, Cannonball crate, +8). Gentle: Cannonball counters the Armored boss. |
| 2 | 1 | SPREAD (14 foes, Spread crate: counter for the Swarm sergeant) vs TROOPS +36. Best path depends on whether you already hold Spread. |
| 2 | 2 | SAFE +60 vs RISKY ×2 then 90 foes. Small crowds go SAFE, big crowds go RISKY. |
| 3 | 1 | CANNON (30 foes, Cannonball: counter for the Armored banner) vs TROOPS +80. |
| 3 | 2 | SAFE +100 vs RISKY (180 foes, Needle crate: counter for the Swift boss, then ×2). |
| 4 | 2 | TROOPS +80 / 90 foes vs LANCE (150 foes, Lance for the Bulky marshal); SAFE +150 / 200 foes vs SPREAD (Swarm boss counter) vs GAMBLE ×2 then 650 foes. |
| 5 | 2 | SAFE +300 vs GAMBLE ×2 / 900 foes; SAFE +500 vs CANNON (Armored boss counter) vs GAMBLE ×2 / 1300 foes. |
| 6 | 2 | SAFE +500 vs GAMBLE ×2 / 1400 foes; SAFE +700 vs LANCE (Bulky boss counter) vs GAMBLE ×2 / 1500 foes. |

Tests check that a fork commits the branch you are in, walls clamp steering,
branches give different outcomes, no path strictly dominates (level 2: Spread vs
Troops flips with the gun you hold; Safe vs Risky flips with crowd size), and the
casual mouse (which reads the signs: takes a counter gun it lacks, otherwise the
safer path) still wins levels 1-2 on any branch.

## Levels

| Lane | Mid-boss | Final boss |
|---|---|---|
| 1. First Dune | Camp Captain: 90, Swift (weak Rapid), slam | Red Camp: 180, Armored (weak Heavy), slam + volley |
| 2. Split Sand | Dune Sergeant: 190, Swarm (weak Spread), slam + volley | Dust Horde: 380, Bulky (weak Pierce), all three |
| 3. Switchback | Scarlet Banner: 520, Armored (weak Heavy), volley + slam | Scarlet Pack: 900, Swift (weak Rapid), all three |
| 4. Jetline | Ember Marshal: 1,200, Bulky (weak Pierce), slam + charge | Ember Mob: 9,000, Swarm (weak Spread), all three. Needs the x2 jet. |
| 5. Purple Stack | Crimson Banner: 2,000, Swift (weak Rapid), all three | Crimson Host: 15,000, Armored (weak Heavy), all three |
| 6. Last Stand | King's Guard: 1,600, Swarm (weak Spread), all three | Dune King: 22,000, Bulky (weak Pierce), all four specials |

Lanes 1 and 2 can be cleared with only the starting Shot and good gates. Bosses on lanes 1 to 3 attack slower and hit softer.

## Tests

`npm test` checks gate math, front-rank combat, the type chart, boss telegraphs and dodging, multiplier rarity, and reference players on every lane:

- On every lane, at least two weapon families can clear the whole lane alone, and the final boss's counter is one of them.
- Lanes 1 and 2 can be cleared with Shot only, with or without dodging.
- A skilled run (good gates, the jet, pickups, dodging, smart switching) wins.
- From lane 3 on, a run that never dodges or switches loses to a boss.
- A lazy run through red gates dies in a wave.
- On lane 4, skipping the jet loses.

`http://127.0.0.1:8765/?smoke=1` auto-plays level 1 with the skilled reference player (it dodges and switches guns) (for the headless check). It is not a menu cheat for later levels.
