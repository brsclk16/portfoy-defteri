#!/usr/bin/env python3
"""Aylık piyasa/portföy PDF raporu (fon ve hisse bazında; kişisel pozisyon içermez).
Kullanım: python3 tools/monthly_report.py [YYYY-MM] [çıktı.pdf]   (ay verilmezse bir önceki ay)
"""
import json, sys, os, datetime as dt, io
from bisect import bisect_right
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether
from reportlab.lib.styles import ParagraphStyle

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda n: json.load(open(os.path.join(ROOT, 'data', n + '.json'), encoding='utf-8'))
AY = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
THEMES = [('Yarı iletken',['SMH','SOXX','AMD','CRDO','ASML']),('AI altyapı',['VRT','DELL']),('Biyotek & sağlık',['XBI','AGNG']),('Değerli metal',['IAU','SLV']),('Sanayi metali',['COPX'])]
ORDER = ['SMH','SOXX','AMD','CRDO','ASML','VRT','DELL','XBI','AGNG','COPX','IAU','SLV']

pdfmetrics.registerFont(TTFont('DV', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DVB', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
st = lambda **k: ParagraphStyle('x', fontName=k.pop('f','DV'), fontSize=k.pop('s',9), leading=k.pop('l',12), textColor=k.pop('c',colors.HexColor('#1b1f27')), **k)
H1, H2, P, SM = st(f='DVB', s=17, l=21), st(f='DVB', s=11, l=15, spaceBefore=8, spaceAfter=4), st(), st(s=7.5, l=10, c=colors.HexColor('#5b6472'))
UP, DN = colors.HexColor('#11793b'), colors.HexColor('#b3261e')

def last_le(arr, d):
    ks = [x[0] for x in arr]; i = bisect_right(ks, d) - 1
    return arr[i][1] if i >= 0 else None

def fmt(v, d=1):
    if v is None: return '—'
    s = f'{abs(v):,.{d}f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    return ('+' if v > 0 else '−' if v < 0 else '') + '%' + s

def main():
    today = dt.date.today()
    if len(sys.argv) > 1 and len(sys.argv[1]) == 7: ym = sys.argv[1]
    else:
        f = today.replace(day=1) - dt.timedelta(days=1); ym = f.strftime('%Y-%m')
    out = sys.argv[2] if len(sys.argv) > 2 else f'/tmp/portfoy-rapor-{ym}.pdf'
    y, m = map(int, ym.split('-'))
    start = dt.date(y, m, 1); end = (dt.date(y + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1))
    d0 = (start - dt.timedelta(days=1)).isoformat(); d1 = min(end, today).isoformat()
    hist, port, macro = D('history'), D('portfolio'), D('macro')
    try: weekly = D('weekly').get('reports', [])
    except Exception: weekly = []
    try: divs = D('dividends').get('data', {})
    except Exception: divs = {}
    H = hist.get('series', hist) if isinstance(hist, dict) else hist
    fx0, fx1 = last_le(H.get('USDTRY', []), d0), last_le(H.get('USDTRY', []), d1)
    fxr = (fx1 / fx0 - 1) * 100 if fx0 and fx1 else None
    inst = port['instruments']
    own = [t for t in ORDER if t in inst and not inst[t].get('watchlist')] + sorted(t for t in inst if t not in ORDER and not inst[t].get('watchlist'))
    watch = [t for t in inst if inst[t].get('watchlist')]
    def ret(t, a, b):
        s = H.get(t, []); x, z = last_le(s, a), last_le(s, b)
        return (z / x - 1) * 100 if x and z else None
    rows = []
    for t in own + watch:
        r = ret(t, d0, d1)
        if r is None: continue
        ytd = ret(t, f'{y - 1}-12-31', d1)
        tl = ((1 + r / 100) * (1 + fxr / 100) - 1) * 100 if fxr is not None else None
        rows.append((t, r, tl, ytd, t in watch))
    spy = ret('SPY', d0, d1)
    g0, g1 = last_le(H.get('XAUUSD', []), d0), last_le(H.get('XAUUSD', []), d1)
    gold = ((g1 * fx1) / (g0 * fx0) - 1) * 100 if g0 and g1 and fx0 and fx1 else None
    cpi = (macro.get('cpi', {}).get('monthly', {}) or {}).get(ym)
    dep = (macro.get('deposit', {}) or {}).get('annualGross', 40)
    days = (dt.date.fromisoformat(d1) - dt.date.fromisoformat(d0)).days
    depm = ((1 + dep / 100) ** (days / 365) - 1) * 100
    eqw = sum(r[1] for r in rows if not r[4]) / max(1, len([r for r in rows if not r[4]]))
    eqw_tl = ((1 + eqw / 100) * (1 + (fxr or 0) / 100) - 1) * 100

    doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=14*mm, rightMargin=14*mm, topMargin=12*mm, bottomMargin=12*mm,
                            title=f'Portföy Defteri {AY[m-1]} {y}', author='Portföy Defteri')
    E = [Paragraph(f'Portföy Defteri · {AY[m-1]} {y} aylık rapor', H1),
         Paragraph(f'{d0} kapanışından {d1} kapanışına · fon ve hisse bazında · hazırlanma {today.strftime("%d.%m.%Y")}' + (' · <b>ay devam ediyor</b>' if end >= today else ''), SM), Spacer(1, 6)]
    # özet kutuları
    k = [['Eşit ağırlıklı portföy ($)', 'Eşit ağırlıklı portföy (₺)', 'S&P 500', 'Dolar/TL', 'Gram altın (₺)', 'TÜFE (aylık)', 'Mevduat (brüt)'],
         [fmt(eqw), fmt(eqw_tl), fmt(spy), fmt(fxr), fmt(gold), fmt(cpi) if cpi is not None else '—', fmt(depm)]]
    t = Table(k, colWidths=[26*mm]*7)
    t.setStyle(TableStyle([('FONT', (0,0), (-1,0), 'DV', 6.5), ('FONT', (0,1), (-1,1), 'DVB', 11), ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('TEXTCOLOR', (0,0), (-1,0), colors.HexColor('#5b6472')), ('BOX', (0,0), (-1,-1), .5, colors.HexColor('#d0d4da')),
        ('INNERGRID', (0,0), (-1,-1), .3, colors.HexColor('#e3e6ea')), ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f6f7f9')),
        ('TOPPADDING', (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5)]))
    E += [t, Spacer(1, 4), Paragraph('Kişisel pozisyonlarınla hesaplanmış rapor ve PDF için: brsclk16.github.io/portfoy-defteri/#/portfoy/rapor', SM)]

    # grafik
    rs = sorted([r for r in rows if not r[4]], key=lambda r: r[1])
    fig, ax = plt.subplots(figsize=(7.4, 2.6), dpi=170)
    ax.barh([r[0] for r in rs], [r[1] for r in rs], color=['#2e9e5b' if r[1] >= 0 else '#d0453a' for r in rs], height=.62)
    if spy is not None: ax.axvline(spy, color='#6b5bd6', lw=1, ls='--'); ax.text(spy, len(rs) - .4, ' S&P 500', color='#6b5bd6', fontsize=7)
    ax.axvline(0, color='#888', lw=.6); ax.tick_params(labelsize=7); ax.set_xlabel('Aylık getiri, dolar bazında (%)', fontsize=7)
    for s in ('top', 'right'): ax.spines[s].set_visible(False)
    plt.tight_layout(); buf = io.BytesIO(); plt.savefig(buf, format='png'); plt.close(fig); buf.seek(0)
    E += [Paragraph('Enstrümanların ay performansı', H2), Image(buf, width=182*mm, height=64*mm)]

    # tablo
    th = [['Enstrüman', 'Ay ($)', 'Ay (₺)', 'Yılbaşından ($)', 'Tema']]
    tmap = {x: n for n, ts in THEMES for x in ts}
    for r in sorted(rows, key=lambda r: (r[4], -r[1])):
        th.append([r[0] + (' (izleme)' if r[4] else ''), fmt(r[1]), fmt(r[2]), fmt(r[3]), tmap.get(r[0], '—')])
    tb = Table(th, colWidths=[38*mm, 26*mm, 26*mm, 30*mm, 50*mm], repeatRows=1)
    ts = [('FONT', (0,0), (-1,0), 'DVB', 8), ('FONT', (0,1), (-1,-1), 'DV', 8), ('ALIGN', (1,0), (3,-1), 'RIGHT'),
          ('LINEBELOW', (0,0), (-1,0), .6, colors.HexColor('#999')), ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f6f7f9')]),
          ('TOPPADDING', (0,0), (-1,-1), 2.5), ('BOTTOMPADDING', (0,0), (-1,-1), 2.5)]
    for i, r in enumerate(th[1:], 1):
        for j in (1, 2, 3):
            v = r[j]
            if v.startswith('+'): ts.append(('TEXTCOLOR', (j,i), (j,i), UP))
            elif v.startswith('−'): ts.append(('TEXTCOLOR', (j,i), (j,i), DN))
    tb.setStyle(TableStyle(ts)); E += [Spacer(1, 4), tb]

    # temalar
    tl = []
    for n, tss in THEMES:
        v = [r[1] for r in rows if r[0] in tss and not r[4]]
        if v: tl.append(f'<b>{n}</b> {fmt(sum(v)/len(v))}')
    E += [Paragraph('Temalar (ortalama, dolar bazında)', H2), Paragraph(' · '.join(tl), P)]

    # öne çıkanlar
    wk = [w for w in weekly if (w.get('weekEnd') or '')[:7] == ym]
    nw = [n for n in port.get('news', []) if (n.get('publishedAt') or '')[:7] == ym and n.get('importance', 0) >= 3][:6]
    if wk or nw:
        E.append(Paragraph('Ayın öne çıkanları', H2))
        for w in wk: E.append(Paragraph(f'• <b>{w.get("range") or w.get("weekEnd")}:</b> {w.get("title","")}', P))
        for n in nw: E.append(Paragraph(f'• {n.get("title","")} <font color="#5b6472">({", ".join(n.get("tickers") or [])})</font>', P))
    # gelecek ay
    nx = f'{y + (m == 12)}-{m % 12 + 1:02d}'
    ev = sorted([e for e in port.get('events', []) if (e.get('date') or '')[:7] == nx], key=lambda e: e['date'])[:10]
    dv = []
    for t, x in divs.items():
        for h in (x.get('hist') or []):
            pd_ = dt.date.fromisoformat(h[0])
            for add in (0, 365):
                d = (pd_ + dt.timedelta(days=add)).isoformat()
                if d[:7] == nx and not any(a[0] == t for a in dv): dv.append((t, d, h[1], add > 0))
    if ev or dv:
        blk = [Paragraph(f'{AY[(m) % 12]} takvimi', H2)]
        for e in ev: blk.append(Paragraph(f'• {e["date"][8:10]}.{e["date"][5:7]} — {e.get("title","")}' + (f' <font color="#5b6472">({", ".join(e.get("tickers") or [])})</font>' if e.get('tickers') else ''), P))
        for t, d, a, est in sorted(dv, key=lambda x: x[1]): blk.append(Paragraph(f'• {d[8:10]}.{d[5:7]} — {t} temettü hak edişi, pay başı ${a:.4f}' + (' (tahmini)' if est else ''), P))
        E.append(KeepTogether(blk))
    E += [Spacer(1, 8), Paragraph('*Eşit ağırlıklı portföy: portföydeki enstrümanların basit ortalaması (kişisel ağırlıkların yerine). ₺ getirisi dolar getirisi ile dolar/TL değişiminin bileşimidir. '
          'Kaynaklar: Twelve Data (fiyat ve kur), TÜİK (TÜFE), stockanalysis.com (temettü). Bu rapor bir değerlendirmedir, yatırım tavsiyesi değildir.', SM)]
    doc.build(E)
    best = max((r for r in rows if not r[4]), key=lambda r: r[1], default=None); worst = min((r for r in rows if not r[4]), key=lambda r: r[1], default=None)
    print(json.dumps({'pdf': out, 'month': f'{AY[m-1]} {y}', 'eqw': round(eqw, 2), 'eqwTL': round(eqw_tl, 2), 'spy': spy and round(spy, 2), 'usdtry': fxr and round(fxr, 2),
                      'best': best and [best[0], round(best[1], 1)], 'worst': worst and [worst[0], round(worst[1], 1)]}, ensure_ascii=False))

if __name__ == '__main__':
    main()
