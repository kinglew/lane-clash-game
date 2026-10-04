// Pure rules for Lane Rush. No Phaser, so node can test them.
import { RUN_SPEED, CROWD_DEPTH, START_FRONT, STEER_SPEED, LANE_CLAMP } from './view.js';

export const COUNT_CAP = 20000;

export function mul(value) {
  return { kind: 'mul', value, good: true };
}
export function add(value) {
  return { kind: 'add', value, good: true };
}
export function div(value) {
  return { kind: 'div', value, good: false };
}
export function sub(value) {
  return { kind: 'sub', value, good: false };
}

export function opLabel(op) {
  switch (op.kind) {
    case 'mul': return 'x' + op.value;
    case 'add': return '+' + op.value;
    case 'div': return '/' + op.value;
    case 'sub': return '-' + op.value;
    default: return '?';
  }
}

export function applyOp(count, op) {
  const c = Math.max(0, Math.floor(Number(count) || 0));
  const v = Number(op && op.value);
  let next = c;
  if (Number.isFinite(v)) {
    switch (op.kind) {
      case 'mul': next = c * v; break;
      case 'add': next = c + v; break;
      case 'div': next = v === 0 ? c : Math.floor(c / v); break;
      case 'sub': next = c - v; break;
      default: break;
    }
  }
  if (!Number.isFinite(next)) next = c;
  next = Math.floor(next);
  if (next < 0) next = 0;
  if (next > COUNT_CAP) next = COUNT_CAP;
  return next;
}

/** laneX is -1 (left wall) to 1 (right wall). */
export function pickGateIndex(laneX, gateCount) {
  const n = Math.max(1, gateCount | 0);
  const x = Math.min(1, Math.max(-1, Number(laneX) || 0));
  let idx = Math.floor(((x + 1) / 2) * n);
  if (idx < 0) idx = 0;
  if (idx >= n) idx = n - 1;
  return idx;
}

export function laneCenter(index, gateCount) {
  const n = Math.max(1, gateCount | 0);
  const i = Math.min(n - 1, Math.max(0, index | 0));
  return -1 + (i + 0.5) * (2 / n);
}

export function justCrossed(prevY, nextY, lineY) {
  return prevY < lineY && nextY >= lineY;
}

// Real-time weapon combat. Counts fall only when a shot or a swing lands.
// The lane never pauses for a separate countdown.

export const SLOT_CAP = 3;

export const WEAPONS = {
  shot: { id: 'shot', name: 'Shot', damage: 1, rate: 2, pierce: 1 },
  bolts: { id: 'bolts', name: 'Rapid Bolts', damage: 1, rate: 5, pierce: 1 },
  spread: { id: 'spread', name: 'Spread Shot', damage: 1, rate: 2, pierce: 3 },
  ball: { id: 'ball', name: 'Cannonball', damage: 4, rate: 1, pierce: 1 },
  needle: { id: 'needle', name: 'Needle Volley', damage: 1, rate: 8, pierce: 1 },
  lance: { id: 'lance', name: 'Twin Lance', damage: 2, rate: 2, pierce: 2 },
  mortar: { id: 'mortar', name: 'Arc Mortar', damage: 6, rate: 0.5, pierce: 2 },
};

export const RED_ATTACK = { damage: 1, rate: 2, pierce: 1 };

export function weaponById(id) {
  return WEAPONS[id] || WEAPONS.shot;
}

export function weaponPower(weapon) {
  const w = weapon || WEAPONS.shot;
  return w.damage * w.rate * Math.max(1, w.pierce);
}

export function freshLoadout() {
  return { slots: ['shot', null, null], equipped: 0 };
}

export function heldWeapon(loadout) {
  const id = loadout && loadout.slots[loadout.equipped];
  return weaponById(id || 'shot');
}

/**
 * Add a weapon to a 3-slot loadout.
 * A duplicate is ignored. A new weapon fills an empty slot and becomes equipped.
 * When every slot is full, a new weapon replaces the first one that is not equipped.
 */
