#!/usr/bin/env python3
"""WinningCircle "Kıssadan Hisse" sabah bülteni → data/kissadan.json (yan kaynak, arşivli).

Kaynak: https://api.winningcircle.io/landing/morningBrief/recent — anahtarsız, herkese açık uç nokta; son 5 günün
bültenini döndürür (her gün ~15 haber, Türkçe başlık + özet + orijinal haber linki + kaynak adı). Bülten her sabah
TR ~08:30'da yayınlanır. Bu betik bültenleri tarihe göre arşivler (KEEP_DAYS gün), böylece API düşse bile son veri
repoda hazır durur. fetch_news.py aynı arşivi haber kaynağı olarak okur.
Kullanım: python3 tools/fetch_kissadan.py   (ağ hatasında arşiv bozulmaz, çıkış kodu 0)"""
import datetime as dt, json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
OUT = os.path.join(DATA, 'kissadan.json')
API = 'https://api.winningcircle.io/landing/morningBrief/recent'
KEEP_DAYS = int(os.environ.get('KISSADAN_KEEP_DAYS', '30'))
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'


def now_iso():
    return dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def to_utc(s):
    try:
        d = dt.datetime.fromisoformat((s or '').replace('Z', '+00:00'))
        d = d if d.tzinfo else d.replace(tzinfo=dt.timezone(dt.timedelta(hours=3)))
        return d.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    except Exception:
        return None


def clean(s, n=None):
    s = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', s or '')).strip()
    return (s[:n].rstrip() + '…') if n and len(s) > n else s


def parse(payload):
    """API yanıtı → [{'date','generatedAt','items':[...]}]. Biçim değişirse ValueError."""
    rows = payload.get('data') if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        raise ValueError('beklenmeyen yanıt: data listesi yok')
    out = []
    for r in rows:
        c = r.get('jsonContent')
        c = json.loads(c) if isinstance(c, str) else (c or {})
        items = []
        for a in c.get('articles') or []:
            if not a.get('title') or not a.get('link'):
                continue
            items.append({'title': clean(a['title'], 240), 'summary': clean(a.get('summary'), 1200),
                          'url': a['link'], 'source': clean(a.get('source') or a.get('source_feed') or ''),
                          'publishedAt': to_utc(a.get('published_at')), 'image': a.get('image_url') or None,
                          'order': a.get('order')})
        date = r.get('briefDate') or (c.get('generated_at') or '')[:10]
        if date and items:
            out.append({'date': date, 'generatedAt': to_utc(c.get('generated_at')), 'items': items})
    if not out:
        raise ValueError('yanıtta bülten yok')
    return out


def fetch(timeout=20):
    req = urllib.request.Request(API, headers={'User-Agent': UA, 'Accept': 'application/json',
                                               'Origin': 'https://www.winningcircle.io',
                                               'Referer': 'https://www.winningcircle.io/'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return parse(json.loads(r.read().decode('utf-8')))


def load():
    try:
        with open(OUT, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {'briefs': []}


def merge(arc, briefs):
    by = {b['date']: b for b in arc.get('briefs') or []}
    for b in briefs:
        by[b['date']] = b  # aynı gün yeniden yayınlanırsa son hali geçerli
    keep = sorted(by.values(), key=lambda b: b['date'], reverse=True)
    cut = (dt.date.today() - dt.timedelta(days=KEEP_DAYS)).isoformat()
    return [b for b in keep if b['date'] >= cut]


def save(arc):
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(arc, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')


def update():
    """Canlı bülteni çek, arşive yaz. (ok, mesaj) döndürür; hata arşivi silmez."""
    arc = load()
    try:
        briefs = fetch()
    except Exception as e:
        arc['lastError'] = {'at': now_iso(), 'err': f'{type(e).__name__}: {e}'[:300]}
        save(arc) if arc.get('briefs') else None
        return False, arc['lastError']['err']
    arc = {'source': 'WinningCircle · Kıssadan Hisse', 'api': API, 'updatedAt': now_iso(),
           'briefs': merge(arc, briefs)}
    save(arc)
    return True, f"{len(briefs)} bülten alındı, arşivde {len(arc['briefs'])} gün"


if __name__ == '__main__':
    ok, msg = update()
    print(('OK ' if ok else 'HATA ') + msg)
    sys.exit(0)
