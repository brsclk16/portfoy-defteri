"""API anahtarlarının tanımlı ve çalışır olduğunu kontrol eder; anahtar değerlerini yazmaz.
Sonuç: data/_diag/keys.json"""
import json, os, urllib.request, urllib.parse, datetime as dt

def env(*names):
    for n in names:
        v = os.environ.get(n, '').strip()
        if v:
            return n, v
    return None, None

def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {'User-Agent': 'PortfoyDefteri/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')[:300]
    except Exception as e:
        return 0, str(e)[:200]

out = {'at': dt.datetime.utcnow().isoformat(timespec='seconds') + 'Z'}

n, k = env('ALPHAVANTAGE_KEY', 'ALPHA_VANTAGE_KEY', 'AV_KEY', 'ALPHAVANTAGE')
if not k:
    out['alphavantage'] = {'ok': False, 'why': 'secret yok veya workflow env içinde değil'}
else:
    s, t = get('https://www.alphavantage.co/query?' + urllib.parse.urlencode({'function': 'GLOBAL_QUOTE', 'symbol': 'IBM', 'apikey': k}))
    try:
        j = json.loads(t)
    except Exception:
        j = {}
    ok = bool(j.get('Global Quote'))
    out['alphavantage'] = {'ok': ok, 'secret': n, 'http': s, 'why': None if ok else (j.get('Information') or j.get('Error Message') or j.get('Note') or t[:200])}

n, k = env('FRED_KEY', 'FRED_API_KEY', 'FRED')
if not k:
    out['fred'] = {'ok': False, 'why': 'secret yok veya workflow env içinde değil'}
else:
    s, t = get('https://api.stlouisfed.org/fred/series?' + urllib.parse.urlencode({'series_id': 'CPIAUCSL', 'api_key': k, 'file_type': 'json'}))
    ok = s == 200 and '"seriess"' in t
    out['fred'] = {'ok': ok, 'secret': n, 'http': s, 'why': None if ok else t[:200]}

n, k = env('EVDS_KEY')
if not k:
    out['evds'] = {'ok': False, 'why': 'secret yok veya workflow env içinde değil'}
else:
    res = {}
    for base in ('https://evds3.tcmb.gov.tr/igmevdsms-dis/', 'https://evds2.tcmb.gov.tr/service/evds/'):
        url = base + 'series=TP.DK.USD.A.YTL&startDate=01-09-2026&endDate=05-10-2026&type=json'
        s, t = get(url, {'key': k, 'User-Agent': 'Mozilla/5.0'})
        res[base.split('/')[2]] = {'http': s, 'ok': s == 200 and '"items"' in t, 'snip': None if (s == 200 and '"items"' in t) else t[:150]}
    out['evds'] = {'ok': any(v['ok'] for v in res.values()), 'secret': n, 'bases': res}

os.makedirs('data/_diag', exist_ok=True)
json.dump(out, open('data/_diag/keys.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False, indent=1))
