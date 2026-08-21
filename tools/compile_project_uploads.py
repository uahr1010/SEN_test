# -*- coding: utf-8 -*-
"""content/project-uploads/domestic/*.json, content/project-uploads/overseas/*.json
(Pages CMS [① 프로젝트 데이터]가 폴더 업로드로 관리하는 실적 추가분)을
기존 실적(assets/data/project_points_base.json, overseas_projects_base.json —
이 스크립트가 절대 건드리지 않는 고정 원본)에 이어 붙여, 실제 화면이
읽는 assets/data/project_points.json / overseas_projects.json 을 다시
만듭니다.

compile_cover_photos.py/compile_glossary.py 와 같은 이유(GitHub Pages는
폴더 안 파일 목록을 브라우저가 알아낼 방법이 없음)로, 두 업로드 폴더가
바뀔 때마다(.github/workflows/compile-project-data.yml) 이 스크립트가
전체를 미리 다시 합쳐 둡니다 — 파일을 새로 올리거나 지우면 그 파일
안의 내용만 결과에서 나타나거나 사라지고, base 파일의 기존 실적은
항상 그대로 남습니다.

파일 이름이 "_"로 시작하면(예시 파일) 건너뜁니다. 그 안의 항목이
필수 칸을 못 채웠거나 타입이 안 맞으면 그 항목 하나만 건너뛰고
경고를 남깁니다 — 파일 하나의 실수 때문에 다른 정상 항목들까지
안 올라가는 일이 없게 합니다.

국내 항목에 codes(행정구역 코드) 칸이 없는 이유: 이 코드는 정확한
지도 좌표에는 안 쓰이고(좌표는 lat/lng을 그대로 씀) 개략 위치(시/군/구)
항목을 뭉쳐 원으로 표시할 때만 쓰이는데, 관리자가 위·경도까지 직접
입력하는 항목은 전부 "정확한 위치"로 표시되어 이 코드가 필요 없습니다
(assets/js/projectmap.js의 EXACT 판정 참고).
"""
import datetime
import io
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

DOMESTIC_SRC = os.path.join(ROOT, 'content', 'project-uploads', 'domestic')
OVERSEAS_SRC = os.path.join(ROOT, 'content', 'project-uploads', 'overseas')

DOMESTIC_BASE = os.path.join(ROOT, 'assets', 'data', 'project_points_base.json')
DOMESTIC_OUT = os.path.join(ROOT, 'assets', 'data', 'project_points.json')
OVERSEAS_BASE = os.path.join(ROOT, 'assets', 'data', 'overseas_projects_base.json')
OVERSEAS_OUT = os.path.join(ROOT, 'assets', 'data', 'overseas_projects.json')

DOMESTIC_REQUIRED = {
    'name': str, 'addr': str, 'area': str, 'year': int, 'gubun': str,
    'lat': (int, float), 'lng': (int, float),
}
OVERSEAS_REQUIRED = {'year': int, 'gubun': str, 'country': str}


def read_upload_items(src_dir, label):
    """src_dir 안의 _로 시작하지 않는 *.json 을 전부 읽어 items를 이어
    붙입니다. 파일이 아예 없거나 폴더가 없으면 빈 목록입니다."""
    items = []
    if not os.path.isdir(src_dir):
        return items
    for name in sorted(os.listdir(src_dir)):
        if not name.endswith('.json') or name.startswith('_'):
            continue
        path = os.path.join(src_dir, name)
        try:
            with io.open(path, encoding='utf-8') as f:
                data = json.load(f)
        except (ValueError, OSError) as err:
            print('::warning::%s(%s) 을 읽지 못했습니다: %s' % (label, name, err))
            continue
        file_items = data.get('items') if isinstance(data, dict) else None
        if not isinstance(file_items, list):
            print('::warning::%s(%s) 에 items 배열이 없습니다 — 건너뜁니다' % (label, name))
            continue
        for it in file_items:
            if isinstance(it, dict):
                it = dict(it)
                it['_src'] = name
                items.append(it)
    return items


def valid(item, required, label, src):
    for key, types in required.items():
        if key not in item or not isinstance(item[key], types) or (isinstance(item[key], str) and not item[key].strip()):
            print('::warning::%s(%s) 항목의 "%s" 칸이 비었거나 형식이 안 맞아 건너뜁니다' % (label, src, key))
            return False
    return True


