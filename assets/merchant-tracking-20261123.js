(function () {
  'use strict';
  if (window.helloPannaMerchant) return;

  const destination = 'MC-6Y2092FM6B';
  const container = 'GTM-52WFLDZL';
  const storageKey = 'hp_merchant_orders_v1';
  const seen = new Set();
  const validOrderId = value => typeof value === 'string' && /^\d{14}$/.test(value);
  const money = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000000;

  function savedOrders() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
      return Array.isArray(saved) ? saved.filter(validOrderId).slice(-100) : [];
    } catch (_) { return []; }
  }

  function remember(id) {
    seen.add(id);
    try { window.localStorage.setItem(storageKey, JSON.stringify([...savedOrders().filter(x => x !== id), id].slice(-100))); }
    catch (_) { /* Browser storage restrictions must not interrupt checkout. */ }
  }

  function payloadFor(order) {
    if (!order || !validOrderId(order.orderId) || !money(order.total) || !money(order.shipping) ||
        order.shipping > order.total || !Array.isArray(order.items) || !order.items.length || order.items.length > 100) return null;

    const totalCents = Math.round(order.total * 100);
    const shippingCents = Math.round(order.shipping * 100);
    const valueCents = totalCents - shippingCents;
    const lines = [];
    for (const item of order.items) {
      if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || item.id > 999999999 ||
          !money(item.price) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) return null;
      lines.push({id: 'HP-' + item.id, quantity: item.quantity, cents: Math.round(item.price * 100) * item.quantity});
    }
    const rawCents = lines.reduce((sum, line) => sum + line.cents, 0);
    if (valueCents > rawCents || (!rawCents && valueCents)) return null;

    // Allocate the actual merchandise amount after discounts. Split a line by
    // one cent when needed, so item prices sum exactly to the event value.
    const allocated = lines.map((line, index) => {
      const share = rawCents ? valueCents * (line.cents / rawCents) : 0;
      return {line, index, cents: Math.floor(share), remainder: share - Math.floor(share)};
    });
    const remainder = valueCents - allocated.reduce((sum, line) => sum + line.cents, 0);
    const ranked = [...allocated].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
    for (let i = 0; i < remainder; i++) ranked[i % ranked.length].cents++;
    const items = [];
    for (const entry of allocated) {
      const unitCents = Math.floor(entry.cents / entry.line.quantity);
      const higherUnits = entry.cents % entry.line.quantity;
      const lowerUnits = entry.line.quantity - higherUnits;
      if (lowerUnits) items.push({item_id: entry.line.id, price: unitCents / 100, quantity: lowerUnits});
      if (higherUnits) items.push({item_id: entry.line.id, price: (unitCents + 1) / 100, quantity: higherUnits});
    }
    // Explicit allowlist: no customer, address, notes, payment details or coupon code.
    return {send_to: destination, transaction_id: order.orderId, currency: 'TWD',
      value: valueCents / 100, shipping: shippingCents / 100, items};
  }

  function trackOrder(order) {
    try {
      const payload = payloadFor(order);
      if (!payload || seen.has(payload.transaction_id) || savedOrders().includes(payload.transaction_id)) return false;
      window.gtag('event', 'purchase', payload);
      remember(payload.transaction_id);
      return true;
    } catch (_) { return false; }
  }

  window.helloPannaMerchant = Object.freeze({trackOrder});
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
  }
  window.gtag('config', destination, {
    groups: 'merchantorders',
    allow_enhanced_conversions: false,
    allow_ad_personalization_signals: false
  });
  // Load the Merchant container shown in its installation instructions. An
  // existing Ads loader does not establish that this container is installed.
  // Public pages include it directly; this fallback never adds a second copy.
  if (!document.querySelector('script[src^="https://www.googletagmanager.com/gtm.js?id=' + container + '"]')) {
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtm.js?id=' + container;
    document.head.appendChild(script);
  }
}());
