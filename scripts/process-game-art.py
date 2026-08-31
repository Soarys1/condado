#!/usr/bin/env python3
"""Chroma-key magenta JPEG sprites and export transparent PNGs for Condado."""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path("/workspace/artifacts/imagine_images")
OUT = Path("/workspace/public/game")
OUT.mkdir(parents=True, exist_ok=True)

SPRITES = {
    "castle": "57fa245a-2e07-498c-85fa-4452424f7a23.jpg",
    "watchtower": "77e3c9cc-5fc5-4aa0-baf8-b3483c276392.jpg",
    "catapult": "6e62f2d7-53bc-413a-a904-35fc7533a089.jpg",
    "mine": "10164b35-20d0-4a7d-b518-eb143763667d.jpg",
    "farm": "194f4306-8e76-4989-8579-8c11ada18110.jpg",
    "barracks": "2ebc91b1-5a1d-4cf9-b213-293ae72ef5f6.jpg",
    "camp": "69050aef-1368-4434-802c-1736594092b0.jpg",
    "wall": "03eb39fe-6689-44db-8f3f-0ab46a6364d1.jpg",
    "infantry": "24339a98-ca8c-483b-98bc-b31e044a946a.jpg",
    "archer": "d583d5bf-2b6a-4107-8854-f65fe7f06355.jpg",
    "cavalry": "1afaf7c3-d1ab-4231-a6ee-808578357ef5.jpg",
    "general": "a1d9daf0-957a-4eb8-a93b-cbeefa16e9c4.jpg",
    "generaless": "1cfef791-f7ff-414b-9cfc-e4b2e4ae412b.jpg",
    "arrow": "40f12cd2-0c15-4339-834b-609c1ccfc5d7.jpg",
    "boulder": "7614e6a6-c5f7-41cd-a9e0-25bdbd5e7d8f.jpg",
    "impact": "cef87f85-d708-4647-8cd3-c78bcdf498b6.jpg",
}

TILES = {
    "grass": "ff684612-7414-41c1-96f2-75210941fa20.jpg",
    "dirt": "3cf91325-b98e-430a-bdba-334e135d82bc.jpg",
}


def magentish(r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
    dist = np.sqrt(
        (r.astype(np.float32) - 255) ** 2
        + (g.astype(np.float32) - 0) ** 2
        + (b.astype(np.float32) - 255) ** 2
    )
    return ((r > 145) & (b > 145) & (g < 165) & ((r - g) > 22) & ((b - g) > 22)) | (dist < 118)


def flood_key(arr: np.ndarray) -> np.ndarray:
    h, w = arr.shape[:2]
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    seed = magentish(r, g, b)
    visited = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if seed[y, x]:
                q.append((x, y))
                visited[y, x] = True
    for y in range(h):
        for x in (0, w - 1):
            if seed[y, x] and not visited[y, x]:
                q.append((x, y))
                visited[y, x] = True
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= w or ny >= h or visited[ny, nx]:
                continue
            if seed[ny, nx]:
                visited[ny, nx] = True
                q.append((nx, ny))
    out = arr.copy()
    alpha = out[:, :, 3].astype(np.float32)
    alpha[visited] = 0
    # soft fringe
    dist = np.sqrt(
        (r.astype(np.float32) - 255) ** 2
        + (g.astype(np.float32) - 0) ** 2
        + (b.astype(np.float32) - 255) ** 2
    )
    fringe = (~visited) & (dist < 160)
    t = np.clip((dist - 100) / 55.0, 0, 1)
    alpha[fringe] *= t[fringe]
    out[:, :, 3] = alpha.astype(np.uint8)
    # despill remaining magenta tint
    keep = out[:, :, 3] > 0
    rr = out[:, :, 0].astype(np.float32)
    gg = out[:, :, 1].astype(np.float32)
    bb = out[:, :, 2].astype(np.float32)
    spill = keep & (rr > 80) & (bb > 80) & (gg + 18 < np.minimum(rr, bb))
    avg = (rr + bb) * 0.5
    gg = np.where(spill, np.minimum(255, gg * 0.35 + avg * 0.65), gg)
    rr = np.where(spill, rr * 0.82 + gg * 0.18, rr)
    bb = np.where(spill, bb * 0.82 + gg * 0.18, bb)
    out[:, :, 0] = np.clip(rr, 0, 255).astype(np.uint8)
    out[:, :, 1] = np.clip(gg, 0, 255).astype(np.uint8)
    out[:, :, 2] = np.clip(bb, 0, 255).astype(np.uint8)
    return out


def crop_alpha(arr: np.ndarray, pad_ratio: float = 0.04) -> np.ndarray:
    a = arr[:, :, 3]
    ys, xs = np.where(a > 12)
    if len(xs) == 0:
        return arr
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    h, w = arr.shape[:2]
    pad = int(max(w, h) * pad_ratio)
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(w, x1 + pad)
    y1 = min(h, y1 + pad)
    return arr[y0:y1, x0:x1]


def resize_max(im: Image.Image, max_side: int) -> Image.Image:
    w, h = im.size
    scale = max_side / max(w, h)
    if scale >= 1:
        return im
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    return im.resize((nw, nh), Image.Resampling.LANCZOS)


def make_seamless(im: Image.Image, overlap: int = 72) -> Image.Image:
    arr = np.array(im.convert("RGB")).astype(np.float32)
    h, w = arr.shape[:2]
    overlap = min(overlap, w // 4, h // 4)
    for i in range(overlap):
        a = i / overlap
        arr[:, i] = arr[:, i] * a + arr[:, w - overlap + i] * (1 - a)
        arr[:, w - overlap + i] = arr[:, i]
    for i in range(overlap):
        a = i / overlap
        arr[i] = arr[i] * a + arr[h - overlap + i] * (1 - a)
        arr[h - overlap + i] = arr[i]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def main() -> None:
    for name, fname in SPRITES.items():
        path = SRC / fname
        im = Image.open(path).convert("RGBA")
        arr = flood_key(np.array(im))
        arr = crop_alpha(arr, 0.025 if name in {"arrow", "boulder", "wall"} else 0.04)
        out = Image.fromarray(arr)
        max_side = 220 if name in {"arrow", "boulder"} else 420 if name == "castle" else 360
        out = resize_max(out, max_side)
        dest = OUT / f"{name}.png"
        out.save(dest, "PNG", optimize=True)
        print(f"wrote {dest} {out.size}")

    grass = Image.open(SRC / TILES["grass"]).convert("RGB")
    dirt = Image.open(SRC / TILES["dirt"]).convert("RGB")

    for name, im in (("grass", grass), ("dirt", dirt)):
        im = make_seamless(im.resize((256, 256), Image.Resampling.LANCZOS), 56)
        dest = OUT / f"{name}.jpg"
        im.save(dest, "JPEG", quality=86, optimize=True)
        print(f"wrote {dest}")
        qc = Image.new("RGB", (512, 512))
        qc.paste(im, (0, 0))
        qc.paste(im, (256, 0))
        qc.paste(im, (0, 256))
        qc.paste(im, (256, 256))
        qc.save(OUT / f"{name}-2x2.jpg", "JPEG", quality=80)

    splash = Image.open(SRC / "4e677348-bb05-44f2-bb0e-7c6a6a202043.jpg").convert("RGB")
    splash = splash.resize((1600, 900), Image.Resampling.LANCZOS)
    splash.save(OUT / "splash.jpg", "JPEG", quality=86, optimize=True)
    print("wrote splash")


if __name__ == "__main__":
    main()
