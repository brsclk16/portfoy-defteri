#!/usr/bin/env python3
"""Google Gemini yardımcı modülü (GEMINI_API_KEY ile; GitHub Actions'ta çalışır).

ask(system, user, search=False, as_json=True) → (yanıt, kaynaklar)
  search=True: Google Arama ile temellendirme (güncel bilgi; kaynak URL'leri döner).
  Model sırası GEMINI_MODEL (virgüllü) ya da varsayılan liste; 429/503'te bekleyip yeniden dener.
  Gemini başaramazsa GROQ_API_KEY varsa Groq'a düşer (ücretsiz; search=True'da web aramalı groq/compound denenir).
  Groq ücretsiz katmanı dakikada ~8 bin token sınırlı olduğundan girdi kısaltılır."""
import json, os, re, time, urllib.error, urllib.request

KEY = os.environ.get('GEMINI_API_KEY', '').strip()
MODELS = [m for m in os.environ.get('GEMINI_MODEL', 'gemini-3.8-flash,gemini-flash-latest,gemini-flash-lite-latest').split(',') if m]
BASE = 'https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent'
USED = []
GROQ = (os.environ.get('GROQ_API_KEY') or os.environ.get('GROQ_KEY') or '').strip()
GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
GROQ_MODELS = [m for m in os.environ.get('GROQ_MODEL', 'openai/gpt-oss-120b,qwen/qwen3.8-27b,openai/gpt-oss-20b').split(',') if m]


def label():
    m = USED[0] if USED else ''
    return f'Groq · {m[5:]}' if m.startswith('groq:') else f'Gemini · {m}'


def available():
    return bool(KEY or GROQ)


def _groq(system, user, search, as_json, max_tokens, temperature, errs):
    models = (['groq/compound'] if search else []) + GROQ_MODELS
    for model in models:
        body = {'model': model, 'temperature': temperature, 'max_tokens': min(max_tokens, 4000),
                'messages': [{'role': 'system', 'content': system + (' Yalnızca geçerli JSON döndür.' if as_json else '')},
                             {'role': 'user', 'content': user[:14000]}]}
        if model.startswith('openai/gpt-oss'):
            body['reasoning_effort'] = 'low'
        if as_json and model != 'groq/compound':
            body['response_format'] = {'type': 'json_object'}
        for attempt in range(2):
            req = urllib.request.Request(GROQ_URL, data=json.dumps(body).encode(), method='POST',
                                         headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {GROQ}',
                                                  'User-Agent': 'portfoy-defteri'})
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    j = json.loads(r.read().decode())
                msg = j['choices'][0]['message']
                txt = msg.get('content') or ''
                if not txt:
                    raise RuntimeError('boş yanıt')
                src = [{'title': t.get('title') or '', 'url': t['url']} for x in (msg.get('executed_tools') or [])
                       for t in ((x.get('search_results') or {}).get('results') or []) if t.get('url')][:8]
                USED[:] = [f'groq:{model}']
                return (_json(txt) if as_json else txt), src
            except urllib.error.HTTPError as e:
                errs.append(f'groq:{model}: HTTP {e.code}: {e.read().decode("utf-8", "replace")[:200]}')
                if e.code == 429 and attempt == 0:
                    time.sleep(30)
                    continue
                break
            except Exception as e:
                errs.append(f'groq:{model}: {str(e)[:200]}')
                break
    return None


def _post(model, body):
    req = urllib.request.Request(BASE.format(m=model), data=json.dumps(body).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'x-goog-api-key': KEY})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'HTTP {e.code}: {e.read().decode("utf-8", "replace")[:300]}')


def _json(txt):
    txt = txt.strip()
    m = re.search(r'```(?:json)?\s*(.*?)```', txt, re.S)
    if m:
        txt = m.group(1)
    m = re.search(r'[\{\[].*[\}\]]', txt, re.S)
    return json.loads(m.group(0) if m else txt)


def ask(system, user, search=False, as_json=True, max_tokens=6000, temperature=0.3):
    body = {'systemInstruction': {'parts': [{'text': system}]}, 'contents': [{'role': 'user', 'parts': [{'text': user}]}],
            'generationConfig': {'temperature': temperature, 'maxOutputTokens': max_tokens}}
    if search:
        body['tools'] = [{'google_search': {}}]
    elif as_json:
        body['generationConfig']['responseMimeType'] = 'application/json'
    errs = []
    for model in (MODELS if KEY else []):
        for attempt in range(3):
            try:
                j = _post(model, body)
                cand = (j.get('candidates') or [{}])[0]
                txt = ''.join(p.get('text', '') for p in ((cand.get('content') or {}).get('parts') or []))
                if not txt:
                    raise RuntimeError(f'boş yanıt ({cand.get("finishReason")})')
                src = []
                for c in ((cand.get('groundingMetadata') or {}).get('groundingChunks') or []):
                    w = c.get('web') or {}
                    if w.get('uri'):
                        src.append({'title': w.get('title') or '', 'url': w['uri']})
                USED[:] = [model]
                return (_json(txt) if as_json else txt), src
            except Exception as e:
                msg = str(e)
                errs.append(f'{model}: {msg[:200]}')
                if ('HTTP 503' in msg or 'HTTP 429' in msg or 'HTTP 500' in msg) and attempt < 2:
                    time.sleep(20 * (attempt + 1))
                    continue
                break
    if GROQ:
        r = _groq(system, user, search, as_json, max_tokens, temperature, errs)
        if r is not None:
            return r
    raise RuntimeError(' | '.join(errs) or 'GEMINI_API_KEY / GROQ_API_KEY yok')
