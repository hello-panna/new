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
function normalizeProductImagePath(value) {
  if (typeof value !== 'string') return '';
  const path = value.trim().replace(/^https:\/\/(?:www\.)?hello-panna\.com\//i, '').replace(/^\.?\//, '');
  if (!path || path.length > 200) return '';
  try {
    const segments = path.split('/').map(part => decodeURIComponent(part));
    if (segments.some(part => !part || part === '.' || part === '..' ||
        /[\u0000-\u001f\u007f\\/:<>"'?#%&]/.test(part))) return '';
    const decoded = segments.join('/');
    if (!/\.(?:jpe?g|png|webp|gif|avif)$/i.test(decoded)) return '';
    segments.forEach(part => encodeURIComponent(part));
    return decoded;
  } catch (error) {
    return '';
  }
}

function productImageUrl(path) {
  return path.split('/').map(part => encodeURIComponent(part)).join('/');
}

const WEB_PRODUCT_VERSION = 'WEB_PRODUCT_EDITOR_20261109_1';
const WEB_PRODUCT_SCHEMA = 'WEB_PRODUCT_EDITOR_20261109_2';
const WEB_PRODUCT_CATEGORIES = {panna:'鮮奶酪', pudding:'烤布丁', snowflake:'雪花酥', coffee:'咖啡'};
const WEB_PRODUCT_TEXT_LIMITS = {title:64, subtitle:100, ingredients:800, description:1200, netWeight:60};
let webProductSettings = Object.create(null);
let webCatalogProducts = Object.create(null);
let webCheckoutCatalog = null;
const catalogSchemaDefaults = new Map();

function webOrderCatalog() {
  return webCheckoutCatalog || HelloPannaPricing.catalog;
}

function readProductFields(fields, complete = false) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('商品資料格式異常');
  if (complete && ['price', ...Object.keys(WEB_PRODUCT_TEXT_LIMITS)].some(key => fields[key] === undefined)) {
    throw new Error('新品資料不完整');
  }
  const result = {};
  for (const [key,value] of Object.entries(fields)) {
    if (key === 'price') {
      if (!Number.isSafeInteger(value) || value < 1 || value > 99999) throw new Error('商品售價格式異常');
    } else if (!Object.prototype.hasOwnProperty.call(WEB_PRODUCT_TEXT_LIMITS,key) ||
        typeof value !== 'string' || value.length > WEB_PRODUCT_TEXT_LIMITS[key] ||
        (key === 'title' && !value.trim())) {
      throw new Error('商品文案格式異常');
    }
    result[key] = value;
  }
  return result;
}

function applyWebProductCatalog(snapshot) {
  if (!snapshot || snapshot.success !== true || snapshot.version !== WEB_PRODUCT_VERSION ||
      snapshot.schema !== WEB_PRODUCT_SCHEMA || !Array.isArray(snapshot.products) ||
      !snapshot.edits || typeof snapshot.edits !== 'object' || Array.isArray(snapshot.edits)) {
    throw new Error('商品資料尚未同步，請重新整理後再試');
  }
  const defaults = HelloPannaPricing.catalog;
  const catalog = {...defaults}, products = Object.create(null), settings = Object.create(null);
  for (const [id,fields] of Object.entries(snapshot.edits)) {
    if (!/^[1-9]\d*$/.test(id) || !defaults[id] || defaults[id].bag) throw new Error('商品設定格式異常');
    settings[id] = readProductFields(fields);
  }
  for (const record of snapshot.products) {
    if (!record || !Number.isSafeInteger(record.id) || record.id < 1 || products[record.id] ||
        typeof record.name !== 'string' || !record.name ||
        !Object.prototype.hasOwnProperty.call(WEB_PRODUCT_CATEGORIES,record.category) ||
        !Number.isSafeInteger(record.leadDays) || record.leadDays < (record.category === 'snowflake' ? 2 : 1) ||
        record.leadDays > 30 || !Array.isArray(record.images) || record.images.length < 1 || record.images.length > 8) {
      throw new Error('商品資料格式異常，請重新整理');
    }
    const {id,name,category,leadDays} = record;
    const images = record.images.map(normalizeProductImagePath);
    if (images.some(path => !path) || new Set(images).size !== images.length) throw new Error('商品圖片路徑格式異常');
    const base = defaults[id];
    if (base) {
      if (base.bag || name !== base.name || category !== HelloPannaPricing.productCategory(base)) {
        throw new Error('商品分類格式異常');
      }
    } else {
      if (id < 100) throw new Error('商品編號格式異常');
      settings[id] = readProductFields(record.fields,true);
      catalog[id] = HelloPannaPricing.productDefinition(name,settings[id].price,category);
    }
    products[id] = {id,name,category,images,leadDays,custom:!base};
  }
  if (Object.keys(defaults).some(id => !defaults[id].bag && !products[id])) throw new Error('商品資料不完整');
  const changed = JSON.stringify(products) !== JSON.stringify(webCatalogProducts) ||
    JSON.stringify(settings) !== JSON.stringify(webProductSettings);
  if (!changed) return false;
  webCatalogProducts = products;
  webProductSettings = settings;
  webCheckoutCatalog = catalog;
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
          const record = webCatalogProducts[id];
          if (record) value.image = record.images.map(path => 'https://www.hello-panna.com/' + productImageUrl(path));
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

function publicProductMedia(images, title) {
  const media = document.createElement('div');
  media.className = 'catalog-card-media';
  const rail = document.createElement('div');
  media.append(rail);
  if (images.length > 1) {
    rail.className = 'snow-gallery';
    rail.tabIndex = 0;
    rail.setAttribute('aria-label',title + '，左右滑動查看照片');
  }
  images.forEach((path,index) => {
    const image = document.createElement('img');
    image.src = productImageUrl(path);
    image.alt = title + '商品照片 ' + (index+1);
    image.loading = 'lazy';
    image.decoding = 'async';
    image.width = 600;
    image.height = 600;
    rail.append(image);
  });
  if (images.length > 1) {
    const controls = document.createElement('div');
    controls.className = 'catalog-gallery-controls';
    const previous = document.createElement('button'), next = document.createElement('button');
    const count = document.createElement('span');
    count.setAttribute('aria-live','polite');
    previous.type = next.type = 'button';
    previous.textContent = '‹';
    next.textContent = '›';
    previous.setAttribute('aria-label','上一張照片');
    next.setAttribute('aria-label','下一張照片');
    const current = () => Math.min(images.length-1,Math.round(rail.scrollLeft / (rail.clientWidth || 1)));
    function sync() {
      const page = current();
      count.textContent = (page+1) + '／' + images.length;
      previous.disabled = page === 0;
      next.disabled = page === images.length-1;
    }
    function move(delta) {
      const target = Math.max(0,Math.min(images.length-1,current()+delta));
      rail.scrollTo({left:target*rail.clientWidth,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    }
    previous.onclick = () => move(-1);
    next.onclick = () => move(1);
    rail.addEventListener('scroll',sync,{passive:true});
    rail.addEventListener('keydown',event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      move(event.key === 'ArrowLeft' ? -1 : 1);
    });
    controls.append(previous,count,next);
    media.append(controls);
    sync();
  }
  return media;
}

function readPublicProductCard(card) {
  const nodes = {
    title:card.querySelector('h3'), price:card.querySelector('.price'),
    subtitle:card.querySelector('.catalog-subtitle'), netWeight:card.querySelector('.catalog-weight'),
    description:card.querySelector('.product-description'), ingredients:card.querySelector('.ingredients'),
    link:card.querySelector('.order-link')
  };
  const original = Object.fromEntries(Object.entries(nodes).map(([key,node]) => [key,node.textContent]));
  const media = card.firstElementChild;
  const images = media.tagName === 'IMG' ? [media] : [...media.querySelectorAll('img')];
  return {card,nodes,original,media,imageKey:JSON.stringify(images.map(img => normalizeProductImagePath(img.getAttribute('src'))))};
}

function addPublicProductCard(grid, product) {
  const card = document.createElement('article');
  card.className = 'product';
  card.id = 'item-' + product.id;
  card.dataset.catalogProduct = product.id;
  const media = publicProductMedia(product.images,webProductSettings[product.id].title);
  const info = document.createElement('div');
  info.className = 'product-info';
  info.innerHTML = '<h3></h3><p class="catalog-subtitle"></p><p class="price"></p><p class="catalog-weight"></p>' +
    '<p class="product-description"></p><p class="ingredients"></p><a class="order-link"></a>';
  info.querySelector('.order-link').href = '/#menu-item-' + product.id;
  card.append(media,info);
  grid.append(card);
  return readPublicProductCard(card);
}

function startPublicProductCatalog() {
  const cards = new Map(Array.from(document.querySelectorAll('[data-catalog-product]'),card =>
    [Number(card.dataset.catalogProduct),readPublicProductCard(card)]));
  const grids = new Map(Array.from(document.querySelectorAll('[data-catalog-grid]'),grid => [grid.dataset.catalogGrid,grid]));
  let pending = false;
  async function refresh() {
    if (pending) return;
    pending = true;
    try {
      const result = await sendOrderServiceRequest({action:'getWebProductCatalog'});
      if (!applyWebProductCatalog(result)) return;
      for (const product of Object.values(webCatalogProducts)) {
        const grid = grids.get(product.category === 'pudding' ? 'panna' : product.category);
        if (product.custom && grid && !cards.has(product.id)) cards.set(product.id,addPublicProductCard(grid,product));
      }
      for (const [id, view] of cards) {
        const product = webCatalogProducts[id];
        if (!product) {
          view.card.remove();
          cards.delete(id);
          continue;
        }
        const {nodes,original} = view, edits = webProductSettings[id] || {};
        nodes.title.textContent = edits.title ?? original.title;
        nodes.price.textContent = edits.price === undefined ? original.price :
          'NT$ ' + edits.price.toLocaleString('zh-TW') + (product.category === 'snowflake' ? '／包' : '／杯');
        nodes.subtitle.textContent = edits.subtitle ?? original.subtitle;
        nodes.netWeight.textContent = edits.netWeight === undefined ? original.netWeight :
          (edits.netWeight ? '淨重 ' + edits.netWeight : '');
        nodes.description.textContent = edits.description === undefined ? original.description :
          [edits.description, product.category === 'pudding' ? '（杯裝出貨）' : ''].filter(Boolean).join('\n');
        nodes.ingredients.textContent = edits.ingredients === undefined ? original.ingredients :
          (edits.ingredients ? '成分：' + edits.ingredients : '');
        nodes.link.textContent = edits.title === undefined ? original.link : '前往選購' + edits.title;
        for (const field of ['subtitle','netWeight','description','ingredients']) nodes[field].hidden = !nodes[field].textContent;
        const imageKey = JSON.stringify(product.images);
        if (imageKey !== view.imageKey) {
          const media = publicProductMedia(product.images,nodes.title.textContent);
          view.media.replaceWith(media);
          view.media = media;
          view.imageKey = imageKey;
        }
      }
      renderCatalogPriceExamples();
    } catch (error) {
      // 無法同步時保留既有菜單內容。
    } finally {
      pending = false;
    }
  }
  refresh();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden) refresh(); },30000);
}
