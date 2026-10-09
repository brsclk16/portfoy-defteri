#!/usr/bin/env python3
"""Google Gemini yardımcı modülü (GEMINI_API_KEY ile; GitHub Actions'ta çalışır).

ask(system, user, search=False, as_json=True) → (yanıt, kaynaklar)
  search=True: Google Arama ile temellendirme (güncel bilgi; kaynak URL'leri döner).
  Model sırası GEMINI_MODEL (virgüllü) ya da varsayılan liste; 429/503'te bekleyip yeniden dener."""
import json, os, re, time, urllib.error, urllib.request

KEY = os.environ.get('GEMINI_API_KEY', '').strip()
MODELS = [m for m in os.environ.get('GEMINI_MODEL', 'gemini-3.8-flash,gemini-flash-latest,gemini-flash-lite-latest').split(',') if m]
BASE = 'https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent'
USED = []


def available():
    return bool(KEY)


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
    if not KEY:
        raise RuntimeError('GEMINI_API_KEY yok')
    body = {'systemInstruction': {'parts': [{'text': system}]}, 'contents': [{'role': 'user', 'parts': [{'text': user}]}],
            'generationConfig': {'temperature': temperature, 'maxOutputTokens': max_tokens}}
    if search:
        body['tools'] = [{'google_search': {}}]
    elif as_json:
        body['generationConfig']['responseMimeType'] = 'application/json'
    errs = []
    for model in MODELS:
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
    raise RuntimeError(' | '.join(errs))
