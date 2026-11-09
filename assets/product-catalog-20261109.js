const TRAFFIC_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxzLCwvSwWAvq3--IsXVQM8n5aNY3jeBcxQSuLG0t8nlBzDlZiEhJYnRREUhHaGsqu9/exec"; 
const ONLINE_CHECKOUT_FRONTEND_VERSION = "2026-10-08-ecpay-bridge-v3";

function createCheckoutNonce() {
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') {
        throw new Error('請使用更新版瀏覽器開啟正式官網');
    }
    return Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
        .map(value => value.toString(16).padStart(2, '0')).join('');
}

function isCheckoutBridgeSource(source, frameWindow) {
    try {
        for (let depth = 0; source && depth < 6; depth++) {
            if (source === frameWindow) return true;
            const parent = source.parent;
            if (!parent || parent === source) break;
            source = parent;
        }
    } catch (error) { /* 不接受來源不明的回覆。 */ }
    return false;
}

function sendOrderServiceRequest(payload) {
    const origin = window.location.origin;
    if (!['https://www.hello-panna.com', 'https://hello-panna.com'].includes(origin)) {
        return Promise.reject(new Error('請從 Hello 好酪正式官網進行訂購與查詢'));
    }
    const nonce = createCheckoutNonce();
    const request = {...payload, clientVersion: ONLINE_CHECKOUT_FRONTEND_VERSION};
    return new Promise((resolve, reject) => {
        const frame = document.createElement('iframe');
        frame.name = 'hp_checkout_' + nonce;
        frame.title = '訂單資料處理';
        frame.style.display = 'none';
        frame.setAttribute('aria-hidden', 'true');
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = TRAFFIC_SCRIPT_URL;
        form.target = frame.name;
        form.acceptCharset = 'UTF-8';
        form.style.display = 'none';
        const fields = {action:'checkoutBridge', checkoutOrigin:origin,
            checkoutNonce:nonce, checkoutPayload:JSON.stringify(request)};
        for (const [key, value] of Object.entries(fields)) {
            const input = document.createElement('input');
            input.type = 'hidden'; input.name = key; input.value = value;
            form.appendChild(input);
        }
        let timer;
        const cleanup = () => {
            clearTimeout(timer);
            window.removeEventListener('message', onMessage);
            frame.remove(); form.remove();
        };
        const onMessage = event => {
            if (!/^https:\/\/(?:script\.google\.com|(?:[a-z0-9-]+\.)?script\.googleusercontent\.com|[a-z0-9-]+-script\.googleusercontent\.com)$/.test(event.origin) ||
                !isCheckoutBridgeSource(event.source, frame.contentWindow)) return;
            const message = event.data;
            if (!message || message.type !== 'hello-panna-checkout-result' || message.nonce !== nonce ||
                message.action !== request.action || message.requestId !== String(request.requestId || '')) return;
            cleanup();
            if (message.apiVersion !== ONLINE_CHECKOUT_FRONTEND_VERSION) {
                reject(new Error('訂單系統版本尚未更新，請聯絡客服')); return;
            }
            if (!message.result || typeof message.result !== 'object' || Array.isArray(message.result)) {
                reject(new Error('訂單系統回傳資料不完整')); return;
            }
            resolve(message.result);
        };
        window.addEventListener('message', onMessage);
        timer = setTimeout(() => {
            cleanup();
            reject(new Error('未收到訂單系統回覆，請先查詢訂單；已成立的訂單可接續付款'));
        }, 120000);
        try {
            document.body.appendChild(frame);
            document.body.appendChild(form);
            // 訂單結果由獨立回傳頁傳給官網；綠界付款仍由官網以同頁 POST 開啟。
            HTMLFormElement.prototype.submit.call(form);
        } catch (error) {
            cleanup(); reject(error);
        }
    });
}

// 公開商品設定由既有官網訂單橋接讀取，文字欄位一律以純文字呈現。
const WEB_PRODUCT_VERSION = 'WEB_PRODUCT_EDITOR_20261109_1';
const WEB_PRODUCT_TEXT_LIMITS = {title:64, subtitle:100, ingredients:800, description:1200, netWeight:60};
let webProductSettings = Object.create(null);
const catalogSchemaDefaults = new Map();

function applyWebProductCatalog(snapshot) {
  if (!snapshot || snapshot.success !== true || snapshot.version !== WEB_PRODUCT_VERSION ||
      !snapshot.edits || typeof snapshot.edits !== 'object' || Array.isArray(snapshot.edits)) {
    throw new Error('商品資料尚未同步，請重新整理後再試');
  }
  const next = Object.create(null);
  for (const [id, fields] of Object.entries(snapshot.edits)) {
    const product = HelloPannaPricing.catalog[Number(id)];
    if (!product || product.bag || !/^[1-9]\d*$/.test(id) || !fields || typeof fields !== 'object' || Array.isArray(fields)) {
      throw new Error('商品資料格式異常，請重新整理');
    }
    const validated = {};
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'price') {
        if (!Number.isSafeInteger(value) || value < 1 || value > 99999) throw new Error('商品售價格式異常');
      } else if (!Object.prototype.hasOwnProperty.call(WEB_PRODUCT_TEXT_LIMITS,key) ||
          typeof value !== 'string' || value.length > WEB_PRODUCT_TEXT_LIMITS[key] ||
          (key === 'title' && !value.trim())) {
        throw new Error('商品文案格式異常');
      }
      validated[key] = value;
    }
    next[id] = validated;
  }
  if (JSON.stringify(next) === JSON.stringify(webProductSettings)) return false;
  webProductSettings = next;
  updateCatalogStructuredData();
  return true;
}

