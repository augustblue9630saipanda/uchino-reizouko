import {japanToday,validDay,ageLabel} from './supabase/functions/generate-dinner/context.mjs?v=20261124.1';

import {importCategories,importLevels,describeProduct,shoppingMatches,ingredientKey} from './supabase/functions/scan-receipt/products.mjs?v=20261125.1';
export {describeProduct,shoppingMatches,ingredientKey} from './supabase/functions/scan-receipt/products.mjs?v=20261125.1';
const pantryKey=ingredientKey;

export function createPurchaseImport({document,window,db,getScope,getStock,getShopping,refresh,notify,openSheet,el,button,categoryFor,foodGlyph,prepareReceiptImage}){
 const $=id=>document.getElementById(id);
 let candidates=[],batch=null,source='shopping',receiptKey=null,file=null,photoURL=null,version=0,loading=false,saving=false,locked=false;
 const scope=()=>({...getScope(),version});
 const current=s=>s.version===version&&s.scopeVersion===getScope().scopeVersion&&s.householdId===getScope().householdId&&s.userId===getScope().userId;
 const ready=()=>!!getScope().householdId&&!!getScope().userId;
 const id=()=>crypto.randomUUID();
 function revokePhoto(){if(photoURL)URL.revokeObjectURL(photoURL);photoURL=null;file=null;$('receiptPhoto').removeAttribute('src');$('receiptPreview').classList.add('hidden');$('receiptLibrary').value='';$('receiptCamera').value='';}
 function reset(){version++;candidates=[];batch=null;receiptKey=null;loading=false;saving=false;locked=false;revokePhoto();busy();$('importRows').replaceChildren();$('importStatus').textContent='';$('receiptStatus').textContent='';}
 function busy(){
  $('importSave').disabled=saving||locked;$('importAddRow').disabled=saving||locked;$('receiptRead').disabled=loading||!file;
  $('receiptLibrary').disabled=loading;$('receiptCamera').disabled=loading;
  $('purchaseImportDialog').classList.toggle('is-saving',saving);$('receiptDialog').classList.toggle('is-saving',loading);
 }
 function baseRow(raw,extra={}){
  const known=describeProduct(raw,categoryFor);return {key:id(),originalName:raw,name:known.name,category:known.category,kind:known.kind,quantityText:'',quantity_level:'normal',registered_on:japanToday(),selected:known.kind==='食材',action:'',target_id:'',shopping_id:'',purchase:false,fixedShopping:false,...extra};
 }
 function existing(c){return getStock().filter(i=>pantryKey(i.name)===pantryKey(c.name));}
 function duplicatesInBatch(c){return candidates.some(x=>x!==c&&x.selected&&pantryKey(x.name)===pantryKey(c.name));}
 function option(select,label,value){const o=el('option','',label);o.value=value;select.append(o);}
 function field(label,input){const wrap=el('label','import-field');wrap.append(el('span','',label),input);return wrap;}
 function render(){
  $('importRows').replaceChildren();let registrations=0,purchases=0;
  $('importAddRow').classList.toggle('hidden',source==='shopping');
  for(const c of candidates){
   const row=el('article','import-row'),header=el('div','import-row-head');
   const check=el('input');check.type='checkbox';check.checked=c.selected;check.disabled=saving||locked;check.setAttribute('aria-label',c.originalName+'を冷蔵庫に登録');check.onchange=()=>{c.selected=check.checked;render();};
   const checkTarget=el('label','import-check-target');checkTarget.append(check);
   const glyph=el('span','import-glyph',foodGlyph({name:c.name,category:c.category}));glyph.setAttribute('aria-hidden','true');
   const name=el('input');name.value=c.name;name.maxLength=100;name.disabled=saving||locked;name.setAttribute('aria-label',c.originalName+'の食材名');name.oninput=()=>{c.name=name.value;};name.onchange=()=>{c.name=name.value.trim();c.action='';c.target_id='';render();};header.append(checkTarget,glyph,name);row.append(header);
   row.append(el('p','import-reference','商品名：'+c.originalName+' ／ '+c.kind+(c.quantityText?' ／ 購入量の参考：'+c.quantityText:'')));
   const details=el('details','import-options'),summary=el('summary','',c.category+' · 残量'+importLevels[c.quantity_level]+' · '+(c.registered_on||'登録日不明'));details.append(summary);
   const fields=el('div','import-field-grid'),category=el('select');category.disabled=saving||locked;category.setAttribute('aria-label',c.originalName+'のカテゴリ');for(const x of importCategories)option(category,x,x);category.value=c.category;category.onchange=()=>{c.category=category.value;summary.textContent=c.category+' · 残量'+importLevels[c.quantity_level]+' · '+(c.registered_on||'登録日不明');};
   const amount=el('select');amount.disabled=saving||locked;amount.setAttribute('aria-label',c.originalName+'の残量');for(const [v,label] of Object.entries(importLevels))option(amount,label,v);amount.value=c.quantity_level;amount.onchange=()=>{c.quantity_level=amount.value;summary.textContent=c.category+' · 残量'+importLevels[c.quantity_level]+' · '+(c.registered_on||'登録日不明');};
   const date=el('input');date.type='date';date.value=c.registered_on||'';date.max=japanToday();date.disabled=saving||locked;date.setAttribute('aria-label',c.originalName+'の登録日');date.onchange=()=>{c.registered_on=date.value||null;summary.textContent=c.category+' · 残量'+importLevels[c.quantity_level]+' · '+(c.registered_on||'登録日不明');};fields.append(field('カテゴリ',category),field('残量',amount),field('登録日',date));details.append(fields);row.append(details);
   const matches=existing(c),duplicate=matches.length>0||duplicatesInBatch(c);
   if(c.selected&&duplicate){
    const choice=el('select');choice.setAttribute('aria-label',c.originalName+'の重複時の処理');choice.disabled=saving||locked;option(choice,'同じ食材があります。対応を選択','');if(matches.length)option(choice,'既存食材の残量を更新する','update');option(choice,'別の食材として追加する','add');option(choice,'今回は登録しない','skip');choice.value=c.action;choice.onchange=()=>{c.action=choice.value;if(c.action==='update'&&matches.length===1)c.target_id=matches[0].id;render();};row.append(choice);
    if(c.action==='update'){
     const target=el('select');target.setAttribute('aria-label',c.originalName+'の更新先');target.disabled=saving||locked;option(target,'更新する食材を選択','');for(const x of matches)option(target,x.name+' · 残量'+(importLevels[x.quantity_level]||'並')+' · '+ageLabel(x),x.id);target.value=c.target_id;target.onchange=()=>c.target_id=target.value;row.append(target,el('p','caption','残量だけを変更します。既存食材の登録日は維持します。'));
    }
   }
   if(source==='receipt'){
    const match=el('select');match.setAttribute('aria-label',c.originalName+'の買い物リスト照合');match.disabled=saving||locked;option(match,'買い物リストの照合先（任意）','');const suggested=shoppingMatches(c,getShopping());const rest=getShopping().filter(i=>!i.pantry_registered_at&&!suggested.some(s=>s.id===i.id));
    for(const x of [...suggested,...rest])option(match,(x.match?x.match+'：':'その他：')+x.name+(x.purchased?'（購入済み）':''),x.id);match.value=c.shopping_id;match.onchange=()=>{c.shopping_id=match.value;c.purchase=!!match.value;render();};row.append(match);
    if(c.shopping_id){const label=el('label','import-purchase');const purchase=el('input');purchase.type='checkbox';purchase.checked=c.purchase;purchase.disabled=saving||locked;purchase.setAttribute('aria-label',c.originalName+'の照合先を購入済みにする');purchase.onchange=()=>{c.purchase=purchase.checked;render();};label.append(purchase,el('span','','照合した買い物を購入済みにする'));row.append(label);}
    else if(suggested.length)row.append(el('p','caption','照合候補があります。自動確定はしません。'));
   }
   if(c.selected&&c.action!=='skip')registrations++;
   if(c.purchase&&c.shopping_id&&(source==='receipt'||c.selected&&c.action!=='skip'))purchases++;
   $('importRows').append(row);
  }
  $('importSummary').textContent='冷蔵庫 '+registrations+'件 ／ 購入済み更新 '+purchases+'件';busy();
 }
 async function openShopping(){
  if(!ready())return;reset();source='shopping';const s=scope();
  try{await refresh();if(!current(s))return;batch=id();candidates=getShopping().filter(i=>i.purchased&&!i.pantry_registered_at).map(i=>baseRow(i.name,{quantityText:[i.quantity,i.unit].filter(Boolean).join(' '),shopping_id:i.id,fixedShopping:true,purchase:true}));$('importTitle').textContent='購入済みの商品を冷蔵庫へ';$('importStatus').textContent=candidates.length?'食材を選び、名前・残量を確認してください。日用品・不明な商品は選択していません。':'冷蔵庫に未登録の購入済み商品がありません。';render();openSheet('purchaseImportDialog');}catch(e){if(current(s))notify('候補を読み込めませんでした：'+e.message);}
 }
 function openReceipt(){if(!ready())return;reset();source='receipt';$('receiptStatus').textContent='明細部分だけが写るように撮影してください。';openSheet('receiptDialog');}
 async function choosePhoto(input){
  if(loading)return;const next=input.files?.[0];revokePhoto();if(!next)return;
  if(!next.type.startsWith('image/')||next.size>20*1024*1024){notify('20MB以下の画像を選択してください。');return;}
  file=next;photoURL=URL.createObjectURL(file);$('receiptPhoto').src=photoURL;$('receiptPreview').classList.remove('hidden');$('receiptStatus').textContent='内容を確認して「AIで商品を読み取る」を押してください。';busy();
 }
 $('receiptLibrary').onchange=()=>choosePhoto($('receiptLibrary'));$('receiptCamera').onchange=()=>choosePhoto($('receiptCamera'));
 $('receiptRead').onclick=async()=>{
  if(!file||loading||!ready())return;loading=true;busy();const s=scope(),selectedFile=file;let controller;
  $('receiptStatus').textContent='画像を整えています…';
  try{
   const bytes=await selectedFile.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);receiptKey=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
   const image=await prepareReceiptImage(selectedFile);if(!current(s))return;$('receiptStatus').textContent='商品を読み取っています…（通常は数十秒・最大約1分）';
   controller=new AbortController();const timer=setTimeout(()=>controller.abort(),65000);let response;
   try{response=await db.functions.invoke('scan-receipt',{body:{householdId:s.householdId,...image},signal:controller.signal});}finally{clearTimeout(timer);}
   if(!current(s))return;const {data,error}=response;
   if(error){let text='読み取りに失敗しました。写真を明るく、まっすぐ撮って再試行してください。';try{const body=await error.context?.json();if(body?.error)text=body.error;}catch{}throw Error(text);}
   if(!Array.isArray(data?.items)||data.householdId!==s.householdId)throw Error('読み取り結果を確認できませんでした。再試行してください。');
   await refresh();if(!current(s))return;batch=id();candidates=data.items.map(i=>baseRow(i.originalName,{name:i.name,category:i.category,kind:i.kind,quantityText:i.quantityText||'',selected:i.kind==='食材'}));
   $('importTitle').textContent='レシートの商品を確認';$('importStatus').textContent=candidates.length?'約'+Math.ceil(data.elapsedMs/1000)+'秒で読み取りました。誤読や分類を必ず確認してください。':'商品を読み取れませんでした。手動で候補を追加するか、写真を撮り直してください。';render();openSheet('purchaseImportDialog');revokePhoto();
  }catch(e){if(current(s))$('receiptStatus').textContent=e.name==='AbortError'?'時間がかかりすぎたため中断しました。明細を分けて撮影し、再試行してください。':e.message;}
  finally{if(current(s)){loading=false;busy();}}
 };
 $('importAddRow').onclick=()=>{if(saving||locked)return;candidates.push(baseRow('',{selected:true,kind:'要確認'}));render();};
 $('importSave').onclick=async()=>{
  if(saving||locked||!ready()||!batch)return;const entries=[];
  for(const c of candidates){
   const register=c.selected&&c.action!=='skip',shop=(c.fixedShopping||c.purchase)?c.shopping_id:'';
   if(source==='shopping'&&!register)continue;
   if(!register&&!shop)continue;
   if(c.action==='skip'&&!c.purchase)continue;
   if(register&&(!c.name.trim()||c.name.length>100||!importCategories.includes(c.category)||!Object.hasOwn(importLevels,c.quantity_level)||c.registered_on&&(!validDay(c.registered_on)||c.registered_on>japanToday()))){notify('食材名・カテゴリ・残量・登録日を確認してください。');return;}
   const duplicate=existing(c).length>0||duplicatesInBatch(c);
   if(register&&duplicate&&(!['add','update'].includes(c.action)||c.action==='update'&&!c.target_id)){notify('同じ食材の扱いと更新先を選択してください。');return;}
   entries.push({key:c.key,name:c.name.trim(),category:c.category,quantity_level:c.quantity_level,registered_on:c.registered_on,action:register?(c.action==='update'?'update':'add'):'purchase_only',target_id:c.target_id||null,shopping_id:shop||null,allow_duplicate:duplicate&&c.action==='add'});
  }
  if(!entries.length){notify('登録する食材か購入済みにする項目を選んでください。');return;}
  saving=true;render();const s=scope();
  try{
   const {data,error}=await db.rpc('commit_pantry_import',{p_household:s.householdId,p_batch:batch,p_entries:entries,p_source:source,p_receipt_key:receiptKey});if(error)throw error;if(!current(s))return;
   if(data?.status==='review'){await refresh();if(!current(s))return;for(const c of candidates)if(data.conflicts?.some(x=>x.key===c.key)){c.action='';c.target_id='';}$('importStatus').textContent='在庫が変わりました。重複している食材の扱いをもう一度選択してください。';return;}
   if(data?.status!=='saved')throw Error('保存結果を確認できませんでした。');locked=true;$('importStatus').textContent=data.replayed?'この登録は処理済みです。二重登録はしていません。':'追加 '+data.added+'件・残量更新 '+data.updated+'件・購入済み更新 '+data.purchased+'件'+(data.already?'（登録済み '+data.already+'件は再登録していません）':'');
   try{await refresh();}catch{$('importStatus').textContent+=' 一覧を開き直して最新状態を確認してください。';}if(current(s))notify(data.replayed?'処理済みの登録です。':'冷蔵庫と買い物リストに反映しました。');
  }catch(e){if(current(s))$('importStatus').textContent='保存できませんでした：'+e.message+' 同じ画面から再試行できます。';}
  finally{if(current(s)){saving=false;render();}}
 };
 for(const name of ['receiptDialog','purchaseImportDialog'])$(name).addEventListener('cancel',e=>{if(saving||loading)e.preventDefault();});
 $('importFromShopping').onclick=openShopping;$('receiptFromFridge').onclick=openReceipt;$('receiptFromShopping').onclick=openReceipt;
 return {reset,openShopping,openReceipt,state:()=>({candidates,source,batch,receiptKey,loading,saving,locked})};
}
