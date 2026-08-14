# -*- coding: utf-8 -*-
"""content/news/<id>.json (Pages CMS가 관리하는 개별 뉴스 파일들) 을 모아
content/news.json 을 다시 만듭니다 — 실제 홈페이지(assets/js/main.js)는
이 파일 하나만 fetch 합니다.

GitHub Pages는 정적 호스팅이라 "폴더 안에 어떤 파일이 있는지" 브라우저가
알아낼 방법이 없어서, 폴더에 뭔가 바뀔 때마다(.github/workflows/compile-news.yml)
이 스크립트로 미리 하나로 합쳐 둡니다.

화면에 보이는 순서는 날짜 최신순으로 이미 프론트엔드(main.js)가 다시
정렬하므로 이 파일 안의 순서 자체는 중요하지 않지만, git diff를 보기 쉽게
여기서도 최신순으로 정렬해 씁니다.
"""
import io
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SRC_DIR = os.path.join(ROOT, 'content', 'news')
OUT = os.path.join(ROOT, 'content', 'news.json')


def main():
    items = []
    for name in sorted(os.listdir(SRC_DIR)):
        if not name.endswith('.json'):
            continue
        path = os.path.join(SRC_DIR, name)
        with io.open(path, encoding='utf-8') as f:
            items.append(json.load(f))

    items.sort(key=lambda it: (it.get('date') or '', it.get('id') or ''), reverse=True)

    with io.open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'items': items}, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print('wrote %d items to %s' % (len(items), OUT))


if __name__ == '__main__':
    main()
