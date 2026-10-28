"""tools/ai_raw/ の原画から、ゲームで使う WebP を assets/img/ に書き出す（開発用）。
キャラ・アイテムは背景（まわりの白っぽい部分）を透明にし、余白を切って最大 512px にする。
使い方: E:\\MV_tools\\venv\\Scripts\\python.exe tools\\process_images.py
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "ai_raw"
OUT = ROOT / "assets" / "img"
OUT.mkdir(parents=True, exist_ok=True)

# どの候補を使うか（ファイル名の末尾 a/b/c/d。"@ファイル名" なら別の原画を使う）
PICK = {
    "hero_keito": "b", "hero_yuuri": "b", "king": "a", "villager": "a", "maou": "b",
    "goblin_king": "a", "dark_wolf": "b", "guardian": "a",
    "m_slime": "a", "m_bat": "a", "m_mushroom": "b", "m_goblin": "a", "m_skeleton": "a", "m_ghost": "a",
    "m_dragon": "b", "m_treant": "a", "m_imp": "a", "m_knight": "a",
    "p_dragon": "b", "p_phoenix": "a", "p_slime": "a", "p_wolf": "b", "p_fairy": "a", "p_cat": "a", "p_golem": "a", "p_spirit": "a",
    "w_excalibur": ("b", (0.405, 0.0, 0.615, 1.0)), "w_gungnir": "a", "w_amenomurakumo": ("@w_excalibur_c", (0.614, 0.06, 0.735, 0.885)), "w_durandal": "a", "w_mjolnir": "a",
    "w_flame": "b", "w_ice": "a", "w_bow": "a", "chest": "a",
    "p_leviathan": "a", "r_crystal_dragon": "a", "r_gold_goblin": "a", "r_metal_slime": "a",
}
BGS = ["bg_plains", "bg_village", "bg_cave", "bg_forest", "bg_ruins", "bg_castle", "bg_throne"]


def cutout(im: Image.Image, tol=34) -> Image.Image:
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    h, w, _ = a.shape
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bgc = np.median(border, axis=0)
    dist = np.abs(a - bgc).max(axis=2)
    near = dist < tol
    lab, _ = ndimage.label(near)
    edge_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge_labels))
    # 背景の色に近い ふちは少し透かして、白いフチを目立たなくする
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    al = Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.9))
    rgba = im.convert("RGBA")
    rgba.putalpha(al)
    box = al.point(lambda v: 255 if v > 20 else 0).getbbox()
    if box:
        pad = 6
        box = (max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad))
        rgba = rgba.crop(box)
    rgba.thumbnail((512, 512), Image.LANCZOS)
    return rgba


for name, k in PICK.items():
    crop = None
    if isinstance(k, tuple):  # 1枚に何本も描かれた武器は、1本だけ切り出す
        k, crop = k
    src = RAW / (f"{k[1:]}.png" if k.startswith("@") else f"{name}_{k}.png")  # @ は別の原画から切り出す
    if not src.exists():
        print("なし:", src.name)
        continue
    im = Image.open(src)
    if crop:
        W, H = im.size
        im = im.crop((int(crop[0] * W), int(crop[1] * H), int(crop[2] * W), int(crop[3] * H)))
    out = cutout(im)
    out.save(OUT / f"{name}.webp", "WEBP", quality=84, method=6)
    print("ok", name, out.size)

for name in BGS:
    src = RAW / f"{name}_a.png"
    im = Image.open(src).convert("RGB")
    im = im.resize((720, 1260), Image.LANCZOS)
    im.save(OUT / f"{name}.webp", "WEBP", quality=72, method=6)
    print("ok", name)

# アイコン（ホーム画面用）
hero = Image.open(OUT / "hero_keito.webp").convert("RGBA")
icon = Image.new("RGBA", (192, 192), (36, 18, 79, 255))
h2 = hero.copy()
h2.thumbnail((180, 180), Image.LANCZOS)
icon.alpha_composite(h2, ((192 - h2.width) // 2, 192 - h2.height))
icon.save(OUT / "icon.png")
print("ok icon")
