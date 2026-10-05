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

/** Only the front ranks can fight at once, so big fights take seconds, not frames. */
export const FRONT_BASE = 40;
export const FRONT_ROOT = 4;
export function frontline(n) {
  const c = Math.max(0, Math.floor(Number(n) || 0));
  return Math.min(c, Math.floor(FRONT_BASE + Math.sqrt(c) * FRONT_ROOT));
}

/** Damage one hit lands through armor. Light guns only chip armored bosses. */
export function armorDamage(damage, armor) {
  const d = Math.max(0, Number(damage) || 0);
  const a = Math.max(0, Number(armor) || 0);
  if (a <= 0) return d;
  return Math.max(d - a, d / ((1 + a) * 2));
}

/** Per-soldier kills per second for a weapon against a given armor. */
export function weaponVs(weapon, armor) {
  const w = weapon || WEAPONS.shot;
  return w.rate * armorDamage(w.damage, armor) * Math.max(1, w.pierce);
}

/** Like resolveHits, but carries fractional damage so armor chip still adds up. */
export function landHits(shots, damage, pierce, alive, acc = 0) {
  const n = Math.max(0, Math.floor(Number(shots) || 0));
  const hp = Math.max(0, Math.floor(Number(alive) || 0));
  const total = n * Math.max(0, Number(damage) || 0) * Math.max(1, Math.floor(Number(pierce) || 1)) + (Number(acc) || 0);
  let killed = Math.floor(total + 1e-9);
  let rest = total - killed;
  if (killed >= hp) { killed = hp; rest = 0; }
  return { shots: n, killed, left: hp - killed, acc: rest };
}

// Boss specials. Each one is telegraphed for `wind` seconds at the lane spot
// the crowd held when it started, then lands. Steering out of the zone dodges it.
export const BOSS_MOVES = {
  slam: { kind: 'slam', label: 'SLAM', frac: 0.2, flat: 6 },
  volley: { kind: 'volley', label: 'VOLLEY', frac: 0.12, flat: 4 },
  charge: { kind: 'charge', label: 'CHARGE', frac: 0.26, flat: 8 },
};
export const BOSS_RANGE = 320;

export function moveZones(kind, laneX) {
  const x = Math.max(-1, Math.min(1, Number(laneX) || 0));
  if (kind === 'volley') {
    return [-0.45, 0, 0.45]
      .map((o) => ({ x: x + o, r: 0.12 }))
      .filter((z) => z.x >= -1.05 && z.x <= 1.05);
  }
  if (kind === 'charge') {
    return [{ x: Math.max(-0.45, Math.min(0.45, x)), r: 0.55 }];
  }
  return [{ x, r: 0.3 }];
}

export function inZones(zones, laneX) {
  for (let i = 0; i < zones.length; i++) {
    if (Math.abs(laneX - zones[i].x) <= zones[i].r + 1e-9) return true;
  }
  return false;
}

