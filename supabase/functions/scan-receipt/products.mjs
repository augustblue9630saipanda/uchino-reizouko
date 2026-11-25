export const importCategories=['野菜・果物','肉・魚','卵・乳製品','主食','その他'];
export const importLevels={low:'少',normal:'並',high:'多'};
export const productKey=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/[\s・\-ー()（）]/g,'');
const knownFoods=[
 [/豚.*ばら|ぽーく.*ばら/,'豚バラ肉','肉・魚'],[/豚|ぽーく/,'豚肉','肉・魚'],[/鶏|とり肉|ちきん/,'鶏肉','肉・魚'],[/牛肉|びーふ/,'牛肉','肉・魚'],
 [/玉ねぎ|玉葱|たまねぎ/,'玉ねぎ','野菜・果物'],[/にんじん|人参/,'にんじん','野菜・果物'],[/じゃが|馬鈴薯/,'じゃがいも','野菜・果物'],[/きゃべつ/,'キャベツ','野菜・果物'],
 [/白菜|はくさい/,'白菜','野菜・果物'],[/ぶろっこり/,'ブロッコリー','野菜・果物'],[/とまと/,'トマト','野菜・果物'],[/しめじ/,'しめじ','野菜・果物'],[/えのき/,'えのき','野菜・果物'],[/しいたけ|椎茸/,'しいたけ','野菜・果物'],
 [/牛乳|みるく/,'牛乳','卵・乳製品'],[/ちーず/,'チーズ','卵・乳製品'],[/たまご|玉子|卵/,'卵','卵・乳製品'],[/とうふ|豆腐/,'豆腐','その他'],
 [/ばなな/,'バナナ','野菜・果物'],[/りんご/,'りんご','野菜・果物'],[/鮭|さけ|さもん|さーもん/,'鮭','肉・魚'],[/鯖|さば/,'さば','肉・魚'],
 [/食ぱん/,'食パン','主食'],[/ぱすた/,'パスタ','主食'],[/うどん/,'うどん','主食'],[/米/,'米','主食']
];
export function describeProduct(raw,categoryFor=()=> 'その他'){
 const key=productKey(raw);
 if(/洗剤|柔軟|洗濯|せっけん|石鹸|しゃんぷ|りんす|てぃっしゅ|といれ|ごみ袋|歯磨|歯ぶらし|おむつ|らっぷ|あるみほいる|すぽんじ|電池/.test(key))return {name:raw,category:'その他',kind:'日用品'};
 const rule=knownFoods.find(([pattern])=>pattern.test(key));if(rule)return {name:rule[1],category:rule[2],kind:'食材'};
 const category=categoryFor({name:raw});
 return {name:raw,category,kind:category!=='その他'||/しょうゆ|醤油|みそ|味噌|砂糖|食塩|こしょう|片栗粉|小麦粉|かれ|だし|調味料/.test(key)?'食材':'不明'};
}
export function shoppingMatches(candidate,shopping){
 const raw=productKey(candidate.originalName||candidate.name),name=productKey(candidate.name),canonical=productKey(describeProduct(candidate.name).name);
 return shopping.filter(i=>!i.pantry_registered_at).map(i=>{
  const k=productKey(i.name),common=productKey(describeProduct(i.name).name);
  const exact=k===raw||k===name,alias=canonical===common;
  const loose=!exact&&!alias&&(name.length>=2&&k.length>=2&&(k.includes(name)||name.includes(k)));
  return {...i,match:exact?'完全一致':alias?'表記違いの候補':loose?'要確認の候補':'',rank:exact?0:alias?1:2};
 }).filter(i=>i.match).sort((a,b)=>a.rank-b.rank);
}
export function ingredientKey(s){
 const key=String(s).normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/\s/g,'');
 return ({'たまご':'卵','玉子':'卵','人参':'にんじん','たまねぎ':'玉ねぎ','玉葱':'玉ねぎ','とうふ':'豆腐'})[key]||key;
}
