import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNT_CAP,
  applyOp,
  pickGateIndex,
  laneCenter,
  justCrossed,
  SLOT_CAP,
  WEAPONS,
  RED_ATTACK,
  weaponById,
  weaponPower,
  freshLoadout,
  giveWeapon,
  switchWeapon,
  heldWeapon,
  fireTicks,
  resolveHits,
  createWorld,
  stepWorld,
  playThrough,
  frontline,
  typeMult,
  hitDamage,
  weaponFamily,
  typeTag,
  strongAgainst,
  casualPlay,
  BOSS_TYPES,
  WEAK_MULT,
  RESIST_MULT,
  weaponVs,
  landHits,
  BOSS_MOVES,
  moveZones,
  inZones,
  moveKill,
  bestSlot,
  safeLane,
  mul,
  add,
  div,
  sub,
} from '../src/logic.js';
import { LEVELS } from '../src/levels.js';

test('gate math multiplies, adds, divides, subtracts, and caps', () => {
  assert.equal(applyOp(10, mul(2)), 20);
  assert.equal(applyOp(10, add(15)), 25);
  assert.equal(applyOp(5, div(2)), 2);
  assert.equal(applyOp(10, sub(30)), 0);
  assert.equal(applyOp(1, div(2)), 0);
  assert.equal(applyOp(10000, mul(3)), COUNT_CAP);
  assert.equal(applyOp(19990, add(50)), COUNT_CAP);
  assert.equal(applyOp(4.9, mul(2)), 8);
  assert.equal(applyOp(-8, add(3)), 3);
  assert.equal(applyOp(12, { kind: 'nope', value: 5 }), 12);
  assert.equal(COUNT_CAP, 20000);
});

test('pickGateIndex matches lane centers', () => {
  for (const n of [2, 3]) {
    for (let i = 0; i < n; i++) {
      assert.equal(pickGateIndex(laneCenter(i, n), n), i);
    }
  }
  assert.equal(pickGateIndex(-1, 3), 0);
  assert.equal(pickGateIndex(1, 3), 2);
  assert.equal(pickGateIndex(0, 2), 1);
  assert.equal(pickGateIndex(-0.01, 2), 0);
  assert.equal(justCrossed(10, 20, 15), true);
  assert.equal(justCrossed(15, 20, 15), false);
  assert.equal(justCrossed(16, 20, 15), false);
});

test('weapons differ by damage, fire rate, and pierce', () => {
  const rows = Object.values(WEAPONS).map((w) => [w.id, w.damage, w.rate, w.pierce]);
  assert.deepEqual(rows.slice(0, 4), [
    ['shot', 1, 2, 1],
    ['bolts', 1, 5, 1],
    ['spread', 1, 2, 3],
    ['ball', 4, 1, 1],
  ]);
  assert.deepEqual(rows.slice(4), [
    ['needle', 1, 8, 1],
    ['lance', 2, 2, 2],
    ['mortar', 6, 0.5, 2],
  ]);
  const keys = new Set(rows.map((r) => r.slice(1).join(',')));
  assert.equal(keys.size, rows.length);
  assert.equal(weaponById('nope').id, 'shot');
  assert.ok(weaponPower(WEAPONS.needle) > weaponPower(WEAPONS.shot));
  assert.ok(weaponPower(WEAPONS.lance) > weaponPower(WEAPONS.ball));
  assert.equal(weaponPower(RED_ATTACK), weaponPower(WEAPONS.shot));

  const ticks = fireTicks(10, 2, 0.5, 0);
  assert.equal(ticks.shots, 10);
  assert.equal(ticks.acc, 0);
  const partial = fireTicks(1, 2, 0.2, 0.1);
  assert.equal(partial.shots, 0);
  assert.ok(Math.abs(partial.acc - 0.5) < 1e-9);

  const spread = resolveHits(4, 1, 3, 20);
  assert.equal(spread.killed, 12);
  assert.equal(spread.left, 8);
  const ball = resolveHits(3, 4, 1, 100);
  assert.equal(ball.killed, 12);
  const capped = resolveHits(5, 4, 1, 7);
  assert.equal(capped.killed, 7);
  assert.equal(capped.left, 0);
  assert.equal(resolveHits(0, 4, 1, 10).killed, 0);
});

