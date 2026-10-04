export function gateColor(op) {
  if (!op.good) return 0xd31838;
  if (op.kind === 'mul' && op.value <= 2) return 0x2f6bff;
  if (op.kind === 'mul') return 0x7a3cf0;
  return 0x5460ea;
}

export function paintBanner(g, x, y, w, h, op, hot = false, alpha = 1) {
  if (w < 8 || h < 8) return;
  const color = gateColor(op);
  const r = Math.max(3, Math.min(16, h * 0.28, w * 0.2));
  const depth = Math.max(2, h * 0.12);
  g.fillStyle(hot ? 0x5a3a10 : 0x241018, alpha);
  g.fillRoundedRect(x - w / 2, y - h / 2 + depth, w, h, r);
  g.fillStyle(color, alpha);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, r);
  g.fillStyle(0xffffff, 0.22 * alpha);
  g.fillRoundedRect(x - w / 2 + w * 0.08, y - h / 2 + h * 0.1, w * 0.84, Math.max(3, h * 0.26), Math.max(2, r * 0.5));
  if (hot) {
    g.lineStyle(Math.max(3, h * 0.14), 0xfff4c2, alpha);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, r);
    g.lineStyle(0, 0, 0);
  }
}

export function paintCannon(g, x, y, scale, recoil, roll) {
  const s = scale;
  const kick = recoil * 12 * s;
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(x, y + 20 * s, 78 * s, 16 * s);

  const wy = y + 10 * s;
  for (const side of [-1, 1]) {
    const cx = x + side * 26 * s;
    g.fillStyle(0x241910, 1);
    g.fillCircle(cx, wy, 13 * s);
    g.fillStyle(0x8a6a48, 1);
    g.fillCircle(cx, wy, 9 * s);
    g.lineStyle(Math.max(1, 2 * s), 0x2a1c12, 1);
    const a = roll + (side === 1 ? 0.8 : 0);
    g.beginPath();
    g.moveTo(cx - Math.cos(a) * 7 * s, wy - Math.sin(a) * 7 * s);
    g.lineTo(cx + Math.cos(a) * 7 * s, wy + Math.sin(a) * 7 * s);
    g.strokePath();
    g.lineStyle(0, 0, 0);
  }

  g.fillStyle(0x5a3b28, 1);
  g.fillRoundedRect(x - 28 * s, y - 6 * s + kick * 0.3, 56 * s, 22 * s, 7 * s);
  g.fillStyle(0xc9854a, 1);
  g.fillRoundedRect(x - 22 * s, y - 2 * s + kick * 0.3, 44 * s, 8 * s, 3 * s);

  g.fillStyle(0x1c2836, 1);
  g.fillRoundedRect(x - 12 * s, y - 52 * s + kick, 24 * s, 48 * s, 7 * s);
  g.fillStyle(0x3d5168, 1);
  g.fillRoundedRect(x - 8 * s, y - 48 * s + kick, 9 * s, 40 * s, 4 * s);
  g.fillStyle(0x7eb6ff, 0.95);
  g.fillRoundedRect(x - 3 * s, y - 44 * s + kick, 6 * s, 14 * s, 2 * s);

  const flash = Math.max(0, recoil);
  g.fillStyle(0xb9dcff, 0.35 + flash * 0.6);
  g.fillCircle(x, y - 54 * s + kick, (7 + flash * 8) * s);
  g.fillStyle(0xf4fbff, 0.95);
  g.fillCircle(x, y - 54 * s + kick, 3.2 * s);
}

function paintSoldier(g, body, head, dark) {
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(20, 48, 22, 8);
  g.fillStyle(dark, 1);
  g.fillRoundedRect(8, 18, 24, 28, 11);
  g.fillStyle(body, 1);
  g.fillRoundedRect(9, 16, 22, 26, 10);
  g.fillStyle(dark, 1);
  g.fillCircle(20, 16, 9);
  g.fillStyle(head, 1);
  g.fillCircle(20, 15, 8);
  g.fillStyle(0xf4fbff, 1);
  g.fillRoundedRect(13, 13, 14, 5, 2);
  g.fillStyle(dark, 0.85);
  g.fillRect(11, 30, 18, 3);
  g.fillStyle(0xffffff, 0.35);
  g.fillCircle(16, 12, 2);
}

export function ensureArt(scene) {
  if (scene.textures.exists('lr-blue')) return;

  const blue = scene.make.graphics({ x: 0, y: 0, add: false });
  paintSoldier(blue, 0x3d7eff, 0x9fd0ff, 0x16357a);
  blue.generateTexture('lr-blue', 40, 54);
  blue.destroy();

  const red = scene.make.graphics({ x: 0, y: 0, add: false });
  paintSoldier(red, 0xe23b3b, 0xffb0a4, 0x7a1420);
  red.generateTexture('lr-red', 40, 54);
  red.destroy();

  const jet = scene.make.graphics({ x: 0, y: 0, add: false });
  jet.fillStyle(0xfff2b0, 0.0);
  jet.fillRect(0, 0, 80, 64);
  jet.fillStyle(0xff8a2a, 1);
  jet.fillTriangle(40, 60, 28, 40, 52, 40);
  jet.fillStyle(0xffe08a, 1);
  jet.fillTriangle(40, 54, 33, 40, 47, 40);
  jet.fillStyle(0xe0a020, 1);
  jet.fillTriangle(6, 36, 40, 22, 40, 40);
  jet.fillTriangle(74, 36, 40, 22, 40, 40);
  jet.fillStyle(0xffd23a, 1);
  jet.fillRoundedRect(30, 12, 20, 32, 9);
  jet.fillStyle(0xfff6c8, 1);
  jet.fillTriangle(40, 2, 28, 20, 52, 20);
  jet.fillStyle(0x1c2836, 1);
  jet.fillCircle(40, 18, 4.5);
  jet.fillStyle(0xffffff, 0.8);
  jet.fillCircle(38.5, 17, 1.6);
  jet.generateTexture('lr-jet', 80, 64);
  jet.destroy();

  const blob = scene.make.graphics({ x: 0, y: 0, add: false });
  blob.fillStyle(0x000000, 0.2);
  blob.fillEllipse(110, 168, 150, 28);
  blob.fillStyle(0x9d1824, 1);
  blob.fillCircle(110, 104, 78);
  blob.fillStyle(0xe23b3b, 1);
  blob.fillCircle(104, 96, 70);
  blob.fillStyle(0xff6d62, 1);
  blob.fillCircle(78, 70, 26);
  blob.fillCircle(132, 118, 22);
  blob.fillStyle(0xffd2cc, 0.85);
  blob.fillCircle(70, 62, 10);
  blob.fillStyle(0xfff6f4, 1);
  blob.fillCircle(82, 86, 14);
  blob.fillCircle(128, 86, 14);
  blob.fillStyle(0x1a0a0c, 1);
  blob.fillCircle(86, 88, 6);
  blob.fillCircle(132, 88, 6);
  blob.fillStyle(0x7a1420, 1);
  blob.fillRoundedRect(70, 70, 22, 5, 2);
  blob.fillRoundedRect(118, 70, 22, 5, 2);
  blob.lineStyle(5, 0x6a1018, 1);
  blob.beginPath();
  blob.moveTo(88, 126);
  blob.lineTo(104, 118);
  blob.lineTo(126, 128);
  blob.strokePath();
  blob.generateTexture('lr-blob', 220, 190);
  blob.destroy();
}
