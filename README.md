# Portföy Defteri

Kişisel portföy takip sitesi (GitHub Pages, statik). Pozisyonlar Supabase'de kullanıcıya bağlı saklanır.

- `index.html`, `style.css`, `app.js` — site
- `data/portfolio.json` — enstrüman analizleri, haberler, takvim, analist sinyalleri (günde 2 kez otomatik)
- `data/prices.json` — son fiyatlar (ABD seansında saatlik otomatik)
- `data/history.json` — 1 yıllık günlük kapanışlar
- `tools/` — otomatik görevlerin kullandığı birleştirme betikleri

Pozisyonlar (alış/satış) ve hedef ağırlıklar **repoda tutulmaz**; Supabase `user_settings` tablosunda
`portfoy_lots` ve `portfoy_settings` anahtarlarıyla kullanıcıya bağlı saklanır. API anahtarları repoya yazılmaz.
