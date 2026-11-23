#!/usr/bin/env python3
"""Publish product pages and a free-listings feed from the public shop catalog.

Reads only getWebProductCatalog. Does not read orders, customers or staff data.
Rejects malformed/partial responses before writing any generated files.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
from html import escape, unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import secrets
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'config/merchant.json').read_text())
DEFAULTS = {p['id']: p for p in json.loads((ROOT / 'config/merchant-defaults.json').read_text())['products']}
ORIGIN = CONFIG['origin']
G = 'http://base.google.com/ns/1.0'
S = 'http://www.sitemaps.org/schemas/sitemap/0.9'
CATEGORIES = {'panna': '鮮奶酪', 'pudding': '烤布丁', 'snowflake': '雪花酥', 'coffee': '咖啡'}


class TextOnly(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

    def handle_starttag(self, tag, attrs):
        if tag in ('br', 'p', 'div'):
            self.parts.append(' ')


def plain(value):
    parser = TextOnly()
    parser.feed(str(value))
    return ' '.join(unescape(''.join(parser.parts)).split())


def decode_js_string(value):
    def replace(match):
        token = match[1]
        if token[0] in 'xu':
            return chr(int(token[1:], 16))
        return {'n': '\n', 'r': '\r', 't': '\t', 'b': '\b', 'f': '\f', 'v': '\v', '0': '\0'}.get(token, token)
    return re.sub(r'\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|[^\r\n])', replace, value)


def parse_bridge(body, nonce=None):
    for token in re.findall(r'"((?:[^"\\]|\\.)*)"', body):
        if 'userHtml' not in token:
            continue
        wrapper = json.loads(decode_js_string(token))
        html = wrapper.get('userHtml', '')
        if 'var message=' not in html:
            continue
        message, _ = json.JSONDecoder().raw_decode(html.split('var message=', 1)[1])
        if (message.get('action') != 'getWebProductCatalog' or
                message.get('apiVersion') != CONFIG['clientVersion'] or
                (nonce is not None and message.get('nonce') != nonce)):
            raise ValueError('Unexpected catalog response')
        return message['result']
    raise ValueError('Public catalog response format changed')


def fetch_catalog():
    source = (ROOT / CONFIG['source']).read_text()
    match = re.search(r'const TRAFFIC_SCRIPT_URL = "(https://script\.google\.com/macros/s/[^"\s]+/exec)"', source)
    if not match:
        raise ValueError('Public catalog endpoint missing')
    nonce = secrets.token_hex(16)
    payload = {'action': 'getWebProductCatalog', 'clientVersion': CONFIG['clientVersion']}
    encoded = urllib.parse.urlencode({
        'action': 'checkoutBridge', 'checkoutOrigin': ORIGIN, 'checkoutNonce': nonce,
        'checkoutPayload': json.dumps(payload),
    }).encode()
    request = urllib.request.Request(match[1], data=encoded, method='POST',
                                    headers={'Content-Type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(request, timeout=90) as response:
        body = response.read(2_000_001)
    if len(body) > 2_000_000:
        raise ValueError('Catalog response is too large')
    return parse_bridge(body.decode('utf-8'), nonce)


def image_path(value):
    if not isinstance(value, str) or len(value) > 200:
        raise ValueError('Invalid image path')
    path = value.removeprefix(ORIGIN + '/').removeprefix('./').lstrip('/')
    parts = path.split('/')
    decoded = [urllib.parse.unquote(p) for p in parts]
    if (not parts or any(not p or p in ('.', '..') or re.search(r'[\x00-\x1f\x7f\\/:<>"\x27?#%&]', p) for p in decoded)
            or not re.search(r'\.(?:jpe?g|png|webp|gif|avif)$', path, re.I)):
        raise ValueError('Invalid image path')
    return '/'.join(urllib.parse.quote(p, safe='-_ .') for p in decoded).replace(' ', '%20')


def normalize(snapshot):
    if (snapshot.get('success') is not True or snapshot.get('schema') != CONFIG['schema'] or
            snapshot.get('version') != CONFIG['version'] or not isinstance(snapshot.get('products'), list) or
            not isinstance(snapshot.get('edits'), dict)):
        raise ValueError('Invalid public catalog snapshot')
    result = []
    seen = set()
    for record in snapshot['products']:
        pid = record.get('id')
        if type(pid) is not int or pid < 1 or pid in seen:
            raise ValueError('Invalid or duplicate product ID')
        seen.add(pid)
        base = DEFAULTS.get(pid)
        if base is None and pid < 100:
            raise ValueError('Default product definitions need updating')
        fields = {**(record.get('fields') or {}), **snapshot['edits'].get(str(pid), {})}
        base = base or {}
        title = plain(fields.get('title', record.get('name', '')))
        price = fields.get('price', base.get('price'))
        category = record.get('category')
        minimum = record.get('minimumQuantity', 1)
        lead = record.get('leadDays', 1)
        if (not title or len(title) > 64 or type(price) is not int or not 1 <= price <= 99999 or
                category not in CATEGORIES or type(minimum) is not int or not 1 <= minimum <= 999 or
                type(lead) is not int or not 1 <= lead <= 30):
            raise ValueError('Invalid product attributes')
        images = record.get('images', [])
        if not isinstance(images, list) or not 1 <= len(images) <= 8:
            raise ValueError('Missing product image')
        images = [image_path(p) for p in images]
        if any(not (ROOT / urllib.parse.unquote(p)).is_file() for p in images):
            raise ValueError('Product image does not exist in the website repository')
        result.append({
            'id': pid, 'sku': 'HP-' + str(pid), 'slug': str(pid), 'name': title,
            'title': title + (f'（{minimum}杯組）' if minimum > 1 and category in ('panna', 'pudding') else ''),
            'category': category, 'unitPrice': price, 'quantity': minimum, 'price': price * minimum,
            'images': images, 'leadDays': lead,
            'subtitle': plain(fields.get('subtitle', '')),
            'description': plain(fields.get('description', base.get('desc', ''))),
            'ingredients': plain(fields.get('ingredients', base.get('ingredients', ''))),
            'netWeight': plain(fields.get('netWeight', f"{base['weight']}g／包" if base.get('weight') else '')),
            'shipping': category in ('panna', 'pudding'),
        })
    expected = {pid for pid in DEFAULTS if pid != 13}
    if not expected.issubset(seen) or not 1 <= len(result) <= 300:
        raise ValueError('Partial public catalog; previous files have been preserved')
    result.sort(key=lambda p: list(DEFAULTS).index(p['id']) if p['id'] in DEFAULTS else 10000 + p['id'])
    return result


def gifts(products):
    by_id = {p['id']: p for p in products}
    result = []
    for gift in CONFIG['gifts']:
        items = [(by_id[int(pid)], qty) for pid, qty in gift['products'].items()]
        if any(p['quantity'] != 1 or not p['shipping'] for p, _ in items):
            continue
        result.append({
            'id': gift['id'], 'sku': 'HP-' + gift['id'].upper(), 'slug': gift['id'], 'name': gift['name'],
            'title': gift['name'], 'category': 'gift', 'quantity': 6,
            'price': sum(p['unitPrice'] * qty for p, qty in items),
            'images': ['assets/gifts-20261123/gift-hero-1108.webp'] + [p['images'][0] for p, _ in items],
            'leadDays': max(p['leadDays'] for p, _ in items),
            'subtitle': '、'.join(p['name'] + f'×{qty}杯' for p, qty in items),
            'description': '六杯鮮奶酪裝盒，口味與數量依本頁組合。禮盒腰封依當期包裝安排，照片為盒裝示意。',
            'ingredients': '；'.join(p['name'] + '：' + p['ingredients'] for p, _ in items),
            'netWeight': '每杯規格依各口味標示，共6杯', 'shipping': True,
        })
    return result


def url(product):
    return ORIGIN + '/products/' + product['slug'] + '.html'


def display_image(path, sizes):
    source = Path(urllib.parse.unquote(path))
    media = ROOT / 'assets/media-20261123'
    variants = sorted(media.glob(source.stem + '-*.webp'))
    if not variants and source.parent.as_posix() == 'assets/gifts-20261123':
        stem = re.sub(r'-\d+$', '', source.stem)
        variants = sorted((ROOT / source.parent).glob(stem + '-*.webp'))
    entries = []
    for variant in variants:
        match = re.search(r'-(\d+)\.webp$', variant.name)
        if match:
            entries.append((int(match[1]), variant.relative_to(ROOT).as_posix()))
    if not entries:
        return f'src="/{escape(path, quote=True)}"'
    entries.sort()
    srcset = ', '.join('/' + name + ' ' + str(width) + 'w' for width, name in entries)
    return f'src="/{entries[0][1]}" srcset="{escape(srcset, quote=True)}" sizes="{escape(sizes, quote=True)}"'


def shipping_note(product):
    if product['category'] == 'snowflake':
        return '含雪花酥的整筆訂單僅限門市取貨。常溫保存期限：取貨日起8–10天；外包裝袋顏色隨機搭配不指定。'
    if product['category'] == 'coffee':
        return '提供門市自取或符合區域與杯數條件的預約外送。咖啡請於購物車選擇冰／熱。'
    return '需冷藏保存，保存期限依杯蓋標示。可門市自取；冷藏宅配奶酪與布丁合計需6杯的倍數，折扣前商品小計最低300元。彰化市指定區域預約外送需滿12杯。'


def contents_note(product):
    text = product['netWeight'] or '規格依商品包裝標示'
    if product['quantity'] > 1 and product['category'] in ('panna', 'pudding'):
        return f"每杯{text}；共{product['quantity']}杯"
    return text


def page(title, description, path, body, structured=None):
    data = '' if structured is None else '<script type="application/ld+json">' + json.dumps(structured, ensure_ascii=False).replace('<', '\\u003c') + '</script>'
    social_image = structured.get('image', [ORIGIN + '/logo.jpg'])[0] if structured else ORIGIN + '/logo.jpg'
    return f'''<!doctype html>
<html lang="zh-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}｜Hello 好酪</title><meta name="description" content="{escape(description, quote=True)}">
<meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="{ORIGIN}{path}">
<meta property="og:type" content="website"><meta property="og:locale" content="zh_TW"><meta property="og:title" content="{escape(title, quote=True)}｜Hello 好酪"><meta property="og:description" content="{escape(description, quote=True)}"><meta property="og:url" content="{ORIGIN}{path}">
<meta property="og:image" content="{escape(social_image, quote=True)}"><meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/assets/product-pages.css">{data}<script defer src="/assets/product-pages.js"></script></head>
<body><header><a class="brand" href="/">Hello 好酪</a><nav aria-label="主要選單"><a href="/products/">商品詳情</a><a href="/delivery.html">配送說明</a><a href="/store.html">彰化門市</a><a href="/contact.html">聯絡好酪</a><a href="/#menu-list">線上訂購</a></nav></header>
<main>{body}</main><footer><div><strong>Hello 好酪｜甲賀食品</strong><p>彰化市中正路一段403號<br>週二至週六10:00–18:00；週日、週一固定公休</p><p><a href="tel:0972005078">{CONFIG['phone']}</a> · <a href="mailto:{CONFIG['email']}">{CONFIG['email']}</a></p><p>統編94427773 · 食品登錄 N-194427773-00000-4 · 已投保產品責任險</p><nav><a href="/contact.html">聯絡好酪</a><a href="/returns.html">退貨、換貨與退款</a><a href="/delivery.html">配送說明</a><a href="{CONFIG['line']}">官方LINE</a></nav></div></footer></body></html>\n'''


def product_page(product, updated):
    p = product
    image_tags = ''.join(f'<img {display_image(image, "(max-width:800px) calc(100vw - 36px), 552px")} alt="{escape(p["name"], quote=True)}商品照片{i+1}" width="800" height="1067" decoding="async" {"loading=lazy" if i else "fetchpriority=high"}>' for i, image in enumerate(p['images']))
    if p['category'] == 'gift':
        cta = '/#hp-bundles'
        price_note = '每盒6杯，依本頁固定口味組合計價。'
    else:
        cta = '/#menu-item-' + str(p['id'])
        unit = '包' if p['category'] == 'snowflake' else '杯'
        price_note = (f'每筆{p["quantity"]}{unit}起訂；每{unit}NT$ {p["unitPrice"]:,}，本頁價格為{p["quantity"]}{unit}合計。'
                      if p['quantity'] > 1 else f'每{unit}售價。')
    indicators = f'<div class="gallery-controls"><button type="button" data-gallery-prev aria-label="上一張照片">上一張</button><output aria-live="polite">1 / {len(p["images"])}</output><button type="button" data-gallery-next aria-label="下一張照片">下一張</button></div>' if len(p['images']) > 1 else ''
    lead = '取貨日期依各商品備貨天數、店休日與官網開放日期安排；可選日期於購物車確認。'
    body = f'''<p class="breadcrumb"><a href="/products/">商品詳情</a> / {escape(p['name'])}</p>
<article class="product"><section class="media" aria-label="{escape(p['name'], quote=True)}商品照片"><div class="gallery">{image_tags}</div>{indicators}</section>
<section class="details"><p class="eyebrow">{escape(CATEGORIES.get(p['category'], '六入禮盒'))}</p><h1>{escape(p['title'])}</h1><p class="price">NT$ {p['price']:,}</p><p>{escape(price_note)}</p>
<p class="subtitle">{escape(p['subtitle'])}</p><p>{escape(p['description'])}</p><dl><dt>內容與規格</dt><dd>{escape(contents_note(p))}</dd><dt>成分</dt><dd>{escape(p['ingredients'])}</dd><dt>取貨與保存</dt><dd>{escape(shipping_note(p))}</dd><dt>備貨與日期</dt><dd>{escape(lead)}</dd></dl>
<a class="button primary" href="{cta}">前往選購{escape(p['name'])}</a><p class="fine">商品可預訂製作。運費、優惠及可取貨日期於購物車確認。</p><p><a href="/delivery.html">配送費用與門檻</a> · <a href="/returns.html">退換貨與退款政策</a> · <a href="/contact.html">聯絡好酪</a></p></section></article>'''
    offer = {'@type': 'Offer', 'url': url(p), 'price': str(p['price']), 'priceCurrency': 'TWD',
             'availability': 'https://schema.org/InStock', 'itemCondition': 'https://schema.org/NewCondition',
             'seller': {'@type': 'Organization', 'name': CONFIG['brand']}}
    if p['shipping']:
        offer['hasMerchantReturnPolicy'] = {'@type': 'MerchantReturnPolicy', 'applicableCountry': 'TW',
            'returnPolicyCategory': 'https://schema.org/MerchantReturnNotPermitted',
            'merchantReturnLink': ORIGIN + '/returns.html'}
    structured = {'@context': 'https://schema.org', '@type': 'Product' if p['shipping'] else 'MenuItem', '@id': url(p) + '#product',
                  'name': p['title'], 'description': p['description'] + ' ' + shipping_note(p),
                  'sku': p['sku'], 'brand': {'@type': 'Brand', 'name': CONFIG['brand']},
                  'image': [ORIGIN + '/' + i for i in p['images']], 'offers': offer,
                  'additionalProperty': [{'@type': 'PropertyValue', 'name': '內容規格', 'value': contents_note(p)},
                                         {'@type': 'PropertyValue', 'name': '成分', 'value': p['ingredients']}]}
    return page(p['title'], f"{p['title']} NT$ {p['price']:,}。{p['description']} {shipping_note(p)}", '/products/' + p['slug'] + '.html', body, structured)


def catalog_page(products):
    sections = []
    for category, name in [('gift', '六入禮盒'), *CATEGORIES.items()]:
        cards = ''.join(f'<a class="product-card" href="/products/{p["slug"]}.html"><img {display_image(p["images"][0], "(max-width:800px) 45vw, 270px")} alt="{escape(p["name"], quote=True)}" loading="lazy" width="400" height="400"><h3>{escape(p["title"])}</h3><p>NT$ {p["price"]:,}</p></a>' for p in products if p['category'] == category)
        if cards:
            sections.append(f'<section><h2>{name}</h2><div class="cards">{cards}</div></section>')
    return page('奶酪、烤布丁與禮盒商品詳情', '查看Hello 好酪各口味照片、成分、規格、價格與訂購條件。', '/products/', '<h1>挑一份喜歡的甜點</h1><p>先看看口味、成分與規格，再到購物車選擇取貨方式。</p>' + ''.join(sections))


def contact_page():
    body = f'''<article class="text-page"><p class="eyebrow">HELLO 好酪 · 聯絡我們</p><h1>聯絡好酪</h1>
<p>訂單、取貨安排、商品問題或退款需求，都可以透過以下方式與我們聯絡。</p>
<div class="contact-grid"><section class="panel"><h2>客服管道</h2><p>電話：<a href="tel:0972005078">{CONFIG['phone']}</a></p><p>Email：<a href="mailto:{CONFIG['email']}">{CONFIG['email']}</a></p><p><a class="button primary" href="{CONFIG['line']}">聯絡官方LINE</a></p><p>LINE官方帳號：@817ytyld</p></section>
<section class="panel"><h2>彰化門市</h2><p>彰化縣彰化市中正路一段403號</p><p>週二至週六10:00–18:00<br>週日、週一固定公休</p><p>門市地址為預訂取貨地點。取貨日期與時段請依官網開放選項安排。</p><p><a href="/store.html">門市資訊與導航</a></p></section></div>
<h2>詢問訂單時，請提供</h2><p>訂單編號、訂購人姓名與聯絡手機。如有商品或包裝問題，可附上照片，方便我們核對。請勿提供信用卡安全碼、網銀密碼或簡訊驗證碼。</p>
<h2>商家資訊</h2><p>Hello 好酪｜甲賀食品<br>統一編號：94427773<br>食品業者登錄字號：N-194427773-00000-4<br>已投保產品責任險</p>
<p><a href="/returns.html">退貨、換貨與退款政策</a> · <a href="/delivery.html">宅配運費與預約外送說明</a></p></article>'''
    structured = {'@context': 'https://schema.org', '@type': 'ContactPage', 'url': ORIGIN + '/contact.html',
        'name': '聯絡Hello 好酪', 'mainEntity': {'@type': 'Organization', 'name': CONFIG['brand'],
        'url': ORIGIN, 'telephone': '+886-972-005-078', 'email': CONFIG['email']}}
    return page('聯絡好酪・客服與彰化門市', 'Hello 好酪訂單、取貨及商品問題客服：0972-005-078、官方LINE與客服Email。', '/contact.html', body, structured)


def returns_page():
    body = f'''<article class="text-page"><p class="eyebrow">HELLO 好酪 · 訂購說明</p><h1>退貨、換貨與退款政策</h1>
<p>本頁說明官網訂購商品的售後處理方式。若收到的商品有問題，請先與好酪聯絡，我們會核對訂單並協助處理。</p>
<h2>冷藏現做食品與非瑕疵退貨</h2><p>鮮奶酪、烤布丁等冷藏現做食品，屬易於腐敗、保存期限較短的商品；符合通訊交易解除權合理例外情事且已於訂購前告知者，不適用七日無理由解除權。此類商品非因商品瑕疵或運送問題，拆封或食用後恕不接受退貨。</p>
<p>其他商品依商品性質、商品頁說明與適用法令辦理；商品有瑕疵時的權益不受上述限制影響。</p>
<h2>商品瑕疵、破損或訂單內容有誤</h2><p>收到商品後請盡速確認。如遇商品本身有瑕疵、運送碰撞損壞，或品項、數量與訂單不符，請立即透過下方客服管道聯絡，並提供訂單編號、問題說明及商品與包裝照片。商品請依原標示妥善保存。</p>
<h2>退款與換貨怎麼處理？</h2><p>核對問題後，由專人依商品與訂單狀況協助退款或換貨；需要回收商品時，請先與客服確認方式，勿自行寄回冷藏食品。退款方式、金額與實際入帳時間，會由客服依原付款方式及金流處理情況說明。</p>
<div class="notice"><strong>退款防詐提醒</strong><p>好酪不會要求你操作ATM解除分期、轉帳繳交退款保證金，或提供網銀密碼、信用卡安全碼及簡訊驗證碼。對聯絡內容有疑慮時，請自行撥打本頁的客服電話查證。</p></div>
<h2>聯絡客服</h2><p>電話：<a href="tel:0972005078">{CONFIG['phone']}</a><br>Email：<a href="mailto:{CONFIG['email']}">{CONFIG['email']}</a><br>官方LINE：<a href="{CONFIG['line']}">@817ytyld</a></p><p>門市營業時間：週二至週六10:00–18:00，週日、週一固定公休。</p>
<p class="fine">相關說明可參閱<a href="https://cpc.ey.gov.tw/Page/7167B631B7C52AFD/ce1bf5f1-b806-4e98-9e59-a0f9a5b16aa2">行政院消費者保護處食品通訊交易說明</a>。</p></article>'''
    return page('退貨、換貨與退款政策', 'Hello 好酪冷藏食品退換貨說明、商品破損與瑕疵處理方式，以及退款防詐提醒與客服管道。', '/returns.html', body)


def feed(products):
    ET.register_namespace('g', G)
    root = ET.Element('rss', {'version': '2.0'})
    channel = ET.SubElement(root, 'channel')
    for key, value in [('title', 'Hello 好酪官方商品'), ('link', ORIGIN + '/products/'), ('description', 'Hello 好酪公開商品資料；免費產品資訊')]:
        ET.SubElement(channel, key).text = value
    count = 0
    for p in products:
        if not p['shipping']:
            continue
        item = ET.SubElement(channel, 'item')
        description = ' '.join(filter(None, [p['subtitle'], p['description'], '成分：' + p['ingredients'], '規格：' + contents_note(p), shipping_note(p)]))
        attrs = {'id': p['sku'], 'title': p['title'], 'description': description[:5000], 'link': url(p),
                 'image_link': ORIGIN + '/' + p['images'][0], 'price': f"{p['price']:.2f} TWD",
                 'availability': 'in_stock', 'condition': 'new', 'brand': CONFIG['brand'], 'mpn': p['sku'],
                 'product_type': CATEGORIES.get(p['category'], '六入禮盒'), 'google_product_category': '412',
                 'included_destination': 'Free_listings', 'excluded_destination': 'Shopping_ads',
                 'shipping_label': 'refrigerated-dessert'}
        for name, value in attrs.items():
            ET.SubElement(item, '{' + G + '}' + name).text = value
        for image in p['images'][1:]:
            ET.SubElement(item, '{' + G + '}additional_image_link').text = ORIGIN + '/' + image
        # An outlier price may invalidate price-based account shipping tiers.
        # Override with the published maximum shipping fee, never underestimate it.
        if p['category'] != 'gift' and not 50 <= p['unitPrice'] <= 65:
            shipping = ET.SubElement(item, '{' + G + '}shipping')
            ET.SubElement(shipping, '{' + G + '}country').text = 'TW'
            ET.SubElement(shipping, '{' + G + '}price').text = '210.00 TWD'
        count += 1
    ET.indent(root, space='  ')
    return ET.tostring(root, encoding='utf-8', xml_declaration=True).decode() + '\n', count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--snapshot', type=Path, help='Use a previously validated public catalog response for local checks')
    args = parser.parse_args()
    snapshot = json.loads(args.snapshot.read_text()) if args.snapshot else fetch_catalog()
    products = normalize(snapshot)
    products += gifts(products)
    content_hash = hashlib.sha256(json.dumps(products, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    old_path = ROOT / 'assets/merchant-catalog.json'
    old = json.loads(old_path.read_text()) if old_path.exists() else {}
    updated = old.get('updatedAt') if old.get('contentHash') == content_hash else datetime.now(timezone.utc).isoformat(timespec='seconds')
    snapshot_data = {'contentHash': content_hash, 'updatedAt': updated, 'products': products}
    output = {ROOT / 'assets/merchant-catalog.json': json.dumps(snapshot_data, ensure_ascii=False, indent=2) + '\n',
              ROOT / 'products/index.html': catalog_page(products), ROOT / 'contact.html': contact_page(),
              ROOT / 'returns.html': returns_page()}
    for product in products:
        output[ROOT / 'products' / (product['slug'] + '.html')] = product_page(product, updated)
    xml, count = feed(products)
    output[ROOT / 'merchant-products.xml'] = xml
    # Merge owned product URLs into the existing sitemap; preserve other pages and image entries.
    sitemap = ET.parse(ROOT / 'sitemap.xml')
    sitemap_root = sitemap.getroot()
    managed = {ORIGIN + '/products/', ORIGIN + '/contact.html', ORIGIN + '/returns.html'} | {url(p) for p in products}
    existing = {entry.findtext('{' + S + '}loc'): entry for entry in sitemap_root}
    for loc in sorted(managed):
        entry = existing.get(loc)
        if entry is None:
            entry = ET.SubElement(sitemap_root, '{' + S + '}url')
            ET.SubElement(entry, '{' + S + '}loc').text = loc
        lastmod = entry.find('{' + S + '}lastmod')
        if lastmod is None:
            lastmod = ET.SubElement(entry, '{' + S + '}lastmod')
        lastmod.text = updated[:10]
    for loc, entry in existing.items():
        if loc and loc.startswith(ORIGIN + '/products/') and loc not in managed:
            sitemap_root.remove(entry)
    ET.register_namespace('', S)
    ET.register_namespace('image', 'http://www.google.com/schemas/sitemap-image/1.1')
    ET.indent(sitemap_root, space='  ')
    output[ROOT / 'sitemap.xml'] = ET.tostring(sitemap_root, encoding='utf-8', xml_declaration=True).decode() + '\n'
    # All validation/rendering has completed. A failed fetch never writes an empty feed.
    changed = 0
    for path, content in output.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists() or path.read_text() != content:
            path.write_text(content)
            changed += 1
    owned = {p['slug'] + '.html' for p in products} | {'index.html'}
    for path in (ROOT / 'products').glob('*.html'):
        if path.name not in owned and re.fullmatch(r'(?:\d+|gift-[a-z]+)\.html', path.name):
            path.unlink()
    print(f'Validated {len(products)} product pages; {count} shippable free-listing products; {changed} files updated.')


if __name__ == '__main__':
    main()
