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
  const per = world.weapon.damage * world.weapon.pierce;
  assert.equal(blue.killed, Math.min(alive0, blue.shots * per));
  assert.ok(blue.killed > 0);
  assert.equal(world.waves[0].alive, alive0 - blue.killed);
  assert.ok(red && red.shots > 0, 'reds should swing back');
  assert.equal(world.count, count0 - red.killed);
  assert.ok(world.frontY > y0);
  assert.equal(world.won, false);
  const quiet = stepWorld(world, 0, 0);
  assert.equal(quiet.attacks.length, 0);
});

test('a stronger weapon lets a smaller crowd beat a larger pack', () => {
  function duel(id, count, enemy) {
    const world = createWorld(LEVELS[0], 1000);
    world.count = count;
    world.weapon = weaponById(id);
    for (const wave of world.waves) wave.alive = 0;
    world.boss.alive = enemy;
    world.boss.count = enemy;
    world.boss.front = world.frontY - 8;
    let guard = 0;
    while (!world.won && !world.lost && guard < 30000) {
      stepWorld(world, 1 / 60, 0);
      guard += 1;
    }
    return world;
  }
  const spread = duel('spread', 80, 100);
  assert.equal(spread.won, true, 'spread leftover ' + spread.count + ' enemy ' + spread.boss.alive);
  assert.ok(spread.count > 0 && spread.count < 80);
  const shot = duel('shot', 80, 100);
  assert.equal(shot.lost, true);
  assert.equal(shot.diedAt, 'boss');
  assert.equal(shot.count, 0);
  assert.ok(shot.boss.alive > 0);
});

test('an even shot-for-shot trade that empties both sides is a loss', () => {
  const world = createWorld(LEVELS[0], LEVELS[0].boss.y - 5);
  world.count = 40;
  world.weapon = weaponById('shot');
  for (const wave of world.waves) wave.alive = 0;
  world.boss.alive = 40;
  world.boss.count = 40;
  world.boss.front = world.frontY - 8;
  let guard = 0;
  while (!world.lost && !world.won && guard < 20000) {
    stepWorld(world, 1 / 60, 0);
    guard += 1;
  }
  assert.equal(world.lost, true);
  assert.equal(world.won, false);
  assert.equal(world.count, 0);
  assert.ok(world.boss.alive <= 0);
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

test('six longer levels have a mid-boss and a final boss', () => {
  assert.equal(LEVELS.length, 6);
  const minEnd = [5400, 9000, 9800, 12000, 13000, 13000];
  let prevBoss = 0;
  for (const level of LEVELS) {
    assert.ok(level.boss.y >= minEnd[level.id - 1], level.name + ' lane ' + level.boss.y);
    assert.ok(level.boss.count > prevBoss, level.name + ' final boss should escalate');
    prevBoss = level.boss.count;
    assert.equal(level.endY, level.boss.y);
    assert.ok(level.rows.length >= 6, level.name + ' gates');
    assert.ok(level.waves.length >= 6, level.name + ' waves');
    const mids = level.waves.filter((w) => w.mid);
    assert.equal(mids.length, 1, level.name + ' mid-boss');
    assert.ok(mids[0].name && mids[0].count > 0);
    assert.ok(mids[0].y > level.rows[0].y && mids[0].y < level.boss.y);
    assert.ok(level.waves.some((w) => w.drop) || mids[0].drop, level.name + ' should drop a weapon');
    assert.ok(level.weapon && Math.abs(level.weapon.x) > 0.5);
    assert.equal(level.proofWin.weapon, true);
    assert.equal(level.proofLose.weapon, false);
    for (const row of level.rows) {
      assert.ok(row.gates.length === 2 || row.gates.length === 3);
    }
    for (let i = 0; i < level.rows.length; i += 3) {
      const slice = level.rows.slice(i, i + 3);
      assert.ok(slice.some((row) => row.gates.some((g) => !g.good)), level.name + ' needs a bad gate');
    }

    const win = playThrough(level, level.proofWin.gates, level.proofWin.jet, true);
    assert.equal(win.won, true, level.name + ' should clear the final boss');
    assert.ok(win.count > 0);
    assert.equal(win.boss.alive, 0);
    assert.ok(win.waves.filter((w) => w.mid).every((w) => w.alive === 0));
    assert.equal(win.pad.taken, true, level.name + ' missed the weapon pad');
    assert.equal(win.weapon.id, level.weapon.id);
    assert.equal(win.loadout.slots[win.loadout.equipped], level.weapon.id);
    assert.ok(win.loadout.slots.length === 3);
    assert.deepEqual(win.rows.map((r) => r.hit), level.proofWin.gates, level.name + ' missed a gate');
    if (level.proofWin.jet) assert.equal(win.jet.taken, true, level.name + ' missed the jet');

    const lose = playThrough(level, level.proofLose.gates, level.proofLose.jet, false);
    assert.equal(lose.lost, true, level.name + ' bad line survived with ' + lose.count);
    assert.ok(lose.diedAt === 'wave' || lose.diedAt === 'mid', level.name + ' died at ' + lose.diedAt);
    assert.equal(lose.count, 0);
    assert.equal(lose.pad.taken, false);
    assert.equal(lose.weapon.id, 'shot');
  }
  const first = playThrough(LEVELS[0], LEVELS[0].proofWin.gates, true, true);
  assert.ok(first.loadout.slots.includes('needle') || first.loadout.slots.includes('lance'));
});
