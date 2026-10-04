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

The crowd is one number. A gate changes that number once, not once per soldier. Multiply and add gates are purple (x2 gates are blue). Divide and subtract gates are red. The count caps at 20,000. One yellow jet sits on each lane and grants a bonus if you pass through it.

The crowd starts with Shot in a three-slot rack. Pads and drops add Rapid Bolts, Spread Shot, Cannonball, Needle Volley, Twin Lance, and Arc Mortar. A fourth distinct gun replaces a slot you are not using. Keys 1, 2, and 3, or the buttons by the cannon, switch which one fires. A duplicate shows FULL.

Each lane is a long march with waves, a labeled mid-boss, and a final boss. When a pack is in range, blues fire the equipped weapon and reds lunge back. Each landed shot or swing removes soldiers — damage, fire rate, and pierce decide the trade, so a stronger weapon lets a smaller crowd beat a larger wave. The cannon still fires new soldiers on its own. The lane never pauses. After the waves, a boss waits at the end. Beating the boss clears the level. If your count hits zero you can retry. An even trade that empties both sides is a loss. Six lanes, then a victory screen.

On-screen soldiers are capped around 100 sprites so big numbers stay fast. The number itself is the real count.

## Levels

1. **First Dune** — Stack the x2 and x3, take the jet, and cut the three small waves. A red divide dies in the stream. Boss 40.
2. **Split Sand** — The x4 into x3 chain outlasts the marching packs. Boss 90.
3. **Switchback** — Weave across the lane into the larger multiplier between waves. A fat plus is bait. Boss 160.
4. **Jetline** — Stay on the left-hand multipliers and take the jet. The same gates without the jet die in the last wave. Boss 700.
5. **Purple Stack** — Ride x5 through x16 up to the cap. The red exit is halved, then eaten by the wave before the boss. Boss 4,000.
6. **Last Stand** — Only the full multiplier line plus the jet gets past the king's vanguard. Boss 4,050.

## Tests

`npm test` checks gate math, weapon hits, and that each level's good line plus its weapon beats the boss while a bad line that skips the weapon dies in a wave.

`http://127.0.0.1:8765/?smoke=1` auto-plays level 1 with that winning line (for the headless check). It is not a menu cheat for later levels.