export function giveWeapon(loadout, id, equipNew = true) {
  const known = !!WEAPONS[id];
  const w = weaponById(id);
  const slots = loadout.slots;
  if (!known) {
    return { ok: false, reason: 'full', id: w.id, name: w.name, slot: -1 };
  }
  const have = slots.indexOf(w.id);
  if (have >= 0) {
    const full = slots.every((s) => !!s);
    return { ok: false, reason: full ? 'full' : 'have', id: w.id, name: w.name, slot: have };
  }
  let empty = -1;
  for (let i = 0; i < SLOT_CAP; i++) {
    if (!slots[i]) { empty = i; break; }
  }
  if (empty >= 0) {
    slots[empty] = w.id;
    if (equipNew) loadout.equipped = empty;
    return { ok: true, reason: 'slot', id: w.id, name: w.name, slot: empty };
  }
  let replace = -1;
  for (let i = 0; i < SLOT_CAP; i++) {
    if (i !== loadout.equipped) { replace = i; break; }
  }
  const replaced = slots[replace];
  slots[replace] = w.id;
  return { ok: true, reason: 'swap', id: w.id, name: w.name, slot: replace, replaced };
}

export function switchWeapon(loadout, index) {
  const i = index | 0;
  if (i < 0 || i >= SLOT_CAP || !loadout.slots[i]) {
    return { changed: false, reason: 'empty', index: i };
  }
  if (loadout.equipped === i) {
    return { changed: false, reason: 'same', index: i, id: loadout.slots[i] };
  }
  loadout.equipped = i;
  return { changed: true, reason: 'switch', index: i, id: loadout.slots[i] };
}

/** How many discrete shots a formation gets this step. Leftover heat is kept. */
export function fireTicks(count, rate, dt, acc) {
  const c = Math.max(0, Number(count) || 0);
  const r = Math.max(0, Number(rate) || 0);
  const step = Math.max(0, Number(dt) || 0);
  let next = (Number(acc) || 0) + c * r * step;
  if (!Number.isFinite(next) || next < 0) next = 0;
  const shots = Math.floor(next);
  return { shots, acc: next - shots };
}

/** One shot removes `damage` from each of `pierce` enemies, capped by who's left. */
export function resolveHits(shots, damage, pierce, alive) {
  const n = Math.max(0, Math.floor(Number(shots) || 0));
  const per = Math.max(0, Number(damage) || 0) * Math.max(1, Math.floor(Number(pierce) || 1));
  const hp = Math.max(0, Math.floor(Number(alive) || 0));
  const killed = Math.min(hp, n * per);
  return { shots: n, killed, left: hp - killed };
}

export const ENEMY_MARCH = 130;
export const PUSH_MULT = 0.42;
export const WAVE_DEPTH = 150;
export const BOSS_DEPTH = 210;
export const MID_DEPTH = 190;
export const ENGAGE = 250;
export const BOSS_ENGAGE = 260;
export const SHOT_REACH = 26;

function yTouch(blueFront, redFront, redDepth) {
  const blueBack = blueFront - CROWD_DEPTH;
  const redTail = redFront + redDepth;
  return redFront <= blueFront + 26 && redTail >= blueBack - 10;
}

function inShotRange(blueFront, redFront, redDepth) {
  const blueBack = blueFront - CROWD_DEPTH;
  const redTail = redFront + redDepth;
  return redFront <= blueFront + SHOT_REACH && redTail >= blueBack - 10;
}

function makeWave(w, i) {
  return {
    id: i,
    y0: w.y,
    front: w.y,
    count: w.count,
    alive: w.count,
    depth: w.mid ? MID_DEPTH : WAVE_DEPTH,
    boss: false,
    mid: !!w.mid,
    final: false,
    name: w.name || '',
    drop: w.drop || null,
    dropX: w.dropX != null ? w.dropX : (w.mid ? -0.72 : 0.82),
    dropped: false,
    redAcc: 0,
  };
}

export function createWorld(level, frontY = START_FRONT) {
  const padSrc = level.weapon || null;
  const pad = padSrc ? {
    y: padSrc.y,
    x: padSrc.x,
    radius: padSrc.radius,
    id: padSrc.id,
    resolved: false,
    taken: false,
    source: 'pad',
  } : {
    y: -1, x: 0, radius: 0, id: 'shot', resolved: true, taken: false, source: 'pad',
  };
  const loadout = freshLoadout();
  return {
    count: level.start,
    frontY,
    laneX: 0,
    loadout,
    weapon: heldWeapon(loadout),
    blueAcc: 0,
    rows: level.rows.map((row, index) => ({
      y: row.y,
      gates: row.gates,
      index,
      triggered: false,
      hit: -1,
    })),
    jet: {
      y: level.jet.y,
      x: level.jet.x,
      radius: level.jet.radius,
      op: level.jet.op,
      resolved: false,
      taken: false,
    },
    pad,
    pickups: padSrc ? [pad] : [],
    waves: (level.waves || []).map(makeWave),
    boss: {
      y0: level.boss.y,
      front: level.boss.y,
      count: level.boss.count,
      alive: level.boss.count,
      depth: BOSS_DEPTH,
      boss: true,
      mid: false,
      final: true,
      name: level.boss.name || level.enemyName || 'Boss',
      drop: null,
      dropped: false,
      redAcc: 0,
    },
    won: false,
    lost: false,
    diedAt: null,
    pushing: false,
  };
}

