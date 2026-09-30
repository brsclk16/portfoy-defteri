# Portföy Defteri

Kişisel portföy takip sitesi (GitHub Pages, statik). Pozisyonlar Supabase'de kullanıcıya bağlı saklanır.

- `index.html`, `style.css`, `app.js` — site
- `data/portfolio.json` — enstrüman analizleri, haberler, takvim, analist sinyalleri (günde 2 kez otomatik)
- `data/prices.json` — son fiyatlar (ABD seansında saatlik otomatik)
- `data/history.json` — 1 yıllık günlük kapanışlar
- `tools/` — otomatik görevlerin kullandığı birleştirme betikleri
- `data/universe.json` — Fikir tarayıcı evreni (~200 şirket). `tools/fetch_universe.py` her iş günü iki kez (GitHub Actions: `evren.yml`)
  ücretsiz kaynaklardan çapraz doğrulamalı olarak günceller: Yahoo Finance (günlük geçmiş → getiriler, 50/200g ort., 52h aralık, beta hesabı),
  Nasdaq.com (fiyat, F/K, piyasa değeri), Finnhub (fiyat, F/K), SEC EDGAR (EPS'ten F/K kontrolü), Stooq / FMP / Twelve Data (yedek).
  Fiyat en az iki kaynakla doğrulanır; uyuşmazlıklar `data/_diag/universe.json`'a yazılır. İsteğe bağlı `TWELVEDATA_KEY` secret'ı yedek kaynağı açar.

Pozisyonlar (alış/satış) ve hedef ağırlıklar **repoda tutulmaz**; Supabase `user_settings` tablosunda
`portfoy_lots` ve `portfoy_settings` anahtarlarıyla kullanıcıya bağlı saklanır. API anahtarları repoya yazılmaz.
