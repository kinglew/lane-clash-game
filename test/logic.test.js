import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNT_CAP,
  applyOp,
  pickGateIndex,
  laneCenter,
  justCrossed,
  contactRate,
  clashStep,
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

test('contact cancels one for one and a large pack lasts about 2.4s', () => {
  let player = 5000;
  let enemy = 1200;
  const rate = contactRate(player, enemy);
  assert.ok(Math.abs(rate - 1200 / 2.4) < 1e-9);
  let elapsed = 0;
  while (enemy > 1e-6 && elapsed < 5) {
    const next = clashStep(player, enemy, 1 / 60, rate);
    assert.ok(Math.abs((player - next.player) - (enemy - next.enemy)) < 1e-6);
    player = next.player;
    enemy = next.enemy;
    elapsed += 1 / 60;
  }
  assert.ok(Math.abs(elapsed - 2.4) < 0.05, 'elapsed ' + elapsed);
  assert.ok(Math.abs(player - 3800) < 1, 'leftover ' + player);
  assert.equal(contactRate(8, 8), 16);
  const stuck = clashStep(40, 10, 0, 16);
  assert.equal(stuck.killed, 0);
  assert.equal(stuck.player, 40);
});

test('the lane keeps moving while a wave is in contact', () => {
  const level = LEVELS[0];
  const world = createWorld(level, level.waves[0].y - 20);
  world.waves[0].front = world.frontY - 8;
  const y0 = world.frontY;
  const count0 = world.count;
  const alive0 = world.waves[0].alive;
  const ev = stepWorld(world, 0.2, 0);
  assert.equal(ev.clashes.length, 1);
  assert.equal(ev.clashes[0].boss, false);
  assert.ok(Math.abs((count0 - world.count) - (alive0 - world.waves[0].alive)) < 1e-4);
  assert.ok(world.frontY > y0, 'front did not advance');
  assert.equal(world.won, false);
  assert.equal(world.lost, false);
  assert.equal(world.pushing, true);
});

test('an even boss fight is a loss, not a tie win', () => {
  const level = LEVELS[0];
  const world = createWorld(level, level.boss.y - 5);
  world.count = level.boss.count;
  world.boss.front = world.frontY - 8;
  for (const wave of world.waves) wave.alive = 0;
  let guard = 0;
  while (!world.lost && !world.won && guard < 20000) {
    stepWorld(world, 1 / 60, 0);
    guard += 1;
  }
  assert.equal(world.lost, true);
  assert.equal(world.won, false);
  assert.equal(world.diedAt, 'boss');
  assert.equal(world.count, 0);
  assert.ok(world.boss.alive <= 0.001);
});

test('six levels stream waves into a boss, and the intended lines win or lose', () => {
  assert.equal(LEVELS.length, 6);
  let prevBoss = 0;
  for (const level of LEVELS) {
    assert.ok(level.boss && level.boss.count > prevBoss, level.name + ' boss should escalate');
    prevBoss = level.boss.count;
    assert.ok(level.waves && level.waves.length >= 3, level.name + ' needs a stream of waves');
    assert.equal(level.endY, level.boss.y);
    assert.ok(level.waves[level.waves.length - 1].y < level.boss.y);
    assert.equal(level.proofWin.gates.length, level.rows.length);
    assert.equal(level.proofLose.gates.length, level.rows.length);
    assert.ok(level.jet && level.jet.radius > 0);
    assert.ok(level.endY > level.jet.y);
    assert.equal(level.enemy, undefined);
    for (const row of level.rows) {
      assert.ok(row.gates.length === 2 || row.gates.length === 3);
      assert.ok(level.endY > row.y);
    }
    for (let i = 0; i < level.rows.length; i += 3) {
      const slice = level.rows.slice(i, i + 3);
      const bad = slice.some((row) => row.gates.some((g) => !g.good));
      assert.ok(bad, level.name + ' needs a bad gate every few rows');
    }

    const win = playThrough(level, level.proofWin.gates, level.proofWin.jet);
    assert.equal(win.won, true, level.name + ' win path should clear the boss');
    assert.ok(win.count > 0, level.name + ' win leftover ' + win.count);
    assert.equal(win.boss.alive, 0);
    assert.deepEqual(win.rows.map((r) => r.hit), level.proofWin.gates, level.name + ' missed a gate');
    if (level.proofWin.jet) assert.equal(win.jet.taken, true, level.name + ' missed the jet');

    const lose = playThrough(level, level.proofLose.gates, level.proofLose.jet);
    assert.equal(lose.lost, true, level.name + ' bad line should die');
    assert.equal(lose.won, false);
    assert.equal(lose.diedAt, 'wave', level.name + ' bad line died at ' + lose.diedAt + ' with ' + lose.count);
    assert.equal(lose.count, 0);

    if (level.needsJet) {
      const missed = playThrough(level, level.proofWin.gates, false);
      assert.equal(missed.won, false, level.name + ' without the jet should lose');
      assert.equal(missed.jet.taken, false);
      assert.equal(missed.diedAt, 'wave', level.name + ' jet miss died at ' + missed.diedAt);
    }
  }
});