function marchUnit(unit, world, step) {
  if (unit.alive <= 0) return;
  const engage = unit.final ? BOSS_ENGAGE : ENGAGE;
  const see = world.frontY > unit.front - engage || unit.front < unit.y0 - 0.5;
  if (!see) return;
  const hit = yTouch(world.frontY, unit.front, unit.depth);
  let march = ENEMY_MARCH;
  if (unit.final) march *= 0.5;
  else if (unit.mid) march *= 0.72;
  if (hit) unit.front = world.frontY - 8;
  else unit.front -= march * step;
}

function spawnDrop(world, unit) {
  if (!unit.drop || unit.dropped || !WEAPONS[unit.drop]) return null;
  unit.dropped = true;
  const drop = {
    y: world.frontY + 190,
    x: unit.dropX,
    radius: 0.16,
    id: unit.drop,
    resolved: false,
    taken: false,
    source: unit.mid ? 'mid' : 'wave',
  };
  world.pickups.push(drop);
  return { id: drop.id, name: weaponById(drop.id).name, x: drop.x, y: drop.y, source: drop.source };
}

function takePickup(world, pickup) {
  pickup.resolved = true;
  const hit = Math.abs(world.laneX - pickup.x) <= pickup.radius + 1e-9;
  pickup.taken = hit;
  if (!hit) {
    return { hit: false, id: pickup.id, name: weaponById(pickup.id).name, count: world.count, reason: 'miss', slot: -1, source: pickup.source, x: pickup.x, y: pickup.y };
  }
  const equipNew = pickup.source === 'pad';
  const got = giveWeapon(world.loadout, pickup.id, equipNew);
  world.weapon = heldWeapon(world.loadout);
  if (got.ok && equipNew) world.blueAcc = 0;
  return {
    hit: true,
    id: got.id,
    name: got.name,
    count: world.count,
    reason: got.reason,
    slot: got.slot,
    replaced: got.replaced || null,
    source: pickup.source,
    x: pickup.x,
    y: pickup.y,
  };
}

/**
 * Advance the lane by dt seconds. laneX is the crowd's steered position.
 * Mutates world. Gates, pickups, drops, waves, and weapon hits share one clock.
 */