test('counts drop only when shots land, and the lane keeps moving', () => {
  const level = LEVELS[0];
  const world = createWorld(level, level.waves[0].y - 8);
  world.waves[0].front = world.frontY - 8;
  const y0 = world.frontY;
  const count0 = world.count;
  const alive0 = world.waves[0].alive;
  const ev = stepWorld(world, 0.5, 0);
  const blue = ev.attacks.find((a) => a.side === 'blue');
  const red = ev.attacks.find((a) => a.side === 'red');
  assert.ok(blue && blue.shots > 0, 'blues should fire on contact');
  assert.ok(blue.killed > 0 && blue.killed <= alive0);
  assert.ok(Math.abs(world.waves[0].alive - (alive0 - blue.killed)) < 1e-9);
  assert.ok(red && red.shots > 0, 'reds should swing back');
  assert.ok(Math.abs(world.count - (count0 - red.killed + (ev.cannon || 0))) < 1e-9);
  assert.ok(world.frontY > y0);
  assert.equal(world.won, false);
  const quiet = stepWorld(world, 0, 0);
  assert.equal(quiet.attacks.length, 0);
});

test('only the front ranks fight; boss types have one weakness and one resistance', () => {
  assert.equal(frontline(10), 10);
  assert.equal(frontline(50), 50);
  assert.ok(frontline(10000) < 10000 && frontline(10000) === Math.floor(50 + 100 * 5));
  assert.equal(WEAK_MULT, 1.8);
  assert.equal(RESIST_MULT, 0.5);
  const fams = new Set(Object.keys(WEAPONS).map(weaponFamily));
  assert.deepEqual([...fams].sort(), ['basic', 'heavy', 'pierce', 'rapid', 'spread']);
  const weakSeen = new Set();
  for (const [id, bt] of Object.entries(BOSS_TYPES)) {
    assert.notEqual(bt.weak, bt.resist, id);
    weakSeen.add(bt.weak);
    assert.match(typeTag(id), /^WEAK: [A-Z]+ {3}RESIST: [A-Z]+$/);
    for (const w of Object.values(WEAPONS)) {
      const m = typeMult(w, id);
      assert.ok(m >= 0.5 && m <= 1.8, 'no weapon is ever near-useless');
      assert.equal(hitDamage(w, id), w.damage * m);
    }
    assert.equal(typeMult(WEAPONS.shot, id), 1, 'Shot is neutral to every type');
  }
  assert.equal(weakSeen.size, 4, 'each type has a different counter');
  assert.equal(typeMult(WEAPONS.ball, 'armored'), 1.8);
  assert.equal(typeMult(WEAPONS.needle, 'armored'), 0.5);
  assert.equal(typeMult(WEAPONS.spread, 'swarm'), 1.8);
  assert.equal(typeMult(WEAPONS.bolts, 'swift'), 1.8);
  assert.equal(typeMult(WEAPONS.lance, 'bulky'), 1.8);
  assert.equal(typeMult(WEAPONS.ball, null), 1, 'plain packs have no type');
  const chip = landHits(4, 0.25, 1, 100, 0);
  assert.equal(chip.killed, 1);
  const carry = landHits(1, 0.25, 1, 100, 0);
  assert.equal(carry.killed, 0);
  assert.ok(carry.acc > 0, 'fractional damage carries over');
  assert.equal(landHits(10, 4, 2, 7, 0).killed, 7);

  const loadout = freshLoadout();
  giveWeapon(loadout, 'needle');
  giveWeapon(loadout, 'ball', false);
  assert.equal(loadout.slots[bestSlot(loadout, 'armored')], 'ball');
  assert.equal(loadout.slots[bestSlot(loadout, 'swift')], 'needle');
  assert.equal(loadout.slots[bestSlot(loadout, null)], 'needle');
});

test('boss specials telegraph zones that land unless you dodge', () => {
  assert.deepEqual(Object.keys(BOSS_MOVES), ['slam', 'volley', 'charge']);
  const slam = moveZones('slam', 0.2);
  assert.equal(slam.length, 1);
  assert.ok(inZones(slam, 0.2) && !inZones(slam, 0.7));
  const volley = moveZones('volley', 0);
  assert.equal(volley.length, 3);
  assert.ok(inZones(volley, 0) && inZones(volley, 0.45) && !inZones(volley, 0.22));
  const charge = moveZones('charge', 0.9);
  assert.ok(inZones(charge, 0.9) && !inZones(charge, -0.6));
  assert.ok(moveKill('charge', 100) > moveKill('slam', 100));
  assert.ok(moveKill('slam', 100) > moveKill('volley', 100));
  assert.equal(moveKill('slam', 3), 3);

  function fight(dodge) {
    const level = LEVELS[2];
    const world = createWorld(level, level.boss.y - 5);
    for (const w of world.waves) w.alive = 0;
    world.count = 5000;
    // Isolate the specials: a huge boss that never melees.
    world.boss.alive = world.boss.count = 1e6;
    world.boss.swingRate = 0;
    world.boss.front = world.frontY + 200;
    let lane = 0;
    let tells = 0;
    let hits = 0;
    let dodged = 0;
    for (let i = 0; i < 90 * 8 && !world.won && !world.lost; i++) {
      if (dodge) {
        const safe = safeLane(world, lane);
        if (safe !== null) lane += Math.sign(safe - lane) * Math.min(Math.abs(safe - lane), 2.6 / 90);
      }
      const ev = stepWorld(world, 1 / 90, lane);
      tells += ev.bossTells.length;
      for (const h of ev.bossHits) (h.hit ? hits++ : dodged++);
    }
    return { tells, hits, dodged };
  }
  const stand = fight(false);
  assert.ok(stand.tells >= 2, 'boss should wind up specials');
  assert.ok(stand.hits >= 2 && stand.dodged === 0, 'standing still eats every special');
  const move = fight(true);
  assert.ok(move.dodged >= 2 && move.hits === 0, 'steering out of the zone dodges');
});