function updateCatalogStructuredData() {
  document.querySelectorAll('script[type="application/ld+json"]').forEach(node => {
    if (!catalogSchemaDefaults.has(node)) catalogSchemaDefaults.set(node, node.textContent);
    try {
      const data = JSON.parse(catalogSchemaDefaults.get(node));
      function update(value) {
        if (Array.isArray(value)) { value.forEach(update); return; }
        if (!value || typeof value !== 'object') return;
        if (value['@type'] === 'MenuItem') {
          const id = String(value.offers?.url || '').match(/#menu-item-(\d+)$/)?.[1];
          const edits = webProductSettings[id];
          if (edits) {
            if (edits.title !== undefined) value.name = edits.title;
            if (edits.price !== undefined && value.offers) value.offers.price = String(edits.price);
            let description = edits.description ?? value.description ?? '';
            if (edits.netWeight !== undefined) {
              description = description.replace(/淨重[^。]*。/g, '');
              if (edits.netWeight) description += '。淨重 ' + edits.netWeight;
            }
            if (edits.ingredients !== undefined) {
              description = description.replace(/成[分份]：[^。]*。/g, '');
              if (edits.ingredients) description += '。成分：' + edits.ingredients;
            }
            value.description = [edits.subtitle, description].filter(Boolean).join('。');
          }
        }
        Object.values(value).forEach(update);
      }
      update(data);
      node.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
    } catch (error) {
      // 舊頁的結構化資料保留原本內容，商品卡仍可顯示最新設定。
    }
  });
}

function renderCatalogPriceExamples() {
  document.querySelectorAll('[data-catalog-items]').forEach(row => {
    const lines = row.dataset.catalogItems.split(',').map(part => {
      const [id, quantity] = part.split(':').map(Number);
      const base = HelloPannaPricing.catalog[id], edits = webProductSettings[id] || {};
      return {title:edits.title ?? base.name, price:edits.price ?? base.price, quantity};
    });
    row.cells[0].textContent = lines.map(item => item.title + ' ' + item.quantity + ' 杯').join(' ＋ ');
    for (let cell = 1; cell < row.cells.length; cell++) {
      const total = lines.reduce((sum,item) => sum + item.price * item.quantity, 0) * cell;
      row.cells[cell].textContent = total.toLocaleString('zh-TW') + ' 元';
    }
  });
}

function startPublicProductCatalog() {
  const cards = Array.from(document.querySelectorAll('[data-catalog-product]'), card => {
    const productId = Number(card.dataset.catalogProduct);
    const nodes = {
      title:card.querySelector('h3'), price:card.querySelector('.price'),
      subtitle:card.querySelector('.catalog-subtitle'), netWeight:card.querySelector('.catalog-weight'),
      description:card.querySelector('.product-description'), ingredients:card.querySelector('.ingredients'),
      link:card.querySelector('.order-link')
    };
    const original = Object.fromEntries(Object.entries(nodes).map(([key,node]) => [key, node?.textContent || '']));
    return {productId, nodes, original};
  });
  let pending = false;
  async function refresh() {
    if (pending) return;
    pending = true;
    try {
      const result = await sendOrderServiceRequest({action:'getWebProductCatalog'});
      applyWebProductCatalog(result);
      for (const {productId, nodes, original} of cards) {
        const edits = webProductSettings[productId] || {};
        const product = HelloPannaPricing.catalog[productId];
        nodes.title.textContent = edits.title ?? original.title;
        nodes.price.textContent = edits.price === undefined ? original.price :
          'NT$ ' + edits.price.toLocaleString('zh-TW') + (product.snowflake ? '／包' : '／杯');
        nodes.subtitle.textContent = edits.subtitle ?? original.subtitle;
        nodes.netWeight.textContent = edits.netWeight === undefined ? original.netWeight :
          (edits.netWeight ? '淨重 ' + edits.netWeight : '');
        nodes.description.textContent = edits.description === undefined ? original.description :
          [edits.description, product.pudding ? '（杯裝出貨）' : ''].filter(Boolean).join('\n');
        nodes.ingredients.textContent = edits.ingredients === undefined ? original.ingredients :
          (edits.ingredients ? '成分：' + edits.ingredients : '');
        nodes.link.textContent = edits.title === undefined ? original.link : '前往選購' + edits.title;
        for (const field of ['subtitle','netWeight','description','ingredients']) {
          nodes[field].hidden = !nodes[field].textContent;
        }
      }
      renderCatalogPriceExamples();
    } catch (error) {
      // 完整菜單保留頁面原有資料，購物車在下單前會確認最新價格。
    } finally {
      pending = false;
    }
  }
  refresh();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden) refresh(); }, 30000);
}