/** Soldiers a landed special removes. */
export function moveKill(kind, count, power = 1) {
  const m = BOSS_MOVES[kind] || BOSS_MOVES.slam;
  const c = Math.max(0, Math.floor(Number(count) || 0));
  return Math.min(c, Math.ceil((c * m.frac + m.flat) * Math.max(0, Number(power) || 0)));
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

function bossKit(src, final) {
  const s = src || {};
  return {
    armor: s.armor != null ? s.armor : (final ? 2 : 1),
    swingDamage: s.swing ? s.swing.damage : (final ? 2 : 1),
    swingRate: s.swing ? s.swing.rate : (final ? 3 : 2.5),
    moves: s.moves || (final ? ['slam', 'volley', 'charge'] : ['slam', 'volley']),
    every: s.every || (final ? 2.1 : 2.6),
    wind: s.wind || (final ? 0.75 : 0.85),
    power: s.power || 1,
  };
}

function makeWave(w, i) {
  const kit = w.mid ? bossKit(w, false) : null;
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
    dmgAcc: 0,
    armor: kit ? kit.armor : 0,
    swingDamage: kit ? kit.swingDamage : RED_ATTACK.damage,
    swingRate: kit ? kit.swingRate : RED_ATTACK.rate,
    kit,
    atk: null,
    atkCd: 0.6,
    moveIdx: 0,
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
  const kit = bossKit(level.boss, true);
  return {
    count: level.start,
    frontY,
    laneX: 0,
    time: 0,
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
      id: 'boss',
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
      dmgAcc: 0,
      armor: kit.armor,
      swingDamage: kit.swingDamage,
      swingRate: kit.swingRate,
      kit,
      atk: null,
      atkCd: 0.35,
      moveIdx: 0,
    },
    stats: { tells: 0, landed: 0, dodged: 0, specialKills: 0 },
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

function bossInRange(world, unit) {
  return unit.alive > 0 && unit.kit && unit.front - world.frontY <= BOSS_RANGE && unit.front + unit.depth >= world.frontY - CROWD_DEPTH;
}

/** Advance telegraphs and land specials. Returns true if the crowd died. */
function stepBossMoves(world, unit, step, events) {
  if (!bossInRange(world, unit)) {
    unit.atk = null;
    return false;
  }
  const kit = unit.kit;
  if (unit.atk) {
    unit.atk.t -= step;
    if (unit.atk.t > 0) return false;
    const atk = unit.atk;
    unit.atk = null;
    unit.atkCd = kit.every;
    const hit = inZones(atk.zones, world.laneX);
    const killed = hit ? moveKill(atk.kind, world.count, kit.power) : 0;
    if (hit) {
      world.stats.landed += 1;
      world.stats.specialKills += killed;
      world.count -= killed;
    } else {
      world.stats.dodged += 1;
    }
    events.bossHits.push({
      id: unit.final ? 'boss' : unit.id,
      final: !!unit.final,
      kind: atk.kind,
      zones: atk.zones,
      hit,
      killed,
      front: unit.front,
      count: world.count,
    });
    if (world.count <= 0) {
      world.count = 0;
      world.lost = true;
      world.won = false;
      world.diedAt = unit.final ? 'boss' : 'mid';
      return true;
    }
    return false;
  }
  unit.atkCd -= step;
  if (unit.atkCd > 0) return false;
  const kind = kit.moves[unit.moveIdx % kit.moves.length];
  unit.moveIdx += 1;
  unit.atk = { kind, t: kit.wind, wind: kit.wind, zones: moveZones(kind, world.laneX) };
  world.stats.tells += 1;
  events.bossTells.push({
    id: unit.final ? 'boss' : unit.id,
    final: !!unit.final,
    kind,
    zones: unit.atk.zones,
    wind: kit.wind,
    front: unit.front,
  });
  return false;
}

/** Live telegraphs the crowd can still dodge. */
export function activeThreats(world) {
  const out = [];
  const units = world.waves.concat([world.boss]);
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.atk && u.alive > 0) out.push({ unit: u, kind: u.atk.kind, zones: u.atk.zones, t: u.atk.t, wind: u.atk.wind });
  }
  return out;
}

/**
 * Advance the lane by dt seconds. laneX is the crowd's steered position.
 * Mutates world. Gates, pickups, drops, waves, boss specials, and hits share one clock.
 */
