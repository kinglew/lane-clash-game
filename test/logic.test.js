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
  assert.notEqual(ball.slot, loadout.equipped);
  assert.equal(loadout.slots[ball.slot], 'ball');
  assert.equal(giveWeapon(loadout, 'spread').reason, 'full');
  assert.equal(giveWeapon(loadout, 'nope').reason, 'full');
  const flipped = switchWeapon(loadout, ball.slot);
  assert.equal(flipped.changed, true);
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
      assert.ok(row.gates.length >= 2 && row.gates.length <= 4);
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
    assert.deepEqual(win.rows.map((r) => r.hit), pw0(level).gates, level.name + ' missed a gate');
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
