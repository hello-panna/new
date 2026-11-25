const assert = require('node:assert/strict');
const {test} = require('node:test');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const vm = require('node:vm');
const script = readFileSync(resolve(__dirname, '../assets/merchant-tracking-20261123.js'), 'utf8');

function browser({saved = new Map(), existingTag = true, blockedStorage = false} = {}) {
  const calls = [], added = [];
  const window = {
    gtag: (...args) => calls.push(args),
    localStorage: {
      getItem(key) { if (blockedStorage) throw Error('blocked'); return saved.get(key) || null; },
      setItem(key, value) { if (blockedStorage) throw Error('blocked'); saved.set(key, value); }
    }
  };
  const document = {querySelector: () => existingTag ? {} : null, createElement: () => ({}),
    head: {appendChild: element => added.push(element)}};
  vm.runInNewContext(script, {window, document});
  return {window, calls, added, saved, purchases: () => calls.filter(x => x[0] === 'event' && x[1] === 'purchase')};
}

function order(overrides = {}) {
  return {orderId: '20261123190000', total: 430, shipping: 130,
    items: [{id: 1, price: 50, quantity: 6}], ...overrides};
}

test('page initialization does not count a purchase or add a duplicate Merchant container', () => {
  const b = browser();
  assert.equal(b.purchases().length, 0);
  assert.equal(b.added.length, 0);
  assert.equal(b.calls[0][1], 'MC-6Y2092FM6B');
  assert.equal(b.calls[0][2].allow_enhanced_conversions, false);
  const landing = browser({existingTag: false});
  assert.equal(landing.added.length, 1);
  assert.equal(landing.added[0].src, 'https://www.googletagmanager.com/gtm.js?id=GTM-52WFLDZL');
  assert.equal(landing.added[0].async, true);
});

test('order event contains only the approved fields and excludes shipping from merchandise value', () => {
  const b = browser();
  assert.equal(b.window.helloPannaMerchant.trackOrder(order({name: 'PRIVATE_NAME', email: 'private@example.test',
    phone: '0911111111', address: 'PRIVATE_ADDRESS', notes: 'PRIVATE_NOTE', couponCode: 'PRIVATE_COUPON',
    items: [{id: 1, price: 50, quantity: 6, name: 'PRIVATE_ITEM_TEXT', email: 'private@example.test'}]})), true);
  const payload = b.purchases()[0][2];
  assert.deepEqual(Object.keys(payload).sort(), ['currency','items','send_to','shipping','transaction_id','value']);
  assert.equal(payload.send_to, 'MC-6Y2092FM6B');
  assert.equal(payload.value, 300);
  assert.equal(payload.shipping, 130);
  assert.equal(payload.currency, 'TWD');
  assert.equal(payload.items[0].item_id, 'HP-1');
  assert.equal(payload.items[0].quantity, 6);
  assert.doesNotMatch(JSON.stringify(payload), /PRIVATE|private@example|0911111111/);
});

test('duplicate confirmations are suppressed across page loads, including restricted storage', () => {
  const first = browser();
  assert.equal(first.window.helloPannaMerchant.trackOrder(order()), true);
  assert.equal(first.window.helloPannaMerchant.trackOrder(order()), false);
  const second = browser({saved: first.saved});
  assert.equal(second.window.helloPannaMerchant.trackOrder(order()), false);
  assert.equal(first.purchases().length, 1);
  const restricted = browser({blockedStorage: true});
  assert.equal(restricted.window.helloPannaMerchant.trackOrder(order()), true);
  assert.equal(restricted.window.helloPannaMerchant.trackOrder(order()), false);
});

test('invalid or incomplete order data never sends a purchase', () => {
  const b = browser();
  for (const value of [null, order({orderId: '0911111111'}), order({total: NaN}), order({items: []}),
    order({items: [{id: 'private@example.test', price: 50, quantity: 6}]}),
    order({items: [{id: 1, price: -1, quantity: 6}]}), order({total: 999999})]) {
    assert.equal(b.window.helloPannaMerchant.trackOrder(value), false);
  }
  assert.equal(b.purchases().length, 0);
});

test('discount allocations reconcile to the paid merchandise cents and preserve actual item quantities', () => {
  for (let discount = 0; discount <= 605; discount++) {
    const b = browser();
    const items = [{id: 2, price: 55, quantity: 3}, {id: 100, price: 65, quantity: 4}, {id: 21, price: 60, quantity: 3}];
    assert.equal(b.window.helloPannaMerchant.trackOrder(order({total: 605 - discount + 130, items})), true);
    const payload = b.purchases()[0][2];
    assert.equal(payload.items.reduce((sum, x) => sum + Math.round(x.price * 100) * x.quantity, 0), Math.round(payload.value * 100));
    for (const item of items) {
      assert.equal(payload.items.filter(x => x.item_id === 'HP-' + item.id).reduce((sum, x) => sum + x.quantity, 0), item.quantity);
    }
  }
});

test('all public product landing pages contain attribution tracking after regeneration', () => {
  const {readdirSync} = require('node:fs');
  const publicPages = ['index.html','menu.html','delivery.html','store.html','gifts.html','changhua-guide.html','contact.html','returns.html',
    ...readdirSync(resolve(__dirname, '../products')).filter(x => x.endsWith('.html')).map(x => 'products/' + x)];
  for (const file of publicPages) {
    const html = readFileSync(resolve(__dirname, '..', file), 'utf8');
    assert.equal((html.match(/src="\/assets\/merchant-tracking-20261123\.js\?v=2"/g) || []).length, 1, file);
    assert.equal((html.match(/src="https:\/\/www\.googletagmanager\.com\/gtm\.js\?id=GTM-52WFLDZL"/g) || []).length, 1, file);
  }
});
