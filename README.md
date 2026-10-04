# Lane Rush

An original portrait lane game. A cannon at the bottom of a walled sand lane fires a crowd of blue soldiers. Steer the crowd through multiplier gates, grab the yellow jet, and outnumber the red mob at the end.

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

The crowd is one number. A gate changes that number once, not once per soldier. Multiply and add gates are purple (x2 gates are blue). Divide and subtract gates are red. The count caps at 20,000. One yellow jet sits on each lane and grants a bonus if you pass through it. At the end, your count and the red mob tick down 1:1. If you hit zero first you lose. If the mob does, you win. A tie (exact match) counts as a win. Six lanes, then a victory screen. Lose and you can retry. Nothing dead-ends.

On-screen soldiers are capped around 100 sprites so big numbers stay fast. The number itself is the real count.

## Levels

1. **First Dune** — Stack the x2 and x3. A red minus wipes a small squad. Enemy 100.
2. **Split Sand** — The x4 into x3 chain beats flat bonuses. Enemy 480.
3. **Switchback** — Weave across the lane into the larger multiplier each row. Fat plus gates are bait. Enemy 1,700.
4. **Jetline** — Stay on the left-hand multipliers and take the jet. Without the jet the mob is bigger than you. Enemy 5,600.
5. **Purple Stack** — Ride the tall x5 through x16 stack up to the cap, and do not exit through a red gate. Enemy 15,000.
6. **Last Stand** — Only the full multiplier line plus the jet clears the Dune King. Enemy 19,000.

## Tests

`npm test` checks gate math, the combat resolver, and that each level's good line beats its mob while a bad line does not. It also steers a keyboard-speed agent through every winning line.

`http://127.0.0.1:8765/?smoke=1` auto-plays level 1 with that winning line (for the headless check). It is not a menu cheat for later levels.
