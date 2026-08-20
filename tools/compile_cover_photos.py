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

파일명 맨 앞의 번호를 숫자로 읽어 오름차순 정렬합니다(자연 정렬) —
표지에서 사진이 그 순서대로 나옵니다. 예: "1_로비.jpg", "2_공장.jpg",
… "10_행사.jpg" 가 1, 2, …, 10 순서로 나옵니다. 문자열 그대로
정렬하면 "10_..."이 "2_..."보다 앞에 와버리는 문제가 있어(사전식
정렬은 "1"이 "2"보다 작다고만 볼 뿐 "10"과 "2"를 숫자로 비교하지
않음) 번호 부분만 따로 뽑아 숫자로 비교합니다. 번호가 없는 파일은
번호 있는 파일들보다 뒤로 가고, 그 안에서는 이름순입니다.
"""
import io
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SRC_DIR = os.path.join(ROOT, 'uploads', 'main')
OUT = os.path.join(ROOT, 'content', 'cover-photos.json')
EXTS = ('.jpg', '.jpeg', '.png', '.webp', '.gif')

LEADING_NUM = re.compile(r'^\s*(\d+)')


def sort_key(name):
    m = LEADING_NUM.match(name)
    num = int(m.group(1)) if m else float('inf')  # 번호 없는 파일은 맨 뒤로
    return (num, name.lower())


def main():
    names = []
    if os.path.isdir(SRC_DIR):
        for name in os.listdir(SRC_DIR):
            if name.lower().endswith(EXTS):
                names.append(name)
    names.sort(key=sort_key)

    photos = ['uploads/main/' + name for name in names]

    with io.open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'photos': photos}, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print('wrote %d photos to %s' % (len(photos), OUT))


if __name__ == '__main__':
    main()
