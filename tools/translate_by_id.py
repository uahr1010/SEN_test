# -*- coding: utf-8 -*-
"""뉴스 기사 하나를 번역해 content/news-i18n.json 에 넣습니다.

[② 뉴스 번역] 페이지의 "번역 실행" 버튼(.pages.yml의 news-i18n.actions)이
GitHub Actions를 통해 이 스크립트를 실행합니다
(.github/workflows/translate-queue.yml). 버튼을 누르면 번역할 기사의
"고유 ID"를 물어보고, 그 값이 payload.inputs.news_id 로 넘어옵니다.

저장소 Actions 탭 → "기사 번역" → Run workflow 에서 news_id 를 직접
넣어 손으로 돌릴 수도 있습니다(버튼이 안 될 때의 대안).

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
  python tools/translate_by_id.py --payload '{"inputs":{"news_id":"news-..."}}'
  python tools/translate_by_id.py --news-id news-2026-... --dry-run   직접 지정해서 미리보기만

동작
  1. payload(또는 --news-id)에서 번역할 기사 id를 찾습니다.
     Pages CMS의 "번역 실행" 버튼이 보내는 payload.inputs.news_id 를 읽습니다
     (news_id_from_queue_file/context.data 는 예전 "번역 요청" 큐 파일 방식의
     흔적으로, 지금은 거의 안 쓰이지만 혹시 몰라 그대로 뒀습니다).
  2. content/news.json 에서 그 id의 한국어 제목/본문을 찾습니다.
  3. 용어집을 참고해 영어·일본어·중국어로 번역합니다.
  4. content/news-i18n.json 에 기록합니다 (같은 id 있으면 덮어씀) — [②
     뉴스 번역] 목록에 바로 나타납니다.
"""
import argparse
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import translate_common as tc  # noqa: E402

ROOT = tc.ROOT
NEWS = os.path.join(ROOT, 'content', 'news.json')
NEWS_I18N = os.path.join(ROOT, 'content', 'news-i18n.json')


def news_id_from_queue_file(path):
    """translate-queue/*.md 파일에서 newsId 값을 직접 읽습니다.
    파일이 없거나 형식이 다르면 None을 돌려줍니다 (호출부에서 payload로 대체)."""
    if not path:
        return None
    full = os.path.join(ROOT, path) if not os.path.isabs(path) else path
    if not os.path.exists(full):
        return None
    text = io.open(full, encoding='utf-8').read()
    m = re.search(r'^newsId:\s*(.+)$', text, re.MULTILINE)
    if not m:
        return None
    v = m.group(1).strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'':
        v = v[1:-1]
    return v.strip() or None


def parse_payload(raw):
    payload = json.loads(raw)
    ctx = payload.get('context', {}) or {}
    path = ctx.get('path')
    news_id = news_id_from_queue_file(path)
    if not news_id:
        data = ctx.get('data', {}) or {}
        news_id = data.get('newsId') or data.get('newsid') or data.get('news_id')
    if not news_id:
        # [② 뉴스 번역] 페이지의 "번역 실행" 버튼(.pages.yml의 actions.fields)
        # 이 보내는 모양 — Pages CMS가 그 입력칸 값을 payload.inputs 에 담습니다.
        inputs = payload.get('inputs', {}) or {}
        news_id = inputs.get('news_id') or inputs.get('newsId')
    return news_id, path


