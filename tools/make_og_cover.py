# -*- coding: utf-8 -*-
"""공유 썸네일(assets/img/og-cover.jpg) 생성.

표지(첫 화면)의 첫 번째 사진(uploads/main/main_1.*) 위에 비전 문구와
그룹명을 합성해 만듭니다. 카카오톡·페이스북 같은 공유 미리보기 크롤러는
JS를 실행하지 않아 실제 표지 화면(사진 크로스페이드 + 텍스트)을 그대로
가져갈 수 없어서, 정적 이미지로 미리 구워 둡니다.

uploads/main/ 에 새 표지 사진이 커밋될 때마다 GitHub Actions
(.github/workflows/og-cover.yml)가 이 스크립트를 실행해 다시 만듭니다.
로컬에서 확인하고 싶을 때도 그냥 실행하면 됩니다: python tools/make_og_cover.py

카카오톡·페이스북은 og:image로 가져간 이미지 자체를 그 URL 기준으로 한동안
캐시합니다. 파일 내용만 바뀌고 주소가 그대로면 계속 옛날 이미지를 보여주므로,
이 스크립트가 매번 index.html의 og:image/twitter:image 주소 끝에
이미지 내용 해시(?v=xxxxxxxx)를 새로 붙여 둡니다 — 내용이 바뀔 때마다
주소 자체가 달라지니 캐시를 무조건 건너뛰게 됩니다.
"""
import hashlib
import io
import json
import os
import re
import textwrap

from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

MAIN_DIR = os.path.join(ROOT, 'uploads', 'main')
EXTS = ('.png', '.jpg', '.jpeg', '.webp', '.gif')   # compile_cover_photos.py 와 같은 확장자 목록
OUT = os.path.join(ROOT, 'assets', 'img', 'og-cover.jpg')
INDEX_HTML = os.path.join(ROOT, 'index.html')

LEADING_NUM = re.compile(r'^\s*(\d+)')

ANTON = os.path.join(ROOT, 'assets', 'fonts', 'Anton-Regular.ttf')
NEWSREADER = os.path.join(ROOT, 'assets', 'fonts', 'Newsreader-Light.ttf')

BRAND = 'SEN ENGINEERING'   # index.html 의 .cover__brand 기본 표기와 동일
W, H = 1200, 630
BRAND_PAD = 46   # 실제 표지의 좌우 여백(clamp(20px,3.4vw,46px))과 같은 값


def find_cover_photo():
    """실제 표지 화면(cover.js)이 맨 처음 보여주는 사진과 똑같은 걸 고릅니다.
    예전엔 "uploads/main/main_1.<확장자>"라는 정해진 파일명 하나만 찾았는데,
    표지 사진 관리 방식이 "아무 이름이나 올리고 파일명 앞 번호로 순서만
    정하기"(compile_cover_photos.py, assets/js/cover.js 참고)로 바뀐 뒤로는
    그 이름의 파일이 더 이상 존재하지 않아 이 스크립트가 조용히 실패하고
    있었습니다(og-cover.jpg가 예전 사진에 멈춰 있던 원인) — 같은 자연 정렬
    규칙으로 폴더를 직접 훑어 첫 번째 사진을 고릅니다."""
    if not os.path.isdir(MAIN_DIR):
        raise SystemExit('uploads/main 폴더를 찾을 수 없습니다.')
    names = [n for n in os.listdir(MAIN_DIR) if n.lower().endswith(EXTS)]
    if not names:
        raise SystemExit('uploads/main 안에 표지 사진이 없습니다.')

    def sort_key(name):
        m = LEADING_NUM.match(name)
        num = int(m.group(1)) if m else float('inf')
        return (num, name.lower())

    names.sort(key=sort_key)
    return os.path.join(MAIN_DIR, names[0])


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


def fit_font_size(text, font_path, target_width, start_size=100):
    """cover.js 의 fitBrand() 와 같은 방식 — 기준 크기에서 잰 폭에 비례해
    맞춘 뒤, 반올림 오차를 몇 번 더 조입니다. 그룹명이 항상 가로 폭을
    꽉 채우도록(실제 표지와 동일하게) 글자 크기를 정합니다."""
    probe = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    font = ImageFont.truetype(font_path, start_size)
    bbox = probe.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    size = start_size * target_width / w

    for _ in range(4):
        font = ImageFont.truetype(font_path, round(size))
        bbox = probe.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        if w <= target_width:
            break
        size *= target_width / w
    return round(size)


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

    brand_size = fit_font_size(BRAND, ANTON, W - BRAND_PAD * 2)
    brand_font = ImageFont.truetype(ANTON, brand_size)
    brand_bbox = ImageDraw.Draw(Image.new('RGB', (1, 1))).textbbox((0, 0), BRAND, font=brand_font)
    # textbbox 의 y1은 글자가 실제로 그려지는 가장 아래 지점까지의 거리이므로,
    # 이 값을 그대로 빼야 여백이 실제 픽셀 기준으로 맞습니다.
    brand_y = H - 56 - brand_bbox[3]
    draw_centered_text(canvas, [BRAND], brand_font, y=brand_y,
                        fill=(255, 255, 255, 255), shadow_alpha=190, line_gap=1.0)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    canvas.convert('RGB').save(OUT, 'JPEG', quality=90)
    print('saved', OUT)

    bump_cache_buster()


def bump_cache_buster():
    """카카오톡·페이스북은 og:image 로 가져간 이미지 자체를 그 URL 기준으로
    한동안 캐시합니다. 파일 내용이 바뀌어도 URL이 그대로면 계속 옛날
    이미지를 보여주므로, 이미지 내용의 해시를 ?v= 쿼리로 붙여 매번 새
    URL이 되도록 합니다."""
    with io.open(OUT, 'rb') as f:
        digest = hashlib.sha1(f.read()).hexdigest()[:8]

    with io.open(INDEX_HTML, encoding='utf-8') as f:
        html = f.read()

    new_html = re.sub(
        r'(assets/img/og-cover\.jpg)(\?v=[0-9a-f]+)?',
        r'\g<1>?v=' + digest,
        html,
    )

    if new_html != html:
        with io.open(INDEX_HTML, 'w', encoding='utf-8') as f:
            f.write(new_html)
        print('index.html og-cover 캐시 버전을', digest, '로 갱신')
    else:
        print('index.html og-cover 캐시 버전 변동 없음 (', digest, ')')


if __name__ == '__main__':
    main()