test('a loadout holds three weapons and switches the one that fires', () => {
  const loadout = freshLoadout();
  assert.equal(SLOT_CAP, 3);
  assert.equal(heldWeapon(loadout).id, 'shot');
  assert.equal(giveWeapon(loadout, 'shot').reason, 'have');
  const bolts = giveWeapon(loadout, 'bolts');
  assert.equal(bolts.reason, 'slot');
  assert.equal(bolts.slot, 1);
  assert.equal(loadout.equipped, 1);
  giveWeapon(loadout, 'spread');
  const ball = giveWeapon(loadout, 'ball');
  assert.equal(ball.reason, 'swap');
  assert.equal(ball.slot, loadout.equipped, "swapped-in gun is held");
  assert.equal(loadout.slots[ball.slot], 'ball');
  assert.equal(giveWeapon(loadout, 'spread').reason, 'have', 'a duplicate reads HAVE IT even with a full rack');
  assert.equal(giveWeapon(loadout, 'nope').reason, 'full');
  assert.equal(heldWeapon(loadout).id, 'ball');
  const other = ball.slot === 0 ? 1 : 0;
  assert.equal(switchWeapon(loadout, other).changed, true);
  assert.equal(switchWeapon(loadout, ball.slot).changed, true);
  assert.equal(heldWeapon(loadout).id, 'ball');
  assert.equal(switchWeapon(loadout, ball.slot).reason, 'same');
  const spare = freshLoadout();
  giveWeapon(spare, 'needle', false);
  assert.equal(spare.slots[1], 'needle');
  assert.equal(spare.equipped, 0, 'a drop fills a slot without stealing the equipped gun');
  assert.equal(switchWeapon(spare, 1).id, 'needle');
  assert.equal(switchWeapon(spare, 2).reason, 'empty');
});

test('multipliers are rare, small, and sit next to bad gates', () => {
  assert.equal(LEVELS.length, 6);
  for (const level of LEVELS) {
    const gates = level.rows.flatMap((r) => r.gates);
    const muls = gates.filter((g) => g.kind === 'mul');
    assert.ok(muls.length <= 5, level.name + ' has ' + muls.length + ' multipliers');
    assert.ok(muls.length / gates.length <= 0.15, level.name + ' multiplier share');
    const avg = muls.reduce((s, g) => s + g.value, 0) / Math.max(1, muls.length);
    assert.ok(avg <= 2.6, level.name + ' average multiplier ' + avg);
    assert.ok(muls.filter((g) => g.value >= 4).length <= 1, level.name + ' big multipliers');
    assert.ok(muls.every((g) => g.value <= 4));
    const adds = gates.filter((g) => g.kind === 'add').length;
    const bad = gates.filter((g) => !g.good).length;
    assert.ok(adds > muls.length && bad > muls.length, level.name + ' should be mostly add and bad gates');
    for (const row of level.rows) {
      assert.ok(row.gates.length >= 2 && row.gates.length <= 5);
      row.gates.forEach((g, i) => {
        if (g.kind !== 'mul') return;
        const edge = i === 0 || i === row.gates.length - 1;
        const nextToBad = (row.gates[i - 1] && !row.gates[i - 1].good) || (row.gates[i + 1] && !row.gates[i + 1].good);
        assert.ok(level.id === 1 || edge || nextToBad, // level 1 has no traps beside its x2s
           level.name + ' row ' + row.y + ' multiplier is too easy to reach');
      });
    }
  }
});