def compile_domestic():
    with io.open(DOMESTIC_BASE, encoding='utf-8') as f:
        base = json.load(f)
    points = list(base.get('points') or [])

    def as_int(v):
        try:
            return int(v)
        except (TypeError, ValueError):
            return 0

    row = max([as_int(p.get('row')) for p in points] + [0]) + 1

    added = 0
    for it in read_upload_items(DOMESTIC_SRC, '국내 실적'):
        src = it.get('_src', '?')
        if not valid(it, DOMESTIC_REQUIRED, '국내 실적', src):
            continue
        points.append({
            'row': row,
            'year': it['year'],
            'name': it['name'].strip(),
            'addr': it['addr'].strip(),
            'kind': it.get('kind') or '',
            'gubun': it['gubun'].strip(),
            'method': it.get('method') or '',
            'lng': float(it['lng']),
            'lat': float(it['lat']),
            'src': 'admin-upload',
            'prec': 'ROAD_ADDR',   # 위·경도를 직접 입력한 항목 = 정확한 위치
            'area': it['area'].strip(),
            'codes': [],
        })
        row += 1
        added += 1

    # count/unplaced 는 원본 스프레드시트(geocoding 전) 기준 통계라 points
    # 배열만으로는 다시 계산할 수 없습니다 — base 값을 그대로 이어받습니다.
    # patent/byMethod(TSC·PSRC 등 특허공법 건수)는 최종 points 기준으로
    # 다시 셉니다.
    by_method = {}
    for p in points:
        m = (p.get('method') or '').strip()
        if not m:
            continue
        for part in m.split('+'):
            part = part.strip()
            if part:
                by_method[part] = by_method.get(part, 0) + 1
    patent = sum(1 for p in points if (p.get('method') or '').strip())

    out = {
        'count': base.get('count', len(points)),
        'placed': len(points),
        'unplaced': base.get('unplaced', 0),
        'patent': patent,
        'byMethod': by_method,
        # 업로드로 새로 추가된 게 없으면(=재실행) 날짜를 괜히 오늘로
        # 앞당기지 않습니다 — base 그대로 두면 diff도 안 생깁니다.
        'updated': datetime.date.today().isoformat() if added else base.get('updated', ''),
        'points': points,
    }
    # 5,775건 이상이라 project_points_base.json과 같은 압축 형식(들여쓰기
    # 없음)으로 씁니다 — indent를 주면 파일 크기가 여러 배로 커집니다.
    with io.open(DOMESTIC_OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('domestic: base %d건 + 업로드 %d건 = 총 %d건 -> %s' % (
        len(base.get('points') or []), added, len(points), DOMESTIC_OUT))


def compile_overseas():
    with io.open(OVERSEAS_BASE, encoding='utf-8') as f:
        base = json.load(f)
    items = list(base.get('items') or [])

    added = 0
    for it in read_upload_items(OVERSEAS_SRC, '해외 실적'):
        src = it.get('_src', '?')
        if not valid(it, OVERSEAS_REQUIRED, '해외 실적', src):
            continue
        items.append({
            'year': it['year'],
            'gubun': it['gubun'].strip(),
            'country': it['country'].strip(),
        })
        added += 1

    # overseas_projects_base.json의 원래 형식(줄마다 객체 하나, 객체
    # 안쪽은 한 줄)을 그대로 유지합니다 — json.dump(indent=2)를 쓰면
    # 객체 안의 키까지 줄이 갈라져 훨씬 길어지고 git diff도 지저분해집니다.
    lines = ['{ ' + json.dumps(it, ensure_ascii=False)[1:-1] + ' }' for it in items]
    with io.open(OVERSEAS_OUT, 'w', encoding='utf-8') as f:
        f.write('{\n  "items": [\n')
        f.write(',\n'.join('    ' + line for line in lines))
        f.write('\n  ]\n}\n')
    print('overseas: base %d건 + 업로드 %d건 = 총 %d건 -> %s' % (
        len(base.get('items') or []), added, len(items), OVERSEAS_OUT))


def main():
    compile_domestic()
    compile_overseas()


if __name__ == '__main__':
    main()
