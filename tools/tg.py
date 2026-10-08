#!/usr/bin/env python3
"""Telegram'a mesaj ya da dosya gönderir (TG_TOKEN, TG_CHAT ortam değişkenleri). Anahtar yoksa sessizce çıkar.
Kullanım: python3 tools/tg.py "metin"   |   python3 tools/tg.py --doc dosya.pdf "açıklama" """
import json, os, sys, urllib.request, uuid
T, C = os.environ.get('TG_TOKEN', '').strip(), os.environ.get('TG_CHAT', '').strip()
if not (T and C):
    print('TG_TOKEN/TG_CHAT yok; gönderilmedi'); sys.exit(0)
a = sys.argv[1:]
if a and a[0] == '--doc':
    path, cap = a[1], (a[2] if len(a) > 2 else '')
    b = uuid.uuid4().hex
    parts = []
    for k, v in (('chat_id', C), ('caption', cap[:1000])):
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    parts.append(f'--{b}\r\nContent-Disposition: form-data; name="document"; filename="{os.path.basename(path)}"\r\nContent-Type: application/pdf\r\n\r\n'.encode()
                 + open(path, 'rb').read() + f'\r\n--{b}--\r\n'.encode())
    req = urllib.request.Request(f'https://api.telegram.org/bot{T}/sendDocument', data=b''.join(parts),
                                 headers={'Content-Type': f'multipart/form-data; boundary={b}'})
else:
    req = urllib.request.Request(f'https://api.telegram.org/bot{T}/sendMessage', headers={'Content-Type': 'application/json'},
                                 data=json.dumps({'chat_id': C, 'text': ' '.join(a)[:4000], 'disable_web_page_preview': True}).encode())
try:
    print(urllib.request.urlopen(req, timeout=30).status)
except Exception as e:
    print('telegram hata', e)