export function stepWorld(world, dt, laneX) {
  const events = { gates: [], jet: null, weapon: null, weapons: [], attacks: [], drops: [] };
  if (world.won || world.lost) return events;
  const step = Math.max(0, Number(dt) || 0);
  if (step === 0) return events;
  world.laneX = Math.max(-1, Math.min(1, Number(laneX) || 0));

  const units = world.waves.concat([world.boss]);
  const touching = units.some((u) => u.alive > 0 && yTouch(world.frontY, u.front, u.depth));
  world.pushing = touching;
  const speed = touching ? RUN_SPEED * PUSH_MULT : RUN_SPEED;
  const prev = world.frontY;
  world.frontY += speed * step;

  for (const u of units) marchUnit(u, world, step);

  const pending = [];
  for (const row of world.rows) {
    if (!row.triggered) pending.push({ y: row.y, type: 'row', row });
  }
  if (!world.jet.resolved) pending.push({ y: world.jet.y, type: 'jet' });
  for (const pickup of world.pickups) {
    if (!pickup.resolved) pending.push({ y: pickup.y, type: 'weapon', pickup });
  }
  pending.sort((a, b) => a.y - b.y);
  for (const e of pending) {
    if (!(prev < e.y && world.frontY >= e.y)) continue;
    if (e.type === 'row') {
      e.row.triggered = true;
      const idx = pickGateIndex(world.laneX, e.row.gates.length);
      e.row.hit = idx;
      const op = e.row.gates[idx];
      world.count = applyOp(world.count, op);
      events.gates.push({ index: e.row.index, gate: idx, count: world.count, op });
      if (world.count <= 0) {
        world.lost = true;
        world.diedAt = 'gate';
        return events;
      }
    } else if (e.type === 'jet') {
      world.jet.resolved = true;
      const hit = Math.abs(world.laneX - world.jet.x) <= world.jet.radius + 1e-9;
      world.jet.taken = hit;
      if (hit) world.count = applyOp(world.count, world.jet.op);
      events.jet = { hit, count: world.count };
    } else if (!e.pickup.resolved) {
      const got = takePickup(world, e.pickup);
      events.weapons.push(got);
      events.weapon = got;
    }
  }

  const living = units.filter((u) => u.alive > 0 && inShotRange(world.frontY, u.front, u.depth));
  living.sort((a, b) => a.front - b.front || (a.final === b.final ? 0 : a.final ? 1 : -1));
  const target = living[0];
  if (!target || world.count <= 0) {
    world.blueAcc = 0;
  } else {
    const wpn = world.weapon;
    const melee = yTouch(world.frontY, target.front, target.depth);
    const fired = fireTicks(world.count, wpn.rate, step, world.blueAcc);
    world.blueAcc = fired.acc;
    const swung = melee
      ? fireTicks(target.alive, RED_ATTACK.rate, step, target.redAcc || 0)
      : { shots: 0, acc: target.redAcc || 0 };
    target.redAcc = swung.acc;
    const blueHit = resolveHits(fired.shots, wpn.damage, wpn.pierce, target.alive);
    const redHit = resolveHits(swung.shots, RED_ATTACK.damage, RED_ATTACK.pierce, world.count);
    target.alive = blueHit.left;
    world.count = redHit.left;
    if (blueHit.shots > 0) {
      events.attacks.push({
        side: 'blue',
        shots: blueHit.shots,
        killed: blueHit.killed,
        weapon: wpn.id,
        boss: !!target.final,
        mid: !!target.mid,
        id: target.final ? 'boss' : target.id,
        front: target.front,
      });
    }
    if (redHit.shots > 0) {
      events.attacks.push({
        side: 'red',
        shots: redHit.shots,
        killed: redHit.killed,
        weapon: 'swing',
        boss: !!target.final,
        mid: !!target.mid,
        id: target.final ? 'boss' : target.id,
        front: target.front,
      });
    }
    if (target.alive <= 0) {
      target.alive = 0;
      const drop = spawnDrop(world, target);
      if (drop) events.drops.push(drop);
    }
    if (world.count <= 0) {
      world.count = 0;
      world.lost = true;
      world.won = false;
      world.diedAt = target.final ? 'boss' : target.mid ? 'mid' : 'wave';
      return events;
    }
    if (target.final && target.alive <= 0) {
      world.won = true;
      return events;
    }
  }

  if (world.boss.alive <= 0 && world.count > 0) {
    world.boss.alive = 0;
    world.won = true;
  }
  return events;
}

/** Steer a keyboard-speed crowd through gates, the jet, and the fixed weapon pad. */
export function playThrough(level, indices, wantJet, wantWeapon = false, dt = 1 / 90) {
  const world = createWorld(level, START_FRONT);
  let lane = 0;
  let guard = 0;
  while (!world.won && !world.lost && guard < 800000) {
    guard += 1;
    const options = [];
    for (const row of world.rows) {
      if (!row.triggered) {
        options.push({
          y: row.y,
          lane: laneCenter(indices[row.index], row.gates.length),
        });
      }
    }
    if (!world.jet.resolved && wantJet) options.push({ y: world.jet.y, lane: level.jet.x });
    if (world.pad && !world.pad.resolved && wantWeapon) options.push({ y: world.pad.y, lane: level.weapon.x });
    options.sort((a, b) => a.y - b.y);
    let target = options.length ? options[0].lane : lane;
    if (target < -LANE_CLAMP) target = -LANE_CLAMP;
    if (target > LANE_CLAMP) target = LANE_CLAMP;
    const maxStep = STEER_SPEED * dt;
    const d = target - lane;
    if (Math.abs(d) <= maxStep) lane = target;
    else lane += Math.sign(d) * maxStep;
    stepWorld(world, dt, lane);
    if (world.frontY > level.boss.y + 2500) break;
  }
  world.finalLane = lane;
  return world;
}
