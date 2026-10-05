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
  armorDamage,
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
  assert.ok(Math.abs(world.count - (count0 - red.killed)) < 1e-9);
  assert.ok(world.frontY > y0);
  assert.equal(world.won, false);
  const quiet = stepWorld(world, 0, 0);
  assert.equal(quiet.attacks.length, 0);
});

test('only the front ranks fight, and armor blunts light guns', () => {
  assert.equal(frontline(10), 10);
  assert.equal(frontline(40), 40);
  assert.ok(frontline(10000) < 10000 && frontline(10000) === Math.floor(40 + 100 * 4));
  assert.equal(armorDamage(3, 0), 3);
  assert.equal(armorDamage(1, 1), 0.25, 'shot vs armor 1 only chips');
  assert.equal(armorDamage(4, 1), 3);
  assert.equal(armorDamage(6, 2), 4);
  assert.ok(armorDamage(1, 2) > 0 && armorDamage(1, 2) < 0.2);
  assert.ok(weaponVs(WEAPONS.ball, 2) > weaponVs(WEAPONS.needle, 2));
  assert.ok(weaponVs(WEAPONS.mortar, 2) > weaponVs(WEAPONS.bolts, 2));
  assert.ok(weaponVs(WEAPONS.needle, 0) > weaponVs(WEAPONS.ball, 0), 'fast guns still win on unarmored packs');
  const chip = landHits(4, 0.25, 1, 100, 0);
  assert.equal(chip.killed, 1);
  const carry = landHits(1, 0.25, 1, 100, 0);
  assert.equal(carry.killed, 0);
  assert.ok(carry.acc > 0, 'fractional damage carries over');
  assert.equal(landHits(10, 4, 2, 7, 0).killed, 7);

  const loadout = freshLoadout();
  giveWeapon(loadout, 'needle');
  giveWeapon(loadout, 'ball', false);
  assert.equal(loadout.slots[bestSlot(loadout, 2)], 'ball');
  assert.equal(loadout.slots[bestSlot(loadout, 0)], 'needle');
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
    const level = LEVELS[1];
    const world = createWorld(level, level.boss.y - 5);
    for (const w of world.waves) w.alive = 0;
    world.count = 5000;
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
        assert.ok(edge || nextToBad, level.name + ' row ' + row.y + ' multiplier is too easy to reach');
      });
    }
  }
});

test('six long levels with armored mid-bosses and final bosses', () => {
  const minEnd = [5400, 9000, 9800, 12000, 13000, 13000];
  let prevBoss = 0;
  for (const level of LEVELS) {
    assert.ok(level.boss.y >= minEnd[level.id - 1], level.name + ' lane ' + level.boss.y);
    assert.ok(level.boss.count > prevBoss, level.name + ' final boss should escalate');
    prevBoss = level.boss.count;
    assert.equal(level.endY, level.boss.y);
    assert.ok(level.rows.length >= 6 && level.waves.length >= 6);
    const mids = level.waves.filter((w) => w.mid);
    assert.equal(mids.length, 1, level.name + ' mid-boss');
    const mid = mids[0];
    assert.ok(mid.y > level.rows[0].y && mid.y < level.boss.y);
    assert.ok(mid.armor >= 1 && mid.moves.length >= 1, level.name + ' mid armor/moves');
    assert.ok(level.boss.armor >= 1 && level.boss.moves.length >= 2, level.name + ' boss armor/moves');
    assert.ok(level.boss.count >= mid.count * 1.5);
    for (const m of [...mid.moves, ...level.boss.moves]) assert.ok(BOSS_MOVES[m], m);
    assert.ok(level.waves.some((w) => w.drop), level.name + ' should drop a weapon');
    assert.ok(level.weapon && Math.abs(level.weapon.x) > 0.5);
    for (let i = 0; i < level.rows.length; i += 3) {
      const slice = level.rows.slice(i, i + 3);
      assert.ok(slice.some((row) => row.gates.some((g) => !g.good)), level.name + ' needs a bad gate');
    }
  }
  assert.ok(LEVELS.slice(2).every((l) => l.boss.moves.includes('charge')), 'later bosses charge');
});

for (const level of LEVELS) {
  test(level.name + ': skilled route wins, lazy routes lose', () => {
    const pw = level.proofWin;
    const win = playThrough(level, pw.gates, pw.jet, true, { dodge: true, smart: true });
    assert.equal(win.won, true, level.name + ' skilled route lost at ' + win.diedAt);
    assert.ok(win.count > 0 && win.boss.alive <= 0);
    assert.ok(win.waves.filter((w) => w.mid).every((w) => w.alive <= 0));
    assert.ok(win.loadout.slots.some((id) => id === 'ball' || id === 'mortar' || id === 'lance'), level.name + ' skilled route should carry a heavy gun');
    assert.deepEqual(win.rows.map((r) => r.hit), pw.gates, level.name + ' missed a gate');
    if (pw.jet) assert.equal(win.jet.taken, true);
    assert.ok(win.stats.tells >= 2 && win.stats.dodged >= 1, level.name + ' bosses should attack');
    assert.equal(win.stats.landed, 0, 'skilled play dodges everything');

    const sloppy = playThrough(level, pw.gates, pw.jet, true, { dodge: false, smart: false });
    assert.equal(sloppy.lost, true, level.name + ' tanking specials should lose (left ' + sloppy.count + ')');
    assert.ok(sloppy.diedAt === 'mid' || sloppy.diedAt === 'boss', 'sloppy died at ' + sloppy.diedAt);
    assert.ok(sloppy.stats.landed > 0);

    const lazy = playThrough(level, level.proofLose.gates, level.proofLose.jet, false);
    assert.equal(lazy.lost, true, level.name + ' bad line survived with ' + lazy.count);
    assert.equal(lazy.diedAt, 'wave');
    assert.equal(lazy.pad.taken, false);
    assert.equal(lazy.weapon.id, 'shot');

    if (level.needsJet) {
      const noJet = playThrough(level, pw.gates, false, true, { dodge: true, smart: true });
      assert.equal(noJet.lost, true, level.name + ' should need the jet');
    }
  });
}