test('six long levels with typed mid-bosses and final bosses, counters dropped ahead', () => {
  const minEnd = [5400, 9000, 9800, 12000, 13000, 13000];
  let prevBoss = 0;
  const finals = new Set();
  for (const level of LEVELS) {
    assert.ok(level.boss.y >= minEnd[level.id - 1], level.name + ' lane ' + level.boss.y);
    assert.ok(level.boss.count > prevBoss, level.name + ' final boss should escalate');
    prevBoss = level.boss.count;
    assert.equal(level.endY, level.boss.y);
    assert.ok(level.rows.length >= 6 && level.waves.length >= 6);
    const mids = level.waves.filter((w) => w.mid);
    assert.equal(mids.length, 1, level.name + ' mid-boss');
    const mid = mids[0];
    const midAt = level.waves.indexOf(mid);
    assert.ok(mid.y > level.rows[0].y && mid.y < level.boss.y);
    assert.ok(BOSS_TYPES[mid.type] && BOSS_TYPES[level.boss.type], level.name + ' typed bosses');
    assert.notEqual(mid.type, level.boss.type, level.name + ' mid and final differ');
    finals.add(level.boss.type);
    assert.ok(mid.moves.length >= 1 && level.boss.moves.length >= 2);
    for (const m of [...mid.moves, ...level.boss.moves]) assert.ok(BOSS_MOVES[m], m);
    // A counter for each boss is reachable before it: pad or an earlier drop.
    const before = (i) => [level.weapon.id, ...level.waves.slice(0, i).map((w) => w.drop).filter(Boolean)];
    assert.ok(before(midAt).some((id) => weaponFamily(id) === BOSS_TYPES[mid.type].weak), level.name + ' mid counter');
    assert.equal(weaponFamily(mid.drop), BOSS_TYPES[level.boss.type].weak, level.name + ' mid drops the final-boss counter');
    for (let i = 0; i < level.rows.length; i += 3) {
      const slice = level.rows.slice(i, i + 3);
      assert.ok(slice.some((row) => row.gates.some((g) => !g.good)), level.name + ' needs a bad gate');
    }
  }
  assert.equal(finals.size, 4, 'every boss type shows up as a final boss');
  // Early bosses attack slower and softer than late ones.
  const pace = (l) => l.boss.every;
  assert.ok(pace(LEVELS[0]) > pace(LEVELS[5]) && LEVELS[0].boss.power < LEVELS[5].boss.power);
});

test('levels 1 and 2 can be cleared with only the starting Shot', () => {
  for (const level of LEVELS.slice(0, 2)) {
    for (const dodge of [true, false]) {
      const w = playThrough(level, level.proofWin.gates, level.proofWin.jet, false, { dodge, arm: 'shot' });
      assert.equal(w.won, true, level.name + ' shot-only (dodge ' + dodge + ') died at ' + w.diedAt);
      assert.deepEqual(w.loadout.slots, ['shot', null, null]);
    }
  }
});

const ARMS = ['bolts', 'needle', 'spread', 'lance', 'ball', 'mortar'];
for (const level of LEVELS) {
  test(level.name + ': at least two weapon families can win, including the boss counter', () => {
    const pw = level.proofWin;
    const winners = new Set();
    for (const arm of ARMS) {
      const w = playThrough(level, pw.gates, pw.jet, false, { dodge: true, arm });
      if (w.won) winners.add(weaponFamily(arm));
    }
    assert.ok(winners.size >= 2, level.name + ' only ' + [...winners].join(','));
    assert.ok(winners.has(BOSS_TYPES[level.boss.type].weak), level.name + ' counter should win');
  });

  test(level.name + ': skilled route wins, lazy routes lose', () => {
    const win = playThrough(level, pw0(level).gates, pw0(level).jet, true, { dodge: true, smart: true });
    assert.equal(win.won, true, level.name + ' skilled route lost at ' + win.diedAt);
    assert.ok(win.count > 0 && win.boss.alive <= 0);
    assert.ok(win.waves.filter((w) => w.mid).every((w) => w.alive <= 0));
    assert.ok(win.loadout.slots.some((id) => id && weaponFamily(id) === BOSS_TYPES[level.boss.type].weak), level.name + ' should carry the boss counter');
    assert.deepEqual(win.rows.filter((r) => r.fork == null).map((r) => r.hit), pw0(level).gates, level.name + ' missed a gate');
    if (pw0(level).jet) assert.equal(win.jet.taken, true);
    assert.ok(win.stats.tells >= 1, level.name + ' bosses should attack');
    assert.equal(win.stats.landed, 0, 'skilled play dodges everything');

    const sloppy = playThrough(level, pw0(level).gates, pw0(level).jet, true, { dodge: false, smart: false });
    if (level.id >= 4) {
      assert.equal(sloppy.lost, true, level.name + ' no dodging and no switching should lose (left ' + sloppy.count + ')');
      assert.ok(sloppy.diedAt === 'mid' || sloppy.diedAt === 'boss', 'sloppy died at ' + sloppy.diedAt);
    }

    const lazy = playThrough(level, level.proofLose.gates, level.proofLose.jet, false);
    assert.equal(lazy.lost, true, level.name + ' bad line survived with ' + lazy.count);
    assert.ok(lazy.diedAt === 'wave' || lazy.diedAt === 'gate', 'lazy died at ' + lazy.diedAt);

    if (level.needsJet) {
      const noJet = playThrough(level, pw0(level).gates, false, true, { dodge: true, smart: true });
      assert.equal(noJet.lost, true, level.name + ' should need the jet');
    }
  });
}

