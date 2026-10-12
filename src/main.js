import Phaser from 'phaser';
import { MenuScene } from './scenes/menu.js';
import { PlayScene } from './scenes/play.js';
import { createSfx } from './sfx.js';
import { setStatus, touchLane } from './status.js';

const params = new URLSearchParams(window.location.search);
// ?casual=SEED auto-plays level 1 through the mouse path with the casual-human model.
const casualSeed = params.get('casual');
const smoke = params.get('smoke') === '1' || casualSeed !== null;
touchLane({ booted: false, result: null, log: [], smoke });

const sfx = createSfx();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // The canvas always fills the window; scenes zoom their camera to fit the
  // 540x960 play column and show extra terrain around it (see fitCamera).
  width: window.innerWidth || 540,
  height: window.innerHeight || 960,
  backgroundColor: '#e7c98a',
  banner: false,
  render: { antialias: true, pixelArt: false },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    fullscreenTarget: 'game',
  },
  scene: smoke ? [PlayScene, MenuScene] : [MenuScene, PlayScene],
  callbacks: {
    preBoot(g) {
      g.registry.set('sfx', sfx);
      g.registry.set('bootSmoke', smoke);
      g.registry.set('casualSeed', casualSeed !== null ? Number(casualSeed) || 1 : null);
    },
    postBoot(g) {
      touchLane({ booted: true });
      setStatus('booted');
      if (g.canvas) {
        g.canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
      }
    },
  },
});

window.addEventListener('error', (ev) => {
  setStatus('error:' + (ev.message || 'unknown'));
});

window.__laneRushGame = game;
