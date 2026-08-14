# -*- coding: utf-8 -*-
"""공유 썸네일(assets/img/og-cover.jpg) 생성.

표지(첫 화면)의 첫 번째 사진(uploads/main/main_1.*) 위에 비전 문구와
그룹명을 합성해 만듭니다. 카카오톡·페이스북 같은 공유 미리보기 크롤러는
JS를 실행하지 않아 실제 표지 화면(사진 크로스페이드 + 텍스트)을 그대로
가져갈 수 없어서, 정적 이미지로 미리 구워 둡니다.

uploads/main/ 에 새 표지 사진이 커밋될 때마다 GitHub Actions
(.github/workflows/og-cover.yml)가 이 스크립트를 실행해 다시 만듭니다.
로컬에서 확인하고 싶을 때도 그냥 실행하면 됩니다: python tools/make_og_cover.py
"""
import io
import json
import os
import textwrap

from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

MAIN_DIR = os.path.join(ROOT, 'uploads', 'main')
EXTS = ['png', 'jpg', 'jpeg', 'webp']   # cover.js 와 같은 순서로 찾습니다
OUT = os.path.join(ROOT, 'assets', 'img', 'og-cover.jpg')

ANTON = os.path.join(ROOT, 'assets', 'fonts', 'Anton-Regular.ttf')
NEWSREADER = os.path.join(ROOT, 'assets', 'fonts', 'Newsreader-Light.ttf')

BRAND = 'SEN ENGINEERING'   # index.html 의 .cover__brand 기본 표기와 동일
W, H = 1200, 630


def find_cover_photo():
    for ext in EXTS:
        path = os.path.join(MAIN_DIR, 'main_1.' + ext)
        if os.path.isfile(path):
            return path
    raise SystemExit('uploads/main/main_1.<png|jpg|jpeg|webp> 를 찾을 수 없습니다.')


def load_vision_text():
    site = json.load(io.open(os.path.join(ROOT, 'content', 'site.json'), encoding='utf-8'))
    vision = ((site.get('hero') or {}).get('coverVision') or '').strip()
    if not vision:
        raise SystemExit('content/site.json 의 hero.coverVision 이 비어 있습니다.')
    return vision


def cover_crop(img, w, h):
    """CSS object-fit:cover 와 같은 방식으로 중앙을 기준 삼아 채우고 자릅니다."""
    sw, sh = img.size
    scale = max(w / sw, h / sh)
    nw, nh = round(sw * scale), round(sh * scale)
    img = img.resize((nw, nh), Image.LANCZOS)
    left = (nw - w) // 2
    top = (nh - h) // 2
    return img.crop((left, top, left + w, top + h))


def build_veil(w, h):
    """.cover__veil 의 수직 그라디언트(위·아래 어둡고 중간이 옅음)를 흉내 냅니다."""
    stops = [
        (0.00, (6, 10, 18, int(255 * 0.72))),
        (0.30, (6, 10, 18, int(255 * 0.28))),
        (0.62, (6, 10, 18, int(255 * 0.42))),
        (1.00, (6, 10, 18, int(255 * 0.86))),
    ]
    veil = Image.new('RGBA', (1, h), (0, 0, 0, 0))
    for y in range(h):
        p = y / (h - 1)
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if p0 <= p <= p1:
                t = 0 if p1 == p0 else (p - p0) / (p1 - p0)
                px = tuple(round(c0[k] + (c1[k] - c0[k]) * t) for k in range(4))
                veil.putpixel((0, y), px)
                break
    return veil.resize((w, h))


def build_radial(w, h):
    """.cover__veil 의 radial-gradient(가장자리를 살짝 더 어둡게)를 흉내 냅니다."""
    radial = Image.new('L', (w, h), 0)
    rd = ImageDraw.Draw(radial)
    cx, cy = w * 0.5, h * 0.4
    maxr = (w ** 2 + h ** 2) ** 0.5 * 0.62
    steps = 40
    for i in range(steps, 0, -1):
        frac = i / steps
        alpha = int(120 * max(0, frac - 0.4) / 0.6) if frac > 0.4 else 0
        r = maxr * frac
        rd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=alpha)
    out = Image.new('RGBA', (w, h), (6, 10, 18, 0))
    out.putalpha(radial)
    return out


def draw_centered_text(canvas, lines, font, y, fill, shadow_alpha, line_gap=1.4):
    w, h = canvas.size
    probe = ImageDraw.Draw(canvas)

    shadow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    yy = y
    for line in lines:
        bbox = probe.textbbox((0, 0), line, font=font)
        lw, lh = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x = (w - lw) / 2 - bbox[0]
        sd.text((x, yy + 3), line, font=font, fill=(0, 0, 0, shadow_alpha))
        yy += lh * line_gap
    shadow = shadow.filter(ImageFilter.GaussianBlur(4))
    canvas.alpha_composite(shadow)

    yy = y
    for line in lines:
        bbox = probe.textbbox((0, 0), line, font=font)
        lw, lh = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x = (w - lw) / 2 - bbox[0]
        probe.text((x, yy), line, font=font, fill=fill)
        yy += lh * line_gap


def main():
    photo_path = find_cover_photo()
    vision = load_vision_text()

    bg = Image.open(photo_path).convert('RGB')
    canvas = cover_crop(bg, W, H).convert('RGBA')
    canvas = Image.alpha_composite(canvas, build_veil(W, H))
    canvas = Image.alpha_composite(canvas, build_radial(W, H))

    vision_font = ImageFont.truetype(NEWSREADER, 25)
    wrapped = textwrap.wrap(vision, width=48)
    draw_centered_text(canvas, wrapped, vision_font, y=118,
                        fill=(255, 255, 255, 245), shadow_alpha=160, line_gap=1.55)

    brand_font = ImageFont.truetype(ANTON, 92)
    draw_centered_text(canvas, [BRAND], brand_font, y=478,
                        fill=(255, 255, 255, 255), shadow_alpha=190, line_gap=1.0)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    canvas.convert('RGB').save(OUT, 'JPEG', quality=90)
    print('saved', OUT)


if __name__ == '__main__':
    main()
