# -*- coding: utf-8 -*-
"""content/glossary/<id>.json (Pages CMS가 관리하는 개별 용어 파일들) 을
모아 content/glossary.json 을 다시 만듭니다 — 번역 도구(tools/
translate_common.py 의 load_glossary())는 이 합쳐진 파일 하나만 읽습니다.

compile_news.py 와 같은 이유(GitHub Pages는 폴더 안 파일 목록을 브라우저가
알아낼 방법이 없음)로, 폴더가 바뀔 때마다(.github/workflows/
compile-glossary.yml) 이 스크립트로 미리 하나로 합쳐 둡니다.

한국어 표기(ko) 기준으로 정렬해 git diff를 보기 쉽게 합니다.
"""
import io
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SRC_DIR = os.path.join(ROOT, 'content', 'glossary')
OUT = os.path.join(ROOT, 'content', 'glossary.json')


def main():
    terms = []
    for name in sorted(os.listdir(SRC_DIR)):
        if not name.endswith('.json'):
            continue
        path = os.path.join(SRC_DIR, name)
        with io.open(path, encoding='utf-8') as f:
            terms.append(json.load(f))

    terms.sort(key=lambda t: t.get('ko') or '')

    with io.open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'terms': terms}, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print('wrote %d terms to %s' % (len(terms), OUT))


if __name__ == '__main__':
    main()
