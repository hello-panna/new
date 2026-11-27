const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {test}=require('node:test');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'assets/fulfillment-availability-20261103.js'),'utf8');
const catalog={1:{name:'原味奶酪'},14:{name:'烤布丁'},13:{name:'保冷袋',bag:true},16:{name:'美式咖啡',coffee:true},21:{name:'雪花酥',snowflake:true},100:{name:'自訂奶酪'}};
function front(){
  let updates=0;
  const s=vm.createContext({console,webOrderCatalog:()=>catalog,webProductSettings:{},webCatalogProducts:{},applyWebProductCatalog(){return false;},window:{onFulfillmentAvailabilityUpdated(){updates++;}}});
  vm.runInContext(source,s);
  const snapshot=(limit=18,extra={})=>({success:true,version:'FULFILLMENT_DATES_20261103_1',revision:1,closed:[],nextDayCupLimit:limit,...extra});
  const apply=(limit,extra)=>s.applyFulfillmentAvailability(snapshot(limit,extra));
  return {s,apply,updates:()=>updates,limit:()=>vm.runInContext('fulfillmentAvailability.nextDayCupLimit',s)};
}
test('default and new thresholds use a strict greater-than boundary',()=>{
  const f=front();f.apply(18);
  for(const [limit,cups,days] of [[18,18,1],[18,19,2],[24,19,1],[24,24,1],[24,25,2],[6,6,1],[6,7,2],[0,1,2],[9999,9999,1]]){
    f.apply(limit);const lead=f.s.getFulfillmentLeadTime([{id:1,quantity:cups}]);
    assert.equal(lead.quantityDays,days);assert.equal(lead.nextDayCupLimit,limit);
  }
});
test('only purchased dessert cups contribute; the longest product rule still wins',()=>{
  const f=front();f.apply(18);
  const lead=f.s.getFulfillmentLeadTime([{id:1,quantity:10},{id:14,quantity:8},{id:13,quantity:100},{id:16,quantity:100},{id:21,quantity:100},{id:1,quantity:100,isGift:true}]);
  assert.equal(lead.cups,18);assert.equal(lead.quantityDays,1);assert.equal(lead.days,2);
  f.s.webCatalogProducts={100:{id:100,leadDays:5}};f.apply(9999);
  assert.equal(f.s.getFulfillmentLeadTime([{id:100,quantity:1}]).days,5);
});
test('setting changes notify the calendar even when the revision is unchanged',()=>{
  const f=front();f.apply(18);const before=f.updates();f.apply(24);assert.equal(f.updates(),before+1);
  f.apply(24);assert.equal(f.updates(),before+1);
});
test('old responses use 18 while malformed limits cannot replace good state',()=>{
  const f=front();f.apply(24);
  for(const value of [-1,1.5,10000,'24',null,NaN])assert.throws(()=>f.apply(value),/杯數設定格式異常/);
  assert.equal(f.limit(),24);f.apply(undefined);assert.equal(f.limit(),18);
});
test('date validity changes at the configured threshold and preserves the 60-day window',()=>{
  const f=front(),now=new Date('2026-11-24T01:00:00Z'),items=[{id:1,quantity:24}];
  f.apply(18);assert.equal(f.s.isFulfillmentLeadDateValid(items,'2026/11/25 (三) 10:00~11:00',now),false);
  f.apply(24);assert.equal(f.s.isFulfillmentLeadDateValid(items,'2026/11/25 (三) 10:00~11:00',now),true);
  assert.equal(f.s.isFulfillmentLeadDateValid(items,'2027/01/24',now),false);
});
test('all three date-picker modes use the synchronized rule, including raising above 18',()=>{
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const a=index.indexOf('function updateDateSettings('),b=index.indexOf('function generateOptions(',a);
  assert.ok(a>=0&&b>a);const fn=index.slice(a,b);
  const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{style:{},value:'',innerText:'',innerHTML:'',options:[]});return nodes.get(id);};
  const chosen=[];let quantityDays=1,limit=24;
  const s=vm.createContext({document:{getElementById:node},cart:[{id:1,quantity:24}],isDessertItem:()=>true,
    getFulfillmentLeadTime:()=>({quantityDays,nextDayCupLimit:limit}),fulfillmentToday:()=>new Date(2026,10,24,12),
    generateOptions:(mode,days)=>chosen.push({mode,days})});vm.runInContext(fn,s);
  for(const mode of ['pickup','delivery','scheduled']){s.updateDateSettings(mode);assert.equal(chosen.at(-1).days,1);}
  quantityDays=2;limit=6;
  for(const mode of ['pickup','delivery','scheduled']){s.updateDateSettings(mode);assert.equal(chosen.at(-1).days,2);assert.match(node('date-hint').innerHTML,/超過 6 杯/);}
  assert.match(index,/fulfillment-availability-20261103\.js\?v=20261127-quantity-lead-v1/);
});
test('visible calendar explanation follows the configured threshold',()=>{
  const shop=fs.readFileSync(path.join(root,'assets/shop-20261123-merchant.js'),'utf8');
  assert.match(shop,/id="hp-date-legend"/);assert.doesNotMatch(shop,/訂購超過18杯/);
  assert.match(shop,/getFulfillmentLeadTime\(cart\)\.nextDayCupLimit/);
});
