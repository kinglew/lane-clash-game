import Phaser from 'phaser';
import { LEVELS } from '../levels.js';
import {
  applyOp,
  opLabel,
  pickGateIndex,
  laneCenter,
  justCrossed,
  createCombat,
  stepCombat,
} from '../logic.js';
import {
  FONT,
  VIEW,
  project,
  laneFromScreen,
  RUN_SPEED,
  STEER_SPEED,
  CROWD_DEPTH,
  START_FRONT,
  LANE_CLAMP,
  MAX_BLUE,
  MAX_RED,
  COMBAT_SECONDS,
  GO_DELAY,
} from '../view.js';
import { ensureArt, paintBanner, paintCannon } from '../art.js';
import { createSfx } from '../sfx.js';
import { setStatus, touchLane } from '../status.js';

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function shown(n) {
  if (n <= 0.001) return 0;
  return Math.ceil(n);
}

export class PlayScene extends Phaser.Scene {
  constructor() {
    super('play');
  }

  init(data) {
    const hasLevel = data && Number.isFinite(data.level);
    this.levelIndex = hasLevel ? data.level : 0;
    const bootSmoke = !!this.registry.get('bootSmoke');
    this.smoke = !!(data && data.smoke) || (!hasLevel && bootSmoke);
  }

  create() {
    ensureArt(this);
    this.sfx = this.registry.get('sfx') || createSfx();
    if (this.levelIndex < 0 || this.levelIndex >= LEVELS.length) this.levelIndex = 0;
    this.level = LEVELS[this.levelIndex];
    this.mode = 'run';
    this.count = this.level.start;
    this.laneX = 0;
    this.targetX = 0;
    this.frontY = START_FRONT;
    this.goTimer = this.smoke ? 0 : GO_DELAY;
    this.clock = 0;
    this.pop = 1;
    this.badFlash = 0;
    this.recoil = 0;
    this.fireCd = 0;
    this.pointerStamp = -1e9;
    this.pointerLane = 0;
    this.leaving = false;
    this.outcome = null;
    this.combat = null;
    this.combatHold = 0;
    this.jetTaken = false;
    this.lead = false;
    this.tracers = [];
    this.log = [];

    this.ground = this.add.graphics().setDepth(0);
    this.fx = this.add.graphics().setDepth(1900);
    this.cannonG = this.add.graphics().setDepth(2100);
    this.hudG = this.add.graphics().setDepth(4000);

    this.blues = [];
    for (let i = 0; i < MAX_BLUE; i++) {
      const img = this.add.image(0, 0, 'lr-blue').setVisible(false);
      img.setOrigin(0.5, 0.9);
      this.blues.push(img);
    }
    this.reds = [];
    for (let i = 0; i < MAX_RED; i++) {
      const img = this.add.image(0, 0, 'lr-red').setVisible(false);
      img.setOrigin(0.5, 0.9);
      this.reds.push(img);
    }
    this.blob = this.add.image(0, 0, 'lr-blob').setOrigin(0.5, 0.72);
    this.leadJet = this.add.image(0, 0, 'lr-jet').setVisible(false).setOrigin(0.5, 0.7);

    this.rows = this.level.rows.map((row, index) => {
      const labels = row.gates.map(() => this.add.text(0, 0, '', {
        fontFamily: FONT,
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#1a1020',
        strokeThickness: 4,
      }).setOrigin(0.5).setVisible(false));
      return {
        y: row.y,
        gates: row.gates,
        index,
        triggered: false,
        gfx: this.add.graphics(),
        labels,
      };
    });

    this.jetGfx = this.add.graphics();
    this.jetLabel = this.add.text(0, 0, opLabel(this.level.jet.op), {
      fontFamily: FONT,
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#3a2a08',
      stroke: '#fff6cc',
      strokeThickness: 4,
    }).setOrigin(0.5).setVisible(false);
    this.jetResolved = false;

    this.crossings = [];
    for (const row of this.rows) this.crossings.push({ y: row.y, type: 'row', row, done: false });
    this.crossings.push({ y: this.level.jet.y, type: 'jet', done: false });
    this.crossings.sort((a, b) => a.y - b.y);

    const hudStyle = {
      fontFamily: FONT,
      fontStyle: 'bold',
      color: '#fff8ea',
      stroke: '#3a261c',
      strokeThickness: 5,
    };
    this.levelText = this.add.text(18, 14, 'LEVEL ' + this.level.id, {
      ...hudStyle,
      fontSize: '26px',
    }).setDepth(4200);
    this.nameText = this.add.text(18, 44, this.level.name, {
      fontFamily: FONT,
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffe7bf',
      stroke: '#3a261c',
      strokeThickness: 3,
    }).setDepth(4200);
    this.blurb = this.add.text(270, 112, this.level.blurb, {
      fontFamily: FONT,
      fontSize: '16px',
      color: '#fffaf0',
      stroke: '#3a261c',
      strokeThickness: 4,
      align: 'center',
      wordWrap: { width: 420 },
    }).setOrigin(0.5).setDepth(4200);

    this.countText = this.add.text(270, 700, String(this.count), {
      fontFamily: FONT,
      fontSize: '64px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#102038',
      strokeThickness: 8,
    }).setOrigin(0.5).setDepth(4100);
    this.enemyText = this.add.text(270, 180, String(this.level.enemy), {
      fontFamily: FONT,
      fontSize: '58px',
      fontStyle: 'bold',
      color: '#fff0ee',
      stroke: '#5a0a12',
      strokeThickness: 8,
    }).setOrigin(0.5).setDepth(4100);
    this.youCap = this.add.text(270, 748, 'YOUR CROWD', {
      fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#d6e4ff',
      stroke: '#102038', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(4100).setVisible(false);
    this.foeCap = this.add.text(270, 128, this.level.enemyName.toUpperCase(), {
      fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#ffd0cc',
      stroke: '#5a0a12', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(4100).setVisible(false);

    this.muteText = this.add.text(VIEW.width - 16, 14, this.sfx.muted ? 'MUTED' : 'SFX', {
      ...hudStyle,
      fontSize: '18px',
    }).setOrigin(1, 0).setDepth(4300);
    this.muteZone = this.add.zone(VIEW.width - 52, 28, 100, 44).setOrigin(0.5).setDepth(4301)
      .setInteractive({ useHandCursor: true });
    this.muteZone.on('pointerdown', () => this.toggleMute());

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyM = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.keyEnter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.keyboard.addCapture(['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT']);

    this.input.on('pointerdown', (p) => this.aimFromPointer(p));
    this.input.on('pointermove', (p) => {
      if (!p.wasTouch || p.isDown) this.aimFromPointer(p);
    });

    touchLane({
      level: this.level.id,
      count: this.count,
      mode: 'run',
      result: null,
      log: this.log,
      smoke: this.smoke,
    });
    setStatus(this.smoke ? 'playing:smoke' : 'playing');
    this.draw();
  }

  aimFromPointer(p) {
    if (this.mode === 'overlay') return;
    if (p.y < 70 && p.x > 430) return;
    this.pointerStamp = this.time.now;
    this.pointerLane = laneFromScreen(p.x);
    this.sfx.ensure();
  }

  toggleMute() {
    const muted = this.sfx.toggle();
    this.muteText.setText(muted ? 'MUTED' : 'SFX');
  }

  smokeTarget() {
    for (const e of this.crossings) {
      if (e.done) continue;
      if (e.type === 'row') {
        const idx = this.level.proofWin.gates[e.row.index];
        return laneCenter(idx, e.row.gates.length);
      }
      return this.level.jet.x;
    }
    return this.laneX;
  }

  steer(dt) {
    if (this.smoke && this.mode === 'run') {
      this.laneX = clamp(this.smokeTarget(), -LANE_CLAMP, LANE_CLAMP);
      this.targetX = this.laneX;
      return;
    }
    const left = this.cursors.left.isDown || this.keyA.isDown;
    const right = this.cursors.right.isDown || this.keyD.isDown;
    const key = left && !right ? -1 : right && !left ? 1 : 0;
    if (key !== 0) {
      this.laneX = clamp(this.laneX + key * STEER_SPEED * dt, -LANE_CLAMP, LANE_CLAMP);
      this.targetX = this.laneX;
    } else if (this.time.now - this.pointerStamp < 90) {
      this.targetX = this.pointerLane;
      this.laneX += (this.targetX - this.laneX) * Math.min(1, 18 * dt);
      this.laneX = clamp(this.laneX, -LANE_CLAMP, LANE_CLAMP);
    }
  }

  update(_time, delta) {
    const dt = Math.min(0.05, delta / 1000);
    this.clock += dt;
    this.pop += (1 - this.pop) * Math.min(1, dt * 9);
    this.badFlash = Math.max(0, this.badFlash - dt);
    this.recoil = Math.max(0, this.recoil - dt * 7);
    if (this.blurb.alpha > 0 && this.clock > 2.4) {
      this.blurb.alpha = Math.max(0, this.blurb.alpha - dt * 1.4);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyM)) this.toggleMute();

    if (this.mode === 'overlay') {
      if (Phaser.Input.Keyboard.JustDown(this.keyEnter) || Phaser.Input.Keyboard.JustDown(this.keySpace)) {
        this.confirm();
      }
      this.draw();
      return;
    }

    this.steer(dt);

    if (this.mode === 'run') this.updateRun(dt);
    else if (this.mode === 'combat') this.updateCombat(dt);

    touchLane({
      level: this.level.id,
      count: this.mode === 'combat' && this.combat ? shown(this.combat.player) : this.count,
      mode: this.mode,
      log: this.log,
    });
    this.draw();
  }

  updateRun(dt) {
    const prev = this.frontY;
    if (this.goTimer > 0) this.goTimer -= dt;
    else this.frontY += RUN_SPEED * dt;

    for (const e of this.crossings) {
      if (e.done) continue;
      if (!justCrossed(prev, this.frontY, e.y)) continue;
      e.done = true;
      if (e.type === 'row') this.applyRow(e.row);
      else this.applyJet();
      if (this.mode !== 'run') return;
    }

    if (this.frontY >= this.level.endY) {
      this.frontY = this.level.endY;
      this.beginCombat();
      return;
    }

    this.fireCd -= dt;
    if (this.goTimer <= 0 && this.fireCd <= 0) {
      this.fireCd = 0.09;
      this.recoil = 1;
      this.sfx.shoot(this.time.now);
      this.tracers.push({
        x: this.laneX + (Math.random() - 0.5) * 0.1,
        y: this.frontY - CROWD_DEPTH + 20,
        life: 0.28,
      });
    }
    for (const t of this.tracers) {
      t.y += 820 * dt;
      t.life -= dt;
    }
    this.tracers = this.tracers.filter((t) => t.life > 0 && t.y < this.frontY);
  }

  applyRow(row) {
    const idx = pickGateIndex(this.laneX, row.gates.length);
    const op = row.gates[idx];
    row.triggered = true;
    row.hit = idx;
    this.count = applyOp(this.count, op);
    this.pop = 1.55;
    this.sfx.gate(!!op.good);
    if (!op.good) {
      this.badFlash = 0.4;
      this.cameras.main.shake(160, 0.008);
    } else {
      this.cameras.main.shake(90, 0.0035);
    }
    const p = project(row.y, laneCenter(idx, row.gates.length), this.camY());
    this.spawnFloater(p.x, p.y, opLabel(op), op.good ? '#fff6cf' : '#ffd4dc');
    this.log.push({ type: 'gate', index: row.index, gate: idx, count: this.count });
    if (this.count <= 0) this.wipe();
  }

  applyJet() {
    this.jetResolved = true;
    const hit = Math.abs(this.laneX - this.level.jet.x) <= this.level.jet.radius;
    if (!hit) {
      this.log.push({ type: 'jet', hit: false, count: this.count });
      return;
    }
    this.jetTaken = true;
    this.lead = true;
    this.count = applyOp(this.count, this.level.jet.op);
    this.pop = 1.7;
    this.sfx.jet();
    this.cameras.main.shake(120, 0.005);
    const p = project(this.level.jet.y, this.level.jet.x, this.camY());
    this.spawnFloater(p.x, p.y - 20, 'JET ' + opLabel(this.level.jet.op), '#ffe56a');
    this.log.push({ type: 'jet', hit: true, count: this.count });
    if (this.count <= 0) this.wipe();
  }

  wipe() {
    if (this.mode === 'overlay') return;
    this.outcome = {
      kind: 'lose',
      win: false,
      player: 0,
      enemy: this.level.enemy,
      preBoss: true,
    };
    this.sfx.lose();
    this.showOverlay('lose');
  }

  beginCombat() {
    if (this.mode !== 'run') return;
    if (this.count <= 0) {
      this.wipe();
      return;
    }
    this.mode = 'combat';
    this.combat = createCombat(this.count, this.level.enemy, COMBAT_SECONDS);
    this.combatStartP = Math.max(0.0001, this.combat.player);
    this.combatStartE = Math.max(0.0001, this.combat.enemy);
    this.combatHold = 0;
    this.cameras.main.shake(200, 0.01);
  }

  updateCombat(dt) {
    if (!this.combat.done) this.combat = stepCombat(this.combat, dt);
    if (this.combat.done) {
      this.combatHold += dt;
      if (this.combatHold > 0.42) this.finishCombat();
    }
  }

  finishCombat() {
    if (this.mode === 'overlay') return;
    const win = !!this.combat.win;
    const last = this.levelIndex >= LEVELS.length - 1;
    this.outcome = {
      kind: win ? (last ? 'victory' : 'win') : 'lose',
      win,
      player: shown(this.combat.player),
      enemy: shown(this.combat.enemy),
      preBoss: false,
    };
    if (win) this.sfx.win();
    else this.sfx.lose();
    this.showOverlay(this.outcome.kind);
  }

  showOverlay(kind) {
    this.mode = 'overlay';
    const win = kind === 'win' || kind === 'victory';
    touchLane({ result: win ? 'win' : 'lose', mode: 'overlay', overlay: kind });
    setStatus('result:' + (win ? 'win' : 'lose'));

    const title = kind === 'victory' ? 'DUNES CLEARED' : kind === 'win' ? 'LANE CLEAR' : 'OVERRUN';
    let body;
    if (kind === 'victory') {
      body = 'You rushed all 6 lanes.\nThe red mobs are scattered across the sand.';
    } else if (kind === 'win') {
      body = this.level.name + ' is clear.\n' + this.outcome.player + ' blues still standing.';
    } else if (this.outcome.preBoss) {
      body = 'The gates wiped the squad out\nbefore the ' + this.level.enemyName + '.';
    } else {
      body = 'The ' + this.level.enemyName + ' still has ' + this.outcome.enemy + '.\nSteer a richer line and try again.';
    }
    const primary = kind === 'win' ? 'NEXT LEVEL' : kind === 'victory' ? 'PLAY AGAIN' : 'RETRY';

    const objs = [];
    const add = (o, d) => { o.setDepth(d); objs.push(o); return o; };
    add(this.add.rectangle(270, 480, 540, 960, 0x140c08, 0.58), 5000);
    add(this.add.rectangle(270, 470, 440, 500, 0xf7e7c6, 1).setStrokeStyle(8, 0x3a261c), 5001);
    add(this.add.text(270, 300, title, {
      fontFamily: FONT,
      fontSize: kind === 'victory' ? '36px' : '48px',
      fontStyle: 'bold',
      color: win ? '#6a35d6' : '#c41432',
      align: 'center',
    }).setOrigin(0.5), 5002);
    add(this.add.text(270, 400, body, {
      fontFamily: FONT,
      fontSize: '20px',
      color: '#4a3424',
      align: 'center',
      lineSpacing: 6,
      wordWrap: { width: 380 },
    }).setOrigin(0.5), 5002);

    const btn = add(this.add.rectangle(270, 530, 300, 72, 0x6c35de).setStrokeStyle(5, 0xfff1c4)
      .setInteractive({ useHandCursor: true }), 5002);
    add(this.add.text(270, 530, primary, {
      fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#fffaf0',
    }).setOrigin(0.5), 5003);
    btn.on('pointerover', () => btn.setFillStyle(0x8452f2));
    btn.on('pointerout', () => btn.setFillStyle(0x6c35de));
    btn.on('pointerdown', () => this.confirm());

    const menu = add(this.add.text(270, 610, 'MENU', {
      fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#6a4a32',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }), 5003);
    menu.on('pointerdown', () => this.toMenu());
    this.overlayObjs = objs;
  }

  confirm() {
    if (this.leaving || this.mode !== 'overlay') return;
    this.leaving = true;
    if (this.outcome.kind === 'win') this.scene.start('play', { level: this.levelIndex + 1 });
    else if (this.outcome.kind === 'victory') this.scene.start('play', { level: 0 });
    else this.scene.start('play', { level: this.levelIndex });
  }

  toMenu() {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start('menu');
  }

  spawnFloater(x, y, text, color) {
    const t = this.add.text(x, y, text, {
      fontFamily: FONT,
      fontSize: '40px',
      fontStyle: 'bold',
      color,
      stroke: '#1a120c',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(3000);
    this.tweens.add({
      targets: t,
      y: y - 86,
      alpha: 0,
      duration: 680,
      ease: 'Cubic.easeOut',
      onComplete: () => { if (t.active) t.destroy(); },
    });
  }

  camY() {
    return this.frontY - CROWD_DEPTH - 36;
  }

  cannonY() {
    return this.frontY - CROWD_DEPTH;
  }

  draw() {
    const cam = this.camY();
    this.drawGround(cam);
    this.drawGates(cam);
    this.drawJet(cam);
    this.drawActors(cam);
    this.drawCannon(cam);
    this.drawFx(cam);
    this.drawHud(cam);
  }

  drawGround(cam) {
    const g = this.ground;
    g.clear();
    const yFar = cam + VIEW.depth;
    const fL = project(yFar, -1, cam);
    const fR = project(yFar, 1, cam);
    const nLx = VIEW.centerX - VIEW.nearHalf;
    const nRx = VIEW.centerX + VIEW.nearHalf;

    g.fillStyle(0xf6d7a4, 1);
    g.fillRect(0, 0, VIEW.width, VIEW.height);
    g.fillStyle(0xffe6ae, 0.95);
    g.fillCircle(438, 58, 28);
    g.fillStyle(0xe7c48a, 1);
    g.fillEllipse(150, fL.y + 8, 240, 54);
    g.fillEllipse(400, fL.y + 16, 280, 64);
    g.fillStyle(0xf3e0b4, 1);
    g.fillEllipse(250, fL.y - 6, 180, 36);

    g.fillStyle(0x3a261c, 1);
    g.beginPath();
    g.moveTo(0, VIEW.height);
    g.lineTo(nLx, VIEW.height);
    g.lineTo(fL.x, fL.y);
    g.lineTo(0, fL.y);
    g.closePath();
    g.fillPath();
    g.beginPath();
    g.moveTo(VIEW.width, VIEW.height);
    g.lineTo(nRx, VIEW.height);
    g.lineTo(fR.x, fR.y);
    g.lineTo(VIEW.width, fL.y);
    g.closePath();
    g.fillPath();

    g.fillStyle(0xf1d6a0, 1);
    g.beginPath();
    g.moveTo(nLx, VIEW.height);
    g.lineTo(nRx, VIEW.height);
    g.lineTo(fR.x, fR.y);
    g.lineTo(fL.x, fL.y);
    g.closePath();
    g.fillPath();

    g.lineStyle(6, 0x6a4632, 1);
    g.beginPath();
    g.moveTo(nLx, VIEW.height);
    g.lineTo(fL.x, fL.y);
    g.moveTo(nRx, VIEW.height);
    g.lineTo(fR.x, fR.y);
    g.strokePath();

    const stripe0 = Math.floor(cam / 80) * 80;
    for (let wy = stripe0; wy < cam + VIEW.depth; wy += 80) {
      const a = project(wy, -0.94, cam);
      const b = project(wy, 0.94, cam);
      if (!a.vis) continue;
      g.lineStyle(Math.max(1, 3 * a.scale), 0xe0bf86, 0.7);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.strokePath();
    }

    g.fillStyle(0xd7b483, 0.8);
    const speck0 = Math.floor(cam / 50) * 50;
    for (let wy = speck0; wy < cam + VIEW.depth; wy += 50) {
      const lane = Math.sin(wy * 0.013) * 0.72;
      const lane2 = Math.cos(wy * 0.021) * 0.55;
      for (const laneX of [lane, lane2]) {
        const p = project(wy, laneX, cam);
        if (!p.vis || p.t < 0) continue;
        g.fillStyle(0xd7b483, 0.75);
        g.fillCircle(p.x, p.y, Math.max(1.2, 3.2 * p.scale));
      }
    }

    const post0 = Math.floor(cam / 130) * 130;
    for (let wy = post0; wy < cam + VIEW.depth; wy += 130) {
      for (const side of [-1, 1]) {
        const p = project(wy, side, cam);
        if (!p.vis) continue;
        const w = Math.max(4, 16 * p.scale);
        const h = Math.max(8, 28 * p.scale);
        g.fillStyle(0x2a1a14, 1);
        g.fillRect(p.x - (side === -1 ? w : 0), p.y - h, w, h);
        g.fillStyle(0x6a4632, 1);
        g.fillRect(p.x - (side === -1 ? w : 0), p.y - h, w, Math.max(2, 4 * p.scale));
      }
    }

    const a = project(this.cannonY(), this.laneX, cam);
    const b = project(this.frontY + (this.lead ? 40 : 0), this.laneX, cam);
    g.lineStyle(Math.max(3, 16 * a.scale), 0x9ec9ff, 0.55);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.strokePath();

    const line = project(this.level.endY, 0, cam);
    if (this.mode === 'run' && line.vis && line.t > 0) {
      const L = project(this.level.endY, -0.95, cam);
      const R = project(this.level.endY, 0.95, cam);
      g.lineStyle(Math.max(2, 8 * line.scale), 0xe23b3b, 0.85);
      g.beginPath();
      g.moveTo(L.x, L.y);
      g.lineTo(R.x, R.y);
      g.strokePath();
    }
  }

  drawGates(cam) {
    const next = this.rows.find((r) => !r.triggered);
    const aimed = next ? pickGateIndex(this.laneX, next.gates.length) : -1;
    for (const row of this.rows) {
      const mid = project(row.y, 0, cam);
      const passed = row.triggered && this.frontY > row.y + 80;
      const show = mid.vis && mid.t > -0.02 && !passed;
      row.gfx.clear();
      row.gfx.setDepth(120 + mid.y);
      if (!show) {
        for (const label of row.labels) label.setVisible(false);
        continue;
      }
      const n = row.gates.length;
      for (let i = 0; i < n; i++) {
        const left = -1 + i * (2 / n);
        const right = -1 + (i + 1) * (2 / n);
        const pL = project(row.y, left, cam);
        const pR = project(row.y, right, cam);
        const cx = (pL.x + pR.x) / 2;
        const gw = Math.max(12, (pR.x - pL.x) * 0.9);
        const gh = Math.max(16, 52 * mid.scale);
        const hot = next === row && i === aimed;
        const alpha = row.triggered ? 0.32 : 1;
        paintBanner(row.gfx, cx, mid.y, gw, gh, row.gates[i], hot, alpha);
        const label = row.labels[i];
        label.setText(opLabel(row.gates[i]));
        label.setPosition(cx, mid.y);
        label.setScale(Math.max(0.42, mid.scale * 1.05));
        label.setAlpha(alpha);
        label.setVisible(true);
        label.setDepth(121 + mid.y);
      }
    }
  }

  drawJet(cam) {
    const jet = this.level.jet;
    const p = project(jet.y, jet.x, cam);
    this.jetGfx.clear();
    const show = !this.jetResolved && p.vis && p.t > 0;
    if (!show) {
      this.jetLabel.setVisible(false);
      this.jetGfx.setVisible(false);
      return;
    }
    this.jetGfx.setVisible(true);
    this.jetGfx.setDepth(120 + p.y);
    const bob = Math.sin(this.clock * 6) * 4 * p.scale;
    const w = Math.max(28, 78 * p.scale);
    const h = Math.max(20, 48 * p.scale);
    this.jetGfx.fillStyle(0x000000, 0.18);
    this.jetGfx.fillEllipse(p.x, p.y + h * 0.45 + bob, w * 0.8, h * 0.28);
    this.jetGfx.fillStyle(0xf0b429, 1);
    this.jetGfx.fillTriangle(p.x - w * 0.55, p.y + h * 0.15 + bob, p.x, p.y - h * 0.15 + bob, p.x, p.y + h * 0.35 + bob);
    this.jetGfx.fillTriangle(p.x + w * 0.55, p.y + h * 0.15 + bob, p.x, p.y - h * 0.15 + bob, p.x, p.y + h * 0.35 + bob);
    this.jetGfx.fillStyle(0xffd23a, 1);
    this.jetGfx.fillRoundedRect(p.x - w * 0.16, p.y - h * 0.55 + bob, w * 0.32, h * 0.95, 8 * p.scale);
    this.jetGfx.fillStyle(0xfff6c4, 1);
    this.jetGfx.fillTriangle(p.x, p.y - h * 0.85 + bob, p.x - w * 0.16, p.y - h * 0.35 + bob, p.x + w * 0.16, p.y - h * 0.35 + bob);
    this.jetLabel.setVisible(true);
    this.jetLabel.setPosition(p.x, p.y + bob);
    this.jetLabel.setScale(Math.max(0.45, p.scale));
    this.jetLabel.setDepth(121 + p.y);
  }

  drawActors(cam) {
    let blueVis;
    let redVis;
    let redFrac = 1;
    if (this.mode === 'combat' || (this.mode === 'overlay' && this.combat)) {
      const pf = clamp(this.combat.player / this.combatStartP, 0, 1);
      const ef = clamp(this.combat.enemy / this.combatStartE, 0, 1);
      blueVis = this.combat.player <= 0.001 ? 0 : Math.max(1, Math.round(Math.min(MAX_BLUE, Math.max(this.count, 1)) * pf));
      // Use the pre-fight visual budget so a huge army visibly melts down.
      const blueBudget = Math.min(MAX_BLUE, Math.max(12, this.count));
      blueVis = this.combat.player <= 0.001 ? 0 : Math.max(1, Math.round(blueBudget * pf));
      redVis = this.combat.enemy <= 0.001 ? 0 : Math.max(1, Math.round(MAX_RED * ef));
      redFrac = ef;
    } else {
      blueVis = this.count <= 0 ? 0 : Math.min(MAX_BLUE, this.count);
      redVis = MAX_RED;
    }

    for (let i = 0; i < this.blues.length; i++) {
      const img = this.blues[i];
      if (i >= blueVis) {
        img.setVisible(false);
        continue;
      }
      const slot = blueSlot(i, blueVis, this.laneX, this.frontY);
      const p = project(slot.y, slot.x, cam);
      if (!p.vis) {
        img.setVisible(false);
        continue;
      }
      const bob = Math.sin(this.clock * 9 + i * 0.7) * 3 * p.scale;
      img.setVisible(true);
      img.setPosition(p.x, p.y + bob);
      img.setScale(Math.max(0.18, p.scale * 0.95));
      img.setDepth(140 + p.y);
      img.setRotation((slot.spin) * 0.15);
    }

    const grow = 1.02 + (this.level.id - 1) * 0.055;
    const bp = project(this.level.endY + 16, 0.02, cam);
    const blobShow = (bp.vis && bp.t > 0) || this.mode !== 'run';
    this.blob.setVisible(blobShow);
    if (blobShow) {
      const sc = (this.mode === 'run' ? bp.scale : Math.max(bp.scale, 0.72)) * grow * (0.72 + 0.28 * redFrac);
      const pulse = 1 + Math.sin(this.clock * 3) * 0.03;
      this.blob.setPosition(this.mode === 'run' ? bp.x : VIEW.centerX, this.mode === 'run' ? bp.y : Math.min(bp.y, 430));
      this.blob.setScale(Math.max(0.2, sc * pulse));
      this.blob.setDepth(130 + (this.mode === 'run' ? bp.y : 400));
    }

    for (let i = 0; i < this.reds.length; i++) {
      const img = this.reds[i];
      if (i >= redVis) {
        img.setVisible(false);
        continue;
      }
      const ang = i * 2.399963;
      const ring = 0.08 + (i % 6) * 0.06;
      const ex = Math.cos(ang) * Math.min(0.88, ring * 1.3);
      const ey = this.level.endY - 6 + Math.sin(ang) * (16 + ring * 36);
      const anchor = this.mode === 'run' ? project(ey, ex, cam) : null;
      if (this.mode === 'run') {
        if (!anchor.vis || anchor.t < 0) {
          img.setVisible(false);
          continue;
        }
        img.setVisible(true);
        img.setPosition(anchor.x, anchor.y);
        img.setScale(Math.max(0.16, anchor.scale * 0.9));
        img.setDepth(145 + anchor.y);
      } else {
        const spread = 150;
        img.setVisible(true);
        img.setPosition(VIEW.centerX + Math.cos(ang) * spread * (0.35 + (i % 5) * 0.08), 390 + Math.sin(ang) * 70);
        img.setScale(0.85 * (0.75 + 0.25 * redFrac));
        img.setDepth(1500 + (i % 9));
      }
    }

    if (this.lead) {
      const lp = project(Math.min(this.level.endY - 8, this.frontY + 70), this.laneX, cam);
      this.leadJet.setVisible(lp.vis);
      this.leadJet.setPosition(lp.x, lp.y + Math.sin(this.clock * 10) * 3);
      this.leadJet.setScale(Math.max(0.72, lp.scale * 1.2));
      this.leadJet.setDepth(160 + lp.y);
    } else {
      this.leadJet.setVisible(false);
    }
  }

  drawCannon(cam) {
    const p = project(this.cannonY(), this.laneX, cam);
    this.cannonG.clear();
    const sc = Math.max(0.55, p.scale * 1.05);
    paintCannon(this.cannonG, p.x, Math.min(VIEW.height - 8, p.y), sc, this.recoil, this.frontY * 0.04);
  }

  drawFx(cam) {
    const g = this.fx;
    g.clear();
    g.fillStyle(0xd7ecff, 0.9);
    for (const t of this.tracers) {
      const p = project(t.y, t.x, cam);
      if (!p.vis) continue;
      g.fillCircle(p.x, p.y, Math.max(1.5, 4 * p.scale));
    }
  }

  drawHud(cam) {
    const g = this.hudG;
    g.clear();
    const prog = clamp(this.frontY / this.level.endY, 0, 1);
    g.fillStyle(0x2a1a14, 0.55);
    g.fillRoundedRect(16, 8, VIEW.width - 32, 6, 3);
    g.fillStyle(0xffd36a, 1);
    g.fillRoundedRect(16, 8, (VIEW.width - 32) * prog, 6, 3);

    if (this.mode === 'overlay') {
      this.countText.setVisible(false);
      this.enemyText.setVisible(false);
      this.youCap.setVisible(false);
      this.foeCap.setVisible(false);
      return;
    }
    this.countText.setVisible(true);

    const fighting = this.mode === 'combat' && this.combat;
    if (fighting) {
      const pf = clamp(this.combat.player / this.combatStartP, 0, 1);
      const ef = clamp(this.combat.enemy / this.combatStartE, 0, 1);
      this.enemyText.setPosition(270, 176);
      this.enemyText.setScale(1);
      this.enemyText.setText(String(shown(this.combat.enemy)));
      this.enemyText.setVisible(true);
      this.foeCap.setVisible(true);
      this.countText.setPosition(270, 800);
      this.countText.setScale(this.pop);
      this.countText.setText(String(shown(this.combat.player)));
      this.youCap.setVisible(true);
      g.fillStyle(0x4a1016, 0.45);
      g.fillRoundedRect(70, 206, 400, 14, 7);
      g.fillStyle(0xe23b3b, 1);
      g.fillRoundedRect(70, 206, 400 * ef, 14, 7);
      g.fillStyle(0x142033, 0.45);
      g.fillRoundedRect(70, 836, 400, 14, 7);
      g.fillStyle(0x3d7eff, 1);
      g.fillRoundedRect(70, 836, 400 * pf, 14, 7);
    } else {
      this.youCap.setVisible(false);
      this.foeCap.setVisible(false);
      const fp = project(this.frontY - CROWD_DEPTH * 0.35, this.laneX, cam);
      this.countText.setPosition(clamp(fp.x, 80, 460), clamp(fp.y, 150, 820));
      this.countText.setScale(this.pop);
      this.countText.setText(String(this.count));
      const bp = project(this.level.endY + 16, 0, cam);
      const showEnemy = bp.vis && bp.t > 0.02 && bp.t < 1;
      this.enemyText.setVisible(showEnemy);
      if (showEnemy) {
        this.enemyText.setScale(Math.max(0.45, bp.scale));
        this.enemyText.setPosition(bp.x, bp.y - Math.max(36, 80 * bp.scale));
        this.enemyText.setText(String(this.level.enemy));
      }
    }

    if (this.badFlash > 0) this.countText.setColor('#ffc1c7');
    else if (this.count >= 10000) this.countText.setColor('#ffe36a');
    else if (this.count >= 1000) this.countText.setColor('#fff4cc');
    else this.countText.setColor('#ffffff');
  }
}

function blueSlot(i, count, laneX, frontY) {
  const n = Math.max(1, count);
  const t = n === 1 ? 0 : i / (n - 1);
  const col = i % 5;
  const y = frontY - Math.pow(t, 0.88) * CROWD_DEPTH;
  const widen = 0.035 + Math.pow(t, 0.85) * 0.36;
  const centered = (col - 2) / 2;
  const jitter = ((i * 37) % 11) / 11 - 0.5;
  let x = laneX + centered * widen + jitter * 0.03;
  if (t < 0.22) x = laneX + centered * 0.05 + jitter * 0.02;
  return { x: clamp(x, -0.9, 0.9), y, spin: jitter * 0.4 };
}
