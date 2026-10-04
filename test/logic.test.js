import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNT_CAP,
  applyOp,
  pickGateIndex,
  laneCenter,
  justCrossed,
  createCombat,
  stepCombat,
  resolveCombat,
  simulate,
  mul,
  add,
  div,
  sub,
} from '../src/logic.js';
import { LEVELS } from '../src/levels.js';
import { RUN_SPEED, STEER_SPEED, START_FRONT, LANE_CLAMP } from '../src/view.js';

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

test('combat is 1:1 and resolves in 2-4 seconds', () => {
  const win = resolveCombat(100, 40, 1 / 60, 3);
  assert.equal(win.win, true);
  assert.equal(win.enemy, 0);
  assert.ok(win.player > 59 && win.player < 61, 'player leftover ' + win.player);
  assert.ok(win.elapsed >= 2 && win.elapsed <= 4, 'elapsed ' + win.elapsed);

  const lose = resolveCombat(40, 100, 1 / 60, 3);
  assert.equal(lose.win, false);
  assert.equal(lose.player, 0);
  assert.ok(lose.enemy > 59 && lose.enemy < 61, 'enemy leftover ' + lose.enemy);
  assert.ok(lose.elapsed >= 2 && lose.elapsed <= 4);

  const tie = resolveCombat(50, 50, 1 / 60, 3);
  assert.equal(tie.win, true);
  assert.equal(tie.player, 0);
  assert.equal(tie.enemy, 0);
  assert.ok(Math.abs(tie.elapsed - 3) < 0.05, 'tie elapsed ' + tie.elapsed);

  let state = createCombat(80, 50, 3);
  state = stepCombat(state, 0.5);
  assert.ok(Math.abs((80 - state.player) - (50 - state.enemy)) < 1e-6);
  assert.equal(state.done, false);
  const stuck = stepCombat(state, 0);
  assert.equal(stuck.player, state.player);

  const already = createCombat(0, 25, 3);
  assert.equal(already.done, true);
  assert.equal(already.win, false);
  const empty = createCombat(0, 0, 3);
  assert.equal(empty.win, true);
});

function simulatePath(level, indices, wantJet) {
  const events = level.rows.map((row, i) => ({ y: row.y, type: 'row', row, i }));
  events.push({ y: level.jet.y, type: 'jet' });
  events.sort((a, b) => a.y - b.y);
  let lane = 0;
  let y = START_FRONT;
  let count = level.start;
  let jetTaken = false;
  let hits = [];
  let eIndex = 0;
  const dt = 1 / 120;
  let guard = 0;
  while (y < level.endY - 0.001 && guard < 400000) {
    guard += 1;
    let target = lane;
    if (eIndex < events.length) {
      const e = events[eIndex];
      if (e.type === 'row') target = laneCenter(indices[e.i], e.row.gates.length);
      else if (wantJet) target = level.jet.x;
    }
    target = Math.max(-LANE_CLAMP, Math.min(LANE_CLAMP, target));
    const step = STEER_SPEED * dt;
    const d = target - lane;
    if (Math.abs(d) <= step) lane = target;
    else lane += Math.sign(d) * step;

    const prev = y;
    y = Math.min(level.endY, y + RUN_SPEED * dt);
    while (eIndex < events.length && prev < events[eIndex].y && y >= events[eIndex].y) {
      const e = events[eIndex];
      if (e.type === 'row') {
        const idx = pickGateIndex(lane, e.row.gates.length);
        count = applyOp(count, e.row.gates[idx]);
        hits.push(idx);
      } else if (Math.abs(lane - level.jet.x) <= level.jet.radius + 1e-6) {
        jetTaken = true;
        count = applyOp(count, level.jet.op);
      }
      eIndex += 1;
      if (count <= 0) return { count, jetTaken, lane, hits };
    }
  }
  return { count, jetTaken, lane, hits };
}

test('six levels escalate and the intended lines win or lose', () => {
  assert.equal(LEVELS.length, 6);
  let prevEnemy = 0;
  for (const level of LEVELS) {
    assert.ok(level.enemy > prevEnemy, level.name + ' enemy should escalate');
    prevEnemy = level.enemy;
    assert.equal(level.proofWin.gates.length, level.rows.length);
    assert.equal(level.proofLose.gates.length, level.rows.length);
    assert.ok(level.jet && level.jet.radius > 0);
    assert.ok(level.endY > level.jet.y);
    for (const row of level.rows) {
      assert.ok(row.gates.length === 2 || row.gates.length === 3);
      assert.ok(level.endY > row.y);
    }
    for (let i = 0; i < level.rows.length; i += 3) {
      const slice = level.rows.slice(i, i + 3);
      const bad = slice.some((row) => row.gates.some((g) => !g.good));
      assert.ok(bad, level.name + ' needs a bad gate every few rows');
    }

    const win = simulate(level, level.proofWin.gates, level.proofWin.jet);
    const lose = simulate(level, level.proofLose.gates, level.proofLose.jet);
    assert.ok(win > level.enemy, level.name + ' win path ' + win + ' vs ' + level.enemy);
    assert.ok(lose < level.enemy, level.name + ' lose path ' + lose + ' vs ' + level.enemy);
    if (level.needsJet) {
      const missed = simulate(level, level.proofWin.gates, false);
      assert.ok(missed < level.enemy, level.name + ' without jet should lose (' + missed + ')');
    }

    const driven = simulatePath(level, level.proofWin.gates, true);
    assert.deepEqual(driven.hits, level.proofWin.gates, level.name + ' steering missed a gate ' + driven.hits);
    if (level.proofWin.jet || level.needsJet) {
      assert.equal(driven.jetTaken, true, level.name + ' steering missed the jet');
    }
    assert.ok(driven.count > level.enemy, level.name + ' steered count ' + driven.count);

    const sameLine = level.proofLose.gates.every((g, i) => g === level.proofWin.gates[i]);
    if (!sameLine) {
      const badDrive = simulatePath(level, level.proofLose.gates, level.proofLose.jet);
      assert.ok(badDrive.count < level.enemy, level.name + ' bad steer still won with ' + badDrive.count);
    }
  }
});
