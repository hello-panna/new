/* Hello 好酪：官網與 Apps Script 共用的價格規則。金額均為整數新台幣。 */
var HelloPannaPricing = (function () {
  'use strict';
  var version='2026-10-29-shopping-v1';
  var catalog={1:{name:'經典原味鮮奶酪',price:50},2:{name:'巧克力鮮奶酪',price:55},7:{name:'伯爵紅茶鮮奶酪',price:55},10:{name:'十薰茉綠鮮奶酪',price:55},3:{name:'芝麻鮮奶酪',price:55},20:{name:'草莓鮮奶酪',price:55},4:{name:'抹茶鮮奶酪',price:55},6:{name:'泰式奶茶鮮奶酪',price:55},8:{name:'芋香紫薯鮮奶酪',price:55},9:{name:'微醺蘭姆鮮奶酪',price:55},5:{name:'咖啡鮮奶酪',price:55},15:{name:'黃金蕎麥鮮奶酪',price:55},14:{name:'烤布丁',price:55},21:{name:'抹茶烤布丁',price:60},16:{name:'美式咖啡',price:60,coffee:true},18:{name:'拿鐵咖啡',price:75,coffee:true},13:{name:'質感保冷袋',price:15,bag:true}};
  function integer(n,min,max,label){n=Number(n);if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(label+'不正確');return n;}
  function quote(input,options){
    options=options||{};var benefits=options.benefits||{},delivery=options.delivery||'自取';
    if(['自取','宅配','預約外送'].indexOf(delivery)<0)throw new Error('取貨方式不正確');
    var counts={},raw=0,cups=0,coffee=0,panna=0,items=[];
    (input||[]).forEach(function(item){
      if(item.isGift===true)return;
      var id=Number(item.id),p=catalog[id];if(!p)throw new Error('有商品已調整，請重新選購');
      var quantity=integer(item.quantity,1,999,'商品數量');
      var temperature=p.coffee?String(item.temperature||''):'';
      if(p.coffee&&['冰','熱'].indexOf(temperature)<0)throw new Error('請選擇咖啡的冰／熱');
      if(p.coffee&&delivery==='宅配')throw new Error('咖啡不提供冷藏宅配');
      raw+=p.price*quantity;counts[id]=(counts[id]||0)+quantity;
      if(p.coffee)coffee+=quantity;else if(!p.bag){cups+=quantity;if(id!==14&&id!==21)panna+=quantity;}
      items.push({id:id,name:p.name+(p.coffee?'（'+temperature+'）':''),price:p.price,quantity:quantity,temperature:temperature,category:p.coffee?'coffee':(p.bag?'bag':'dessert')});
    });
    var coffeeCups=Math.min(panna,coffee),coffeeDiscount=coffeeCups*10,base=raw-coffeeDiscount;
    var candidates=[];
    if(benefits.first===true&&(counts[1]||0)>=2&&(counts[2]||0)>=2&&(counts[7]||0)>=2)candidates.push({code:'FIRST20',name:'首購人氣六入折20元',amount:Math.min(20,base)});
    if(benefits.rewardId&&cups>=6)candidates.push({code:'RETURN20',name:'六入回購券折20元',amount:Math.min(20,base),rewardId:benefits.rewardId});
    if(benefits.vip95===true)candidates.push({code:'VIP95',name:'好酪友95折',amount:base-Math.floor(base*.95)});
    candidates.sort(function(a,b){return b.amount-a.amount;});
    var selection=options.selection||'auto',chosen=null;
    if(selection==='auto')chosen=candidates[0]||null;
    else if(selection!=='none')chosen=candidates.filter(function(x){return x.code===selection;})[0]||null;
    var promo=chosen?chosen.amount:0,used=integer(options.usedPoints||0,0,999999,'折抵點數');
    used=Math.min(used,Math.max(0,base-promo));
    var shippingBase=0,shippingDiscount=0;
    if(delivery==='宅配'&&cups){shippingBase=cups<=12?130:(cups<=48?170:210);shippingDiscount=raw>=2000?shippingBase:(raw>=1200?Math.min(50,shippingBase):0);}
    var shipping=shippingBase-shippingDiscount;
    return {version:version,items:items,raw:raw,cups:cups,coffee:coffee,panna:panna,coffeeCups:coffeeCups,coffeeDiscount:coffeeDiscount,promo:chosen,candidates:candidates,usedPoints:used,discount:coffeeDiscount+promo+used,shippingBase:shippingBase,shippingDiscount:shippingDiscount,shipping:shipping,freeBags:Math.floor(cups/12),total:Math.max(0,base-promo-used)+shipping};
  }
  return {version:version,catalog:catalog,quote:quote};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=HelloPannaPricing;
