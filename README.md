# Lane Rush

An original portrait lane game. A cannon at the bottom of a walled sand lane fires a crowd of blue soldiers. Steer through multiplier gates, grab the yellow jet and a weapon pickup, and fight red waves in real time until the boss.

Built with [Phaser 3](https://phaser.io) (MIT). Art is drawn in code. No CDN and no external assets.

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
- SFX / M toggles mute.
- Play, Next, Retry, and Menu are buttons. Enter, Space, or a tap starts from the title screen.

## Rules

The crowd is one number. A gate changes that number once, not once per soldier. Add gates are purple, multiply gates are blue, and divide and subtract gates are red. The count caps at 20,000. One yellow jet sits on each lane and grants a bonus if you pass through it.

Multipliers are rare: two to five per lane, mostly x2 or x3, and each one sits out on an edge or squeezed between red gates. Most rows are add gates and red gates, some four wide. You win by stacking adds and picking the right gun, not by chaining multipliers.

The crowd starts with Shot in a three-slot rack. Pads and drops add Rapid Bolts, Spread Shot, Cannonball, Needle Volley, Twin Lance, and Arc Mortar. A fourth distinct gun replaces a slot you are not using. Keys 1, 2, and 3, or the buttons by the cannon, switch which one fires. A duplicate shows FULL.

Each lane is a long march with waves, a labeled mid-boss, and a final boss. When a pack is in range, only the front ranks fight: blues fire the equipped weapon and reds swing back. Damage, fire rate, and pierce decide the trade.

Mid-bosses and final bosses wear armor (shown on the mid-boss label). Armor takes damage off every hit, so Shot, Bolts, and Needles only chip a boss while Cannonball, Lance, and Mortar cut through. Switch to a heavy gun for bosses and a fast gun for plain packs. Bosses also hit harder and faster than packs.

Bosses telegraph special attacks. A red zone appears on the sand and fills as the boss winds up:

- **Slam**: the boss rears up and crashes down on one wide spot where you stand.
- **Volley**: three rocks arc toward three narrow spots. Stand in a gap.
- **Charge**: the boss shakes, then dashes down a wide strip of the lane.

Steer out of the zone before it fills to dodge. A special that lands takes a big chunk of the crowd. Tanking specials usually loses at the mid-boss.

The cannon still fires new soldiers on its own and the lane never pauses. Beating the final boss clears the level. If your count hits zero you can retry. An even trade that empties both sides is a loss. Six lanes, then a victory screen.

On-screen soldiers are capped around 100 sprites, and shots, sparks, shockwaves, and boss rocks come from fixed pools, so big numbers stay fast. The number itself is the real count.

## Levels

| Lane | Multipliers | Mid-boss | Final boss |
|---|---|---|---|
| 1. First Dune | 2 (x2) | 130, armor 1, slam | 260, armor 1, slam + volley |
| 2. Split Sand | 3 (x2) | 260, armor 1, slam + volley | 560, armor 2, slam + volley + charge |
| 3. Switchback | 3 (up to x3) | 560, armor 1, volley + slam | 900, armor 2, all three |
| 4. Jetline | 3 (up to x3) | 1,200, armor 1, slam + charge | 3,600, armor 2, all three. Needs the jet. |
| 5. Purple Stack | 5 (one x4) | 2,000, armor 2, all three | 9,500, armor 2, all three |
| 6. Last Stand | 3 (up to x3) | 1,600, armor 2, all three | 11,000, armor 2, all three. Needs the jet. |

## Tests

`npm test` checks gate math, front-rank combat, armor, boss telegraphs and dodging, multiplier rarity, and three reference players on every lane. A skilled run (good gates, the jet, weapons, dodging, and switching guns) wins. A sloppy run that takes the good gates but tanks specials and never switches loses to a boss. A lazy run through red gates dies in a wave. On jet lanes, skipping the jet loses.

`http://127.0.0.1:8765/?smoke=1` auto-plays level 1 with the skilled reference player (it dodges and switches guns) (for the headless check). It is not a menu cheat for later levels.
