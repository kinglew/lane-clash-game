import Phaser from 'phaser';
import { LEVELS } from '../levels.js';
import {
  opLabel,
  pickGateIndex,
  laneCenter,
  createWorld,
  stepWorld,
  weaponById,
  switchWeapon,
  heldWeapon,
  autoPilot,
  BOSS_MOVES,
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
  GO_DELAY,
} from '../view.js';
import { ensureArt, paintBanner, paintCannon } from '../art.js';
import { createSfx } from '../sfx.js';
import { setStatus, touchLane } from '../status.js';

// Per-weapon look: projectile color, core color, size, trail length (px of world y),
// muzzle flash color, and how hard a landed hit shakes the camera.
const WSTYLE = {
  shot: { color: 0xd7ecff, core: 0xffffff, size: 3.4, trail: 26, flash: 0xeaf6ff, shake: 0 },
  bolts: { color: 0xffd84a, core: 0xfff8d0, size: 2.4, trail: 44, flash: 0xffe58a, shake: 0 },
  spread: { color: 0x5fe8a8, core: 0xd8fff0, size: 4.4, trail: 22, flash: 0x9ff5cc, shake: 0 },
  ball: { color: 0xff7a32, core: 0xfff1c9, size: 8.5, trail: 40, flash: 0xffb066, shake: 0.006 },
  needle: { color: 0xbff2ff, core: 0xffffff, size: 1.6, trail: 52, flash: 0xd8f8ff, shake: 0 },
  lance: { color: 0xfff0a8, core: 0xffffff, size: 3.2, trail: 60, flash: 0xfff4c8, shake: 0.002 },
  mortar: { color: 0xa24bdf, core: 0xf3d0ff, size: 11, trail: 34, flash: 0xd9a2ff, shake: 0.009 },
};
const MOVE_COLOR = { slam: 0xff5a3a, volley: 0xffb02e, charge: 0xff2a5a };

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
    this.world = createWorld(this.level, START_FRONT);
    this.count = this.world.count;
    this.frontY = this.world.frontY;
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
    this.pending = 0;
    this.jetTaken = false;
    this.lead = false;
    this.tracers = [];
    this.log = [];
    // Fixed-size pools. Nothing below allocates per frame.
    this.shotPool = [];
    for (let i = 0; i < 40; i++) {
      this.shotPool.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, kind: 'shot', arc: 0 });
    }
    this.shotCursor = 0;
    this.impacts = [];
    for (let i = 0; i < 16; i++) this.impacts.push({ on: false, x: 0, y: 0, life: 0, max: 0.14, kind: 'shot', big: false });
    this.impactCursor = 0;
    this.sparks = [];
    for (let i = 0; i < 48; i++) this.sparks.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0.3, color: 0xffffff });
    this.sparkCursor = 0;
    this.waves3 = [];
    for (let i = 0; i < 6; i++) this.waves3.push({ on: false, x: 0, y: 0, r: 0.3, life: 0, max: 0.45, color: 0xff5a3a });
    this.waveCursor = 0;
    this.bossShots = [];
    for (let i = 0; i < 12; i++) this.bossShots.push({ on: false, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, dur: 1 });
    this.bossShotCursor = 0;
    this.muzzle = 0;
    this.muzzleColor = 0xfff4c4;
    this.lunge = 0;
    this.swingT = 0;
    this.shakeCd = 0;
    this.bossAnim = { rise: 0, dash: 0, slam: 0 };

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

    const arm = (this.level.weapon && this.level.weapon.id) || 'shot';
    const armName = arm === 'bolts' ? 'RAPID BOLTS' : arm === 'spread' ? 'SPREAD SHOT' : arm === 'ball' ? 'CANNONBALL' : 'SHOT';
    this.weaponGfx = this.add.graphics();
    this.weaponLabel = this.add.text(0, 0, armName, {
      fontFamily: FONT,
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#102033',
      stroke: '#d7f4ff',
      strokeThickness: 3,
    }).setOrigin(0.5).setVisible(false);
    this.gunText = this.add.text(270, 860, '', { fontFamily: FONT, fontSize: '14px' }).setVisible(false);
    this.dropLabels = [];
    for (let i = 0; i < 4; i++) {
      this.dropLabels.push(this.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#102033',
        stroke: '#d7f4ff', strokeThickness: 3,
      }).setOrigin(0.5).setVisible(false));
    }
    this.slotTexts = [];
    this.slotZones = [];
    for (let i = 0; i < 3; i++) {
      const x = 270 + (i - 1) * 156;
      const zone = this.add.zone(x, 918, 146, 52).setInteractive({ useHandCursor: true }).setDepth(4600);
      zone.on('pointerdown', () => this.trySwitch(i));
      this.slotZones.push(zone);
      this.slotTexts.push(this.add.text(x, 918, (i + 1) + ' —', {
        fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#d6ecff',
        stroke: '#102038', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(4601));
    }
    this.midMarks = [];
    for (const wave of this.world.waves) {
      if (!wave.mid) continue;
      this.midMarks.push({
        wave,
        img: this.add.image(0, 0, 'lr-blob').setOrigin(0.5, 0.72).setVisible(false),
        anim: { rise: 0, dash: 0, slam: 0 },
        label: this.add.text(0, 0, wave.name.toUpperCase() + '  ARMOR ' + wave.armor, {
          fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#fff0ee',
          stroke: '#5a0a12', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(4100).setVisible(false),
      });
    }

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
    this.enemyText = this.add.text(270, 180, String(this.level.boss.count), {
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
    this.key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.key3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
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
    if (p.y > 870) return;
    this.pointerStamp = this.time.now;
    this.pointerLane = laneFromScreen(p.x);
    this.sfx.ensure();
  }

  toggleMute() {
    const muted = this.sfx.toggle();
    this.muteText.setText(muted ? 'MUTED' : 'SFX');
  }

  smokePlan() {
    if (!this._smokePlan) {
      this._smokePlan = {
        gates: this.level.proofWin.gates,
        jet: !!this.level.proofWin.jet,
        weapon: !!this.level.proofWin.weapon,
        drops: true,
        dodge: true,
        smart: true,
      };
    }
    return this._smokePlan;
  }

  steer(dt) {
    if (this.smoke && this.mode === 'run') {
      // Reference player: same autopilot the tests use, steering at keyboard speed.
      const aim = autoPilot(this.world, this.level, this.smokePlan(), this.laneX);
      if (aim.slot !== this.world.loadout.equipped) this.trySwitch(aim.slot);
      const d = aim.lane - this.laneX;
      const ms = STEER_SPEED * dt;
      this.laneX = clamp(Math.abs(d) <= ms ? aim.lane : this.laneX + Math.sign(d) * ms, -LANE_CLAMP, LANE_CLAMP);
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
    this.muzzle = Math.max(0, this.muzzle - dt * 7);
    this.lunge = Math.max(0, this.lunge - dt * 4.5);
    this.swingT += dt;
    this.shakeCd = Math.max(0, this.shakeCd - dt);
    this.decayAnim(this.bossAnim, dt);
    for (let i = 0; i < this.midMarks.length; i++) this.decayAnim(this.midMarks[i].anim, dt);
    if (this.blurb.alpha > 0 && this.clock > 2.4) {
      this.blurb.alpha = Math.max(0, this.blurb.alpha - dt * 1.4);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyM)) this.toggleMute();
    if (this.mode === 'run') {
      if (Phaser.Input.Keyboard.JustDown(this.key1)) this.trySwitch(0);
      if (Phaser.Input.Keyboard.JustDown(this.key2)) this.trySwitch(1);
      if (Phaser.Input.Keyboard.JustDown(this.key3)) this.trySwitch(2);
    }

    if (this.mode === 'overlay') {
      if (Phaser.Input.Keyboard.JustDown(this.keyEnter) || Phaser.Input.Keyboard.JustDown(this.keySpace)) {
        this.confirm();
      }
      this.draw();
      return;
    }

    this.steer(dt);
    if (this.mode === 'run') this.updateRun(dt);

    touchLane({
      level: this.level.id,
      count: shown(this.count),
      mode: this.mode,
      log: this.log,
    });
    this.draw();
  }

  updateRun(dt) {
    if (this.pending > 0) {
      this.pending -= dt;
      if (this.pending <= 0) this.finishRun();
      return;
    }
    if (this.goTimer > 0) {
      this.goTimer -= dt;
      return;
    }

    const ev = stepWorld(this.world, dt, this.laneX);
    this.syncWorld();
    for (const g of ev.gates) this.juiceGate(g);
    if (ev.jet) this.juiceJet(ev.jet);
    for (let i = 0; i < ev.weapons.length; i++) this.juiceWeapon(ev.weapons[i]);
    this.juiceAttacks(ev.attacks);
    for (let i = 0; i < ev.bossTells.length; i++) this.juiceTell(ev.bossTells[i]);
    for (let i = 0; i < ev.bossHits.length; i++) this.juiceBossHit(ev.bossHits[i]);
    this.stepShots(dt);

    this.fireCd -= dt;
    if (this.fireCd <= 0 && this.count > 0) {
      this.fireCd = 0.09;
      this.recoil = 1;
      this.sfx.shoot(this.time.now);
      this.tracers.push({
        x: this.laneX + (Math.random() - 0.5) * 0.1,
        y: this.frontY - CROWD_DEPTH + 20,
        life: 0.28,
      });
    }
    for (const tr of this.tracers) {
      tr.y += 820 * dt;
      tr.life -= dt;
    }
    this.tracers = this.tracers.filter((tr) => tr.life > 0 && tr.y < this.frontY + 40);

    if (this.world.won || this.world.lost) this.pending = 0.28;
  }

  syncWorld() {
    this.count = this.world.count;
    this.frontY = this.world.frontY;
    this.jetTaken = this.world.jet.taken;
    this.jetResolved = this.world.jet.resolved;
    this.lead = this.jetTaken;
    for (let i = 0; i < this.rows.length; i++) {
      this.rows[i].triggered = this.world.rows[i].triggered;
      this.rows[i].hit = this.world.rows[i].hit;
    }
  }

  juiceGate(g) {
    const row = this.rows[g.index];
    const op = g.op;
    this.pop = 1.55;
    this.sfx.gate(!!op.good);
    if (!op.good) {
      this.badFlash = 0.4;
      this.cameras.main.shake(160, 0.008);
    } else {
      this.cameras.main.shake(90, 0.0035);
    }
    const p = project(row.y, laneCenter(g.gate, row.gates.length), this.camY());
    this.spawnFloater(p.x, p.y, opLabel(op), op.good ? '#fff6cf' : '#ffd4dc');
    this.log.push({ type: 'gate', index: g.index, gate: g.gate, count: shown(g.count) });
  }

  trySwitch(index) {
    if (this.mode !== 'run') return;
    const res = switchWeapon(this.world.loadout, index);
    this.world.weapon = heldWeapon(this.world.loadout);
    if (res.changed) {
      this.world.blueAcc = 0;
      this.sfx.weapon();
      this.spawnFloater(270, 840, (index + 1) + ' ' + this.world.weapon.name.toUpperCase(), '#d6ecff');
    } else if (res.reason === 'empty') {
      this.spawnFloater(270, 840, 'EMPTY', '#ffd0d4');
    }
  }

  juiceWeapon(ev) {
    this.log.push({ type: 'weapon', hit: ev.hit, id: ev.id, reason: ev.reason, slot: ev.slot, count: shown(ev.count) });
    if (!ev.hit) return;
    const p = project(ev.y, ev.x, this.camY());
    let label = ev.name.toUpperCase();
    let color = '#b9ecff';
    if (ev.reason === 'full') { label = 'FULL'; color = '#ffd0d4'; }
    else if (ev.reason === 'have') { label = 'HAVE IT'; color = '#ffe7a3'; }
    else {
      this.pop = 1.45;
      this.sfx.weapon();
      label = (ev.slot + 1) + ' ' + ev.name.toUpperCase();
    }
    this.spawnFloater(p.x, p.y - 18, label, color);
  }

  juiceAttacks(attacks) {
    if (!attacks || !attacks.length) return;
    this.sfx.ensure();
    let swung = false;
    for (let i = 0; i < attacks.length; i++) {
      const a = attacks[i];
      if (a.side === 'blue' && a.shots > 0) {
        const st = WSTYLE[a.weapon] || WSTYLE.shot;
        this.muzzle = 1;
        this.muzzleColor = st.flash;
        this.spawnVolley(a);
        this.sfx.attack(a.weapon, this.time.now);
        if (a.killed > 0) {
          const big = st.shake > 0;
          this.spawnImpact(a.front + 10, this.laneX + (Math.random() - 0.5) * 0.3, a.weapon, big);
          if (big && this.shakeCd <= 0) {
            this.cameras.main.shake(90, st.shake);
            this.shakeCd = 0.16;
          }
        } else if (a.armor > 0) {
          // Armor chip: a small grey spark so the player sees light guns bouncing.
          this.spawnSparks(a.front + 6, this.laneX, 2, 0xc8c8c8, 0.18);
        }
      } else if (a.side === 'red' && a.shots > 0) {
        swung = true;
        if (a.killed > 0) {
          this.spawnImpact(this.frontY - 12, this.laneX + (Math.random() - 0.5) * 0.3, 'swing', false);
        }
      }
    }
    if (swung) {
      this.lunge = 1;
      this.sfx.attack('swing', this.time.now);
    }
  }

  spawnVolley(a) {
    const kind = a.weapon;
    const n = kind === 'ball' || kind === 'mortar' ? 1 : kind === 'spread' ? 3 : kind === 'lance' ? 2 : kind === 'bolts' ? 4 : kind === 'needle' ? 5 : 2;
    const speed = kind === 'mortar' ? 360 : kind === 'ball' ? 520 : kind === 'needle' || kind === 'bolts' ? 1080 : kind === 'lance' ? 900 : 760;
    for (let i = 0; i < n; i++) {
      const s = this.shotPool[this.shotCursor];
      this.shotCursor = (this.shotCursor + 1) % this.shotPool.length;
      s.on = true;
      s.kind = kind;
      const fan = kind === 'spread' ? (i - 1) * 0.16 : (i - (n - 1) / 2) * 0.05;
      s.x = this.laneX + fan + (Math.random() - 0.5) * 0.04;
      s.y = this.frontY - 10 - i * 10;
      s.vx = kind === 'spread' ? (i - 1) * 0.35 : 0;
      s.vy = speed;
      s.max = kind === 'mortar' ? 0.42 : kind === 'ball' ? 0.28 : kind === 'needle' ? 0.12 : 0.17;
      s.life = s.max;
      s.arc = kind === 'mortar' ? 1 : 0;
    }
  }

  spawnImpact(y, x, kind, big) {
    const hit = this.impacts[this.impactCursor];
    this.impactCursor = (this.impactCursor + 1) % this.impacts.length;
    hit.on = true;
    hit.x = x;
    hit.y = y;
    hit.kind = kind;
    hit.big = !!big;
    hit.max = big ? 0.3 : 0.14;
    hit.life = hit.max;
    const st = WSTYLE[kind];
    const color = kind === 'swing' ? 0xff6a5a : st ? st.color : 0xfff6d4;
    this.spawnSparks(y, x, big ? 6 : 3, color, big ? 0.38 : 0.22);
  }

  spawnSparks(y, x, n, color, life) {
    for (let k = 0; k < n; k++) {
      const s = this.sparks[this.sparkCursor];
      this.sparkCursor = (this.sparkCursor + 1) % this.sparks.length;
      const ang = Math.random() * Math.PI * 2;
      const sp = 0.4 + Math.random() * 0.9;
      s.on = true;
      s.x = x;
      s.y = y;
      s.vx = Math.cos(ang) * sp * 0.5;
      s.vy = Math.sin(ang) * sp * 160;
      s.color = color;
      s.max = life;
      s.life = life;
    }
  }

  spawnShock(x, y, r, color, max) {
    const w = this.waves3[this.waveCursor];
    this.waveCursor = (this.waveCursor + 1) % this.waves3.length;
    w.on = true;
    w.x = x;
    w.y = y;
    w.r = r;
    w.color = color;
    w.max = max;
    w.life = max;
  }

  animFor(id) {
    if (id === 'boss') return this.bossAnim;
    for (let i = 0; i < this.midMarks.length; i++) {
      if (this.midMarks[i].wave.id === id) return this.midMarks[i].anim;
    }
    return this.bossAnim;
  }

  decayAnim(a, dt) {
    a.dash = Math.max(0, a.dash - dt * 3.2);
    a.slam = Math.max(0, a.slam - dt * 3);
  }

  juiceTell(tell) {
    const m = BOSS_MOVES[tell.kind] || BOSS_MOVES.slam;
    this.sfx.tell(tell.kind);
    const p = project(this.frontY - CROWD_DEPTH * 0.4, tell.zones[0].x, this.camY());
    this.spawnFloater(clamp(p.x, 90, 450), Math.max(160, p.y - 60), m.label + '!', '#ffd2c8');
    if (tell.kind === 'volley') {
      // Rocks are in flight for the whole wind-up and land exactly when it resolves.
      for (let i = 0; i < tell.zones.length; i++) {
        const b = this.bossShots[this.bossShotCursor];
        this.bossShotCursor = (this.bossShotCursor + 1) % this.bossShots.length;
        b.on = true;
        b.x0 = (Math.random() - 0.5) * 0.3;
        b.y0 = tell.front + 30;
        b.x1 = tell.zones[i].x;
        b.y1 = this.frontY - CROWD_DEPTH * 0.45;
        b.t = 0;
        b.dur = tell.wind;
      }
    }
  }

  juiceBossHit(h) {
    const anim = this.animFor(h.id);
    const color = MOVE_COLOR[h.kind] || 0xff5a3a;
    const y = this.frontY - CROWD_DEPTH * 0.45;
    if (h.kind === 'slam') {
      anim.slam = 1;
      for (let i = 0; i < h.zones.length; i++) this.spawnShock(h.zones[i].x, y, h.zones[i].r, color, 0.5);
    } else if (h.kind === 'charge') {
      anim.dash = 1;
      this.spawnShock(h.zones[0].x, y, h.zones[0].r, color, 0.45);
    } else {
      for (let i = 0; i < h.zones.length; i++) this.spawnShock(h.zones[i].x, y, h.zones[i].r + 0.04, color, 0.32);
    }
    for (let i = 0; i < h.zones.length; i++) this.spawnSparks(y, h.zones[i].x, 4, color, 0.4);
    this.sfx.boom(h.kind, h.hit);
    const p = project(y, this.laneX, this.camY());
    if (h.hit) {
      this.badFlash = 0.45;
      this.cameras.main.shake(h.kind === 'charge' ? 260 : 200, h.kind === 'volley' ? 0.008 : 0.014);
      this.spawnFloater(clamp(p.x, 90, 450), Math.max(170, p.y - 30), '-' + h.killed, '#ff9a8a');
    } else {
      this.cameras.main.shake(90, 0.004);
      this.spawnFloater(clamp(p.x, 90, 450), Math.max(170, p.y - 30), 'DODGED', '#c9f7ff');
    }
    this.log.push({ type: 'boss', kind: h.kind, hit: h.hit, killed: h.killed, final: h.final });
  }

  stepShots(dt) {
    for (let i = 0; i < this.shotPool.length; i++) {
      const s = this.shotPool[i];
      if (!s.on) continue;
      s.y += s.vy * dt;
      s.x += s.vx * dt;
      s.life -= dt;
      if (s.life <= 0) s.on = false;
    }
    for (let i = 0; i < this.impacts.length; i++) {
      const hit = this.impacts[i];
      if (!hit.on) continue;
      hit.life -= dt;
      if (hit.life <= 0) hit.on = false;
    }
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (!s.on) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy *= 0.92;
      s.life -= dt;
      if (s.life <= 0) s.on = false;
    }
    for (let i = 0; i < this.waves3.length; i++) {
      const w = this.waves3[i];
      if (!w.on) continue;
      w.life -= dt;
      if (w.life <= 0) w.on = false;
    }
    for (let i = 0; i < this.bossShots.length; i++) {
      const b = this.bossShots[i];
      if (!b.on) continue;
      b.t += dt;
      if (b.t >= b.dur + 0.05) b.on = false;
    }
  }

  juiceJet(ev) {
    this.log.push({ type: 'jet', hit: ev.hit, count: shown(ev.count) });
    if (!ev.hit) return;
    this.pop = 1.7;
    this.sfx.jet();
    this.cameras.main.shake(120, 0.005);
    const p = project(this.level.jet.y, this.level.jet.x, this.camY());
    this.spawnFloater(p.x, p.y - 20, 'JET ' + opLabel(this.level.jet.op), '#ffe56a');
  }

  finishRun() {
    if (this.mode === 'overlay') return;
    const win = !!this.world.won && !this.world.lost;
    const last = this.levelIndex >= LEVELS.length - 1;
    this.outcome = {
      kind: win ? (last ? 'victory' : 'win') : 'lose',
      win,
      player: shown(this.world.count),
      enemy: shown(this.world.boss.alive),
      diedAt: this.world.diedAt,
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
    } else if (this.outcome.diedAt === 'gate') {
      body = 'A red gate wiped the squad out\nbefore the ' + this.level.enemyName + '.';
    } else if (this.outcome.diedAt === 'wave' || this.outcome.diedAt === 'mid') {
      body = (this.outcome.diedAt === 'mid' ? 'The mid-boss' : 'A red wave') + ' overran the squad\nbefore the ' + this.level.enemyName + '.';
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

  nearestThreat() {
    const units = this.world.waves.filter((w) => w.alive > 0.05);
    if (this.world.boss.alive > 0.05) units.push(this.world.boss);
    units.sort((a, b) => a.front - b.front);
    return units[0] || null;
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
    this.drawWeapon(cam);
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

  drawWeapon(cam) {
    this.weaponGfx.clear();
    for (let i = 0; i < this.dropLabels.length; i++) this.dropLabels[i].setVisible(false);
    const open = this.world.pickups.filter((drop) => !drop.resolved);
    let labelN = 0;
    for (let n = 0; n < open.length; n++) {
      const drop = open[n];
      const p = project(drop.y, drop.x, cam);
      if (!p.vis || p.t <= 0) continue;
      const bob = Math.sin(this.clock * 5 + n) * 3 * p.scale;
      const s = Math.max(0.35, p.scale);
      this.weaponGfx.setDepth(120 + p.y);
      this.paintWeaponIcon(this.weaponGfx, drop.id, p.x, p.y + bob, s);
      if (labelN < this.dropLabels.length) {
        const label = this.dropLabels[labelN++];
        label.setText(weaponById(drop.id).name.toUpperCase());
        label.setVisible(true);
        label.setPosition(p.x, p.y + 18 * s + bob);
        label.setScale(Math.max(0.45, s));
        label.setDepth(122 + p.y);
      }
    }
  }

  paintWeaponIcon(g, id, x, y, s) {
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(x, y + 16 * s, 36 * s, 10 * s);
    g.fillStyle(0x16324a, 1);
    g.fillRoundedRect(x - 16 * s, y - 6 * s, 32 * s, 22 * s, 4 * s);
    if (id === 'ball' || id === 'mortar') {
      g.fillStyle(id === 'mortar' ? 0xc46bff : 0xffb15a, 1);
      g.fillCircle(x, y - 8 * s, (id === 'mortar' ? 11 : 9) * s);
      g.fillStyle(0xfff1c9, 1);
      g.fillCircle(x - 2 * s, y - 11 * s, 3.5 * s);
    } else if (id === 'spread') {
      g.fillStyle(0x8ef0c2, 1);
      for (const side of [-1, 0, 1]) g.fillCircle(x + side * 8 * s, y - 10 * s, 3.2 * s);
    } else if (id === 'lance') {
      g.fillStyle(0xfff3c4, 1);
      g.fillRect(x - 8 * s, y - 16 * s, 4 * s, 18 * s);
      g.fillRect(x + 4 * s, y - 16 * s, 4 * s, 18 * s);
    } else if (id === 'needle') {
      g.fillStyle(0xd7f4ff, 1);
      for (const side of [-6, -2, 2, 6]) g.fillRect(x + side * s, y - 14 * s, 1.6 * s, 14 * s);
    } else {
      g.fillStyle(0x3ec6ff, 1);
      g.fillRect(x - 10 * s, y - 12 * s, 20 * s, 3 * s);
      g.fillRect(x - 7 * s, y - 7 * s, 16 * s, 3 * s);
      g.fillRect(x - 4 * s, y - 2 * s, 12 * s, 3 * s);
    }
  }

  drawActors(cam) {
    const blueVis = this.count <= 0.001 ? 0 : Math.min(MAX_BLUE, Math.max(1, Math.ceil(Math.min(this.count, MAX_BLUE))));

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
      // Front ranks throw their weight forward on each volley and recoil back.
      const front = i < blueVis * 0.35;
      const phase = Math.sin(this.swingT * 22 + i * 1.7);
      const kick = this.muzzle * (front ? 9 + phase * 4 : 4) * p.scale;
      img.setVisible(true);
      img.setPosition(p.x, p.y + bob - kick);
      img.setScale(Math.max(0.18, p.scale * (0.95 + (front ? this.muzzle * 0.08 : 0))));
      img.setDepth(140 + p.y);
      img.setRotation(slot.spin * 0.15 + (front ? this.muzzle * phase * 0.22 : 0));
    }

    const boss = this.world.boss;
    const grow = 1.02 + (this.level.id - 1) * 0.055;
    const frac = boss.count > 0 ? clamp(boss.alive / boss.count, 0, 1) : 0;
    const bp = project(boss.front + 24, 0.02, cam);
    const blobShow = boss.alive > 0.05 && bp.vis && bp.t > 0;
    this.blob.setVisible(blobShow);
    if (blobShow) {
      const sc = bp.scale * grow * (0.72 + 0.28 * frac);
      const pose = this.bossPose(boss, this.bossAnim, bp.scale);
      const pulse = 1 + Math.sin(this.clock * (boss.atk ? 14 : 3)) * (boss.atk ? 0.05 : 0.03);
      this.blob.setPosition(bp.x + pose.dx, bp.y + this.lunge * 10 * bp.scale + pose.dy);
      this.blob.setScale(Math.max(0.2, sc * pulse * pose.sx), Math.max(0.2, sc * pulse * pose.sy));
      this.blob.setTint(pose.tint);
      this.blob.setDepth(130 + bp.y);
    }

    for (let i = 0; i < this.midMarks.length; i++) {
      const mark = this.midMarks[i];
      const wave = mark.wave;
      const mp = project(wave.front + 20, 0, cam);
      const show = wave.alive > 0.05 && mp.vis && mp.t > 0;
      mark.img.setVisible(show);
      mark.label.setVisible(show);
      if (!show) continue;
      const fracM = wave.count > 0 ? clamp(wave.alive / wave.count, 0, 1) : 0;
      const sc = mp.scale * 0.72 * (0.78 + 0.22 * fracM);
      const pose = this.bossPose(wave, mark.anim, mp.scale);
      mark.img.setPosition(mp.x + pose.dx, mp.y + this.lunge * 8 + pose.dy);
      mark.img.setScale(Math.max(0.16, sc * pose.sx), Math.max(0.16, sc * pose.sy));
      mark.img.setTint(pose.tint);
      mark.img.setDepth(128 + mp.y);
      mark.label.setPosition(mp.x, mp.y - Math.max(28, 70 * mp.scale));
      mark.label.setScale(Math.max(0.45, mp.scale));
      mark.label.setDepth(4100);
    }

    const waves = this.world.waves.filter((w) => w.alive > 0.05 && !w.mid).sort((a, b) => a.front - b.front);
    let slot = 0;
    for (const w of waves) {
      const n = Math.max(3, Math.min(18, Math.ceil(Math.min(w.alive, 18))));
      for (let i = 0; i < n && slot < this.reds.length; i++, slot++) {
        const img = this.reds[slot];
        const ang = i * 2.399963;
        const ex = Math.cos(ang) * Math.min(0.72, 0.08 + (i % 5) * 0.07);
        const ey = w.front + 16 + (i % 4) * 22 - this.lunge * 26;
        const anchor = project(ey, ex, cam);
        if (!anchor.vis || anchor.t < 0) {
          img.setVisible(false);
          continue;
        }
        const bob = Math.sin(this.clock * 8 + i) * 2 * anchor.scale;
        img.setVisible(true);
        img.setPosition(anchor.x, anchor.y + bob);
        img.setScale(Math.max(0.16, anchor.scale * 0.9));
        img.setRotation(this.lunge * 0.45);
        img.setDepth(145 + anchor.y);
      }
    }
    for (; slot < this.reds.length; slot++) this.reds[slot].setVisible(false);

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

  /** Wind-up, landing, and dash pose for a boss blob. No allocation: reuses one object. */
  bossPose(unit, anim, scale) {
    const pose = this._pose || (this._pose = { dx: 0, dy: 0, sx: 1, sy: 1, tint: 0xffffff });
    pose.dx = 0;
    pose.dy = 0;
    pose.sx = 1;
    pose.sy = 1;
    pose.tint = 0xffffff;
    const atk = unit.atk;
    if (atk) {
      const k = clamp(1 - atk.t / atk.wind, 0, 1);
      const shiver = Math.sin(this.clock * 60) * 3 * scale * k;
      if (atk.kind === 'slam') {
        pose.dy = -k * 46 * scale;
        pose.sx = 1 - k * 0.12;
        pose.sy = 1 + k * 0.22;
      } else if (atk.kind === 'charge') {
        pose.dy = -k * 18 * scale;
        pose.dx = shiver * 2;
        pose.sx = 1 + k * 0.16;
        pose.sy = 1 - k * 0.1;
      } else {
        pose.sx = 1 + k * 0.1;
        pose.sy = 1 + k * 0.1;
        pose.dx = shiver;
      }
      pose.tint = k > 0.66 && Math.sin(this.clock * 40) > 0 ? 0xffd0a0 : 0xffffff;
    }
    if (anim.slam > 0) {
      pose.sx *= 1 + anim.slam * 0.3;
      pose.sy *= 1 - anim.slam * 0.28;
      pose.dy += anim.slam * 8 * scale;
    }
    if (anim.dash > 0) {
      pose.dy += anim.dash * 120 * scale;
      pose.sy *= 1 + anim.dash * 0.12;
    }
    return pose;
  }

  /** Red danger zones on the sand for each live telegraph, filling as it winds up. */
  drawTells(g, cam) {
    const yA = this.frontY - CROWD_DEPTH - 10;
    const yB = this.frontY + 30;
    const units = this.world.waves;
    for (let u = 0; u <= units.length; u++) {
      const unit = u < units.length ? units[u] : this.world.boss;
      const atk = unit.atk;
      if (!atk || unit.alive <= 0) continue;
      const k = clamp(1 - atk.t / atk.wind, 0, 1);
      const color = MOVE_COLOR[atk.kind] || 0xff5a3a;
      const blink = Math.sin(this.clock * (12 + k * 20)) > 0 ? 1 : 0.6;
      for (let i = 0; i < atk.zones.length; i++) {
        const z = atk.zones[i];
        const x0 = Math.max(-1, z.x - z.r);
        const x1 = Math.min(1, z.x + z.r);
        const a0 = project(yA, x0, cam);
        const a1 = project(yA, x1, cam);
        const b0 = project(yB, x0, cam);
        const b1 = project(yB, x1, cam);
        g.fillStyle(color, (0.12 + 0.22 * k) * blink);
        g.beginPath();
        g.moveTo(a0.x, a0.y);
        g.lineTo(a1.x, a1.y);
        g.lineTo(b1.x, b1.y);
        g.lineTo(b0.x, b0.y);
        g.closePath();
        g.fillPath();
        // Inner bar fills from the far edge toward the crowd as the attack winds up.
        const yk = yB - (yB - yA) * k;
        const c0 = project(yk, x0, cam);
        const c1 = project(yk, x1, cam);
        g.lineStyle(Math.max(2, 4 * c0.scale), color, 0.95);
        g.beginPath();
        g.moveTo(c0.x, c0.y);
        g.lineTo(c1.x, c1.y);
        g.strokePath();
        g.lineStyle(Math.max(1.5, 3 * a0.scale), 0xfff0e6, 0.7 * blink);
        g.beginPath();
        g.moveTo(a0.x, a0.y);
        g.lineTo(b0.x, b0.y);
        g.moveTo(a1.x, a1.y);
        g.lineTo(b1.x, b1.y);
        g.strokePath();
        g.lineStyle(0, 0, 0);
      }
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
    this.drawTells(g, cam);
    g.fillStyle(0xd7ecff, 0.9);
    for (let i = 0; i < this.tracers.length; i++) {
      const tr = this.tracers[i];
      const p = project(tr.y, tr.x, cam);
      if (!p.vis) continue;
      g.fillCircle(p.x, p.y, Math.max(1.5, 4 * p.scale));
    }
    if (this.muzzle > 0) {
      const m = project(this.frontY - 6, this.laneX, cam);
      if (m.vis) {
        const r = Math.max(4, (10 + this.muzzle * 10) * m.scale);
        g.fillStyle(this.muzzleColor, 0.25 + this.muzzle * 0.45);
        g.fillCircle(m.x, m.y, r * 1.5);
        g.fillStyle(0xffffff, 0.5 + this.muzzle * 0.4);
        g.fillCircle(m.x, m.y, r * 0.55);
        for (let k = -1; k <= 1; k++) {
          g.fillStyle(this.muzzleColor, 0.6 * this.muzzle);
          g.fillTriangle(m.x + k * r * 0.9, m.y, m.x + k * r * 0.4, m.y - r * 2.2, m.x + k * r * 0.2, m.y);
        }
      }
    }
    for (let i = 0; i < this.shotPool.length; i++) {
      const s = this.shotPool[i];
      if (!s.on) continue;
      const st = WSTYLE[s.kind] || WSTYLE.shot;
      const lift = s.arc ? Math.sin(Math.PI * (1 - s.life / s.max)) * 60 : 0;
      const p = project(s.y, s.x, cam);
      if (!p.vis) continue;
      const tail = project(s.y - st.trail, s.x - s.vx * 0.05, cam);
      const py = p.y - lift * p.scale;
      const ty = tail.y - lift * 0.7 * p.scale;
      const sz = Math.max(1.4, st.size * p.scale);
      // Trail
      g.lineStyle(Math.max(1, sz * (s.kind === 'needle' ? 0.9 : 1.2)), st.color, 0.45);
      g.beginPath();
      g.moveTo(tail.x, ty);
      g.lineTo(p.x, py);
      g.strokePath();
      g.lineStyle(0, 0, 0);
      if (s.kind === 'ball' || s.kind === 'mortar') {
        g.fillStyle(st.color, 0.35);
        g.fillCircle(p.x, py, sz * 1.6);
        g.fillStyle(st.color, 1);
        g.fillCircle(p.x, py, sz);
        g.fillStyle(st.core, 1);
        g.fillCircle(p.x - sz * 0.3, py - sz * 0.3, sz * 0.4);
      } else if (s.kind === 'lance' || s.kind === 'needle' || s.kind === 'bolts') {
        const len = Math.max(6, (s.kind === 'lance' ? 22 : s.kind === 'needle' ? 18 : 14) * p.scale);
        g.fillStyle(st.color, 1);
        g.fillRect(p.x - sz / 2, py - len, sz, len);
        g.fillStyle(st.core, 1);
        g.fillRect(p.x - sz / 4, py - len, sz / 2, len * 0.5);
        if (s.kind === 'lance') g.fillTriangle(p.x - sz, py - len, p.x + sz, py - len, p.x, py - len - sz * 2.5);
      } else if (s.kind === 'spread') {
        g.fillStyle(st.color, 0.4);
        g.fillCircle(p.x, py, sz * 1.7);
        g.fillStyle(st.core, 1);
        g.fillCircle(p.x, py, sz * 0.8);
      } else {
        g.fillStyle(st.color, 1);
        g.fillCircle(p.x, py, sz);
        g.fillStyle(st.core, 1);
        g.fillCircle(p.x, py, sz * 0.5);
      }
    }
    for (let i = 0; i < this.impacts.length; i++) {
      const hit = this.impacts[i];
      if (!hit.on) continue;
      const p = project(hit.y, hit.x, cam);
      if (!p.vis) continue;
      const k = Math.max(0, hit.life / hit.max);
      const st = WSTYLE[hit.kind];
      const color = hit.kind === 'swing' ? 0xff6a5a : st ? st.color : 0xfff6d4;
      const r = Math.max(3, ((hit.big ? 34 : 16) - k * (hit.big ? 18 : 6)) * p.scale);
      g.fillStyle(0xfff6d4, 0.75 * k);
      g.fillCircle(p.x, p.y, r * 0.6);
      g.lineStyle(Math.max(1.5, (hit.big ? 4 : 2) * p.scale), color, 0.9 * k);
      g.strokeCircle(p.x, p.y, r);
      g.lineStyle(0, 0, 0);
    }
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (!s.on) continue;
      const p = project(s.y, s.x, cam);
      if (!p.vis) continue;
      g.fillStyle(s.color, Math.max(0, s.life / s.max));
      g.fillCircle(p.x, p.y, Math.max(1.2, 3 * p.scale));
    }
    for (let i = 0; i < this.waves3.length; i++) {
      const w = this.waves3[i];
      if (!w.on) continue;
      const k = 1 - w.life / w.max;
      const c = project(w.y, w.x, cam);
      if (!c.vis) continue;
      const e = project(w.y, Math.min(1, w.x + w.r * (0.5 + k)), cam);
      const rx = Math.max(6, Math.abs(e.x - c.x));
      g.lineStyle(Math.max(2, 9 * c.scale * (1 - k)), w.color, 0.9 * (1 - k));
      g.strokeEllipse(c.x, c.y, rx * 2, rx * 0.7);
      g.fillStyle(w.color, 0.22 * (1 - k));
      g.fillEllipse(c.x, c.y, rx * 1.6, rx * 0.5);
      g.lineStyle(0, 0, 0);
    }
    for (let i = 0; i < this.bossShots.length; i++) {
      const b = this.bossShots[i];
      if (!b.on) continue;
      const k = clamp(b.t / b.dur, 0, 1);
      const wy = b.y0 + (b.y1 - b.y0) * k;
      const wx = b.x0 + (b.x1 - b.x0) * k;
      const p = project(wy, wx, cam);
      if (!p.vis) continue;
      const lift = Math.sin(Math.PI * k) * 140 * p.scale;
      const r = Math.max(4, 10 * p.scale);
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(p.x, p.y, r * 2, r * 0.7);
      g.fillStyle(0xffb02e, 0.4);
      g.fillCircle(p.x, p.y - lift, r * 1.6);
      g.fillStyle(0x7a1420, 1);
      g.fillCircle(p.x, p.y - lift, r);
      g.fillStyle(0xffd2a0, 1);
      g.fillCircle(p.x - r * 0.3, p.y - lift - r * 0.3, r * 0.35);
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
      this.gunText.setVisible(false);
      for (let i = 0; i < this.slotTexts.length; i++) this.slotTexts[i].setVisible(false);
      return;
    }
    this.countText.setVisible(true);

    this.youCap.setVisible(false);
    this.foeCap.setVisible(false);
    const fp = project(this.frontY - CROWD_DEPTH * 0.35, this.laneX, cam);
    this.countText.setPosition(clamp(fp.x, 80, 460), clamp(fp.y, 150, 820));
    this.countText.setScale(this.pop);
    this.countText.setText(String(shown(this.count)));
    for (let i = 0; i < 3; i++) {
      const x = 270 + (i - 1) * 156;
      const on = this.world.loadout.equipped === i && !!this.world.loadout.slots[i];
      g.fillStyle(on ? 0x2a62e0 : 0x1b2430, 0.92);
      g.fillRoundedRect(x - 68, 898, 136, 40, 8);
      g.lineStyle(3, on ? 0xffe7a3 : 0x3d4e60, 1);
      g.strokeRoundedRect(x - 68, 898, 136, 40, 8);
      g.lineStyle(0, 0, 0);
      const id = this.world.loadout.slots[i];
      const name = id ? weaponById(id).name.toUpperCase() : '—';
      const label = this.slotTexts[i];
      label.setVisible(true);
      label.setText((i + 1) + '  ' + name);
      label.setColor(on ? '#fff8e8' : '#b7c6d6');
    }

    const threat = this.nearestThreat();
    const tp = threat ? project(threat.front + (threat.boss ? 20 : 8), 0, cam) : null;
    const showEnemy = !!(tp && tp.vis && tp.t > 0.02 && tp.t < 1);
    this.enemyText.setVisible(showEnemy);
    if (showEnemy) {
      this.enemyText.setScale(Math.max(0.45, tp.scale));
      this.enemyText.setPosition(tp.x, tp.y - Math.max(28, 64 * tp.scale));
      this.enemyText.setText(String(shown(threat.alive)));
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
