# -*- coding: utf-8 -*-
"""한국어 기사 초안 → 4개 국어 번역 → content/news.json 에 추가.

GitHub Actions 에서 자동으로 실행됩니다 (.github/workflows/translate-news.yml).
사장님 PC 에서 직접 돌려 볼 수도 있습니다.

  ┌──────────── API 키는 어디에 있나 ────────────┐
  │ 저장소 Settings → Secrets and variables →     │
  │ Actions → Repository secrets 에 넣습니다.     │
  │                                              │
  │ 이 값은 GitHub 서버 안에서만 풀리고, 공개      │
  │ 저장소라도 외부에서 볼 수 없습니다.            │
  │ 코드나 홈페이지에는 절대 들어가지 않습니다.     │
  └──────────────────────────────────────────────┘

환경변수
  OPENAI_API_KEY          (필수) API 키. Actions 에서는 secrets 로 주입됩니다.
  SEN_TRANSLATE_MODEL     쓸 모델 이름. 없으면 gpt-4o.
  SEN_TRANSLATE_BASE_URL  OpenAI 가 아닌 엔드포인트를 쓸 때만 지정.

사용
  python tools/translate_news.py drafts/2026-08-12-세미나.md
  python tools/translate_news.py drafts/... --dry-run     결과만 보고 저장 안 함

초안 파일 형식 — 머리말은 선택입니다.

    category: 언론보도
    date: 2026-08-12
    link: https://example.com/article
    ---
    싱가포르 BC4:2025 개정 관련 기술 세미나 개최

    센 엔지니어링그룹은 싱가포르 건설청 (BCA) 과 함께 ...

머리말 없이 "첫 줄 제목 / 빈 줄 / 본문" 만 적어도 됩니다.
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

# 모델 이름은 자주 바뀌므로 코드에 박아 두지 않고 환경변수로 받습니다.
DEFAULT_MODEL = os.environ.get('SEN_TRANSLATE_MODEL', 'gpt-4o')
BASE_URL = os.environ.get('SEN_TRANSLATE_BASE_URL', '').strip()


# ---------------------------------------------------------------- 초안 읽기
def _unquote(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'':
        v = v[1:-1]
    return v.strip()


def parse_draft(path):
    """초안 파일 → (머리말 dict, 제목, 본문)

    두 가지 형식을 받습니다.

    1) Pages CMS 가 만드는 표준 YAML 머리말 — title 이 머리말 안에 있습니다.
           ---
           title: 제목
           category: 언론보도
           ---
           본문...

    2) 손으로 적은 형식 — 첫 줄이 제목입니다.
           제목

           본문...
    """
    raw = io.open(path, encoding='utf-8').read().strip()
    meta = {}

    if raw.startswith('---'):
        end = raw.find('\n---', 3)
        if end > 0:
            head = raw[3:end]
            raw = raw[end + 4:].lstrip('-').strip()
            for line in head.splitlines():
                if ':' in line and not line.strip().startswith('#'):
                    k, _, v = line.partition(':')
                    meta[k.strip().lower()] = _unquote(v)

    title = meta.pop('title', '').strip()
    if title:
        body = raw.strip()
    else:
        parts = raw.split('\n', 1)
        title = parts[0].strip()
        body = parts[1].strip() if len(parts) > 1 else ''

    if not title:
        sys.exit('제목이 없습니다: %s' % path)
    if not body:
        sys.exit('본문이 없습니다: %s' % path)
    return meta, title, body


# ---------------------------------------------------------------- 용어집
def load_glossary():
    doc = json.load(io.open(GLOSSARY, encoding='utf-8'))
    return doc.get('terms', [])


def used_terms(text, terms):
    """기사에 실제로 나온 용어만 추립니다.
    용어집 전체를 프롬프트에 넣으면 길고 비싸지기만 합니다."""
    hits = [t for t in terms if (t.get('ko') or '').strip() and t['ko'] in text]
    # 긴 표기부터 — "PSRC 기둥" 이 "PSRC" 보다 먼저 걸리도록
    hits.sort(key=lambda t: -len(t['ko']))
    return hits


def build_prompt(text, hits, lang_label, lang_key):
    lines = []
    for t in hits:
        target = (t.get(lang_key) or '').strip()
        if target:
            lines.append(u'  "%s" → "%s"' % (t['ko'], target))
    block = (u'\n반드시 아래 표기를 그대로 쓰십시오. 다르게 옮기지 마십시오.\n' + u'\n'.join(lines)
             if lines else u'')
    return (
        u'다음 한국어 보도자료를 %s(으)로 번역하십시오.\n'
        u'- 사실을 더하거나 빼지 마십시오.\n'
        u'- 문단 구분(빈 줄)을 그대로 유지하십시오.\n'
        u'- 번역문만 출력하고 설명은 붙이지 마십시오.%s\n\n'
        u'--- 원문 ---\n%s' % (lang_label, block, text)
    )


def check_glossary(out, hits, lang_key):
    """번역 결과에 용어집 표기가 실제로 쓰였는지 확인합니다."""
    missing = []
    for t in hits:
        target = (t.get(lang_key) or '').strip()
        if target and target not in out:
            missing.append(u'%s → %s' % (t['ko'], target))
    return missing


# ---------------------------------------------------------------- 번역
def make_client():
    from openai import OpenAI
    if BASE_URL:
        print('엔드포인트: %s' % BASE_URL)
        return OpenAI(base_url=BASE_URL)
    return OpenAI()


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


# ---------------------------------------------------------------- 본체
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('draft')
    ap.add_argument('--category', default='')
    ap.add_argument('--date', default='')
    ap.add_argument('--link', default='')
    ap.add_argument('--model', default=DEFAULT_MODEL)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    if not os.environ.get('OPENAI_API_KEY'):
        sys.exit('OPENAI_API_KEY 가 없습니다.\n'
                 '  GitHub: Settings → Secrets and variables → Actions 에 등록\n'
                 '  내 PC : setx OPENAI_API_KEY "sk-..." 후 터미널 새로 열기\n'
                 '  ※ 키를 저장소 안 파일에 적지 마십시오.')

    meta, title_ko, body_ko = parse_draft(args.draft)
    category = args.category or meta.get('category') or '언론보도'
    date = args.date or meta.get('date') or datetime.date.today().isoformat()
    link = args.link or meta.get('link') or ''

    terms = load_glossary()
    hits = used_terms(title_ko + '\n' + body_ko, terms)
    print('모델: %s' % args.model)
    print('용어집 %d개 중 이 기사에 쓰인 것 %d개' % (len(terms), len(hits)))
    for t in hits[:10]:
        print('   %s' % t['ko'])

    client = make_client()

    title = {'ko': title_ko}
    excerpt = {'ko': body_ko}
    warnings = []
    for key, label in LANGS:
        print('\n[%s] 번역 중...' % label)
        title[key] = translate(client, args.model, build_prompt(title_ko, hits, label, key))
        excerpt[key] = translate(client, args.model, build_prompt(body_ko, hits, label, key))
        miss = check_glossary(title[key] + '\n' + excerpt[key], hits, key)
        if miss:
            warnings.append((label, miss))
            print('  ⚠ 용어집대로 안 나온 항목 %d개:' % len(miss))
            for m in miss:
                print('     %s' % m)
        else:
            print('  용어집 표기 모두 반영됨')

    slug = re.sub(r'[^a-z0-9]+', '-', title.get('en', '').lower()).strip('-')[:40] or 'news'
    item = {
        'id': 'news-%s-%s' % (date, slug),
        'date': date,
        'category': {'ko': category, 'en': category, 'ja': category, 'zh': category},
        'image': '',
        'link': link,
        'title': title,
        'excerpt': excerpt,
    }

    if args.dry_run:
        print('\n--- 미리보기 (저장 안 함) ---')
        print(json.dumps(item, ensure_ascii=False, indent=2))
        return

    doc = json.load(io.open(NEWS, encoding='utf-8'))
    items = doc.setdefault('items', [])
    # 같은 id 가 이미 있으면 덮어씁니다 (초안을 고쳐 다시 돌린 경우)
    items[:] = [x for x in items if x.get('id') != item['id']]
    items.insert(0, item)
    io.open(NEWS, 'w', encoding='utf-8').write(
        json.dumps(doc, ensure_ascii=False, indent=2) + u'\n')

    print('\ncontent/news.json 에 추가했습니다 (id: %s)' % item['id'])
    print('분류는 4개 국어가 같은 값으로 들어갔습니다. 필요하면 직접 고치세요.')
    if warnings:
        print('\n⚠ 용어집과 다르게 번역된 항목이 있습니다. 게시 전에 확인하세요.')


if __name__ == '__main__':
    main()
