"""Android uygulama ikonlarını ve açılış görselini üretir.

Capacitor'ın koyduğu yer tutucuların üzerine yazar. Uyarlanabilir (adaptive)
ikonlarda zeminin kırpılacağını varsayarak karakteri güvenli alanda tutar:
108dp'lik tuvalin ortadaki 72dp'si her cihazda görünür.
"""
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

PAPER = (250, 247, 242, 255)
SEAL = (192, 57, 43, 255)

FONTS = [
    r"C:\Windows\Fonts\simsun.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
]

# mipmap yoğunlukları: klasör -> ic_launcher kenarı
DENSITIES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

# açılış görseli: klasör -> (genişlik, yükseklik)
SPLASH_PORT = {"mdpi": (320, 480), "hdpi": (480, 800), "xhdpi": (720, 1280),
               "xxhdpi": (960, 1600), "xxxhdpi": (1280, 1920)}
SPLASH_LAND = {k: (v[1], v[0]) for k, v in SPLASH_PORT.items()}


def font_at(size):
    for path in FONTS:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    raise SystemExit("Çince font bulunamadı")


def draw_glyph(img, box_size, color, center=None):
    d = ImageDraw.Draw(img)
    f = font_at(box_size)
    l, t, r, b = d.textbbox((0, 0), "墨", font=f)
    cx, cy = center or (img.width / 2, img.height / 2)
    d.text((cx - (r - l) / 2 - l, cy - (b - t) / 2 - t), "墨", font=f, fill=color)


def rounded(size, radius, fill):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle([0, 0, size - 1, size - 1], radius, fill=fill)
    return img


def legacy_icon(size, circular=False):
    """Eski (uyarlanabilir olmayan) başlatıcı ikonu."""
    if circular:
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(img).ellipse([0, 0, size - 1, size - 1], fill=SEAL)
    else:
        img = rounded(size, int(size * 0.20), SEAL)
    draw_glyph(img, int(size * 0.52), PAPER)
    return img


def adaptive_foreground(size):
    """Zemin ayrı katmanda; burada yalnız karakter, güvenli alanda."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # 108dp tuvalde güvenli alan 72dp -> karakteri bunun içine sığdır
    draw_glyph(img, int(size * 0.42), PAPER)
    return img


def splash(w, h):
    img = Image.new("RGBA", (w, h), PAPER)
    plate = int(min(w, h) * 0.22)
    tile = rounded(plate, int(plate * 0.22), SEAL)
    draw_glyph(tile, int(plate * 0.52), PAPER)
    img.paste(tile, ((w - plate) // 2, (h - plate) // 2), tile)
    return img


written = 0
for name, px in DENSITIES.items():
    folder = os.path.join(RES, f"mipmap-{name}")
    os.makedirs(folder, exist_ok=True)
    legacy_icon(px).save(os.path.join(folder, "ic_launcher.png"))
    legacy_icon(px, circular=True).save(os.path.join(folder, "ic_launcher_round.png"))
    # uyarlanabilir katman 108/48 oranında daha büyük
    adaptive_foreground(round(px * 108 / 48)).save(
        os.path.join(folder, "ic_launcher_foreground.png")
    )
    written += 3

for name, (w, h) in SPLASH_PORT.items():
    folder = os.path.join(RES, f"drawable-port-{name}")
    if os.path.isdir(folder):
        splash(w, h).save(os.path.join(folder, "splash.png"))
        written += 1

for name, (w, h) in SPLASH_LAND.items():
    folder = os.path.join(RES, f"drawable-land-{name}")
    if os.path.isdir(folder):
        splash(w, h).save(os.path.join(folder, "splash.png"))
        written += 1

splash(720, 1280).save(os.path.join(RES, "drawable", "splash.png"))
written += 1

# uyarlanabilir ikonun zemini
with open(os.path.join(RES, "values", "ic_launcher_background.xml"), "w", encoding="utf-8") as f:
    f.write(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        '    <color name="ic_launcher_background">#C0392B</color>\n'
        "</resources>\n"
    )

print(f"{written} görsel yazıldı")
