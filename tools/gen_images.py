"""ゲーム用の画像をローカルの Animagine XL 4.0 で生成する（開発用。ゲーム実行には不要）。
使い方: E:\\MV_tools\\venv\\Scripts\\python.exe tools\\gen_images.py [名前 ...]
  生成した原画は tools/ai_raw/ に保存される（既にあるものはスキップ）。
  その後 tools/process_images.py で背景を抜いて assets/img/ に WebP で書き出す。
"""
import sys, os, zlib, torch
from pathlib import Path

os.environ.setdefault("HF_HOME", r"E:\MV_tools\hf")
from diffusers import StableDiffusionXLPipeline, EulerAncestralDiscreteScheduler

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tools" / "ai_raw"
RAW.mkdir(parents=True, exist_ok=True)

CHAR = "masterpiece, high score, absurdres, anime coloring, vibrant colors, chibi, full body, simple background, white background, solo, no effects"
ITEM = "masterpiece, high score, absurdres, game icon, item, vibrant colors, no humans, simple background, white background, centered"
BG = "masterpiece, high score, absurdres, anime screencap, scenery, no humans, fantasy, vibrant colors, detailed background"
NEG = ("lowres, bad anatomy, bad hands, text, letters, watermark, signature, username, error, missing fingers, "
       "extra digits, cropped, worst quality, low quality, low score, bad score, blurry, jpeg artifacts, "
       "multiple views, border, frame, splash, motion lines, speed lines, abstract background, gradient background, colorful background, "
       "aura, magic effects, multiple swords, many swords, weapon rack, multiple boys, multiple girls, 2others, duplicate, pattern")

