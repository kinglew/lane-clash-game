// Screen projection and tuning knobs shared by the sim test and the Phaser scene.

export const FONT = 'Trebuchet MS, Verdana, sans-serif';

export const VIEW = {
  width: 540,
  height: 960,
  horizonY: 96,
  bottomY: 990,
  depth: 1020,
  nearHalf: 236,
  farHalf: 58,
  centerX: 270,
};

export const RUN_SPEED = 300;
export const STEER_SPEED = 2.55;
export const CROWD_DEPTH = 230;
export const START_FRONT = 210;
export const LANE_CLAMP = 0.92;
export const MAX_BLUE = 100;
export const MAX_RED = 84;
export const COMBAT_SECONDS = 3;
export const GO_DELAY = 0.28;

export function project(worldY, laneX, camY) {
  const rel = worldY - camY;
  const tRaw = rel / VIEW.depth;
  const vis = tRaw > -0.15 && tRaw < 1.08;
  const t = Math.min(1, Math.max(0, tRaw));
  const ease = Math.pow(t, 0.78);
  const y = VIEW.bottomY - (VIEW.bottomY - VIEW.horizonY) * ease;
  const half = VIEW.nearHalf + (VIEW.farHalf - VIEW.nearHalf) * ease;
  const x = VIEW.centerX + laneX * half;
  const scale = 1 - ease * 0.76;
  return { x, y, half, scale, vis, t: tRaw };
}

export function laneFromScreen(screenX) {
  const lane = (screenX - VIEW.centerX) / VIEW.nearHalf;
  if (lane < -LANE_CLAMP) return -LANE_CLAMP;
  if (lane > LANE_CLAMP) return LANE_CLAMP;
  return lane;
}
