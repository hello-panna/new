/* 日期停用與商品備貨天數；前後端皆使用台灣日期與整筆訂單最長天數。 */
'use strict';
const fulfillmentAvailability={loaded:false,revision:0,closed:{'2026-11-17':7},productLeadDays:Object.create(null),calendarDay:'',lastFetch:0,pending:null,initialized:false,lastError:''};
function fulfillmentModeBit(mode){return ({pickup:1,delivery:2,scheduled:4,'自取':1,'宅配':2,'預約外送':4})[mode]||0;}
function fulfillmentDateKey(value){const m=String(value||'').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?=\s|T|$)/);return m?m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'):'';}
function fulfillmentToday(now=new Date()){const parts=new Date(now.getTime()+8*3600000).toISOString().slice(0,10).split('-').map(Number);return new Date(parts[0],parts[1]-1,parts[2],12);}
function isFulfillmentDateClosed(mode,date){const key=fulfillmentDateKey(date),bit=fulfillmentModeBit(mode);return !!(key&&bit&&(fulfillmentAvailability.closed[key]&bit));}
function getFulfillmentLeadTime(items){
  const catalog=webOrderCatalog();let cups=0,productDays=1,names=[];
  (Array.isArray(items)?items:[]).forEach(item=>{
    if(!item||item.isGift===true)return;
    const product=catalog[Number(item.id)],quantity=Number(item.quantity??item.qty);
    if(!product||product.bag||!Number.isSafeInteger(quantity)||quantity<=0)return;
    if(!product.coffee&&!product.snowflake)cups+=quantity;
    const days=fulfillmentAvailability.productLeadDays[item.id]||(product.snowflake?2:1);
    const name = webProductSettings[item.id]?.title ?? product.name;
    if(days>productDays){productDays=days;names=[name];}else if(days===productDays&&days>1&&!names.includes(name))names.push(name);
  });
  const quantityDays=cups>18?2:1;return {days:Math.max(quantityDays,productDays),cups,quantityDays,productDays,names};
}
function isFulfillmentLeadDateValid(items,value,now=new Date()){
  if(!fulfillmentAvailability.loaded)return false;
  const key=fulfillmentDateKey(value),day=new Date(key+'T00:00:00Z');if(!key||!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==key)return false;
  const today=new Date(now.getTime()+8*3600000).toISOString().slice(0,10),ahead=(day.getTime()-new Date(today+'T00:00:00Z').getTime())/86400000,lead=getFulfillmentLeadTime(items).days;
  return ahead>=lead&&ahead<lead+60;
}
function applyFulfillmentAvailability(data){
  if(!data||data.success!==true||data.version!=='FULFILLMENT_DATES_20261103_1'||!Number.isSafeInteger(data.revision)||data.revision<0||!Array.isArray(data.closed)||data.closed.length>400)throw new Error('取貨日期設定尚未同步，請稍後再試');
  const next=Object.create(null),leads=Object.create(null);
  data.closed.forEach(row=>{if(!row||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isSafeInteger(row.mask)||row.mask<1||row.mask>7||next[row.date]!==undefined)throw new Error('取貨日期設定格式異常');next[row.date]=row.mask;});
  const catalogChanged = applyWebProductCatalog(data.catalog);
  Object.values(webCatalogProducts).forEach(product => { leads[product.id] = product.leadDays; });
  const calendarDay=new Date(Date.now()+8*3600000).toISOString().slice(0,10),changed=!fulfillmentAvailability.loaded||calendarDay!==fulfillmentAvailability.calendarDay||data.revision!==fulfillmentAvailability.revision||JSON.stringify(next)!==JSON.stringify(fulfillmentAvailability.closed)||JSON.stringify(leads)!==JSON.stringify(fulfillmentAvailability.productLeadDays);
  const firstLoad = !fulfillmentAvailability.loaded;
  fulfillmentAvailability.closed=next;fulfillmentAvailability.productLeadDays=leads;fulfillmentAvailability.calendarDay=calendarDay;fulfillmentAvailability.revision=data.revision;fulfillmentAvailability.loaded=true;fulfillmentAvailability.lastFetch=Date.now();fulfillmentAvailability.lastError='';
  if ((changed || catalogChanged) && typeof window.onFulfillmentAvailabilityUpdated === 'function') {
    window.onFulfillmentAvailabilityUpdated({catalogChanged,firstLoad});
  }
}
async function refreshFulfillmentAvailability(force=false){
  if(fulfillmentAvailability.pending)return fulfillmentAvailability.pending;
  if(!force&&fulfillmentAvailability.loaded&&Date.now()-fulfillmentAvailability.lastFetch<15000)return true;
  const request=(async()=>{
    try{const result=await sendOrderServiceRequest({action:'getFulfillmentAvailability'});if(!result||!result.success)throw new Error(result&&result.msg||'取貨日期暫時無法同步');applyFulfillmentAvailability(result);return true;}
    catch(error){fulfillmentAvailability.lastError=String(error.message||error);if(!fulfillmentAvailability.loaded&&typeof window.onFulfillmentAvailabilityUpdated==='function')window.onFulfillmentAvailabilityUpdated();return false;}
  })();
  fulfillmentAvailability.pending=request;
  try{return await request;}finally{if(fulfillmentAvailability.pending===request)fulfillmentAvailability.pending=null;}
}
function initializeFulfillmentAvailability(){
  if(fulfillmentAvailability.initialized)return;fulfillmentAvailability.initialized=true;refreshFulfillmentAvailability(true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshFulfillmentAvailability(true);});
  setInterval(()=>{if(!document.hidden)refreshFulfillmentAvailability(true);},30000);
}