function pw0(level) {
  return level.proofWin;
}

test('weapon icons list the boss types a gun beats, best first, never resisted ones', () => {
  assert.deepEqual(strongAgainst('shot'), []);
  assert.deepEqual(strongAgainst('bolts'), ['swift']);
  assert.deepEqual(strongAgainst('needle'), ['swift']);
  assert.deepEqual(strongAgainst('spread'), ['swarm']);
  assert.deepEqual(strongAgainst('lance'), ['bulky']);
  assert.deepEqual(strongAgainst('ball'), ['armored']);
  assert.deepEqual(strongAgainst('mortar'), ['armored']);
  for (const id of Object.keys(WEAPONS)) {
    for (const type of strongAgainst(id)) assert.ok(typeMult(WEAPONS[id], type) > 1);
  }
});

test('dropped weapons auto-equip when picked up, like pads', () => {
  const level = LEVELS[0];
  const world = createWorld(level, 400);
  world.pickups = [{ y: 420, x: 0, radius: 0.2, id: 'lance', resolved: false, taken: false, source: 'wave' }];
  const ev = stepWorld(world, 0.2, 0);
  assert.equal(ev.weapon.hit, true);
  assert.equal(heldWeapon(world.loadout).id, 'lance');
  assert.equal(world.weapon.id, 'lance');
  // Running through a gun you already hold switches back to it.
  switchWeapon(world.loadout, 0);
  world.weapon = heldWeapon(world.loadout);
  world.pickups.push({ y: world.frontY + 10, x: 0, radius: 0.2, id: 'lance', resolved: false, taken: false, source: 'mid' });
  const ev2 = stepWorld(world, 0.2, 0);
  assert.equal(ev2.weapon.reason, 'have');
  assert.equal(world.weapon.id, 'lance');
});

// A casual human: reacts ~0.35 s late, aims with lateral error, gives up on ~30% of
// off-center gates, never dodges, never switches by hand (auto-equip only).
function casualRate(level, seeds, opts) {
  let wins = 0;
  const left = [];
  for (let s = 1; s <= seeds; s++) {
    const w = casualPlay(level, s, opts);
    if (w.won) { wins += 1; left.push(w.count); }
  }
  left.sort((a, b) => a - b);
  return { wins, median: left.length ? left[left.length >> 1] : 0 };
}

test('casual players clear levels 1 and 2 with a clear margin', () => {
  for (const level of LEVELS.slice(0, 2)) {
    const r = casualRate(level, 30);
    assert.ok(r.wins >= 27, level.name + ' casual wins ' + r.wins + '/30');
    assert.ok(r.median >= level.boss.count * 1.5, level.name + ' casual margin ' + r.median);
    const harsh = casualRate(level, 30, { error: 0.15, giveUp: 0.45, delay: 0.45 });
    assert.ok(harsh.wins >= 24, level.name + ' sloppier casual wins ' + harsh.wins + '/30');
  }
});

test('casual players clear level 3 on most seeds; later levels need skill', () => {
  const r = casualRate(LEVELS[2], 40);
  assert.ok(r.wins >= 22, 'Switchback casual wins ' + r.wins + '/40');
  for (const level of LEVELS.slice(3)) {
    assert.ok(casualRate(level, 10).wins <= 3, level.name + ' should need skill');
  }
});

test('level 1 is safe down the middle: good center gates and a counter drop', () => {
  const level = LEVELS[0];
  const first = level.rows[0];
  assert.equal(first.gates[1].good, true, 'first center gate is good');
  const midAt = level.waves.findIndex((w) => w.mid);
  const centerDrop = level.waves.slice(0, midAt).find((w) => w.drop && Math.abs(w.dropX) < 0.2);
  assert.ok(centerDrop, 'a drop lands on the center path before the mid-boss');
  assert.ok(level.cannon > 0 && level.start >= 30);
  let got = 0;
  for (let s = 1; s <= 20; s++) {
    const w = casualPlay(level, s);
    if (w.loadout.slots.includes(centerDrop.drop)) got += 1;
  }
  assert.ok(got >= 14, 'casual players usually pick up the center drop (' + got + '/20)');
});

