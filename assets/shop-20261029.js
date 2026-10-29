/* Hello 好酪完整購物流程；沿用原官網金流橋接、商品資料與店家設定。 */
'use strict';
const hp = {category:'all',benefits:{},benefitKey:'',benefitSeq:0,backendReady:false,selection:'auto',quote:null,calendarMonth:'',dateGroups:{},lastDate:'',receipt:null,lastFocus:null,toastTimer:0,busy:false,preview:!['https://www.hello-panna.com','https://hello-panna.com'].includes(location.origin)};
const hpOldDateSettings=updateDateSettings;
const hpOriginalBridge=sendOrderServiceRequest;
const hpOriginalCloseBoxing=closeBoxingModal;
const hpOriginalSaveBox=saveCurrentBox;
const hpOriginalUnpackBox=unpackBox;
const hpOriginalAutoBoxes=autoFillBoxes;
const hpId=id=>document.getElementById(id);
const hpEsc=escapeOrderQueryText;
const hpMoney=n=>'NT$ '+Number(n||0).toLocaleString('zh-TW');
const hpName=item=>String(item.name||'').replace('鮮奶酪','');
const hpMode=()=>document.querySelector('input[name="deliveryMethod"]:checked')?.value||'自取';
function hpEl(tag,cls,content){const n=document.createElement(tag);if(cls)n.className=cls;if(content!==undefined)n.innerHTML=content;return n;}
function hpToast(message){const el=hpId('hp-toast');el.textContent=message;el.hidden=false;clearTimeout(hp.toastTimer);hp.toastTimer=setTimeout(()=>el.hidden=true,3200);}
function hpShowDialog(content,label){const d=hpId('hp-dialog');hp.lastFocus=document.activeElement;d.innerHTML='<div class="hp-dialog-content">'+content+'</div>';d.setAttribute('aria-label',label||'選購設定');d.showModal();}
function hpCloseDialog(){hpId('hp-dialog').close();hp.lastFocus?.focus();}
function hpFood(item){if(item.id===13)return '可重複使用・另計件數';if(item.id===14||item.id===21)return '蛋奶素・含蛋、乳';if(isCoffeeItem(item))return item.id===18?'12oz・含乳':'12oz・黑咖啡';return '葷食・含乳'+(item.id===3?'、芝麻':item.id===15?'、蕎麥':item.id===9?'・含酒精':'');}
function hpGetQuote(){
  try{
    const q=HelloPannaPricing.quote(cart,{delivery:hpMode(),benefits:hp.benefits,selection:hp.selection,usedPoints});
    usedPoints=q.usedPoints;hp.quote=q;
    currentRawTotal=q.raw;currentTotalCups=q.cups;currentCoffeeCups=q.coffee;currentPannaCottaCups=q.panna;currentCoffeeDiscountCups=q.coffeeCups;currentCoffeeDiscount=q.coffeeDiscount;currentShippingFee=q.shipping;currentDiscountAmount=q.discount;currentFinalTotal=q.total;
    currentDiscountName=[q.coffeeDiscount?'咖啡加購折'+q.coffeeDiscount+'元':'',q.promo?q.promo.name:'',q.usedPoints?'點數折抵'+q.usedPoints+'元':''].filter(Boolean).join('＋');
    appliedCoupon=q.promo?{code:q.promo.code,name:q.promo.name,type:q.promo.code==='VIP95'?'rate':'minus',value:q.promo.code==='VIP95'?.95:q.promo.amount}:null;
    return q;
  }catch(error){hpToast(error.message);return hp.quote||{items:[],raw:0,cups:0,coffee:0,panna:0,freeBags:0,total:0,shipping:0,candidates:[],discount:0,coffeeDiscount:0,usedPoints:0};}
}
function hpMount(){
  const header=document.querySelector('header');
  header.innerHTML='<div class="hp-brand"><img src="logo.jpg" class="header-logo" alt="Hello 好酪商標" width="38" height="38"><span>Hello 好酪</span></div><nav class="hp-header-links" aria-label="常用功能"><button class="hp-link-btn" onclick="openOrderQuery()">查詢訂單</button><a class="hp-link-btn" href="https://lin.ee/UHEkfgW" target="_blank" rel="noopener">聯絡好酪 ↗</a></nav>';
  const s1=hpId('step-1'),s2=hpId('step-2'),s3=hpId('step-3');
  const buyer=hpId('cust-name').closest('.options-section');
  const delivery=document.querySelector('.delivery-method-group').closest('.options-section');
  const modes=document.querySelector('.delivery-method-group');
  const notes=hpId('cust-remarks').closest('.options-section');
  const points=document.querySelector('.coupon-section.points-card');
  const coupons=hpId('coupon-code').closest('.coupon-section');
  const payments=document.querySelector('input[name="paymentMethod"]').closest('.options-section');
  const aboutNodes=[...s1.querySelectorAll(':scope > .package-box,:scope > .video-row,:scope > .seo-content-card,:scope > .brand-story')];
  const menu=hpId('menu-list'),cartList=hpId('cart-list');
  const globalModes=hpEl('section','hp-mode-wrap','<div class="hp-mode-heading"><span>這次想怎麼取貨？</span><a href="delivery.html" target="_blank" rel="noopener">查看配送說明 ↗</a></div>');
  globalModes.id='hp-mode-wrap';globalModes.append(modes);hpId('shop-view').before(globalModes);
  const modeDetails={自取:['門市自取','單杯也能訂'],宅配:['冷藏宅配','6杯的倍數出貨'],預約外送:['預約外送','彰化指定區・12杯起']};
  modes.querySelectorAll('label').forEach(label=>{const input=label.querySelector('input'),d=modeDetails[input.value];input.setAttribute('onchange','hpRequestMode(this.value)');label.querySelector('span').innerHTML='<span class="hp-mode-name">'+d[0]+'</span><span class="hp-mode-sub">'+d[1]+'</span>';});
  const oldModeLabel=delivery.querySelector(':scope > .form-label');if(oldModeLabel)oldModeLabel.remove();
  const hero=hpEl('section','hp-hero','<div><div class="hp-eyebrow">HANDMADE IN CHANGHUA</div><h1>今天，想吃哪一種甜？</h1><p>鮮奶酪・烤布丁・六入禮盒，慢慢挑你喜歡的口味。</p></div><div class="hp-hero-note">一杯也能自取，六杯剛好成盒。<br>奶酪與布丁可混搭，價格依選購口味計算。</div>');
  const bundles=hpEl('section','','<h2 class="section-header">幫你搭好的一盒</h2><div class="hp-bundles" id="hp-bundles"></div>');
  const combo=hpEl('section','','<div id="hp-coffee-combos"></div>');
  const categories=hpEl('nav','hp-category-nav');categories.id='hp-categories';categories.setAttribute('aria-label','商品分類');
  const menuTitle=hpEl('h2','section-header','挑選喜歡的口味');menuTitle.id='hp-menu-title';
  const about=hpEl('details','hp-after-shopping','<summary>關於好酪、成分與訂購說明</summary>');aboutNodes.forEach(n=>about.append(n));
  const footer=hpEl('footer','hp-footer','<div>甲賀食品｜統編 94427773<br>彰化市中正路一段403號<br><a href="tel:0972005078">0972-005-078</a>・食品登錄 N-194427773-00000-4<br>已投保產品責任險</div><nav><a href="menu.html">完整菜單</a><a href="store.html">門市資訊</a><a href="gifts.html">送禮指南</a><button class="hp-link-btn" onclick="openRefundPolicy()">退貨與退款</button></nav>');
  s1.replaceChildren(hero,bundles,combo,categories,menuTitle,menu,cartList,about,footer);
  const deliveryCard=hpEl('section','hp-panel','<h2>取貨安排</h2><p class="hp-subtle" id="hp-mode-summary"></p>');deliveryCard.append(delivery);
  const buyerCard=hpEl('section','hp-panel','<h2>聯絡資料</h2><p class="hp-subtle">免註冊即可訂購。請留下可以聯絡到你的姓名與手機。</p>');buyerCard.append(buyer);
  const noteDisclosure=hpEl('details','hp-disclosure','<summary>特殊需求備註（選填）</summary>');noteDisclosure.append(notes);notes.style.margin='0';notes.style.padding='0 16px 16px';
  const privacy=hpEl('label','hp-switch','<input id="hp-remember-contact" type="checkbox">在這個裝置記住聯絡資料');buyerCard.append(noteDisclosure,privacy);
  const err=hpEl('div','hp-error-summary');err.id='hp-form-error';err.setAttribute('role','alert');
  const formLayout=hpEl('div','hp-form-layout');formLayout.append(deliveryCard,buyerCard);s2.replaceChildren(err,formLayout);
  const select=hpId('pickup-slot-select');select.hidden=true;select.setAttribute('tabindex','-1');
  const picker=hpEl('div','','<div class="hp-date-top"><button type="button" onclick="hpCalendarMove(-1)" aria-label="上一個月">‹</button><strong id="hp-calendar-month"></strong><button type="button" onclick="hpCalendarMove(1)" aria-label="下一個月">›</button></div><div class="hp-calendar" id="hp-calendar" aria-label="可選日期"></div><div class="hp-date-legend">淡色日期目前未開放；訂購達18杯，需多一天備料。</div><div class="hp-times" id="hp-times" aria-label="取貨時段"></div><div id="hp-date-selection" class="hp-date-selection" hidden></div><div class="hp-error" id="hp-date-error"></div>');select.after(picker);
  const same=hpId('same-as-cust');same.checked=true;same.closest('label').hidden=true;
  const other=hpEl('label','hp-switch','<input type="checkbox" id="hp-other-recipient" onchange="hpToggleRecipient()">寄給別人／由其他人收件');same.closest('label').after(other);hpToggleRecipient();
  const review=hpEl('div','hp-review-layout','<div><section class="hp-panel"><div class="hp-edit-heading"><h2>選購內容</h2><button class="hp-edit" onclick="openCartModal()">修改商品</button></div><div id="hp-review-items"></div><details class="hp-disclosure"><summary>裝盒方式：預設由好酪安排</summary><div style="padding:0 16px 16px"><p class="hp-subtle">有分盒或送禮需求時再設定；未設定會依口味混裝。</p><button class="action-btn secondary" onclick="openBoxingModal()">自訂每盒口味</button><div id="hp-box-summary" class="hp-subtle"></div></div></details></section><section class="hp-panel"><div class="hp-edit-heading"><h2>取貨與聯絡資料</h2><button class="hp-edit" onclick="hpEditDelivery()">修改資料</button></div><div id="hp-review-fulfillment"></div></section></div><section class="hp-panel" id="hp-payment-panel"><h2>確認金額與付款</h2><div id="hp-review-totals"></div><div id="hp-benefits"></div><div id="hp-discounts"></div><div id="hp-payments"></div><p class="hp-subtle">按下確認後，會先建立訂單，再帶你前往所選的付款頁面。</p><div class="hp-error" id="hp-submit-error" role="alert"></div></section>');
  s3.replaceChildren(review);
  const pointDetails=hpEl('details','hp-disclosure','<summary>使用會員點數（選填）</summary>');pointDetails.append(points);
  const couponDetails=hpEl('details','hp-disclosure','<summary>我有優惠碼（選填）</summary>');couponDetails.append(coupons);hpId('hp-discounts').append(pointDetails,couponDetails);
  const allPoints=hpEl('button','hp-link-btn','使用目前可折抵的全部點數');allPoints.type='button';allPoints.onclick=()=>{usedPoints=memberMaxPoints;renderCart();hpId('use-points-input').value=usedPoints;};hpId('points-input-area').append(allPoints);
  payments.classList.add('hp-pay-options');payments.style.border='0';payments.style.padding='0';payments.style.margin='18px 0 0';hpId('hp-payments').append(hpEl('h3','','付款方式'),payments);
  hpId('hp-payments').querySelectorAll('.radio-label span').forEach(s=>{s.textContent=s.textContent.replace('銀行轉帳 / 虛擬帳號自動產出 (綠界金流)','ATM轉帳（取得專屬帳號）').replace('信用卡線上刷卡 (綠界金流)','信用卡').replace('Apple Pay 行動支付 (綠界金流)','Apple Pay').replace('TWQR 行動支付 (綠界金流)','TWQR 行動支付').replace('LINE Pay（自行輸入金額・人工核款）','LINE Pay（自行輸入金額，人工核款）');});
  document.querySelectorAll('.step-label').forEach((n,i)=>n.textContent=['選購商品','取貨與資料','確認與付款'][i]);
  document.querySelectorAll('.step-item').forEach((n,i)=>{n.setAttribute('role','button');n.tabIndex=0;n.onclick=()=>{if(i+1<currentStep)goToStep(i+1);};n.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();n.click();}};});
  hpId('checkout-bottom-bar').querySelector('.price-area').innerHTML='<div class="hp-bar-title" id="hp-bar-count">尚未選購商品</div><div class="total-price"><span id="hp-bar-total">NT$ 0</span><span style="font-size:11px;font-weight:400;color:var(--hp-muted)">查看明細⌃</span></div><div class="hp-bar-note" id="hp-bar-note"></div>';
  const cartAccess=hpId('checkout-bottom-bar').querySelector('.price-area');cartAccess.setAttribute('role','button');cartAccess.tabIndex=0;cartAccess.setAttribute('aria-label','查看購物車');cartAccess.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openCartModal();}};
  const cartModal=document.querySelector('.cart-modal-content');cartModal.querySelector('h3').textContent='這次選好的甜點';cartModal.querySelector(':scope > .action-btn')?.remove();cartModal.append(hpEl('div','hp-cart-actions','<button class="action-btn secondary" onclick="closeCartModal()">繼續選購</button><button id="hp-cart-next" class="action-btn" onclick="hpCartContinue()">選擇取貨與資料</button>'));
  const dialog=hpEl('dialog','hp-dialog');dialog.id='hp-dialog';dialog.addEventListener('click',e=>{if(e.target===dialog)hpCloseDialog();});document.body.append(dialog);
  const toast=hpEl('div','hp-toast');toast.id='hp-toast';toast.hidden=true;toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.body.append(toast);
  const skip=hpEl('a','hp-skip','跳至商品清單');skip.href='#menu-list';document.body.prepend(skip);
  document.querySelectorAll('input.form-input').forEach(input=>{const map={'cust-name':'name','cust-phone':'tel','cust-email':'email','rcpt-name':'name','rcpt-phone':'tel','cust-addr-detail':'street-address'};if(map[input.id])input.autocomplete=map[input.id];input.setAttribute('autocapitalize','off');input.setAttribute('autocorrect','off');});
  const groupEmail=hpId('cust-email').closest('.form-group');groupEmail.querySelector('label').innerHTML='Email <span class="opt-label">（選填，累點與點數折抵時需要）</span>';groupEmail.querySelector('label').style.color='var(--hp-ink)';
  document.querySelectorAll('label.form-label').forEach(label=>{const input=label.parentElement.querySelector('input,select,textarea');if(input?.id)label.htmlFor=input.id;});
  document.querySelectorAll('span[onclick^="close"]').forEach(n=>{n.setAttribute('role','button');n.tabIndex=0;n.setAttribute('aria-label','關閉視窗');n.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();n.click();}};});
  if(hp.preview){document.body.prepend(hpEl('div','hp-preview-note','購物流程預覽｜不會建立真實訂單或付款'));}
}
function hpRenderBundles(){
  const defs=[{name:'人氣六入',sub:'原味、巧克力、伯爵各2杯',ids:[1,2,7],price:320,action:'popular',note:'符合首購資格可折20元'},{name:'茶香六入',sub:'伯爵、十薰茉綠、抹茶各2杯',ids:[7,10,4],price:330,action:'tea',note:'三種茶香，一次品嚐'},{name:'自由搭配六入',sub:'奶酪與布丁都能混搭',ids:[20,14,21],price:300,action:'custom',note:'依口味計價・300元起'}];
  hpId('hp-bundles').innerHTML=defs.map(b=>'<article class="hp-bundle"><div class="hp-bundle-pics">'+b.ids.map(id=>{const p=menuData.find(p=>p.id===id);return '<img src="'+p.image+'" alt="'+hpEsc(p.name)+'" loading="lazy" width="100" height="100">';}).join('')+'</div><h3>'+b.name+'</h3><p>'+b.sub+'</p><div class="hp-bundle-price">'+(b.action==='popular'&&hp.benefits.first?'NT$ 300 <small><s>320</s> 首購價</small>':hpMoney(b.price)+(b.action==='custom'?'<small>起</small>':''))+'</div><p>'+b.note+'</p><button onclick="hpAddBundle(\''+b.action+'\')">'+(b.action==='custom'?'開始選擇6杯':'一鍵加入6杯')+'</button></article>').join('');
  const combos=hpId('hp-coffee-combos');combos.innerHTML=hpMode()==='宅配'?'':'<div class="hp-combo-row"><button onclick="hpChooseCombo(16)">原味＋美式　100元</button><button onclick="hpChooseCombo(18)">原味＋拿鐵　115元</button><span class="hp-quiet" style="align-self:center">沿用奶酪加購咖啡折10元</span></div>';
}
function hpAddBundle(kind){
  if(kind==='custom'){hp.category='dessert';renderMenu();hpId('hp-menu-title').scrollIntoView({behavior:'smooth'});hpToast('挑選6杯，奶酪與布丁都可以混搭');return;}
  const ids=kind==='tea'?[7,10,4]:[1,2,7];ids.forEach(id=>hpAddRaw(id,2));hpChanged();hpToast('已加入'+(kind==='tea'?'茶香':'人氣')+'六入，可再修改口味與數量');
}
function hpChooseCombo(id){hpShowDialog('<h2>原味奶酪＋'+(id===16?'美式':'拿鐵')+'</h2><p class="hp-subtle">選擇咖啡的溫度，一次加入兩項商品。</p><div class="hp-dialog-actions"><button class="action-btn secondary" onclick="hpAddCombo('+id+',\'冰\')">冰咖啡</button><button class="action-btn" onclick="hpAddCombo('+id+',\'熱\')">熱咖啡</button></div><button class="hp-link-btn" style="width:100%;margin-top:10px" onclick="hpCloseDialog()">返回選購</button>','選擇咖啡溫度');}
function hpAddCombo(id,temp){hpAddRaw(1,1);hpAddRaw(id,1,temp);hpChanged();hpCloseDialog();hpToast('已加入奶酪與'+temp+'咖啡，優惠自動計算');}
function hpAddRaw(id,quantity,temp){const p=menuData.find(x=>x.id===Number(id));if(!p)return;if(isCoffeeItem(p)&&hpMode()==='宅配')return;const item=cart.find(x=>x.id===p.id&&(!isCoffeeItem(p)||x.temperature===temp));if(item)item.quantity=Math.min(999,item.quantity+quantity);else cart.push({...p,name:p.name+(isCoffeeItem(p)?'（'+temp+'）':''),temperature:temp||'',quantity});if(hp.initialized&&!hp.preview){try{if(typeof fbq==='function')fbq('track','AddToCart',{content_name:p.name,value:p.price*quantity,currency:'TWD'});}catch(ignore){}}}
function hpRenderMenu(){
  const cats=[['all','全部'],['popular','人氣'],['dessert','鮮奶酪'],['pudding','烤布丁'],['coffee','咖啡'],['bag','保冷袋']];
  hpId('hp-categories').innerHTML=cats.map(([k,v])=>'<button type="button" role="tab" aria-selected="'+(hp.category===k)+'" onclick="hpCategory(\''+k+'\')">'+v+'</button>').join('');
  const selected=menuData.filter(p=>hp.category==='all'||(hp.category==='popular'&&[1,2,7].includes(p.id))||(hp.category==='dessert'&&isPannaCottaItem(p))||(hp.category==='pudding'&&[14,21].includes(p.id))||(hp.category==='coffee'&&isCoffeeItem(p))||(hp.category==='bag'&&p.id===13));
  hpId('hp-menu-title').textContent=hp.category==='all'?'挑選喜歡的口味':cats.find(x=>x[0]===hp.category)[1];
  hpId('menu-list').innerHTML=selected.map(p=>{
    const coffee=isCoffeeItem(p),temp=coffeeTemperatureSelections[p.id]||'',blocked=coffee&&hpMode()==='宅配';
    const idx=cart.findIndex(x=>x.id===p.id&&(!coffee||x.temperature===temp));
    const q=idx>=0?cart[idx].quantity:0;
    let action=blocked?'<button class="add-btn" disabled>咖啡不提供宅配</button>':coffee&&!temp?'<button class="add-btn" disabled>請先選冰／熱</button>':q?hpQtyHtml(idx,q,p.name):'<button class="add-btn" onclick="hpAddProduct('+p.id+')">＋ 加入購物車</button>';
    return '<article class="menu-item" id="menu-item-'+p.id+'"><button class="hp-image-button" onclick="hpProductDetails('+p.id+')" aria-label="查看'+hpEsc(p.name)+'詳細介紹"><div class="menu-img-container">'+renderMenuImage(p)+'</div>'+(p.badge?'<span class="hp-badge">'+hpEsc(p.badge)+'</span>':'')+'</button><div class="hp-product-title"><h3 class="menu-name">'+hpEsc(p.name)+'</h3><div class="menu-price">$'+p.price+'</div></div><div class="hp-food-note">'+hpFood(p)+'</div><button class="hp-detail-link" onclick="hpProductDetails('+p.id+')">口味介紹・完整成分</button>'+(coffee?'<div class="hp-temperature" role="group" aria-label="'+p.name+'溫度">'+['冰','熱'].map(t=>'<button aria-pressed="'+(temp===t)+'" onclick="selectCoffeeTemperature('+p.id+',\''+t+'\')" '+(blocked?'disabled':'')+'>'+t+'</button>').join('')+'</div>':'')+action+'</article>';
  }).join('');
}
function hpQtyHtml(index,q,name){return '<div class="hp-qty"><button onclick="hpSetQty('+index+','+(q-1)+')" aria-label="減少'+hpEsc(name)+'">−</button><input type="number" min="0" max="999" value="'+q+'" inputmode="numeric" aria-label="'+hpEsc(name)+'數量" oninput="hpSetQty('+index+',this.value,true)" onchange="hpSetQty('+index+',this.value)"><button onclick="hpSetQty('+index+','+(q+1)+')" aria-label="增加'+hpEsc(name)+'">＋</button></div>';}
function hpCategory(category){hp.category=category;renderMenu();hpId('hp-categories').scrollIntoView({block:'start',behavior:'smooth'});}
function hpProductDetails(id){const p=menuData.find(x=>x.id===id);if(!p)return;hpShowDialog('<button class="hp-dialog-close" onclick="hpCloseDialog()" aria-label="關閉">×</button><img src="'+p.image+'" alt="'+hpEsc(p.name)+'"><h2 style="margin-top:18px">'+hpEsc(p.name)+'　'+hpMoney(p.price)+'</h2><div class="hp-small-tag" style="display:inline-block">'+hpFood(p)+'</div><p>'+p.desc+'</p><p class="hp-subtle"><strong>'+(id===13?'材質':'成分')+'：</strong>'+hpEsc(p.ingredients)+'</p>'+(id===9?'<p class="hp-error">含蘭姆酒，未滿18歲請勿購買。</p>':'')+'<button class="action-btn" style="width:100%" onclick="hpCloseDialog()">返回挑選口味</button>',p.name);}
function hpAddProduct(id){const p=menuData.find(x=>x.id===id);const temp=coffeeTemperatureSelections[id]||'';if(isCoffeeItem(p)&&!temp)return;hpAddRaw(id,1,temp);hpChanged();hpToast('已加入'+p.name);}
function hpReconcileBoxes(){
  const remaining={};cart.filter(isDessertItem).forEach(i=>remaining[i.id]=(remaining[i.id]||0)+i.quantity);
  const kept=[];let removed=0;
  completedBoxes.forEach(box=>{const need={};box.items.forEach(i=>need[i.id]=(need[i.id]||0)+i.qty);if(Object.keys(need).every(id=>(remaining[id]||0)>=need[id])){Object.keys(need).forEach(id=>remaining[id]-=need[id]);kept.push(box);}else removed++;});
  completedBoxes=kept.map((b,i)=>({...b,label:String.fromCharCode(65+i)}));
  const building=[];currentBoxBuilding.forEach(i=>{const qty=Math.min(i.qty,remaining[i.id]||0);if(qty){building.push({...i,qty});remaining[i.id]-=qty;}});currentBoxBuilding=building;
  if(removed)hpToast('已保留其餘裝盒設定；受數量影響的'+removed+'盒可重新安排');
}
function hpSetQty(index,value,typing=false){if(typing&&String(value).trim()==='')return;const n=Number(value);if(!Number.isInteger(n)||n<0||n>999){if(!typing)hpToast('數量請填0～999的整數');return;}if(!cart[index]||cart[index].quantity===n)return;const active=document.activeElement,scope=active?.closest('#modal-cart-list')?'#modal-cart-list':'#menu-list';const label=active?.getAttribute('aria-label');cart[index].quantity=n;if(!n)cart.splice(index,1);hpReconcileBoxes();hpChanged();if(typing&&n&&label)document.querySelector(scope+' input[aria-label="'+CSS.escape(label)+'"]')?.focus();}
function hpChanged(){renderMenu();renderCart();hpSaveDraft();}
function hpTotalsHtml(q,delivery=hpMode()){return '<div class="hp-money-row"><span>商品小計</span><span>'+hpMoney(q.raw)+'</span></div>'+(q.coffeeDiscount?'<div class="hp-money-row discount"><span>咖啡加購 '+q.coffeeCups+'杯</span><span>−'+q.coffeeDiscount+'元</span></div>':'')+(q.promo?'<div class="hp-money-row discount"><span>'+hpEsc(q.promo.name)+'</span><span>−'+q.promo.amount+'元</span></div>':'')+(q.usedPoints?'<div class="hp-money-row discount"><span>點數折抵</span><span>−'+q.usedPoints+'元</span></div>':'')+(delivery==='宅配'?'<div class="hp-money-row"><span>冷藏運費'+(q.shippingDiscount?'（已折'+q.shippingDiscount+'元）':'')+'</span><span>'+hpMoney(q.shipping)+'</span></div>':'<div class="hp-money-row"><span>'+(delivery==='預約外送'?'預約外送費':'門市自取')+'</span><span>NT$ 0</span></div>')+'<div class="hp-money-row total"><span>應付總額</span><span>'+hpMoney(q.total)+'</span></div>';}
function hpCartHtml(q){
  if(!cart.length)return '<div class="hp-empty">購物車還空著，先挑一杯喜歡的口味吧。</div>';
  let content=cart.map((p,i)=>'<div class="hp-cart-line"><img src="'+p.image+'" alt="'+hpEsc(p.name)+'" width="50" height="50"><div><div class="hp-cart-name">'+hpEsc(p.name)+'</div><div class="hp-cart-extra">每'+(p.id===13?'只':'杯')+' '+p.price+'元</div>'+hpQtyHtml(i,p.quantity,p.name)+'</div><div class="hp-cart-price">'+hpMoney(p.price*p.quantity)+'</div></div>').join('');
  if(q.freeBags)content+='<div class="hp-gift-row">贈品｜保冷袋 '+q.freeBags+'只（不計甜點杯數）</div>';
  if(hpMode()==='宅配'&&q.cups%6)content+='<div class="hp-cart-progress">宅配需整盒出貨，目前'+q.cups+'杯，再挑'+(6-q.cups%6)+'杯就能裝滿下一盒。</div>';
  if(hpMode()==='預約外送'&&q.cups<12)content+='<div class="hp-cart-progress">預約外送12杯起，目前還差'+(12-q.cups)+'杯。</div>';
  if(hpMode()==='宅配'&&q.raw<2000){const target=q.raw<1200?1200:2000;content+='<div class="hp-cart-progress">再買 '+hpMoney(target-q.raw)+'，'+(target===1200?'運費可折50元':'即可享宅配免運')+'。<progress max="'+target+'" value="'+q.raw+'"></progress>'+(q.raw===1980&&cart.filter(p=>p.price===55&&isDessertItem(p)).reduce((a,p)=>a+p.quantity,0)>=4?'<button class="hp-link-btn" onclick="hpUpgradeDialog()">選4杯升級抹茶烤布丁，剛好達免運</button>':'')+'</div>';}
  if(q.cups&&q.cups%12)content+='<div class="hp-cart-extra" style="margin:12px 0">再挑'+(12-q.cups%12)+'杯甜點，多送一只保冷袋。</div>';
  content+='<div class="hp-subtle" style="margin:16px 0">甜點 '+q.cups+'杯'+(q.coffee?'・咖啡 '+q.coffee+'杯':'')+'。裝盒由好酪安排，分盒需求可在確認頁設定。</div>'+hpTotalsHtml(q);
  return content;
}
function hpRenderCart(){
  const q=hpGetQuote();updateDateSettings(getSelectedDeliveryMode());
  hpId('cart-list').innerHTML=hpCartHtml(q);
  if(hpId('cart-modal-overlay').style.display==='flex')hpId('modal-cart-list').innerHTML=hpId('cart-list').innerHTML;
  hpId('hp-bar-count').textContent=q.cups||q.coffee?'甜點 '+q.cups+'杯'+(q.coffee?'・咖啡 '+q.coffee+'杯':'')+(cart.some(p=>p.id===13)?'・保冷袋另計':''):'尚未選購商品';
  hpId('hp-bar-total').textContent=hpMoney(q.total);
  hpId('hp-bar-note').textContent=hpMode()==='宅配'?(q.cups?'含冷藏運費'+q.shipping+'元':'選購後自動計算運費'):(hpMode()==='預約外送'?'外送時段需由店家確認':'門市自取・免註冊下單');
  hpId('hp-cart-next').disabled=!cart.length;hpId('btn-next').disabled=!cart.length||orderSubmissionInProgress;
  hpRenderReview(q);hpSaveDraft();
}
function hpUpgradeDialog(){const candidates=cart.map((p,i)=>({...p,index:i})).filter(p=>p.price===55&&isDessertItem(p));hpShowDialog('<h2>選4杯升級抹茶烤布丁</h2><p class="hp-subtle">每杯加5元，4杯共加20元；替換後會重新計算優惠與裝盒。</p>'+candidates.map(p=>'<label class="hp-money-row"><span>'+hpEsc(p.name)+'</span><input class="form-input hp-upgrade-qty" style="width:85px;min-height:36px" type="number" min="0" max="'+Math.min(4,p.quantity)+'" value="0" data-index="'+p.index+'" aria-label="升級'+hpEsc(p.name)+'杯數"></label>').join('')+'<div class="hp-dialog-actions"><button class="action-btn secondary" onclick="hpCloseDialog()">取消</button><button class="action-btn" onclick="hpApplyUpgrade()">確認替換4杯</button></div>','升級選擇');}
function hpApplyUpgrade(){const selected=[...document.querySelectorAll('.hp-upgrade-qty')].map(n=>({index:Number(n.dataset.index),quantity:Number(n.value)}));if(selected.some(s=>!Number.isInteger(s.quantity)||s.quantity<0||s.quantity>cart[s.index].quantity)||selected.reduce((a,s)=>a+s.quantity,0)!==4){hpToast('請選擇剛好4杯');return;}selected.forEach(s=>cart[s.index].quantity-=s.quantity);cart=cart.filter(p=>p.quantity>0);hpAddRaw(21,4);hpReconcileBoxes();hpChanged();hpCloseDialog();hpToast('已替換4杯，更新後總額與運費請見購物車');}
function hpToggleRecipient(){const other=hpId('hp-other-recipient')?.checked||false;hpId('same-as-cust').checked=!other;['rcpt-name','rcpt-phone'].forEach(id=>hpId(id).closest('.form-group').hidden=!other);if(!other)toggleRecipientSame();hpSaveDraft();}
function hpRequestMode(value){
  const old=hp.delivery||'自取';document.querySelector('input[name="deliveryMethod"][value="'+old+'"]').checked=true;
  const apply=()=>{document.querySelector('input[name="deliveryMethod"][value="'+value+'"]').checked=true;hp.delivery=value;if(value==='宅配')cart=cart.filter(p=>!isCoffeeItem(p));hpReconcileBoxes();clearScheduledDeliveryConfirmation();hp.calendarMonth='';hpChanged();hpRenderBundles();};
  if(value==='宅配'&&cart.some(isCoffeeItem)){hpShowDialog('<h2>改成冷藏宅配？</h2><p>咖啡不提供宅配。確認後會移除購物車中的咖啡，甜點會保留。</p><div class="hp-dialog-actions"><button class="action-btn secondary" id="hp-keep-mode">保留目前取貨方式</button><button class="action-btn" id="hp-confirm-mode">移除咖啡並改宅配</button></div>','變更取貨方式');hpId('hp-keep-mode').onclick=hpCloseDialog;hpId('hp-confirm-mode').onclick=()=>{apply();hpCloseDialog();};}else apply();
}
function hpUpdateDateSettings(mode){
  const previous=hpId('pickup-slot-select').value;hpOldDateSettings(mode);hpId('pickup-slot-select').hidden=true;
  const groups={};[...hpId('pickup-slot-select').options].filter(o=>o.value).forEach(o=>{const key=o.value.slice(0,10);(groups[key]||(groups[key]=[])).push({value:o.value,label:o.textContent});});hp.dateGroups=groups;if(hp.selectedDay&&!groups[hp.selectedDay])hp.selectedDay='';
  const dates=Object.keys(groups);if(!hp.calendarMonth||!dates.some(d=>d.slice(0,7)===hp.calendarMonth))hp.calendarMonth=(hpId('pickup-slot-select').value||dates[0]||'').slice(0,7);
  hpRenderCalendar();
  if(previous&&!hpId('pickup-slot-select').value){hpId('hp-date-error').textContent='因取貨方式或杯數調整，原日期已不適用，請重新選擇。';}
  hpId('hp-mode-summary').textContent=hpMode()==='自取'?'門市自取｜彰化市中正路一段403號':hpMode()==='宅配'?'冷藏宅配｜選擇的是出貨日，實際到貨依物流安排。':'彰化市預約外送｜12杯起，實際時段由店家確認。';
  const deliveryInfo=hpId('delivery-info-box');deliveryInfo.innerHTML='<strong>新竹物流・冷藏宅配</strong><div>1–2盒130元，3–8盒170元，9盒以上210元。</div><div>折扣前商品滿1,200元，運費折50元；滿2,000元免運。</div><div>甜點以6杯的倍數出貨，咖啡不提供宅配。</div>';
}
function hpRenderCalendar(){
  if(!hpId('hp-calendar'))return;const dates=Object.keys(hp.dateGroups);if(!hp.calendarMonth){hpId('hp-calendar').innerHTML='<p class="hp-subtle" style="grid-column:1/-1">目前沒有開放日期，請聯絡好酪。</p>';return;}
  const [y,m]=hp.calendarMonth.split('/').map(Number),offset=new Date(y,m-1,1).getDay(),days=new Date(y,m,0).getDate();
  hpId('hp-calendar-month').textContent=y+'年 '+m+'月';
  let output=['日','一','二','三','四','五','六'].map(w=>'<span class="hp-weekday">'+w+'</span>').join('');output+='<span></span>'.repeat(offset);
  const selected=hpId('pickup-slot-select').value.slice(0,10)||hp.selectedDay||'';
  for(let d=1;d<=days;d++){const key=y+'/'+String(m).padStart(2,'0')+'/'+String(d).padStart(2,'0'),available=!!hp.dateGroups[key];output+='<button type="button" aria-label="'+key+(available?'可選':'未開放')+'" aria-pressed="'+(selected===key)+'" '+(!available?'disabled title="目前未開放"':'onclick="hpPickDate(\''+key+'\')"')+'>'+d+'</button>';}
  hpId('hp-calendar').innerHTML=output;
  const nav=hpId('hp-calendar-month').parentElement.querySelectorAll('button');nav[0].disabled=!dates.some(d=>d.slice(0,7)<hp.calendarMonth);nav[1].disabled=!dates.some(d=>d.slice(0,7)>hp.calendarMonth);
  hpRenderTimes(selected||hp.selectedDay||'');
}
function hpCalendarMove(delta){const [y,m]=hp.calendarMonth.split('/').map(Number),d=new Date(y,m-1+delta,1);hp.calendarMonth=d.getFullYear()+'/'+String(d.getMonth()+1).padStart(2,'0');hpRenderCalendar();}
function hpPickDate(key){hp.selectedDay=key;hpId('pickup-slot-select').value='';if(hpMode()==='宅配'&&hp.dateGroups[key]?.length)hpId('pickup-slot-select').value=hp.dateGroups[key][0].value;hpId('hp-date-error').textContent='';hpRenderCalendar();hpSaveDraft();}
function hpRenderTimes(key){const options=hp.dateGroups[key]||[],selected=hpId('pickup-slot-select').value;hpId('hp-times').innerHTML=hpMode()==='宅配'?'':options.map(o=>'<button type="button" aria-pressed="'+(selected===o.value)+'" onclick="hpPickSlot(\''+o.value+'\')">'+hpEsc(o.value.split(' ').slice(-1)[0])+'</button>').join('');hpId('hp-date-selection').hidden=!selected;hpId('hp-date-selection').textContent=selected?(hpMode()==='宅配'?'預計出貨：':hpMode()==='預約外送'?'希望送達：':'到店取貨：')+selected:'';}
function hpPickSlot(value){hpId('pickup-slot-select').value=value;hpId('hp-date-error').textContent='';hpRenderCalendar();hpRenderReview(hpGetQuote());hpSaveDraft();}
function hpError(id,message){const field=hpId(id);field?.classList.add('hp-invalid');if(field)field.setAttribute('aria-invalid','true');let n=hpId('error-'+id);if(!n&&field){n=hpEl('div','hp-error');n.id='error-'+id;field.after(n);field.setAttribute('aria-describedby',n.id);}if(n)n.textContent=message;return id;}
function hpValidateDetails(focus=true){
  document.querySelectorAll('.hp-invalid').forEach(n=>{n.classList.remove('hp-invalid');n.removeAttribute('aria-invalid');});document.querySelectorAll('[id^="error-"]').forEach(n=>n.textContent='');
  const errors=[],name=hpId('cust-name').value.trim(),phone=hpId('cust-phone').value.trim(),email=hpId('cust-email').value.trim();
  if(!name)errors.push(hpError('cust-name','請填寫訂購人姓名'));if(!/^09\d{8}$/.test(phone))errors.push(hpError('cust-phone','請輸入09開頭的10碼手機號碼'));if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))errors.push(hpError('cust-email','Email格式不正確，請再確認'));
  if(!hpId('pickup-slot-select').value){hpId('hp-date-error').textContent=hpMode()==='宅配'?'請選擇出貨日期':'請選擇日期與時段';errors.push('hp-calendar');}
  if(hpMode()!=='自取'){
    if(!hpId('hp-other-recipient').checked)toggleRecipientSame();
    if(!hpId('rcpt-name').value.trim())errors.push(hpError('rcpt-name','請填寫收件人姓名'));if(!/^09\d{8}$/.test(hpId('rcpt-phone').value))errors.push(hpError('rcpt-phone','請填寫收件人10碼手機號碼'));
  }
  if(hpMode()==='宅配'){
    if(!hpId('cust-city').value)errors.push(hpError('cust-city','請選擇縣市'));if(!hpId('cust-addr-detail').value.trim())errors.push(hpError('cust-addr-detail','請填寫區鄉鎮、路段與門牌'));
  }else if(hpMode()==='預約外送'){
    if(!hpId('scheduled-delivery-village').value)errors.push(hpError('scheduled-delivery-village','請選擇有提供外送的里別'));if(!hpId('scheduled-delivery-address-detail').value.trim())errors.push(hpError('scheduled-delivery-address-detail','請填寫路段、門牌與樓層'));if(!hpId('scheduled-details-confirmed').checked)errors.push(hpError('scheduled-details-confirmed','請確認外送資料與時段說明'));
  }
  hpId('hp-form-error').textContent=errors.length?'還有'+errors.length+'個地方需要確認，已在欄位旁標示。':'';
  if(errors.length&&focus){goToStep(2);const el=hpId(errors[0]);el?.scrollIntoView({behavior:'smooth',block:'center'});el?.focus();}
  return !errors.length;
}
function hpValidateCart(){const q=hpGetQuote();if(!cart.length){hpToast('先挑一杯喜歡的甜點吧');return false;}if(hpMode()==='宅配'&&(q.cups<6||q.cups%6)){hpToast('宅配甜點需6杯的倍數，目前'+q.cups+'杯');openCartModal();return false;}if(hpMode()==='預約外送'&&q.cups<12){hpToast('預約外送12杯起，目前還差'+(12-q.cups)+'杯');openCartModal();return false;}return true;}
async function hpNext(){
  if(currentStep===1){if(hpValidateCart()){closeCartModal();goToStep(2);trackInitiateCheckout();}}
  else if(currentStep===2){if(!hpValidateCart()||!hpValidateDetails())return;hpId('btn-next').disabled=true;hpId('btn-next').textContent='正在確認優惠…';await hpLoadBenefits(true);goToStep(3);}
  else await hpSubmit();
}
function hpGoToStep(step,push=true){
  if(step<1||step>3)return;document.querySelectorAll('.step-content').forEach(n=>n.classList.toggle('active',n.id==='step-'+step));document.querySelectorAll('.step-item').forEach((n,i)=>{n.classList.toggle('active',i+1===step);n.classList.toggle('completed',i+1<step);n.setAttribute('aria-current',i+1===step?'step':'false');});
  currentStep=step;hpId('btn-prev').style.display=step>1?'block':'none';hpId('btn-next').textContent=step===1?'確認商品，選擇取貨':step===2?'前往確認與付款':(document.querySelector('input[name="paymentMethod"]:checked')?.value==='ATM'?'確認訂單並取得轉帳帳號':'確認訂單並前往付款');hpId('btn-next').disabled=!cart.length||orderSubmissionInProgress;hpId('hp-cart-next').textContent=step===3?'儲存並返回確認':'選擇取貨與資料';
  if(step===3)hpRenderReview(hpGetQuote());if(push){history.pushState({hpStep:step},'',location.href);window.scrollTo({top:0,behavior:'instant'});}hpSaveDraft();
}
function hpEditDelivery(){goToStep(2);}
function hpCartContinue(){const fields=[...hpId('modal-cart-list').querySelectorAll('.hp-qty input')];if(fields.length===cart.length){const values=fields.map(n=>Number(n.value));if(values.some(n=>!Number.isInteger(n)||n<0||n>999)){hpToast('請先確認商品數量');return;}let changed=false;values.forEach((n,i)=>{if(cart[i].quantity!==n){cart[i].quantity=n;changed=true;}});if(changed){cart=cart.filter(p=>p.quantity>0);hpReconcileBoxes();hpChanged();}}if(!hpValidateCart())return;closeCartModal();if(currentStep===3){if(!hpValidateDetails(false))goToStep(2);else hpRenderReview(hpGetQuote());}else goToStep(2);}
function hpRenderReview(q){
  if(!hpId('hp-review-items'))return;
  hpId('hp-review-items').innerHTML=cart.length?'<div class="hp-review-items">'+cart.map(p=>'<div class="hp-review-item"><div><img src="'+p.image+'" alt="'+hpEsc(p.name)+'" width="44" height="44"><span>'+hpEsc(p.name)+' × '+p.quantity+'</span></div><span>'+hpMoney(p.price*p.quantity)+'</span></div>').join('')+'</div>':'<p class="hp-subtle">尚未選購商品</p>';
  if(q.freeBags)hpId('hp-review-items').innerHTML+='<div class="hp-gift-row">滿額贈保冷袋 '+q.freeBags+'只</div>';
  hpId('hp-box-summary').textContent=completedBoxes.length?'已設定 '+completedBoxes.length+'盒，其餘由店家安排。':'目前由店家安排混裝。';
  const addr=hpMode()==='宅配'?hpId('cust-city').value+hpId('cust-addr-detail').value.trim():hpMode()==='預約外送'?'彰化市'+hpId('scheduled-delivery-village').value+hpId('scheduled-delivery-address-detail').value.trim():'彰化市中正路一段403號';
  hpId('hp-review-fulfillment').innerHTML='<dl class="hp-review-kv"><dt>取貨方式</dt><dd>'+hpEsc(hpMode())+'</dd><dt>'+(hpMode()==='宅配'?'出貨日期':'日期時段')+'</dt><dd>'+hpEsc(hpId('pickup-slot-select').value||'尚未選擇')+'</dd><dt>訂購人</dt><dd>'+hpEsc(hpId('cust-name').value)+'<br>'+hpEsc(hpId('cust-phone').value)+'</dd>'+(hpMode()!=='自取'?'<dt>收件人</dt><dd>'+hpEsc(hpId('rcpt-name').value)+'・'+hpEsc(hpId('rcpt-phone').value)+'</dd>':'')+'<dt>地址</dt><dd>'+hpEsc(addr)+'</dd></dl>'+(hpMode()==='預約外送'?'<p class="hp-quiet">所選為希望送達時段，實際時間由好酪確認。</p>':'')+(hpId('cust-remarks').value?'<p class="hp-subtle">備註：'+hpEsc(hpId('cust-remarks').value)+'</p>':'');
  hpId('hp-review-totals').innerHTML=hpTotalsHtml(q);
  const key=hpId('cust-name').value.trim()+'|'+hpId('cust-phone').value.trim();
  hpId('hp-benefits').innerHTML='<div class="hp-benefit">'+(hp.benefitKey===key?(q.promo?'已自動選用：'+hpEsc(q.promo.name):'目前沒有符合條件的主優惠'):'填寫聯絡資料後，會為你確認首購與回購優惠。')+'<div class="hp-quiet">首購、回購券與95折擇優，不重複折抵。運費門檻依折扣前商品小計。</div><button class="hp-link-btn" onclick="hpLoadBenefits(true)">重新確認優惠</button>'+(q.candidates.length?'<label class="hp-switch"><input type="checkbox" '+(hp.selection==='none'?'':'checked')+' onchange="hp.selection=this.checked?\'auto\':\'none\';renderCart()">自動使用本次最划算的主優惠</label>':'')+'</div>';
  hpId('verify-email-text').textContent=hpId('cust-email').value||'尚未填寫Email';
}
async function hpLoadBenefits(force){
  const name=hpId('cust-name').value.trim(),phone=hpId('cust-phone').value.trim(),key=name+'|'+phone;if(!name||!/^09\d{8}$/.test(phone))return false;if(!force&&hp.benefitKey===key)return true;const sequence=++hp.benefitSeq;
  try{const data=await sendOrderServiceRequest({action:'getShoppingBenefits',name,phone});if(sequence!==hp.benefitSeq)return false;if(!data.success||data.version!==HelloPannaPricing.version)throw new Error(data.msg||'優惠服務暫時無法確認');hp.backendReady=true;hp.benefitKey=key;hp.benefits=data.benefits||{};hp.selection='auto';hpRenderBundles();renderCart();return true;}
  catch(error){if(sequence!==hp.benefitSeq)return false;hp.benefits={};hp.benefitKey='';renderCart();if(force)hpToast('暫時無法確認專屬優惠，請稍後按重新確認');return false;}
}
async function hpCheckPoints(){const name=hpId('cust-name').value.trim(),phone=hpId('cust-phone').value.trim(),email=hpId('cust-email').value.trim(),msg=hpId('points-msg'),btn=document.querySelector('.points-verify-btn');if(!name||!phone||!email){msg.textContent='使用點數請先填寫姓名、手機與Email。';return;}btn.disabled=true;btn.textContent='正在驗證點數…';try{const data=await sendOrderServiceRequest({action:'checkPoints',name,phone,email});if(!data.success)throw new Error(data.msg||'查無相符會員資料');memberMaxPoints=Math.max(0,Number(data.points)||0);hpId('member-points-balance').textContent='可用 '+memberMaxPoints+'點';hpId('points-input-area').style.display=memberMaxPoints?'block':'none';msg.textContent=memberMaxPoints?'驗證完成，可輸入折抵點數或使用全部。':'目前沒有可用點數，本次購買完成取貨後可累積。';renderCart();}catch(e){memberMaxPoints=0;usedPoints=0;hpId('points-input-area').style.display='none';msg.textContent=e.message;renderCart();}finally{btn.disabled=false;btn.textContent='查詢可用點數';}}
async function hpApplyCoupon(){const code=hpId('coupon-code').value.trim().toUpperCase(),msg=hpId('coupon-msg');if(code!=='VIP95'){msg.textContent='查無此優惠碼；首購及回購優惠會自動核對。';return;}const ok=await hpLoadBenefits(true);if(!ok||!hp.benefits.vip95){msg.textContent='此手機目前不符合95折優惠資格。';return;}hp.selection='auto';renderCart();msg.textContent=hp.quote.promo?.code==='VIP95'?'已套用95折優惠。':'已為你選用折抵更多的主優惠，95折不重複計算。';hpId('coupon-code').value='';}
function hpSaveDraft(){
  if(!hp.initialized||!hpId('cust-name')||!hpId('hp-remember-contact'))return;
  const ids=['cust-name','cust-phone','cust-email','rcpt-name','rcpt-phone','cust-city','cust-addr-detail','scheduled-delivery-village','scheduled-delivery-address-detail','cust-remarks'];const contact={};ids.forEach(id=>contact[id]=hpId(id).value);
  try{localStorage.setItem('hp-cart-v20261029',JSON.stringify({at:Date.now(),items:cart.map(p=>({id:p.id,quantity:p.quantity,temperature:p.temperature||''})),boxes:completedBoxes,building:currentBoxBuilding,mode:hpMode(),date:hpId('pickup-slot-select').value,other:hpId('hp-other-recipient').checked}));sessionStorage.setItem('hp-contact-v20261029',JSON.stringify(contact));if(hpId('hp-remember-contact').checked)localStorage.setItem('hp-saved-contact-v20261029',JSON.stringify(contact));else localStorage.removeItem('hp-saved-contact-v20261029');}catch(ignore){}
}
function hpRestoreDraft(){
  try{const draft=JSON.parse(localStorage.getItem('hp-cart-v20261029')||'null');if(draft&&Date.now()-draft.at<86400000){cart=[];(draft.items||[]).forEach(i=>{if(menuData.some(p=>p.id===i.id)&&Number.isInteger(i.quantity)&&i.quantity>0&&i.quantity<=999){if([16,18].includes(i.id)&&!['冰','熱'].includes(i.temperature))return;hpAddRaw(i.id,i.quantity,i.temperature);}});completedBoxes=Array.isArray(draft.boxes)?draft.boxes:[];currentBoxBuilding=[];hpReconcileBoxes();if(['自取','宅配','預約外送'].includes(draft.mode)){document.querySelector('input[name="deliveryMethod"][value="'+draft.mode+'"]').checked=true;hp.delivery=draft.mode;}if(draft.other)hpId('hp-other-recipient').checked=true;hp.pendingRestoreDate=draft.date||'';}
    const saved=localStorage.getItem('hp-saved-contact-v20261029'),contact=JSON.parse(sessionStorage.getItem('hp-contact-v20261029')||saved||'{}');Object.entries(contact).forEach(([id,value])=>{if(hpId(id)&&typeof value==='string')hpId(id).value=value;});hpId('hp-remember-contact').checked=!!saved;hpToggleRecipient();
    const receipt=JSON.parse(sessionStorage.getItem('hp-last-order-v20261029')||'null');if(receipt&&Date.now()-receipt.at<86400000)hp.receipt=receipt;
  }catch(ignore){cart=[];completedBoxes=[];currentBoxBuilding=[];}
}
function hpBuildOrder(){
  const q=hpGetQuote(),name=hpId('cust-name').value.trim(),phone=hpId('cust-phone').value.trim(),email=hpId('cust-email').value.trim(),delivery=hpMode(),payment=document.querySelector('input[name="paymentMethod"]:checked').value;
  let address='',uiAddress='',scheduled=null,remarks=hpId('cust-remarks').value.trim();
  const rcptName=delivery==='自取'?'':hpId('rcpt-name').value.trim(),rcptPhone=delivery==='自取'?'':hpId('rcpt-phone').value.trim();
  if(delivery==='宅配')uiAddress=hpId('cust-city').value+hpId('cust-addr-detail').value.trim();
  if(delivery==='預約外送'){uiAddress='彰化市'+hpId('scheduled-delivery-village').value+hpId('scheduled-delivery-address-detail').value.trim();scheduled={city:'彰化市',village:hpId('scheduled-delivery-village').value,addressDetail:hpId('scheduled-delivery-address-detail').value.trim(),address:uiAddress,recipientName:rcptName,recipientPhone:rcptPhone,detailsConfirmed:true,scheduleAdjustmentAccepted:true};}
  if(uiAddress)address='收件人：'+rcptName+' ('+rcptPhone+') / 地址：'+uiAddress;
  if(completedBoxes.length)remarks+='\n[裝盒分配明細]\n'+completedBoxes.map(b=>b.label+'盒'+(b.note?'（'+b.note+'）':'')+'：'+b.items.map(i=>i.name+'×'+i.qty).join('、')).join('\n');
  const orderData={uxVersion:HelloPannaPricing.version,items:q.items,originalTotal:q.raw,discountPoints:q.usedPoints,otherDiscount:q.discount-q.usedPoints,paymentMethod:payment,receivedAmount:q.total,changeAmount:0,phone,email,name,delivery,address,date:hpId('pickup-slot-select').value,shippingFee:q.shipping,finalTotal:q.total,remarks,totalCups:q.cups,couponCode:q.promo?.code||'',rewardId:q.promo?.rewardId||''};if(scheduled)orderData.scheduledDelivery=scheduled;
  const requestId=getOnlineOrderRequestId(JSON.stringify([name,phone,email.toLowerCase(),q.usedPoints,orderData]));
  const payload={action:'createEcpayOrder',clientVersion:ONLINE_CHECKOUT_FRONTEND_VERSION,name,phone,email,points:email?q.cups:0,usedPoints:q.usedPoints,requestId,orderData,paymentMethod:payment};
  return {payload,q,receipt:{at:Date.now(),name,phone,email,delivery,payment,date:orderData.date,address:uiAddress,rcptName,rcptPhone,items:q.items,total:q.total,quote:q,remarks}};
}
async function hpSubmit(){
  if(orderSubmissionInProgress)return;if(!hpValidateCart()||!hpValidateDetails())return;
  if(!hp.backendReady){const ok=await hpLoadBenefits(true);if(!ok){hpId('hp-submit-error').textContent='訂單服務暫時無法確認，請稍後重新確認優惠與金額，再送出。';return;}hpToast('優惠與金額已更新，請確認後再次按付款');return;}
  const {payload,q,receipt}=hpBuildOrder();orderSubmissionInProgress=true;hpId('btn-next').disabled=true;hpId('hp-submit-error').textContent='';hpId('loading-text').textContent='正在建立訂單，請稍候…';hpId('loading-overlay').style.display='flex';hpSaveDraft();
  let confirmed='';
  try{
    const result=await sendOrderServiceRequest(payload);if(!result.success){orderSubmissionInProgress=false;throw Object.assign(new Error(result.msg||result.error||'訂單尚未完成，請重新確認'),{knownFailure:true});}
    if(!/^\d{14}$/.test(String(result.orderId||'')))throw new Error('訂單結果待確認，請先查詢訂單');confirmed=String(result.orderId);receipt.orderId=confirmed;hp.receipt=receipt;sessionStorage.setItem('hp-last-order-v20261029',JSON.stringify(receipt));
    localStorage.removeItem('hp-cart-v20261029');hpShowResult(receipt,'pending');clearOnlineOrderRequestId(payload.requestId);
    const needsPayment=receipt.payment!=='LinePay'&&q.total>0;
    if(needsPayment){prepareEcpayPostForm(result.ecpayParams,confirmed,q.total,receipt.payment);if(hp.preview&&window.__HP_TEST_API){hpToast('測試：已準備金流表單，未送往真實付款');return;}submitPreparedEcpayPayment();}
    else if(q.total===0)await hpRefreshPayment();
  }catch(error){
    if(confirmed){hpId('hp-result-status-note').textContent='訂單已成立，付款頁尚未開啟，可按下方繼續付款。';}
    else{hpId('hp-submit-error').textContent=error.message+(error.knownFailure?'':'。請先查詢訂單，確認原訂單是否成立。');if(!error.knownFailure){hpId('hp-submit-error').innerHTML=hpEsc(hpId('hp-submit-error').textContent)+' <button class="hp-link-btn" onclick="openOrderQuery()">查詢原訂單</button>';}}
  }finally{hpId('loading-overlay').style.display='none';if(!confirmed&&!orderSubmissionInProgress)hpId('btn-next').disabled=false;}
}
function hpTrackPaid(receipt){
  if(hp.preview)return;
  const key='hp-paid-tracked-'+receipt.orderId;hp.trackedPaid=hp.trackedPaid||{};
  try{if(localStorage.getItem(key))return;}catch(ignore){}
  if(hp.trackedPaid[receipt.orderId])return;
  try{if(typeof gtag==='function')gtag('event','conversion',{'send_to':'AW-17855729381/9La6CO6XneybEOWdo8JC','value':receipt.total,'currency':'TWD','transaction_id':receipt.orderId});}catch(ignore){}
  try{if(typeof fbq==='function')fbq('track','Purchase',{value:receipt.total,currency:'TWD',content_name:'鮮奶酪訂單',num_items:receipt.quote.cups,transaction_id:receipt.orderId},{eventID:'purchase_'+receipt.orderId});}catch(ignore){}
  hp.trackedPaid[receipt.orderId]=true;try{localStorage.setItem(key,'1');}catch(ignore){}
}
function hpShowResult(receipt,state,order){
  if(state==='paid'||state==='settled')hpTrackPaid(receipt);
  hp.receipt=receipt;hpId('shop-view').style.display='none';hpId('hp-mode-wrap').hidden=true;hpId('checkout-bottom-bar').style.display='none';const result=hpId('receipt-view');result.style.display='block';
  const canceled=state==='canceled',paid=state==='paid'||state==='settled',manual=receipt.payment==='LinePay',title=canceled?'訂單已取消':state==='settled'?'訂單成立，無需付款':paid?'付款已確認':manual?'訂單已成立，等待付款／核款':'訂單已成立，請完成付款';
  result.innerHTML='<div class="hp-result"><div class="hp-status-icon">'+(paid?'✓':canceled?'—':'…')+'</div><div class="hp-eyebrow">HELLO 好酪・ORDER</div><h1 class="hp-status-title">'+title+'</h1><p class="hp-order-id">訂單編號 #'+hpEsc(receipt.orderId)+'</p><p class="hp-subtle" id="hp-result-status-note">'+(paid?'好酪已確認付款，取貨與配送資訊如下。':manual?'LINE Pay需自行輸入金額，付款後由好酪人工核對。':'付款狀態以訂單系統確認結果為準，離開付款頁仍可回來接續。')+'</p><section class="hp-panel"><div class="hp-money-row total" style="border:0;padding:0"><span>訂單總額</span><span>'+hpMoney(receipt.total)+'</span></div><dl class="hp-review-kv"><dt>取貨方式</dt><dd>'+hpEsc(receipt.delivery)+'</dd><dt>'+(receipt.delivery==='宅配'?'出貨日期':'日期時段')+'</dt><dd>'+hpEsc(receipt.date)+'</dd><dt>訂購人</dt><dd>'+hpEsc(receipt.name)+'・'+hpEsc(receipt.phone)+'</dd><dt>取貨地址</dt><dd>'+hpEsc(receipt.address||'彰化市中正路一段403號')+'</dd></dl><details class="hp-disclosure"><summary>查看商品與金額明細</summary><div style="padding:0 16px 16px">'+receipt.items.map(p=>'<div class="hp-money-row"><span>'+hpEsc(p.name)+' × '+p.quantity+'</span><span>'+hpMoney(p.price*p.quantity)+'</span></div>').join('')+hpTotalsHtml(receipt.quote,receipt.delivery)+'</div></details><div class="hp-result-actions" id="hp-result-actions"></div></section><section class="hp-panel"><h2>訂單與付款進度</h2><p class="hp-subtle">'+(paid?'完成取貨或出貨後，可於下次結帳驗證30天內的回購券。':'如已完成付款，可按重新確認。ATM取號完成仍需轉帳；LINE Pay需等待人工核款。')+'</p><button class="action-btn secondary" onclick="hpRefreshPayment()" id="hp-check-payment">重新確認付款狀態</button><button class="hp-link-btn" onclick="openOrderQuery()">查詢全部訂單</button></section><div class="hp-result-actions"><button class="action-btn secondary" onclick="hpCopyReceipt()">複製訂單資訊</button><a class="action-btn" href="https://lin.ee/UHEkfgW" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">聯絡好酪</a></div><button class="hp-link-btn" onclick="hpStartNewOrder()" style="width:100%;margin-top:20px">返回選購</button><p class="hp-quiet" style="margin-top:18px">已由系統確認的付款，不需再複製訂單傳送客服。人工核款或有特殊需求時，才需要聯絡。</p></div>';
  const actions=hpId('hp-result-actions');
  if(!paid&&!canceled&&receipt.total>0){if(manual)actions.innerHTML='<a class="action-btn" style="text-align:center;text-decoration:none" href="'+LINE_PAY_LINK+'" target="_blank" rel="noopener">開啟LINE Pay・付款 '+receipt.total+'元</a><a class="action-btn secondary" href="https://lin.ee/UHEkfgW" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">付款後聯絡核款</a>';else actions.innerHTML='<button class="action-btn" onclick="hpResumeLastOrder()">'+(receipt.payment==='ATM'?'接續取得轉帳帳號':'繼續原訂單付款')+'</button>';}
  window.scrollTo({top:0,behavior:'instant'});
}
async function hpRefreshPayment(){if(!hp.receipt)return;const btn=hpId('hp-check-payment');if(btn){btn.disabled=true;btn.textContent='正在查詢付款狀態…';}try{const data=await sendOrderServiceRequest({action:'queryOrder',name:hp.receipt.name,phone:hp.receipt.phone});const order=data.orders?.find(o=>String(o.orderId)===hp.receipt.orderId);if(!data.success||!order)throw new Error('目前查不到這筆訂單，請使用查詢訂單或聯絡好酪');hpShowResult(hp.receipt,order.paymentState||(/已確認付款|已出貨|已完成/.test(order.status)?'paid':'pending'),order);hpToast('最新狀態：'+order.status);}catch(e){hpId('hp-result-status-note').textContent=e.message;}finally{const b=hpId('hp-check-payment');if(b){b.disabled=false;b.textContent='重新確認付款狀態';}}}
async function hpResumeLastOrder(){if(!hp.receipt||paymentResumeInProgress)return;const r=hp.receipt;paymentResumeInProgress=true;hpId('loading-overlay').style.display='flex';hpId('loading-text').textContent='正在取得原訂單付款資料…';try{const data=await sendOrderServiceRequest({action:'resumeEcpayPayment',name:r.name,phone:r.phone,orderId:r.orderId});if(!data.success){if(data.code==='ALREADY_PAID'){await hpRefreshPayment();return;}throw new Error(data.msg||'這筆訂單目前無法接續付款，請重新確認狀態');}if(data.atmInfo){hpShowAtmInfo(data.atmInfo);return;}prepareEcpayPostForm(data.ecpayParams,r.orderId,r.total,data.paymentMethod);if(hp.preview&&window.__HP_TEST_API){hpToast('測試：接續原訂單付款，未建立新單');return;}submitPreparedEcpayPayment();}catch(e){hpId('hp-result-status-note').textContent=e.message;}finally{paymentResumeInProgress=false;hpId('loading-overlay').style.display='none';}}
async function hpCopyReceipt(){if(!hp.receipt)return;const r=hp.receipt,text='Hello 好酪訂單 #'+r.orderId+'\n'+r.name+' / '+r.phone+'\n'+r.delivery+' '+r.date+'\n'+r.items.map(i=>i.name+' × '+i.quantity).join('\n')+'\n應付總額：'+hpMoney(r.total);try{await navigator.clipboard.writeText(text);hpToast('訂單資訊已複製');}catch(e){hpToast('無法複製，可使用訂單編號聯絡好酪');}}
function hpStartNewOrder(){cart=[];completedBoxes=[];currentBoxBuilding=[];usedPoints=0;memberMaxPoints=0;hp.benefits={};hp.benefitKey='';hp.selection='auto';orderSubmissionInProgress=false;hpId('receipt-view').style.display='none';hpId('shop-view').style.display='block';hpId('hp-mode-wrap').hidden=false;hpId('checkout-bottom-bar').style.display='flex';hpChanged();hpGoToStep(1);}
function hpShowAtmInfo(info){hpShowDialog('<h2>原訂單ATM轉帳資訊</h2><dl class="hp-review-kv"><dt>銀行代碼</dt><dd>'+hpEsc(info.bankCode)+'</dd><dt>虛擬帳號</dt><dd>'+hpEsc(info.account)+'</dd><dt>繳款期限</dt><dd>'+hpEsc(info.expiresAt)+'</dd></dl><p class="hp-subtle">取號完成尚未付款，請依訂單金額於期限內轉帳。</p><button class="action-btn" style="width:100%" onclick="hpCloseDialog()">我知道了</button>','ATM轉帳帳號');}
function hpInit(){
  hpMount();
  renderMenu=hpRenderMenu;renderCart=hpRenderCart;calculateOrderTotals=hpGetQuote;updateDateSettings=hpUpdateDateSettings;goToStep=hpGoToStep;handleNextClick=hpNext;submitFinalOrder=hpSubmit;checkMemberPoints=hpCheckPoints;applyCoupon=hpApplyCoupon;handleDeliveryMethodChange=()=>hpRequestMode(hpMode());prepareStep2=()=>hpRenderReview(hpGetQuote());prepareStep3=prepareStep2;
  closeBoxingModal=()=>{hpOriginalCloseBoxing();hpSaveDraft();};saveCurrentBox=()=>{hpOriginalSaveBox();hpSaveDraft();};unpackBox=i=>{hpOriginalUnpackBox(i);hpSaveDraft();};autoFillBoxes=()=>{hpOriginalAutoBoxes();hpSaveDraft();};
  updateItemQty=(id,delta,temp='')=>{const i=cart.findIndex(p=>p.id===id&&(!isCoffeeItem(p)||p.temperature===temp));if(i>=0)hpSetQty(i,cart[i].quantity+delta);};changeQty=(i,d)=>hpSetQty(i,cart[i].quantity+d);
  sendOrderServiceRequest=payload=>{if(hp.preview){if(typeof window.__HP_TEST_API==='function')return Promise.resolve(window.__HP_TEST_API(payload));return Promise.reject(new Error('目前是預覽頁面，正式下單請使用好酪官網'));}return hpOriginalBridge(payload);};
  hpRestoreDraft();hp.initialized=true;hp.delivery=hpMode();hpRenderBundles();renderMenu();renderCart();
  if(hp.pendingRestoreDate&&[...hpId('pickup-slot-select').options].some(o=>o.value===hp.pendingRestoreDate)){hpId('pickup-slot-select').value=hp.pendingRestoreDate;hp.selectedDay=hp.pendingRestoreDate.slice(0,10);hp.calendarMonth=hp.pendingRestoreDate.slice(0,7);hpRenderCalendar();}
  history.replaceState({hpStep:1},'',location.href);hpGoToStep(1,false);
  ['cust-name','cust-phone'].forEach(id=>hpId(id).addEventListener('input',()=>{hp.benefitSeq++;hp.benefits={};hp.benefitKey='';hp.selection='auto';hpRenderBundles();renderCart();}));
  document.querySelectorAll('#step-2 input,#step-2 select,#step-2 textarea').forEach(n=>{n.addEventListener('input',hpSaveDraft);n.addEventListener('change',()=>{hpSaveDraft();hpRenderReview(hpGetQuote());});});
  hpId('cust-phone').addEventListener('blur',()=>hpLoadBenefits(false));hpId('cust-name').addEventListener('blur',()=>hpLoadBenefits(false));
  hpId('hp-remember-contact').addEventListener('change',hpSaveDraft);
  document.querySelectorAll('input[name="paymentMethod"]').forEach(n=>n.addEventListener('change',()=>{updatePaymentHelp();hpGoToStep(currentStep,false);}));
  window.addEventListener('popstate',event=>{if(event.state?.hpStep&&hpId('receipt-view').style.display==='none')hpGoToStep(event.state.hpStep,false);});
  window.addEventListener('pageshow',event=>{hpId('loading-overlay').style.display='none';if(event.persisted&&hp.receipt){hpShowResult(hp.receipt,'pending');hpRefreshPayment();}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeCartModal();closeOrderQuery();if(hpId('boxing-modal-overlay').style.display==='flex')closeBoxingModal();}});
  if(hp.receipt){const recovery=hpEl('div','hp-recovery','<span>上次訂單 #'+hpEsc(hp.receipt.orderId)+'<br>可以查詢狀態或接續付款。</span><button onclick="hpShowResult(hp.receipt,\'pending\');hpRefreshPayment()">查看訂單</button>');hpId('step-1').prepend(recovery);}
  if(new URLSearchParams(location.search).get('payment')==='return'){if(hp.receipt){hpShowResult(hp.receipt,'pending');hpRefreshPayment();}else{openOrderQuery();hpToast('輸入訂購人姓名與手機，即可確認付款狀態');}}
  if(!hp.preview)logVisit();
  document.documentElement.classList.remove('hp-pending');
  window.__hpReady=true;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hpInit,{once:true});else hpInit();
