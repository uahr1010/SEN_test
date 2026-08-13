# -*- coding: utf-8 -*-
"""content/news/*.json (기사 한 건당 파일 하나) → content/news.json 로 합칩니다.

Pages CMS의 [② 뉴스] 탭이 이제 content/news/ 를 컬렉션으로 관리합니다
(파일 하나=기사 한 건). 사이트(assets/js/*.js)는 여전히 content/news.json
하나만 fetch 하므로, content/news/ 가 바뀔 때마다 이 스크립트로 다시
합쳐 content/news.json 을 갱신해야 합니다 — .github/workflows/compile-news.yml
이 push 때마다 자동으로 실행합니다.

기사 하나당 파일 하나로 나눈 이유: 예전에는 news.json 안에 배열로 전부
들어 있어서, 관리자가 기사 하나를 추가/수정할 때 Pages CMS가 폼에 없던
기존 기사까지 통째로 덮어써 버리는 사고가 반복됐습니다(2026-08-13,
두 차례 데이터 유실). 파일을 분리하면 기사 하나를 고칠 때 다른 기사
파일은 아예 건드리지 않아 이 문제가 구조적으로 없어집니다.

사용
  python tools/compile_news.py
"""
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEWS_DIR = os.path.join(ROOT, 'content', 'news')
OUT_PATH = os.path.join(ROOT, 'content', 'news.json')


def load_items():
    items = []
    if not os.path.isdir(NEWS_DIR):
        return items
    for name in sorted(os.listdir(NEWS_DIR)):
        if not name.endswith('.json'):
            continue
        path = os.path.join(NEWS_DIR, name)
        with io.open(path, encoding='utf-8') as f:
            try:
                item = json.load(f)
            except ValueError as e:
                print('[compile_news] %s 파싱 실패: %s' % (name, e), file=sys.stderr)
                raise
        if not item.get('id'):
            item['id'] = name[:-5]  # .json 확장자 제거
        items.append(item)
    return items


def main():
    items = load_items()
    items.sort(key=lambda it: str(it.get('date') or ''), reverse=True)

    ids = [it['id'] for it in items]
    dupes = sorted(set(x for x in ids if ids.count(x) > 1))
    if dupes:
        print('[compile_news] 경고: id 중복 → %s' % ', '.join(dupes), file=sys.stderr)

    with io.open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump({'items': items}, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print('[compile_news] %d건 → %s' % (len(items), os.path.relpath(OUT_PATH, ROOT)))


if __name__ == '__main__':
    main()
