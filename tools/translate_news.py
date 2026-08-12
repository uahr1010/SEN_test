# -*- coding: utf-8 -*-
"""한국어 기사 → 4개 국어 번역 → content/news.json 에 추가.

  ┌──────────── 왜 사장님 PC 에서 돌리나 ────────────┐
  │ 홈페이지는 GitHub Pages 로 서비스되는 정적 사이트입니다.       │
  │ 거기서 번역 API 를 부르려면 API 키를 브라우저 자바스크립트에    │
  │ 넣어야 하는데, 이 저장소는 public 이라 키가 즉시 공개됩니다.    │
  │ 그래서 번역은 "기사를 쓰는 시점에, 이 PC 에서" 끝내고           │
  │ 결과 문장만 news.json 에 담아 올립니다.                        │
  │ 방문자 입장에서는 이미 번역된 글을 그냥 읽는 것이라 빠르고,     │
  │ 방문자가 늘어도 번역 비용이 추가로 들지 않습니다.               │
  └────────────────────────────────────────────────┘

준비 (최초 한 번):

    pip install openai
    setx OPENAI_API_KEY "sk-...."      # 키는 이 파일에 적지 말 것

사용:

    python tools/translate_news.py article.txt

article.txt 형식 (첫 줄 제목, 빈 줄, 나머지 본문):

    싱가포르 BC4:2025 개정 관련 기술 세미나 개최

    센 엔지니어링그룹은 ... 본문 ...

옵션:
    --category 언론보도      분류 (기본: 언론보도)
    --date 2026-08-12       날짜 (기본: 오늘)
    --link https://...      원문 링크
    --model <모델명>         번역에 쓸 모델 (기본: 환경변수 SEN_TRANSLATE_MODEL)
    --dry-run               news.json 에 쓰지 않고 결과만 보여 줌
"""
import argparse
import datetime
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GLOSSARY = os.path.join(ROOT, 'content', 'glossary.json')
NEWS = os.path.join(ROOT, 'content', 'news.json')

LANGS = [('en', 'English'), ('ja', 'Japanese'), ('zh', 'Simplified Chinese')]

# 실제로 쓸 모델 이름은 환경변수로 지정합니다.
# 모델은 자주 바뀌므로 코드에 박아 두지 않습니다.
DEFAULT_MODEL = os.environ.get('SEN_TRANSLATE_MODEL', 'gpt-4o')


def load_glossary():
    doc = json.load(io.open(GLOSSARY, encoding='utf-8'))
    return doc.get('terms', [])


def used_terms(text, terms):
    """기사 본문에 실제로 나온 용어만 추립니다.
    용어집 전체를 프롬프트에 넣으면 길고 비싸지기만 합니다."""
    hits = []
    for t in terms:
        ko = (t.get('ko') or '').strip()
        if ko and ko in text:
            hits.append(t)
    # 긴 표기부터 — "PSRC 기둥" 이 "PSRC" 보다 먼저 걸리도록
    hits.sort(key=lambda t: -len(t['ko']))
    return hits


def build_prompt(text, hits, lang_label, lang_key):
    lines = []
    for t in hits:
        target = (t.get(lang_key) or '').strip()
        if target:
            lines.append(u'  "%s" → "%s"' % (t['ko'], target))
    glossary_block = (
        u'\n반드시 아래 표기를 그대로 쓰십시오. 다르게 옮기지 마십시오.\n' + u'\n'.join(lines)
        if lines else u''
    )
    return (
        u'다음 한국어 보도자료를 %s(으)로 번역하십시오.\n'
        u'- 사실을 더하거나 빼지 마십시오.\n'
        u'- 문단 구분(빈 줄)을 그대로 유지하십시오.\n'
        u'- 번역문만 출력하고 설명은 붙이지 마십시오.%s\n\n'
        u'--- 원문 ---\n%s' % (lang_label, glossary_block, text)
    )


