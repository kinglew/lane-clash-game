import Phaser from 'phaser';
import { FONT } from '../view.js';
import { ensureArt, paintBanner, paintCannon } from '../art.js';
import { mul, div } from '../logic.js';
import { createSfx } from '../sfx.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create() {
    ensureArt(this);
    this.sfx = this.registry.get('sfx') || createSfx();
    this.started = false;

    const g = this.add.graphics();
    g.fillStyle(0xf6d7a4, 1);
    g.fillRect(0, 0, 540, 960);
    g.fillStyle(0xffe7ad, 1);
    g.fillCircle(430, 120, 36);
    g.fillStyle(0xe7c48a, 1);
    g.fillEllipse(120, 210, 220, 70);
    g.fillEllipse(400, 230, 260, 80);
    g.fillStyle(0x3a261c, 1);
    g.fillRect(0, 250, 70, 710);
    g.fillRect(470, 250, 70, 710);
    g.fillStyle(0xf0d7a2, 1);
    g.fillRect(70, 250, 400, 710);
    g.lineStyle(6, 0x6b4632, 1);
    g.lineBetween(70, 250, 70, 960);
    g.lineBetween(470, 250, 470, 960);

    paintBanner(g, 150, 360, 150, 62, mul(2), false, 1);
    paintBanner(g, 390, 360, 150, 62, div(2), false, 1);
    paintBanner(g, 270, 450, 170, 74, mul(8), true, 1);

    const label = {
      fontFamily: FONT,
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#1a120c',
      strokeThickness: 5,
    };
    this.add.text(150, 360, 'x2', { ...label, fontSize: '32px' }).setOrigin(0.5);
    this.add.text(390, 360, '/2', { ...label, fontSize: '32px' }).setOrigin(0.5);
    this.add.text(270, 450, 'x8', { ...label, fontSize: '40px' }).setOrigin(0.5);

    const jet = this.add.image(270, 540, 'lr-jet').setScale(0.95);
    this.tweens.add({
      targets: jet,
      y: 528,
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    for (let i = 0; i < 8; i++) {
      const s = this.add.image(96 + i * 48, 790, 'lr-blue').setScale(1.05);
      this.tweens.add({
        targets: s,
        y: 778,
        duration: 380 + i * 25,
        yoyo: true,
        repeat: -1,
        delay: i * 40,
        ease: 'Sine.easeInOut',
      });
    }

    const cannon = this.add.graphics();
    paintCannon(cannon, 270, 900, 1.15, 0.2, 0.4);

    this.add.text(270, 150, 'LANE RUSH', {
      fontFamily: FONT,
      fontSize: '68px',
      fontStyle: 'bold',
      color: '#fffaf0',
      stroke: '#3a261c',
      strokeThickness: 10,
    }).setOrigin(0.5);

    this.add.text(270, 214, 'Steer your crowd through the gates,\nthen outnumber the red mob.', {
      fontFamily: FONT,
      fontSize: '20px',
      align: 'center',
      color: '#4a3424',
      lineSpacing: 4,
    }).setOrigin(0.5);

    const btn = this.add.rectangle(270, 640, 280, 76, 0x6c35de)
      .setStrokeStyle(5, 0xfff1c4)
      .setInteractive({ useHandCursor: true });
    const playLabel = this.add.text(270, 640, 'PLAY', {
      fontFamily: FONT,
      fontSize: '36px',
      fontStyle: 'bold',
      color: '#fffaf0',
    }).setOrigin(0.5);
    btn.on('pointerover', () => btn.setFillStyle(0x8452f2));
    btn.on('pointerout', () => btn.setFillStyle(0x6c35de));
    btn.on('pointerdown', () => this.begin());
    playLabel.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.begin());

    this.add.text(270, 708, 'Mouse, drag, or A / D    ·    cannon fires itself', {
      fontFamily: FONT,
      fontSize: '15px',
      color: '#6a4a32',
    }).setOrigin(0.5);

    this.add.text(270, 736, 'Any key or tap to start', {
      fontFamily: FONT,
      fontSize: '14px',
      color: '#8a6848',
    }).setOrigin(0.5);

    this.muteText = this.add.text(522, 18, this.sfx.muted ? 'MUTED' : 'SFX', {
      fontFamily: FONT,
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#fff6e4',
      stroke: '#3a261c',
      strokeThickness: 4,
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    this.muteText.on('pointerdown', (pointer, lx, ly, event) => {
      if (event && event.stopPropagation) event.stopPropagation();
      this.swallow = true;
      this.doMute();
    });

    this.input.on('pointerdown', (p) => {
      if (this.swallow) {
        this.swallow = false;
        return;
      }
      if (p.y < 64 && p.x > 430) return;
      this.begin();
    });
    this.input.keyboard.on('keydown', (ev) => {
      if (ev.key === 'm' || ev.key === 'M') {
        this.doMute();
        return;
      }
      this.begin();
    });
    this.input.keyboard.addCapture(['SPACE', 'UP', 'DOWN']);
  }

  doMute() {
    const muted = this.sfx.toggle();
    this.muteText.setText(muted ? 'MUTED' : 'SFX');
  }

  begin() {
    if (this.started) return;
    this.started = true;
    this.sfx.ensure();
    this.scene.start('play', { level: 0 });
  }
}
