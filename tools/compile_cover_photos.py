# -*- coding: utf-8 -*-
"""uploads/main/ (Pages CMS [⑥ 표지 사진]이 그냥 폴더 업로드로 관리하는
표지 사진들) 을 훑어 content/cover-photos.json 을 다시 만듭니다.

GitHub Pages는 정적 호스팅이라 폴더 안에 실제로 어떤 파일이 있는지
브라우저(assets/js/cover.js)가 알아낼 방법이 없습니다 — 예전엔 그래서
main_1.png, main_2.png 처럼 정해진 이름을 하나씩 찔러 보는 방식을
썼는데, 파일 이름을 마음대로 못 정하는 불편이 있었습니다. 이제는
compile_news.py/compile_glossary.py 와 같은 방식으로, 폴더가 바뀔 때마다
(.github/workflows/compile-cover-photos.yml) 이 스크립트가 실제 파일
목록을 미리 하나로 묶어 둡니다 — 파일 이름은 아무거나 상관없습니다.

파일명 오름차순(대소문자 무시)으로 정렬합니다 — 표지에서 사진이 그
순서대로 나오므로, 앞에 01-, 02- 처럼 번호를 붙이면 순서를 마음대로
정할 수 있습니다.
"""
import io
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SRC_DIR = os.path.join(ROOT, 'uploads', 'main')
OUT = os.path.join(ROOT, 'content', 'cover-photos.json')
EXTS = ('.jpg', '.jpeg', '.png', '.webp', '.gif')


def main():
    names = []
    if os.path.isdir(SRC_DIR):
        for name in os.listdir(SRC_DIR):
            if name.lower().endswith(EXTS):
                names.append(name)
    names.sort(key=lambda n: n.lower())

    photos = ['uploads/main/' + name for name in names]

    with io.open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'photos': photos}, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print('wrote %d photos to %s' % (len(photos), OUT))


if __name__ == '__main__':
    main()