def find_news_item(news_id):
    doc = json.load(io.open(NEWS, encoding='utf-8'))
    for it in doc.get('items', []):
        if it.get('id') == news_id:
            return it
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--payload', default='', help='Pages CMS action이 보내는 JSON 문자열')
    ap.add_argument('--news-id', default='', help='payload 대신 id를 직접 지정 (테스트용)')
    ap.add_argument('--model', default=tc.DEFAULT_MODEL)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    queue_path = None
    if args.news_id:
        news_id = args.news_id
    elif args.payload:
        news_id, queue_path = parse_payload(args.payload)
    else:
        sys.exit('--payload 또는 --news-id 중 하나는 있어야 합니다.')

    if not news_id:
        sys.exit('번역할 기사 id를 찾지 못했습니다. [② 뉴스 번역]의 "번역 실행" '
                  '버튼에서 "번역할 기사의 고유 ID" 칸이 비어 있지 않은지 확인하세요.')

    item = find_news_item(news_id)
    if not item:
        sys.exit('content/news.json 에 id "%s" 인 기사가 없습니다. '
                  '[② 뉴스]의 "고유 ID"를 정확히 복사했는지 확인하세요.' % news_id)

    title_ko = item.get('title') or ''
    body_ko = item.get('excerpt') or ''
    if not title_ko or not body_ko:
        sys.exit('id "%s" 기사에 제목/본문이 비어 있습니다.' % news_id)

    if not os.environ.get('OPENAI_API_KEY'):
        sys.exit('OPENAI_API_KEY 가 없습니다.\n'
                 '  GitHub: Settings → Secrets and variables → Actions 에 등록\n'
                 '  내 PC : setx OPENAI_API_KEY "sk-..." 후 터미널 새로 열기\n'
                 '  ※ 키를 저장소 안 파일에 적지 마십시오.')

    terms = tc.load_glossary()
    hits = tc.used_terms(title_ko + '\n' + body_ko, terms)
    print('기사: %s' % news_id)
    print('모델: %s' % args.model)
    print('용어집 %d개 중 이 기사에 쓰인 것 %d개' % (len(terms), len(hits)))
    for t in hits[:10]:
        print('   %s' % t['ko'])

    client = tc.make_client()

    title = {}
    excerpt = {}
    warnings = []
    for key, label in tc.LANGS:
        print('\n[%s] 번역 중...' % label)
        title[key] = tc.translate(client, args.model, tc.build_prompt(title_ko, hits, label, key))
        excerpt[key] = tc.translate(client, args.model, tc.build_prompt(body_ko, hits, label, key))
        miss = tc.check_glossary(title[key] + '\n' + excerpt[key], hits, key)
        if miss:
            warnings.append((label, miss))
            print('  ⚠ 용어집대로 안 나온 항목 %d개:' % len(miss))
            for m in miss:
                print('     %s' % m)
        else:
            print('  용어집 표기 모두 반영됨')

    i18n_item = {'id': news_id, 'title': title, 'excerpt': excerpt}

    if args.dry_run:
        print('\n--- 미리보기 (저장 안 함) ---')
        print(json.dumps(i18n_item, ensure_ascii=False, indent=2))
        return

    i18n_doc = json.load(io.open(NEWS_I18N, encoding='utf-8'))
    i18n_items = i18n_doc.setdefault('items', [])
    i18n_items[:] = [x for x in i18n_items if x.get('id') != news_id]
    i18n_items.insert(0, i18n_item)
    io.open(NEWS_I18N, 'w', encoding='utf-8').write(
        json.dumps(i18n_doc, ensure_ascii=False, indent=2) + u'\n')
    print('\ncontent/news-i18n.json 에 기록했습니다 (id: %s)' % news_id)

    # 예전 "번역 요청" 큐 파일(translate-queue/*.md) 방식의 흔적입니다 —
    # 처리 후 그 요청 파일을 지우던 로직인데, 지금은 [② 뉴스 번역] 액션이
    # 자기 자신(content/news-i18n.json)의 경로를 context.path 로 보내므로,
    # 이 조건 없이 지웠다면 방금 쓴 번역 파일이 통째로 삭제될 뻔했습니다.
    # translate-queue/ 아래 파일일 때만(지금은 사실상 없음) 지웁니다.
    if queue_path and queue_path.startswith('translate-queue/'):
        full = os.path.join(ROOT, queue_path) if not os.path.isabs(queue_path) else queue_path
        if os.path.exists(full):
            os.remove(full)
            print('처리한 요청 파일을 지웠습니다: %s' % queue_path)

    if warnings:
        print('\n⚠ 용어집과 다르게 번역된 항목이 있습니다. [② 뉴스 번역] 탭에서 확인하세요.')


if __name__ == '__main__':
    main()
