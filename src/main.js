import Phaser from 'phaser';
import { MenuScene } from './scenes/menu.js';
import { PlayScene } from './scenes/play.js';
import { createSfx } from './sfx.js';
import { setStatus, touchLane } from './status.js';

const smoke = new URLSearchParams(window.location.search).get('smoke') === '1';
touchLane({ booted: false, result: null, log: [], smoke });

const sfx = createSfx();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 540,
  height: 960,
  backgroundColor: '#e7c98a',
  banner: false,
  render: { antialias: true, pixelArt: false },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: smoke ? [PlayScene, MenuScene] : [MenuScene, PlayScene],
  callbacks: {
    preBoot(g) {
      g.registry.set('sfx', sfx);
      g.registry.set('bootSmoke', smoke);
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
