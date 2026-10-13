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
- `data/kissadan.json` — WinningCircle "Kıssadan Hisse" Türkçe sabah bülteni arşivi (son 30 gün, günde ~15 haber).
  `tools/fetch_kissadan.py` anahtarsız uç noktadan (`api.winningcircle.io/landing/morningBrief/recent`) her sabah TR 08:47'de
  çeker (`kissadan.yml`); API düşerse arşiv korunur. Haber toplayıcı (`fetch_news.py`) bu bülteni `winningcircle` kaynağı olarak
  ham habere ekler, portföy hisselerini Türkçe metinden eşler; Türkçe olduğu için çeviriye gönderilmez. Haberler sayfasında ayrı bölüm.

## İş akışı kuyrukları
GitHub Actions'ta aynı `concurrency` grubunda en fazla bir bekleyen iş durur; yenisi gelince bekleyen iptal edilir. Eskiden 9 iş akışı tek `repo-yazma`
grubunu paylaşıyordu ve veri toplama çalışmaları sessizce kayboluyordu. Gruplar artık gerçekte yazılan dosyalara göre (git geçmişinden çıkarıldı):
- `veri-temel`: `icgoru.yml`, `talep.yml`, `evren.yml` — ortak dosyalar: `analysts`, `valuation`, `earnhist`, `dividends`, `inst13f`, `insider`, `fundhold`, `peers`, `universe`
- kendi kuyruğunda: `fiyat`, `alarm`, `veri`, `uzun`, `haber`, `piyasa`, `anahtar`, `kissadan`, `sinyal`, `olay`, `fikir` — her biri yalnızca kendi dosyalarını yazar
Yeni bir iş akışı başka bir iş akışının yazdığı dosyayı yazacaksa aynı gruba konmalı (itme döngüsündeki `-X theirs`, aynı dosyada eşzamanlı güncellemeyi ezer).