export function stepWorld(world, dt, laneX) {
  const events = { gates: [], jet: null, weapon: null, weapons: [], attacks: [], drops: [], bossTells: [], bossHits: [] };
  if (world.won || world.lost) return events;
  const step = Math.max(0, Number(dt) || 0);
  if (step === 0) return events;
  world.time += step;
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

  for (const u of units) {
    if (u.kit && stepBossMoves(world, u, step, events)) return events;
  }

  const living = units.filter((u) => u.alive > 0 && inShotRange(world.frontY, u.front, u.depth));
  living.sort((a, b) => a.front - b.front || (a.final === b.final ? 0 : a.final ? 1 : -1));
  const target = living[0];
  if (!target || world.count <= 0) {
    world.blueAcc = 0;
  } else {
    const wpn = world.weapon;
    const melee = yTouch(world.frontY, target.front, target.depth);
    const fired = fireTicks(frontline(world.count), wpn.rate, step, world.blueAcc);
    world.blueAcc = fired.acc;
    const swung = melee
      ? fireTicks(frontline(target.alive), target.swingRate, step, target.redAcc || 0)
      : { shots: 0, acc: target.redAcc || 0 };
    target.redAcc = swung.acc;
    const blueHit = landHits(fired.shots, armorDamage(wpn.damage, target.armor), wpn.pierce, target.alive, target.dmgAcc);
    const redHit = resolveHits(swung.shots, target.swingDamage, 1, world.count);
    target.alive = blueHit.left;
    target.dmgAcc = blueHit.acc;
    world.count = redHit.left;
    if (blueHit.shots > 0) {
      events.attacks.push({
        side: 'blue',
        shots: blueHit.shots,
        killed: blueHit.killed,
        weapon: wpn.id,
        boss: !!target.final,
        mid: !!target.mid,
        armor: target.armor,
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
      target.atk = null;
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

/** The nearest living enemy body ahead of (or on) the crowd. */
export function nextFoe(world, reach = 700) {
  let best = null;
  const units = world.waves.concat([world.boss]);
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.alive <= 0) continue;
    if (u.front + u.depth < world.frontY - CROWD_DEPTH) continue;
    if (u.front - world.frontY > reach) continue;
    if (!best || u.front < best.front) best = u;
  }
  return best;
}

/** Best held slot against an armor value. */
export function bestSlot(loadout, armor) {
  let best = loadout.equipped;
  let score = -1;
  for (let i = 0; i < loadout.slots.length; i++) {
    const id = loadout.slots[i];
    if (!id) continue;
    const s = weaponVs(weaponById(id), armor);
    if (s > score + 1e-9) { score = s; best = i; }
  }
  return best;
}

/** Lane spot outside every live telegraph, nearest to `lane`. */
export function safeLane(world, lane) {
  const threats = activeThreats(world);
  if (!threats.length) return null;
  const zones = [];
  for (const th of threats) for (const z of th.zones) zones.push({ x: z.x, r: z.r + 0.08 });
  if (!inZones(zones, lane)) return null;
  let best = null;
  for (let k = -LANE_CLAMP; k <= LANE_CLAMP + 1e-9; k += 0.04) {
    const x = Math.round(k * 100) / 100;
    if (inZones(zones, x)) continue;
    if (best === null || Math.abs(x - lane) < Math.abs(best - lane)) best = x;
  }
  return best;
}

/**
 * One frame of the reference player: steer to planned gates, jet, pad, and drops;
 * dodge telegraphs; switch to the best weapon for the next foe.
 * Returns { lane, slot } targets. Shared by tests and the smoke driver.
 */
export function autoPilot(world, level, plan, lane) {
  const options = [];
  for (const row of world.rows) {
    if (!row.triggered) {
      options.push({ y: row.y, lane: laneCenter(plan.gates[row.index], row.gates.length) });
    }
  }
  if (!world.jet.resolved && plan.jet) options.push({ y: world.jet.y, lane: level.jet.x });
  for (const pk of world.pickups) {
    if (pk.resolved) continue;
    if (pk.source === 'pad' ? plan.weapon : plan.drops) options.push({ y: pk.y, lane: pk.x });
  }
  options.sort((a, b) => a.y - b.y);
  let target = options.length ? options[0].lane : lane;
  if (plan.dodge) {
    const safe = safeLane(world, lane);
    if (safe !== null) target = safe;
  }
  if (target < -LANE_CLAMP) target = -LANE_CLAMP;
  if (target > LANE_CLAMP) target = LANE_CLAMP;
  let slot = world.loadout.equipped;
  if (plan.smart) {
    const foe = nextFoe(world);
    if (foe) slot = bestSlot(world.loadout, foe.armor);
  }
  return { lane: target, slot };
}

/**
 * Run a level with a reference player.
 * playThrough(level, gates, wantJet, wantWeapon, { dodge, smart, drops, dt })
 */
export function playThrough(level, indices, wantJet, wantWeapon = false, opts = {}) {
  const o = typeof opts === 'number' ? { dt: opts } : (opts || {});
  const dt = o.dt || 1 / 90;
  const plan = {
    gates: indices,
    jet: !!wantJet,
    weapon: !!wantWeapon,
    drops: o.drops != null ? !!o.drops : !!wantWeapon,
    dodge: !!o.dodge,
    smart: !!o.smart,
  };
  const world = createWorld(level, START_FRONT);
  let lane = 0;
  let guard = 0;
  while (!world.won && !world.lost && guard < 1200000) {
    guard += 1;
    const aim = autoPilot(world, level, plan, lane);
    if (aim.slot !== world.loadout.equipped) {
      switchWeapon(world.loadout, aim.slot);
      world.weapon = heldWeapon(world.loadout);
      world.blueAcc = 0;
    }
    const maxStep = STEER_SPEED * dt;
    const d = aim.lane - lane;
    if (Math.abs(d) <= maxStep) lane = aim.lane;
    else lane += Math.sign(d) * maxStep;
    stepWorld(world, dt, lane);
    if (world.frontY > level.boss.y + 2500) break;
  }
  world.finalLane = lane;
  return world;
}
