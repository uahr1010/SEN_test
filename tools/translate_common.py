# -*- coding: utf-8 -*-
"""번역 공통 로직 (용어집 로드 · 프롬프트 생성 · API 호출 · 용어집 검증).

tools/translate_by_id.py 가 이 모듈을 가져다 씁니다. 단독으로 실행하는
스크립트가 아닙니다.
"""
import io
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GLOSSARY = os.path.join(ROOT, 'content', 'glossary.json')

LANGS = [('en', 'English'), ('ja', 'Japanese'), ('zh', 'Simplified Chinese')]

# 모델 이름은 자주 바뀌므로 코드에 박아 두지 않고 환경변수로 받습니다.
DEFAULT_MODEL = os.environ.get('SEN_TRANSLATE_MODEL', 'gpt-4o')
BASE_URL = os.environ.get('SEN_TRANSLATE_BASE_URL', '').strip()


# ---------------------------------------------------------------- 용어집
def load_glossary():
    doc = json.load(io.open(GLOSSARY, encoding='utf-8'))
    return doc.get('terms', [])


def squash(s):
    """띄어쓰기를 모두 없앤 형태. 용어를 찾을 때만 씁니다.

    글쓴이는 "PSRC(Prefabricated SRC)" 라고 쓰는데 용어집에는
    "PSRC (Prefabricated SRC)" 처럼 괄호 앞이 띄어져 있는 식으로
    표기가 흔들립니다. 그대로 비교하면 BCA·OSC·HMGICS 같은
    핵심 고유명사가 통째로 누락되므로, 공백을 지우고 견줍니다.
    """
    return re.sub(r'\s+', '', s or '')


def used_terms(text, terms):
    """기사에 실제로 나온 용어만 추립니다.
    용어집 전체를 프롬프트에 넣으면 길고 비싸지기만 합니다."""
    flat = squash(text)
    hits = [t for t in terms
            if (t.get('ko') or '').strip() and squash(t['ko']) in flat]
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
    """번역 결과에 용어집 표기가 실제로 쓰였는지 확인합니다.
    여기서도 띄어쓰기 차이는 눈감아 줍니다 — 괄호 앞 공백 하나 때문에
    멀쩡한 번역을 틀렸다고 알리면 경고가 무의미해집니다."""
    flat = squash(out)
    missing = []
    for t in hits:
        target = (t.get(lang_key) or '').strip()
        if target and squash(target) not in flat:
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
    # temperature 를 지정하지 않습니다.
    # 최근 추론형 모델(gpt-5.6-terra 등)은 기본값(1) 외의 temperature 를
    # 거부합니다 — 실제로 "Unsupported value: 'temperature' does not
    # support 0.2 with this model" 오류로 확인됐습니다.
    # 번역처럼 창의성보다 정확성이 중요한 작업에서는 기본값도 충분합니다.
    res = client.chat.completions.create(
        model=model,
        messages=[
            {'role': 'system',
             'content': 'You are a professional translator for a structural engineering firm. '
                        'Follow the provided glossary exactly.'},
            {'role': 'user', 'content': prompt},
        ],
    )
    return res.choices[0].message.content.strip()