test('faithful casual mouse (same step + followLane the scene uses) wins level 1, even sloppy', async () => {
  const { casualPlay, followLane } = await import('../src/logic.js');
  // followLane never teleports and keeps moving after the pointer stops.
  let lane = 0;
  for (let i = 0; i < 60; i++) lane = followLane(lane, 0.6, 1 / 60);
  assert.ok(Math.abs(lane - 0.6) < 0.01, 'reaches a held pointer target: ' + lane);
  const sloppy = { error: 0.22, giveUp: 0.6, reach: 0.5, delay: 0.45, greed: 0.3 };
  let normal = 0;
  let rough = 0;
  for (let s = 1; s <= 40; s++) {
    if (casualPlay(LEVELS[0], s).won) normal++;
    if (casualPlay(LEVELS[0], s, sloppy).won) rough++;
  }
  assert.ok(normal >= 39, 'casual L1 wins ' + normal + '/40');
  assert.ok(rough >= 36, 'sloppy L1 wins ' + rough + '/40');
});

test('level 1 boss falls to a 64-crowd still holding the resisted Needle', async () => {
  const m = await import('../src/logic.js');
  const l = LEVELS[0];
  for (const id of ['needle', 'shot']) {
    const w = m.createWorld(l, l.boss.y - 900);
    for (const x of w.waves) x.alive = 0;
    w.rows.forEach((r) => { r.triggered = true; });
    w.jet.resolved = true;
    w.count = 64;
    w.loadout.slots = [id, null, null];
    w.weapon = m.heldWeapon(w.loadout);
    let t = 0;
    while (!w.won && !w.lost && t < 60) { m.stepWorld(w, 1 / 60, 0); t += 1 / 60; }
    assert.ok(w.won, id + ' with 64 should beat Red Camp');
  }
});

test('weapon pickups: touching the crate with any part of the crowd always fills a slot', async () => {
  const m = await import('../src/logic.js');
  const run = (level, pk, lane) => {
    const w = m.createWorld(level, pk.y - 400);
    for (const x of w.waves) x.alive = 0;
    w.rows.forEach((r) => { r.triggered = true; });
    w.jet.resolved = true;
    w.cannon = 0;
    w.count = 50;
    w.pickups = [Object.assign({ resolved: false, taken: false }, pk)];
    const evs = [];
    for (let i = 0; i < 400 && !w.pickups[0].resolved; i++) {
      const ev = m.stepWorld(w, 1 / 60, lane);
      evs.push(...ev.weapons);
    }
    return { w, evs };
  };
  const L = LEVELS[0];
  // Drop at the lane centre, crowd passing at many offsets that visually overlap it.
  for (const lane of [-0.5, -0.35, -0.2, 0, 0.2, 0.35, 0.5]) {
    const { w, evs } = run(L, { y: 3000, x: 0, radius: 0.16, id: 'ball', source: 'mid' }, lane);
    assert.equal(evs.length, 1, 'one event at lane ' + lane);
    assert.ok(evs[0].hit, 'crowd body over the crate must collect it at lane ' + lane);
    assert.equal(w.loadout.slots[1], 'ball');
    assert.equal(w.weapon.id, 'ball', 'auto-equipped');
    assert.equal(evs[0].reason, 'slot');
  }
  // Edge pad and wave drop.
  for (const pk of [{ y: 1250, x: 0.78, radius: 0.16, id: 'bolts', source: 'pad' }, { y: 2000, x: -0.82, radius: 0.16, id: 'needle', source: 'wave' }]) {
    const { w, evs } = run(L, pk, Math.sign(pk.x) * 0.6);
    assert.ok(evs[0].hit, pk.id + ' at the edge should be collected');
    assert.equal(w.loadout.slots[1], pk.id);
  }
  // A clear miss reports a visible miss event and leaves slots as they were.
  const miss = run(L, { y: 3000, x: 0.8, radius: 0.16, id: 'ball', source: 'mid' }, -0.6);
  assert.equal(miss.evs.length, 1);
  assert.equal(miss.evs[0].hit, false);
  assert.equal(miss.evs[0].reason, 'miss');
  // The crowd hitbox is the drawn crowd shape.
  assert.equal(m.crowdHalfAt(0), 0.05);
  assert.ok(m.crowdHalfAt(230) > 0.39);
});

