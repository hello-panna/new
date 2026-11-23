import importlib.util
import json
from pathlib import Path
import re
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('merchant_sync', ROOT / 'scripts/sync-merchant-catalog.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class MerchantPublicationTests(unittest.TestCase):
    def test_feed_price_and_sku_match_visible_product_page(self):
        namespace = {'g': 'http://base.google.com/ns/1.0'}
        items = ET.parse(ROOT / 'merchant-products.xml').findall('channel/item')
        self.assertGreaterEqual(len(items), 16)
        seen = set()
        for item in items:
            sku = item.findtext('g:id', namespaces=namespace)
            self.assertNotIn(sku, seen)
            seen.add(sku)
            path = item.findtext('g:link', namespaces=namespace).removeprefix(sync.ORIGIN + '/')
            html = (ROOT / path).read_text()
            schema = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)[1])
            amount = item.findtext('g:price', namespaces=namespace).split()[0]
            self.assertEqual(float(amount), float(schema['offers']['price']))
            self.assertEqual(sku, schema['sku'])
            self.assertIn('NT$ ' + format(int(float(amount)), ','), html)
            self.assertEqual(item.findtext('g:included_destination', namespaces=namespace), 'Free_listings')
            self.assertEqual(item.findtext('g:excluded_destination', namespaces=namespace), 'Shopping_ads')

    def test_pickup_only_products_are_not_in_shipping_feed(self):
        items = ET.parse(ROOT / 'merchant-products.xml').findall('channel/item')
        ids = {item.findtext('{http://base.google.com/ns/1.0}id') for item in items}
        for pid in (16, 18, 22, 23, 24):
            self.assertNotIn('HP-' + str(pid), ids)

    def test_minimum_quantity_is_priced_as_the_purchasable_pack(self):
        products = json.loads((ROOT / 'assets/merchant-catalog.json').read_text())['products']
        for product in products:
            if product['category'] != 'gift':
                self.assertEqual(product['price'], product['quantity'] * product['unitPrice'])
                if product['quantity'] > 1 and product['category'] in ('panna', 'pudding'):
                    self.assertIn(str(product['quantity']) + '杯組', product['title'])

    def test_outlier_prices_use_a_non_underestimated_shipping_override(self):
        product = dict(json.loads((ROOT / 'assets/merchant-catalog.json').read_text())['products'][0])
        product.update(unitPrice=25, quantity=1, price=25)
        xml, _ = sync.feed([product])
        item = ET.fromstring(xml).find('channel/item')
        self.assertEqual(item.findtext('{http://base.google.com/ns/1.0}shipping/{http://base.google.com/ns/1.0}price'), '210.00 TWD')

    def test_partial_catalog_and_unsafe_images_are_rejected(self):
        with self.assertRaises(ValueError):
            sync.normalize({'success': True, 'version': sync.CONFIG['version'],
                'schema': sync.CONFIG['schema'], 'products': [], 'edits': {}})
        for path in ('../secret.jpg', '%2e%2e/secret.jpg', 'https://bad.example/photo.jpg', 'x.png?token=1'):
            with self.assertRaises(ValueError):
                sync.image_path(path)

    def test_page_content_cannot_inject_markup_or_scripts(self):
        products = json.loads((ROOT / 'assets/merchant-catalog.json').read_text())['products']
        p = dict(products[0], title='商品</script><script>alert(1)</script>', ingredients='<img src=x onerror=alert(1)>')
        html = sync.product_page(p, '2026-11-23')
        self.assertNotIn('<script>alert(1)</script>', html)
        self.assertNotIn('<img src=x', html)
        schema = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)[1])
        self.assertEqual(schema['name'], p['title'])

    def test_current_shipping_tiers_match_all_mixed_cup_totals(self):
        # A valid shipped dessert order has a multiple of six cups.
        # For current 50/55/60/65 prices, every possible total lies on this 5-dollar grid.
        for cups in range(6, 67, 6):
            for raw in range(50 * cups, 65 * cups + 1, 5):
                checkout = 130 if cups <= 12 else 170 if cups <= 48 else 210
                checkout = 0 if raw >= 2000 else max(0, checkout - (50 if raw >= 1200 else 0))
                merchant = 0 if raw >= 2000 else 120 if raw >= 1200 else 170 if raw >= 900 else 130
                self.assertEqual(merchant, checkout, (cups, raw))


if __name__ == '__main__':
    unittest.main()
