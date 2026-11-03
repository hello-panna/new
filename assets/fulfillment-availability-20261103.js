/* 額外停用日期；營業日、備料期與品項限制仍由原日期產生器決定。 */
'use strict';
const fulfillmentAvailability={loaded:false,revision:0,closed:{'2026-11-17':7},lastFetch:0,pending:null,initialized:false,lastError:''};
function fulfillmentModeBit(mode){return ({pickup:1,delivery:2,scheduled:4,'自取':1,'宅配':2,'預約外送':4})[mode]||0;}
function fulfillmentDateKey(value){const m=String(value||'').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?=\s|T|$)/);return m?m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'):'';}
function isFulfillmentDateClosed(mode,date){const key=fulfillmentDateKey(date),bit=fulfillmentModeBit(mode);return !!(key&&bit&&(fulfillmentAvailability.closed[key]&bit));}
function applyFulfillmentAvailability(data){
  if(!data||data.success!==true||data.version!=='FULFILLMENT_DATES_20261103_1'||!Number.isSafeInteger(data.revision)||data.revision<0||!Array.isArray(data.closed)||data.closed.length>400)throw new Error('取貨日期設定尚未同步，請稍後再試');
  const next=Object.create(null);
  data.closed.forEach(row=>{if(!row||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isSafeInteger(row.mask)||row.mask<1||row.mask>7||next[row.date]!==undefined)throw new Error('取貨日期設定格式異常');next[row.date]=row.mask;});
  const changed=!fulfillmentAvailability.loaded||data.revision!==fulfillmentAvailability.revision||JSON.stringify(next)!==JSON.stringify(fulfillmentAvailability.closed);
  fulfillmentAvailability.closed=next;fulfillmentAvailability.revision=data.revision;fulfillmentAvailability.loaded=true;fulfillmentAvailability.lastFetch=Date.now();fulfillmentAvailability.lastError='';
  if(changed&&typeof window.onFulfillmentAvailabilityUpdated==='function')window.onFulfillmentAvailabilityUpdated();
}
async function refreshFulfillmentAvailability(force=false){
  if(fulfillmentAvailability.pending)return fulfillmentAvailability.pending;
  if(!force&&fulfillmentAvailability.loaded&&Date.now()-fulfillmentAvailability.lastFetch<15000)return true;
  const request=(async()=>{
    try{const result=await sendOrderServiceRequest({action:'getFulfillmentAvailability'});if(!result||!result.success)throw new Error(result&&result.msg||'取貨日期暫時無法同步');applyFulfillmentAvailability(result);return true;}
    catch(error){fulfillmentAvailability.lastError=String(error.message||error);return false;}
  })();
  fulfillmentAvailability.pending=request;
  try{return await request;}finally{if(fulfillmentAvailability.pending===request)fulfillmentAvailability.pending=null;}
}
function initializeFulfillmentAvailability(){
  if(fulfillmentAvailability.initialized)return;fulfillmentAvailability.initialized=true;refreshFulfillmentAvailability(true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshFulfillmentAvailability(true);});
  setInterval(()=>{if(!document.hidden)refreshFulfillmentAvailability(true);},30000);
}