test('real drops from waves and the mid-boss spawn ahead of the crowd and fill slots', async () => {
  const m = await import('../src/logic.js');
  for (const L of LEVELS.slice(0, 3)) {
    const w = m.createWorld(L, 0);
    const seen = [];
    let guard = 0;
    while (!w.won && !w.lost && guard++ < 60000) {
      const target = w.pickups.find((p) => !p.resolved && p.y > w.frontY - 200);
      const ev = m.stepWorld(w, 1 / 60, target ? target.x : 0);
      for (const d of ev.drops || []) assert.ok(d.y > w.frontY, 'drop spawned ahead');
      for (const g of ev.weapons) seen.push(g);
      if (w.frontY > L.boss.y - 300) break;
    }
    const missed = seen.filter((g) => !g.hit);
    assert.equal(missed.length, 0, L.name + ' steering onto every crate missed ' + JSON.stringify(missed));
    for (const g of seen) assert.ok(w.loadout.slots.includes(g.id), L.name + ' holds ' + g.id);
  }
});

test('picking up a 4th gun with a full rack swaps it in AND equips it', async () => {
  const m = await import('../src/logic.js');
  const lo = { slots: ['shot', 'needle', 'bolts'], equipped: 2 };
  const got = m.giveWeapon(lo, 'ball', true);
  assert.equal(got.reason, 'swap');
  assert.equal(lo.slots[got.slot], 'ball');
  assert.equal(lo.equipped, got.slot, 'swapped gun must be held');
  assert.equal(m.heldWeapon(lo).id, 'ball');
  assert.ok(lo.slots.includes('bolts'), 'the gun you were holding is kept');
});

// ---------------- Branching paths ----------------
async function runToY(L, opts) {
  const m = await import('../src/logic.js');
  const w = m.createWorld(L);
  if (opts.noMainCrates) {
    w.pickups = w.pickups.filter((p) => p.fork != null);
    for (const wv of w.waves) if (wv.fork == null) wv.drop = null;
  }
  if (opts.preset) { w.loadout.slots = ['shot', opts.preset, null]; w.loadout.equipped = 1; w.weapon = m.heldWeapon(w.loadout); }
  if (opts.count) w.count = opts.count;
  const plan = { gates: L.proofWin.gates, jet: true, weapon: true, drops: true, dodge: true, smart: true, branches: opts.branches };
  let lane = 0;
  while (!w.won && !w.lost && w.frontY < opts.y) {
    const a = m.autoPilot(w, L, plan, lane);
    if (a.slot !== w.loadout.equipped) { m.switchWeapon(w.loadout, a.slot); w.weapon = m.heldWeapon(w.loadout); }
    const d = a.lane - lane; lane += Math.abs(d) <= 0.04 ? d : Math.sign(d) * 0.04;
    m.stepWorld(w, 1 / 90, lane); lane = w.laneX;
  }
  return w;
}

test('forks: every level has them, level 1 one gentle fork, later levels 2 with real tradeoffs (some 3-way)', async () => {
  const { branchSummary } = await import('../src/logic.js');
  assert.equal(LEVELS[0].forks.length, 1);
  assert.equal(LEVELS[0].forks[0].branches.length, 2);
  for (const L of LEVELS.slice(1)) assert.ok(L.forks.length >= 2, L.name + ' forks');
  assert.ok(LEVELS.some((L) => L.forks.some((f) => f.branches.length === 3)), 'some 3-way fork');
  for (const L of LEVELS) {
    for (const f of L.forks) {
      assert.ok(f.y1 > f.y0 + 300);
      // No full-width content inside a fork.
      for (const r of L.rows) assert.ok(r.y < f.y0 - 100 || r.y > f.y1 + 40, L.name + ' row ' + r.y + ' inside fork');
      for (const w of L.waves) assert.ok(w.y < f.y0 || w.y > f.y1, L.name + ' wave ' + w.y + ' inside fork');
      const sums = f.branches.map(branchSummary);
      const keys = new Set(sums.map((s) => JSON.stringify([s.adds, s.muls, s.foes, s.guns])));
      assert.equal(keys.size, sums.length, L.name + ' branches must differ');
      sums.forEach((s) => assert.ok(s.title));
    }
  }
});

