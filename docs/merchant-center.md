# Merchant Center product synchronization

The public catalog source is the existing `getWebProductCatalog` action used by
the storefront. The updater reads product data only; it never reads customer,
order, staff or payment records and requires no Google credentials.

`python3 scripts/sync-merchant-catalog.py` validates the full public response
before changing files. An unreachable or malformed response leaves the existing
feed and product pages in place. Product IDs use stable `HP-<catalog ID>` values.
The two fixed six-cup gifts have their own stable IDs and use the same component
prices as the store. A product minimum quantity is represented by a purchasable
pack, with the full pack price, on both its page and the feed.

The workflow runs every six hours and can be run manually in GitHub Actions.
It regenerates product pages, `assets/merchant-catalog.json`, the sitemap,
contact/returns pages and `merchant-products.xml`. GitHub Pages is explicitly
rebuilt after a bot commit. Set Merchant Center to fetch the public XML every
day after the overnight update. Neither schedule is instantaneous; allow for
Google fetch/processing latency after changing a product.

The feed includes shippable milk desserts, baked puddings and the two fixed
six-cup gifts. Coffee and snowflake crisps have informational pages but are
excluded from this shipping feed. Only free listings are enabled. Store pickup
and local inventory require a separately linked and configured Business Profile.
The generator does not start or modify paid advertising campaigns.

## Account shipping setup

Use price-based rates for the current dessert price range of NT$50–65 per cup.
This handles a cart mixing single cups, six-cup gifts and twelve-cup minimum
packs, unlike an item-count table that treats a cup and a box as the same unit.

| Pre-discount merchandise subtotal (TWD) | Shipping (TWD) |
| --- | --- |
| Below 900 | 130 |
| 900–1199.99 | 170 |
| 1200–1999.99 | 120 |
| 2000 or above | 0 |

For all current valid six-cup-multiple carts, these bands reproduce the
storefront's cup/box rates, NT$50 shipping discount at NT$1200, and free shipping
at NT$2000. Tests cover all possible 50/55/60/65 mixed-cup totals through 66 cups.
The minimum pre-discount subtotal for shipping is NT$300; the storefront also
enforces six-cup multiples. Individual product minimums still apply.

An individual product whose per-cup price moves outside 50–65 gets a conservative
NT$210 product-level shipping override in the feed. This avoids understating
shipping until account tiers are reviewed. That estimate can exceed checkout's
actual shipping. Review these assumptions if shipping fees, free-shipping
thresholds, or the permitted delivery catalog change. They are deliberately
separate from the storefront pricing engine and do not change customer charges.

Customer-service contact values are in `config/merchant.json`. Update that file
and run the updater when contact information changes. Product names, prices,
descriptions, ingredients, net contents, photos, minimums and preparation times
come from the live product editor; default definitions for built-in products
remain in `config/merchant-defaults.json`.
