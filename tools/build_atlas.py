#!/usr/bin/env python3
"""Turn raw agy (Gemini image-generator) sheets on flat magenta into one game atlas.

Raw inputs live outside the repo (default /workspace/lane-rush-art-raw):
  blue.png red.png (4 frames), mid.png boss.png (3 frames), fx.png (5 frames),
  props.png (3x2 grid), sand.png (tile).
Outputs: assets/lr-atlas.png + assets/lr-atlas.json (Phaser JSON hash), assets/lr-sand.jpg
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

RAW = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/lane-rush-art-raw')
OUT = Path(__file__).resolve().parent.parent / 'assets'


def key(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g  # magenta-ness
    alpha = np.clip((215 - m) / 75, 0, 1)
    edge = (alpha < 1) | (m > 40)
    cap = g + 40
    a[..., 0] = np.where(edge, np.minimum(r, cap), r)
    a[..., 2] = np.where(edge, np.minimum(b, cap), b)
    alpha[alpha < 0.08] = 0
    rgba = np.dstack([a, alpha * 255]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')


def spans(profile, min_len, gap=3):
    on = profile > 0
    out, start, last = [], None, None
    for i, v in enumerate(on):
        if v:
            if start is None:
                start = i
            last = i
        elif start is not None and i - last > gap:
            if last - start >= min_len:
                out.append((start, last + 1))
            start = None
    if start is not None and last - start >= min_len:
        out.append((start, last + 1))
    return out


def crop_alpha(im):
    bb = im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
    return im.crop(bb) if bb else im


def components(mask):
    """4-connected labels on a small boolean grid (pure python BFS)."""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    n = 0
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not lab[y, x]:
                n += 1
                stack = [(y, x)]
                lab[y, x] = n
                while stack:
                    cy, cx = stack.pop()
                    for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n
                            stack.append((ny, nx))
    return lab, n


def split_blobs(im, n):
    """Split touching-column frames by connected parts; small bits join the nearest frame."""
    s = 4
    al = np.asarray(im.getchannel('A')) > 20
    small = al[: al.shape[0] // s * s, : al.shape[1] // s * s]
    small = small.reshape(small.shape[0] // s, s, small.shape[1] // s, s).any(axis=(1, 3))
    lab, k = components(small)
    sizes = [(lab == i).sum() for i in range(1, k + 1)]
    order = sorted(range(k), key=lambda i: -sizes[i])
    big = sorted(order[:n], key=lambda i: np.nonzero(lab == i + 1)[1].mean())
    cx = [np.nonzero(lab == i + 1)[1].mean() for i in big]
    owner = np.zeros_like(lab)
    for i in range(k):
        xs = np.nonzero(lab == i + 1)[1].mean()
        j = int(np.argmin([abs(xs - c) for c in cx]))
        owner[lab == i + 1] = j + 1
    full = np.kron(owner, np.ones((s, s), np.int32))
    full = np.pad(full, ((0, al.shape[0] - full.shape[0]), (0, al.shape[1] - full.shape[1])))
    out = []
    arr = np.asarray(im)
    for j in range(n):
        a = arr.copy()
        a[..., 3] = np.where(full == j + 1, a[..., 3], 0)
        out.append(crop_alpha(Image.fromarray(a, 'RGBA')))
    return out


def split_row(im, n):
    al = np.asarray(im.getchannel('A')) > 20
    cols = spans(al.sum(0), 20, gap=4)
    if len(cols) < n:
        return split_blobs(im, n)
    # merge smallest gaps until we have n parts
    while len(cols) > n:
        gaps = [cols[i + 1][0] - cols[i][1] for i in range(len(cols) - 1)]
        i = int(np.argmin(gaps))
        cols[i:i + 2] = [(cols[i][0], cols[i + 1][1])]
    assert len(cols) == n, (len(cols), n)
    return [crop_alpha(im.crop((x0, 0, x1, im.height))) for x0, x1 in cols]


def split_grid(im, rows, cols):
    al = np.asarray(im.getchannel('A')) > 20
    rs = spans(al.sum(1), 20, gap=6)
    assert len(rs) == rows, rs
    out = []
    for y0, y1 in rs:
        out += split_row(im.crop((0, y0, im.width, y1)), cols)
    return out


def cells(frames, height, max_w=None):
    """Scale a group to a shared cell; frames sit bottom-centered."""
    h = max(f.height for f in frames)
    w = max(f.width for f in frames)
    k = height / h
    if max_w and w * k > max_w:
        k = max_w / w
    cw, ch = int(round(w * k)) + 4, int(round(h * k)) + 4
    out = []
    for f in frames:
        s = f.resize((max(1, round(f.width * k)), max(1, round(f.height * k))), Image.LANCZOS)
        c = Image.new('RGBA', (cw, ch))
        c.paste(s, ((cw - s.width) // 2, ch - 2 - s.height))
        out.append(c)
    return out


def single(f, height):
    k = height / f.height
    return f.resize((max(1, round(f.width * k)), height), Image.LANCZOS)


def main():
    sheets = {}
    blue = split_row(key(Image.open(RAW / 'blue.png')), 4)
    red = split_row(key(Image.open(RAW / 'red.png')), 4)
    mid = split_row(key(Image.open(RAW / 'mid.png')), 3)
    boss = split_row(key(Image.open(RAW / 'boss.png')), 3)
    fx = split_row(key(Image.open(RAW / 'fx.png')), 5)
    props = split_grid(key(Image.open(RAW / 'props.png')), 2, 3)
    for i, f in enumerate(cells(blue, 84)):
        sheets['blue_%d' % i] = f
    for i, f in enumerate(cells(red, 84)):
        sheets['red_%d' % i] = f
    for i, f in enumerate(cells(mid, 220)):
        sheets['mid_%d' % i] = f
    for i, f in enumerate(cells(boss, 260)):
        sheets['boss_%d' % i] = f
    for i, f in enumerate(cells(fx, 128, 128)):
        sheets['boom_%d' % i] = f
    names = ['cannon', 'jet', 'crate', 'orb', 'shell', 'rock']
    sizes = [150, 110, 96, 48, 56, 56]
    for n, f, s in zip(names, props, sizes):
        sheets[n] = single(f, s)

    # shelf pack, tallest first
    items = sorted(sheets.items(), key=lambda kv: -kv[1].height)
    W, pad = 1024, 2
    x = y = shelf = 0
    pos = {}
    for name, im in items:
        if x + im.width + pad > W:
            x, y, shelf = 0, y + shelf + pad, 0
        pos[name] = (x, y)
        x += im.width + pad
        shelf = max(shelf, im.height)
    H = y + shelf
    H = (H + 3) // 4 * 4
    atlas = Image.new('RGBA', (W, H))
    frames = {}
    for name, im in items:
        px, py = pos[name]
        atlas.paste(im, (px, py))
        frames[name] = {
            'frame': {'x': px, 'y': py, 'w': im.width, 'h': im.height},
            'rotated': False, 'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': im.width, 'h': im.height},
            'sourceSize': {'w': im.width, 'h': im.height},
        }
    OUT.mkdir(exist_ok=True)
    atlas.save(OUT / 'lr-atlas.png', optimize=True)
    meta = {'image': 'lr-atlas.png', 'format': 'RGBA8888', 'size': {'w': W, 'h': H}, 'scale': '1',
            'app': 'tools/build_atlas.py (art generated with Gemini via agy)'}
    (OUT / 'lr-atlas.json').write_text(json.dumps({'frames': frames, 'meta': meta}, indent=1))

    sand = Image.open(RAW / 'sand.png').convert('RGB').resize((512, 512), Image.LANCZOS)
    sand.save(OUT / 'lr-sand.jpg', quality=82, optimize=True)
    for n, im in sorted(sheets.items()):
        print(n, im.size)
    print('atlas', W, H)


main()