test('fork commit: branch chosen at the split, walls clamp the lane, other branch content vanishes', async () => {
  const m = await import('../src/logic.js');
  const L = LEVELS[0];
  const f0 = L.forks[0];
  for (const b of [0, 1]) {
    const w = m.createWorld(L, f0.y0 - 50);
    for (const x of w.waves) if (x.fork == null) x.alive = 0;
    w.rows.forEach((r) => { if (r.fork == null) r.triggered = true; });
    w.jet.resolved = true;
    const lane = m.branchCenter(2, b);
    for (let i = 0; i < 30; i++) m.stepWorld(w, 1 / 60, lane);
    const f = w.forks[0];
    assert.equal(f.chosen, b);
    // Try to cross the wall: the logic clamps you inside your branch.
    m.stepWorld(w, 1 / 60, b === 0 ? 0.9 : -0.9);
    const [lo, hi] = m.laneBounds(w);
    assert.ok(w.laneX >= lo && w.laneX <= hi, 'clamped ' + w.laneX);
    assert.ok(b === 0 ? w.laneX < 0 : w.laneX > 0, 'stayed on own side');
    for (const r of w.rows) if (r.fork === 0 && r.branch !== b) assert.ok(r.skipped);
    for (const x of w.waves) if (x.fork === 0 && x.branch !== b) assert.equal(x.alive, 0);
    // After the rejoin the full lane is open again.
    while (w.frontY < f0.y1 + 10 && !w.lost) m.stepWorld(w, 1 / 60, lane);
    assert.deepEqual(m.laneBounds(w), [-0.92, 0.92]);
  }
  // Gates inside a branch map to the branch's own width.
  const row = { gates: [1, 2], span: m.branchSpans(2)[1] };
  assert.equal(m.rowGateIndex(row, m.gateCenter(row, 0)), 0);
  assert.equal(m.rowGateIndex(row, m.gateCenter(row, 1)), 1);
});

test('branches produce clearly different outcomes', async () => {
  for (const L of LEVELS.slice(0, 3)) {
    const y = L.forks[L.forks.length - 1].y1 + 50;
    const counts = [];
    for (let b = 0; b < L.forks[0].branches.length; b++) {
      const w = await runToY(L, { branches: L.forks.map(() => b), y });
      counts.push({ count: Math.round(w.count), slots: w.loadout.slots.join(',') });
    }
    const differ = counts[0].count !== counts[1].count || counts[0].slots !== counts[1].slots;
    assert.ok(differ, L.name + ' branches identical ' + JSON.stringify(counts));
  }
});

test('no strictly dominant branch: the right path depends on the gun you hold or crowd size', async () => {
  // Level 2 fork 1: SPREAD path (counter for the Swarm sergeant) vs TROOPS path.
  const L2 = LEVELS[1];
  const after = (b, preset) => runToY(L2, { branches: [b, 0], preset, noMainCrates: true, y: 5400 }).then((w) => w.count);
  const shotSpread = await after(0, null);
  const shotTroops = await after(1, null);
  const heldSpread = await after(0, 'spread');
  const heldTroops = await after(1, 'spread');
  assert.ok(shotSpread > shotTroops, `holding Shot, SPREAD path should win the sergeant fight (${shotSpread} vs ${shotTroops})`);
  assert.ok(heldTroops > heldSpread, `already holding Spread, TROOPS should be better (${heldTroops} vs ${heldSpread})`);
  // Level 2 fork 2: SAFE +60 vs RISKY x2 behind a wave: depends on crowd size.
  const m = await import('../src/logic.js');
  const fork = (count, b) => {
    const w = m.createWorld(L2, L2.forks[1].y0 - 60);
    for (const x of w.waves) if (x.fork !== 1) x.alive = 0;
    w.rows.forEach((r) => { if (r.fork !== 1) r.triggered = true; });
    w.jet.resolved = true; w.cannon = 0; w.count = count;
    w.pickups = [];
    const row = w.rows.find((r) => r.fork === 1 && r.branch === b);
    let best = 0;
    row.gates.forEach((g, i) => { if (m.applyOp(count, g) > m.applyOp(count, row.gates[best])) best = i; });
    const lane = m.gateCenter(row, best);
    while (w.frontY < L2.forks[1].y1 + 300 && !w.lost) m.stepWorld(w, 1 / 60, lane);
    return w.lost ? 0 : w.count;
  };
  assert.ok(fork(80, 0) > fork(80, 1), 'small crowd: SAFE is better');
  assert.ok(fork(600, 1) > fork(600, 0), 'big crowd: RISKY x2 is better');
});

test('casual players pick a branch from the sign and still win levels 1-2 on any branch; level 3 safe-ish branch most seeds', async () => {
  const { casualPlay } = await import('../src/logic.js');
  for (const [li, need] of [[0, 28], [1, 27]]) {
    for (const branch of [0, 1, 'auto']) {
      let wins = 0;
      for (let s = 1; s <= 30; s++) if (casualPlay(LEVELS[li], s, { branch }).won) wins++;
      assert.ok(wins >= need, `L${li + 1} branch ${branch}: ${wins}/30`);
    }
  }
  let w3 = 0;
  for (let s = 1; s <= 30; s++) if (casualPlay(LEVELS[2], s, { branch: 'safe' }).won) w3++;
  assert.ok(w3 >= 20, 'L3 safe branch casual ' + w3 + '/30');
  // The casual mouse really commits to the branch it wanted.
  const r = casualPlay(LEVELS[0], 3, { branch: 1 });
  assert.equal(r.forks[0].chosen, 1);
});
