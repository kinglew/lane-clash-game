// Pure rules for Lane Rush. No Phaser, so node can test them.

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

export function createCombat(player, enemy, targetSeconds = 3) {
  const p = Math.max(0, Number(player) || 0);
  const e = Math.max(0, Number(enemy) || 0);
  const seconds = Math.min(4, Math.max(2, targetSeconds));
  const smaller = Math.min(p, e);
  const rate = smaller <= 0 ? 0 : smaller / seconds;
  const done = p <= 0 || e <= 0;
  const win = done ? e <= p : false;
  return {
    player: p,
    enemy: e,
    rate,
    targetSeconds: seconds,
    done,
    win,
  };
}

export function stepCombat(state, dt) {
  if (state.done) return state;
  const dec = state.rate * Math.max(0, Number(dt) || 0);
  const p = state.player - dec;
  const e = state.enemy - dec;
  if (p <= 0 || e <= 0) {
    return {
      ...state,
      player: Math.max(0, p),
      enemy: Math.max(0, e),
      done: true,
      // Same decrement: the side that started lower hits 0 first.
      // Exact ties cross together and count as a win.
      win: e <= p,
    };
  }
  return { ...state, player: p, enemy: e, done: false, win: false };
}

export function resolveCombat(player, enemy, dt = 1 / 60, targetSeconds = 3) {
  let state = createCombat(player, enemy, targetSeconds);
  let elapsed = 0;
  let guard = 0;
  while (!state.done && guard < 20000) {
    state = stepCombat(state, dt);
    elapsed += dt;
    guard += 1;
  }
  return { ...state, elapsed };
}

/** Apply gate indices in world order. takeJet applies the jet op when its line is crossed. */
export function simulate(level, gateIndices, takeJet) {
  let count = level.start;
  const events = level.rows.map((row, i) => ({ y: row.y, type: 'row', row, i }));
  if (level.jet) events.push({ y: level.jet.y, type: 'jet' });
  events.sort((a, b) => a.y - b.y);
  let ri = 0;
  for (const e of events) {
    if (e.type === 'row') {
      const idx = gateIndices[ri++];
      const gate = e.row.gates[idx];
      count = applyOp(count, gate);
    } else if (takeJet) {
      count = applyOp(count, level.jet.op);
    }
  }
  return count;
}
