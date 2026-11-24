// Shared JST calendar arithmetic. A registration date is never an expiry date.
export const moodOptions=['がっつり','さっぱり','お肉','お魚','時短','節約','子どもが喜ぶ'];
export function japanToday(now=Date.now()){
 return new Date(now+9*3600000).toISOString().slice(0,10);
}
export function validDay(day){
 return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
}
export function registrationDay(item){
 // An explicit null means the family marked the date as unknown.
 if(Object.hasOwn(item,'registered_on'))return validDay(item.registered_on)?item.registered_on:null;
 const time=Date.parse(item.created_at);return Number.isFinite(time)?japanToday(time):null;
}
export function elapsedDays(item,now=Date.now()){
 const day=registrationDay(item);if(!day)return null;
 return Math.max(0,Math.round((Date.parse(japanToday(now)+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'))/86400000));
}
export function ageLabel(item,now=Date.now()){
 const days=elapsedDays(item,now);return days===null?'登録日不明':days===0?'今日登録':days+'日前';
}
export function sortPantry(items,order){
 if(!['oldest','newest'].includes(order))return [...items];
 return [...items].sort((a,b)=>{
  const x=registrationDay(a),y=registrationDay(b);
  if(!x||!y)return x?-1:y?1:0;
  return order==='oldest'?x.localeCompare(y):y.localeCompare(x);
 });
}
export function dinnerPreferences(body){
 const requestText=body.requestText??'',moods=body.moods??[],purchaseMode=body.purchaseMode??'balanced';
 if(typeof requestText!=='string'||requestText.length>400||!Array.isArray(moods)||moods.length>7||moods.some(x=>!moodOptions.includes(x))||!['balanced','pantry','flexible'].includes(purchaseMode))throw Error('リクエストは400文字以内で、買い足し条件と気分を確認してください。');
 return {requestText:requestText.trim(),moods:[...new Set(moods)],purchaseMode};
}
export function inventoryContext(rows,now=Date.now()){
 return rows.filter(r=>typeof r.name==='string'&&r.name.trim()).map(r=>({name:r.name.trim().slice(0,100),quantityLevel:({low:'少',normal:'並',high:'多'})[r.quantity_level]||'並',elapsedDays:elapsedDays(r,now)}));
}