def translate(client, model, prompt):
    res = client.chat.completions.create(
        model=model,
        messages=[
            {'role': 'system',
             'content': 'You are a professional translator for a structural engineering firm. '
                        'Follow the provided glossary exactly.'},
            {'role': 'user', 'content': prompt},
        ],
        temperature=0.2,
    )
    return res.choices[0].message.content.strip()


def check_glossary(out, hits, lang_key):
    """번역 결과에 용어집 표기가 실제로 쓰였는지 확인합니다."""
    missing = []
    for t in hits:
        target = (t.get(lang_key) or '').strip()
        if target and target not in out:
            missing.append(u'%s → %s' % (t['ko'], target))
    return missing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('article')
    ap.add_argument('--category', default='언론보도')
    ap.add_argument('--date', default=datetime.date.today().isoformat())
    ap.add_argument('--link', default='')
    ap.add_argument('--model', default=DEFAULT_MODEL)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    if not os.environ.get('OPENAI_API_KEY'):
        sys.exit('OPENAI_API_KEY 환경변수가 없습니다.\n'
                 '  setx OPENAI_API_KEY "sk-..."  로 설정한 뒤 새 터미널에서 실행하세요.\n'
                 '  ※ 키를 이 파일이나 저장소 안에 적지 마십시오.')

    raw = io.open(args.article, encoding='utf-8').read().strip()
    parts = raw.split('\n', 1)
    title_ko = parts[0].strip()
    body_ko = parts[1].strip() if len(parts) > 1 else ''
    if not body_ko:
        sys.exit('본문이 없습니다. 첫 줄 제목, 빈 줄, 그다음 본문 형식으로 적어 주세요.')

    terms = load_glossary()
    hits = used_terms(title_ko + '\n' + body_ko, terms)
    print('용어집 %d개 중 이 기사에 쓰인 것 %d개' % (len(terms), len(hits)))
    for t in hits[:10]:
        print('   %s' % t['ko'])

    from openai import OpenAI
    client = OpenAI()

    title = {'ko': title_ko}
    excerpt = {'ko': body_ko}
    for key, label in LANGS:
        print('\n[%s] 번역 중...' % label)
        title[key] = translate(client, args.model, build_prompt(title_ko, hits, label, key))
        excerpt[key] = translate(client, args.model, build_prompt(body_ko, hits, label, key))
        miss = check_glossary(title[key] + '\n' + excerpt[key], hits, key)
        if miss:
            print('  ⚠ 용어집대로 안 나온 항목 %d개 — 확인이 필요합니다:' % len(miss))
            for m in miss:
                print('     %s' % m)
        else:
            print('  용어집 표기 모두 반영됨')

    slug = re.sub(r'[^a-z0-9]+', '-', title.get('en', '').lower()).strip('-')[:40] or 'news'
    item = {
        'id': 'news-%s-%s' % (args.date, slug),
        'date': args.date,
        'category': {'ko': args.category, 'en': args.category,
                     'ja': args.category, 'zh': args.category},
        'image': '',
        'link': args.link,
        'title': title,
        'excerpt': excerpt,
    }

    if args.dry_run:
        print('\n--- 미리보기 (저장 안 함) ---')
        print(json.dumps(item, ensure_ascii=False, indent=2))
        return

    doc = json.load(io.open(NEWS, encoding='utf-8'))
    doc.setdefault('items', []).insert(0, item)
    io.open(NEWS, 'w', encoding='utf-8').write(
        json.dumps(doc, ensure_ascii=False, indent=2) + u'\n')
    print('\ncontent/news.json 에 추가했습니다 (id: %s)' % item['id'])
    print('분류(category) 는 4개 국어가 같은 값으로 들어갔습니다. 필요하면 직접 고치세요.')
    print('확인 후 git commit / push 하면 사이트에 반영됩니다.')


if __name__ == '__main__':
    main()