# 名前: (種類, プロンプト, 候補数)
JOBS = {
    # 主人公・人物
    "hero_keito": ("char", "1boy, solo, child, hero, short spiky brown hair, big eyes, confident smile, red cape, blue tunic, silver shoulder armor, holding sword, standing, looking at viewer", 4),
    "hero_yuuri": ("char", "1girl, solo, child, hero, pink hair, ponytail, big eyes, confident smile, red cape, white and blue tunic, silver shoulder armor, holding sword, standing, looking at viewer", 4),
    "king": ("char", "1boy, solo, old man, king, gold crown, long white beard, red royal robe, fur trim, holding scepter, smile, open mouth", 2),
    "villager": ("char", "1girl, solo, villager, brown hair, apron, worried, open mouth, hands up", 1),
    "maou": ("char", "1boy, solo, demon king, large horns, black armor, purple cape, glowing red eyes, evil grin, dark aura, standing, menacing", 3),
    # ボス
    "goblin_king": ("char", "no humans, goblin, green skin, monster, gold crown, fat, holding club, fangs, angry, standing", 2),
    "dark_wolf": ("char", "no humans, solo, wolf, monster, black fur, glowing purple eyes, fangs, fierce, standing", 3),
    "guardian": ("char", "no humans, golem, stone golem, ancient guardian, glowing blue runes, glowing eyes, monster, standing", 2),
    # ザコモンスター
    "m_slime": ("char", "no humans, slime (creature), blue slime, monster, cute, smile, big eyes", 1),
    "m_bat": ("char", "no humans, bat, purple bat monster, cute, fangs, spread wings, flying", 1),
    "m_mushroom": ("char", "no humans, solo, one mushroom monster, big red cap with white spots, angry eyes, tiny legs, cute, standing", 2),
    "m_goblin": ("char", "no humans, solo, goblin, green skin, monster, holding dagger, grin, standing", 2),
    "m_skeleton": ("char", "no humans, solo, skeleton knight, monster, holding sword, holding shield, standing", 2),
    "m_ghost": ("char", "no humans, ghost, cute ghost, purple flame, monster, tongue out", 1),
    "m_dragon": ("char", "no humans, solo, small red dragon, monster, wings, angry, standing", 2),
    "m_treant": ("char", "no humans, tree monster, treant, angry face, branches, dark green leaves", 1),
    "m_imp": ("char", "no humans, solo, one imp, small red devil, monster, holding trident, bat wings, mischievous grin, standing", 2),
    "m_knight": ("char", "no humans, solo, living armor, dark armor knight, monster, empty helmet, glowing eyes, holding lance, standing", 2),
    # 仲間
    "p_dragon": ("char", "no humans, solo, one baby dragon, blue dragon, cute, smile, small wings, sitting", 2),
    "p_phoenix": ("char", "no humans, phoenix, bird, fire, flaming wings, golden, majestic, cute", 1),
    "p_slime": ("char", "no humans, slime (creature), green slime, cute, happy, sparkle", 1),
    "p_wolf": ("char", "no humans, solo, wolf, white wolf pup, cute, blue eyes, happy, sitting", 2),
    "p_fairy": ("char", "1girl, solo, fairy, tiny, butterfly wings, green dress, smile, sparkle, flying", 1),
    "p_cat": ("char", "no humans, cat monster, cute, two tails, purple fur, happy, magical", 1),
    "p_golem": ("char", "no humans, golem, small golem, cute, mossy stone, round, smile", 1),
    "p_spirit": ("char", "no humans, solo, small light spirit, cute round yellow creature, glowing, smile, tiny wings, floating", 2),
    # 武器
    "w_excalibur": ("item", "one sword, only one sword, legendary holy sword, golden crossguard, blue gem, silver blade, glowing, vertical, centered", 3),
    "w_gungnir": ("item", "single spear, gungnir, golden spear, runes, vertical", 2),
    "w_amenomurakumo": ("item", "one sword, only one, ancient japanese straight sword, tsurugi, bronze hilt, magatama, white clouds, vertical, centered", 3),
    "w_durandal": ("item", "single sword, durandal, silver broadsword, red gem, vertical", 2),
    "w_mjolnir": ("item", "single war hammer, silver and gold hammer, runes", 2),
    "w_flame": ("item", "single sword, red blade, flame pattern, fire, vertical", 2),
    "w_ice": ("item", "staff, ice staff, ice crystal, frost, blue glow", 1),
    "w_bow": ("item", "bow (weapon), holy bow, white and gold, glowing arrow, feathers", 1),
    "chest": ("item", "treasure chest, open chest, gold coins, glowing, sparkle", 1),
    # 背景（縦長）
    "bg_plains": ("bg", "grassland, blue sky, clouds, path, castle in distance, hills, sunny, bright", 1),
    "bg_village": ("bg", "village, medieval houses, farm, windmill, sunset, warm light", 1),
    "bg_cave": ("bg", "cave, dark cave interior, torches, rocks, glowing crystals, goblin camp", 1),
    "bg_forest": ("bg", "dark forest, cursed forest, purple fog, twisted trees, glowing mushrooms, night", 1),
    "bg_ruins": ("bg", "ancient ruins, stone pillars, overgrown, desert, mysterious glowing runes, sunset", 1),
    "bg_castle": ("bg", "demon castle, dark castle interior, throne room, red carpet, purple flames, lightning, ominous", 1),
    "bg_throne": ("bg", "royal throne room, bright, gold, red carpet, stained glass, castle interior", 1),
}

SIZE = {"char": (1024, 1024), "item": (1024, 1024), "bg": (768, 1344)}
STYLE = {"char": CHAR, "item": ITEM, "bg": BG}

only = set(sys.argv[1:])
todo = [(k, v) for k, v in JOBS.items() if (not only or k in only)]

pipe = StableDiffusionXLPipeline.from_pretrained(
    "cagliostrolab/animagine-xl-4.0", dtype=torch.float16, use_safetensors=True)
pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
pipe.enable_model_cpu_offload()
pipe.vae.enable_tiling()

for i, (name, (kind, prompt, n)) in enumerate(todo):
    w, h = SIZE[kind]
    full = f"{STYLE[kind]}, {prompt}"
    for k in range(n):
        p = RAW / f"{name}_{'abcd'[k]}.png"
        if p.exists():
            continue
        g = torch.Generator("cpu").manual_seed(zlib.crc32(name.encode()) % 100000 + k * 1000)
        pipe(prompt=full, negative_prompt=NEG, width=w, height=h, num_inference_steps=26,
             guidance_scale=5.5, generator=g).images[0].save(p)
        print("saved", p.name, flush=True)
print("done", flush=True)
