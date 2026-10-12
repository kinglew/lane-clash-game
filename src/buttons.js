/**
 * Robust click/tap handling for UI buttons at any window size.
 *
 * Phaser's own hit test relies on cached canvas bounds and camera state, which can
 * go stale after a fullscreen/RESIZE change (the live build ignored clicks on the
 * result screen at 1920x1113). Here every press is mapped from the DOM event's
 * client position through the canvas's *current* bounding rect and the camera's
 * current scroll/zoom, then tested against each button's world bounds.
 * Buttons registered here must not also have a Phaser 'pointerdown' handler.
 */
export function canvasToWorld(scene, clientX, clientY) {
  const canvas = scene.game.canvas;
  const r = canvas.getBoundingClientRect();
  const sx = (clientX - r.left) * (scene.scale.width / Math.max(1, r.width));
  const sy = (clientY - r.top) * (scene.scale.height / Math.max(1, r.height));
  const cam = scene.cameras.main;
  // Same formula Phaser uses for a camera with origin 0.5.
  const x = cam.scrollX + cam.width * 0.5 + (sx - cam.x - cam.width * 0.5) / cam.zoom;
  const y = cam.scrollY + cam.height * 0.5 + (sy - cam.y - cam.height * 0.5) / cam.zoom;
  return { x, y, sx, sy };
}

export function worldToScreen(scene, wx, wy) {
  const cam = scene.cameras.main;
  return {
    x: cam.x + cam.width * 0.5 + (wx - cam.scrollX - cam.width * 0.5) * cam.zoom,
    y: cam.y + cam.height * 0.5 + (wy - cam.scrollY - cam.height * 0.5) * cam.zoom,
  };
}

export function screenRect(scene, obj) {
  const b = obj.getBounds();
  const a = worldToScreen(scene, b.x, b.y);
  const c = worldToScreen(scene, b.right, b.bottom);
  return { x: a.x, y: a.y, w: c.x - a.x, h: c.y - a.y, cx: (a.x + c.x) / 2, cy: (a.y + c.y) / 2 };
}

/** list: () => [{ obj, fn, pad? }]; first visible hit wins (list in priority order). */
export function bindButtons(scene, list) {
  const canvas = scene.game.canvas;
  const onDown = (ev) => {
    if (!scene.sys.isActive()) return;
    const p = canvasToWorld(scene, ev.clientX, ev.clientY);
    for (const b of list()) {
      if (!b.obj || !b.obj.active || b.obj.visible === false) continue;
      const r = b.obj.getBounds();
      const pad = b.pad || 4;
      if (p.x >= r.x - pad && p.x <= r.right + pad && p.y >= r.y - pad && p.y <= r.bottom + pad) {
        scene.uiHitAt = scene.time.now;
        b.fn();
        return;
      }
    }
  };
  canvas.addEventListener('pointerdown', onDown);
  scene.events.once('shutdown', () => canvas.removeEventListener('pointerdown', onDown));
  scene.events.once('destroy', () => canvas.removeEventListener('pointerdown', onDown));
}
