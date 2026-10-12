// Screen projection and tuning knobs shared by the sim test and the Phaser scene.

// The play column is always 540x960 logical units. The canvas fills the whole
// window; fitCamera zooms so the column fits and the extra space shows more
// terrain on the sides (desktop) or above/below (tall phones).
export const BASE_W = 540;
export const BASE_H = 960;

export function fitCamera(scene) {
  const cam = scene.cameras.main;
  const w = Math.max(1, scene.scale.width);
  const h = Math.max(1, scene.scale.height);
  const z = Math.min(w / BASE_W, h / BASE_H);
  cam.setZoom(z);
  cam.centerOn(BASE_W / 2, BASE_H / 2);
  const hw = w / z / 2;
  const hh = h / z / 2;
  // Wide lane: fill most of the visible width (landscape gets a much wider lane),
  // with a milder perspective taper and everything drawn bigger (VIEW.unit).
  VIEW.nearHalf = Math.max(236, Math.min(hw * 0.94, 860));
  VIEW.farHalf = VIEW.nearHalf * 0.52;
  VIEW.unit = Math.max(1.12, Math.min(1.9, VIEW.nearHalf / 236));
  return { left: BASE_W / 2 - hw, right: BASE_W / 2 + hw, top: BASE_H / 2 - hh, bottom: BASE_H / 2 + hh, zoom: z };
}

export const FONT = 'Trebuchet MS, Verdana, sans-serif';

export const VIEW = {
  width: 540,
  height: 960,
  horizonY: 96,
  bottomY: 990,
  depth: 1020,
  nearHalf: 236,
  farHalf: 123,
  unit: 1.12, // size multiplier for everything drawn in the lane
  centerX: 270,
};

export const RUN_SPEED = 250;
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
  const scale = (1 - ease * 0.62) * VIEW.unit;
  return { x, y, half, scale, vis, t: tRaw };
}

export function laneFromScreen(screenX) {
  const lane = (screenX - VIEW.centerX) / VIEW.nearHalf;
  if (lane < -LANE_CLAMP) return -LANE_CLAMP;
  if (lane > LANE_CLAMP) return LANE_CLAMP;
  return lane;
}
