import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {createFeedback} from './feedback.mjs?v=20261120.2';

const url='https://moorgivgwmkbxyjvwuih.supabase.co';
const key='sb_publishable_4cMwMgr654spcCXTKnsabw_a6AEu77x';
// Exact allowlisted URL; never derive email redirects from localhost or a query parameter.
const AUTH_REDIRECT_URL='https://augustblue9630saipanda.github.io/uchino-reizouko/';
const db=createClient(url,key);
const $=id=>document.getElementById(id);
const categories=['野菜・果物','肉・魚','卵・乳製品','主食','その他'];
const glyphs={'野菜・果物':'🥬','肉・魚':'🐟','卵・乳製品':'🥚','主食':'🍚','その他':'🧺'};
let activeUser=null,householdId=null,currentPage='home',mealItems=null,shoppingItems=[],shoppingLoaded=false;
let pantryRequest=0,shoppingRequest=0,scopeVersion=0,dinnerVersion=0,dinnerBusy=false,dinnerPlans=[],selectedPlan=0;
let categoryFilter='すべて',inviteValue='',photoURL=null,selectedFile=null,busy=false,channel=null,toastTimer;
const shoppingLocks=new Set();
const collapsedPantryCategories=new Set();
const quantityLevels={low:'少',normal:'並',high:'多'},quantityLocks=new Set();
let pendingPantryAdd=null,pantrySaving=false;

function el(tag,className='',text=''){const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;}
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','#i-'+name);svg.setAttribute('aria-hidden','true');svg.append(use);return svg;}
function button(text,className,action){const node=el('button',className,text);node.type='button';node.onclick=action;return node;}
function message(text){
 const open=document.querySelector('dialog[open]');
 if(open){let note=open.querySelector('[data-dialog-status]');if(!note){note=el('p','inline-status');note.dataset.dialogStatus='';note.setAttribute('role','status');open.append(note);}note.textContent=text;}
 $('status').textContent=text;$('status').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('status').classList.add('hidden'),6500);
}
function openSheet(id){document.querySelectorAll('dialog[open]').forEach(d=>d.close());const dialog=$(id);dialog.querySelectorAll('[data-dialog-status]').forEach(n=>n.remove());dialog.showModal();dialog.scrollTop=0;}
function closeSheets(){document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{const d=$(b.dataset.close);if(!d.classList.contains('is-saving'))d.close();});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d&&!d.classList.contains('is-saving')&&!d.classList.contains('requires-choice')){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));

function navigate(page){
 if(!['home','fridge','dinner','shopping','feedback'].includes(page))return;
 if(page==='feedback')closeSheets();
 currentPage=page;
 document.querySelectorAll('.page').forEach(n=>n.classList.toggle('active',n.id==='page-'+page));
 document.querySelectorAll('.navBtn').forEach(n=>{const active=n.dataset.page===page;n.classList.toggle('active',active);if(active)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
 window.scrollTo({top:0,behavior:'smooth'});
 if(activeUser&&householdId){if(page==='shopping')loadShopping().catch(e=>message('買い物の読み込み：'+e.message));else if(page==='fridge')loadItems().catch(e=>message('食材の読み込み：'+e.message));}
 if(page==='feedback'&&activeUser&&householdId)feedback.load().catch(e=>message('ご意見メモの読み込み：'+e.message));
}
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
document.querySelectorAll('.navBtn').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
$('settingsOpen').onclick=()=>openSheet('settingsDialog');
$('todayLabel').textContent=new Intl.DateTimeFormat('en',{month:'short',day:'numeric',weekday:'short'}).format(new Date()).toUpperCase()+' / DAILY NOTE';

function categoryFor(item){
 if(categories.includes(item.category))return item.category;
 const name=item.name.normalize('NFKC').toLowerCase();
 if(/卵|たまご|玉子|タマゴ|牛乳|乳|チーズ|ヨーグルト|バター/.test(name))return '卵・乳製品';
 if(/肉|豚|牛|鶏|とり|鳥|ハム|ベーコン|ソーセージ|魚|鮭|さけ|サケ|サンマ|さんま|鯖|さば|まぐろ|マグロ|ツナ|鯵|あじ|海老|えび|エビ|イカ|いか|貝|しらす/.test(name))return '肉・魚';
 if(/米|ご飯|ごはん|パン|麺|うどん|パスタ|そば|餅|もち/.test(name))return '主食';
 if(/菜|ねぎ|ネギ|葱|にんじん|人参|ニンジン|キャベツ|きゃべつ|大根|だいこん|トマト|とまと|なす|ナス|茄子|じゃが|ジャガ|いも|芋|かぼちゃ|カボチャ|きゅうり|キュウリ|ピーマン|パプリカ|ズッキーニ|もやし|しめじ|えのき|エリンギ|きのこ|キノコ|しいたけ|椎茸|玉ねぎ|たまねぎ|ブロッコリー|ほうれん|小松|レタス|果|りんご|リンゴ|バナナ|みかん|レモン|いちご|ぶどう/.test(name))return '野菜・果物';
 return 'その他';
}
function renderFilters(){
 const wrap=$('categoryFilters');wrap.replaceChildren();
 for(const c of ['すべて',...categories]){const b=button(c,'chip'+(c===categoryFilter?' active':''),()=>{categoryFilter=c;renderFilters();renderPantry();});b.setAttribute('aria-pressed',String(c===categoryFilter));wrap.append(b);}
}
function renderPantry(){
 const stock=mealItems||[],search=$('foodSearch').value.trim().toLowerCase();
 const filtered=stock.filter(i=>(categoryFilter==='すべて'||categoryFor(i)===categoryFilter)&&i.name.toLowerCase().includes(search));
 $('stockSummary').textContent=mealItems===null?'食材を読み込み中…':stock.length+'種類の食材が、出番を待っています。';
 $('homeStock').textContent=mealItems===null?'—':String(stock.length);$('items').replaceChildren();
 const groups=new Map();
 for(const category of categories){
  const items=filtered.filter(item=>categoryFor(item)===category);if(!items.length)continue;
  const section=el('details','pantry-category');section.open=!collapsedPantryCategories.has(category);
  const summary=el('summary','pantry-category-heading');
  summary.append(el('span','pantry-category-name',category),el('span','pantry-category-count',items.length+'件'));
  section.append(summary);
  // Ignore delayed toggle events from sections replaced by a newer render.
  section.ontoggle=()=>{if(!section.isConnected)return;section.open?collapsedPantryCategories.delete(category):collapsedPantryCategories.add(category);};
  const list=el('div','pantry-category-list');section.append(list);groups.set(category,list);$('items').append(section);
 }
 for(const item of filtered){
  const card=el('div','food-row'),name=el('span','food-row-name',item.name);name.title=item.name;
  const amount=el('div','quantity-switch');amount.setAttribute('role','group');amount.setAttribute('aria-label',item.name+'の量');
  for(const [value,label] of Object.entries(quantityLevels)){const b=button(label,'quantity-button',()=>setFoodQuantity(item,value));b.setAttribute('aria-label',item.name+'の量を「'+label+'」にする');b.setAttribute('aria-pressed',String((item.quantity_level||'normal')===value));b.disabled=quantityLocks.has(item.id);amount.append(b);}
  const more=button('…','food-more',()=>editFood(item));more.setAttribute('aria-label',item.name+'の編集・削除');
  card.append(name,amount,more);groups.get(categoryFor(item)).append(card);
 }
 $('fridgeEmpty').classList.toggle('hidden',mealItems===null||stock.length>0);
 if(stock.length&&!filtered.length)$('items').append(el('p','caption','該当する食材がありません。'));
 $('homeIngredients').replaceChildren();
 for(const item of stock.slice(0,6))$('homeIngredients').append(el('span','pantry-tag',item.name));
 if(!stock.length)$('homeIngredients').append(button('＋ 食材を登録してみる','text-button',()=>editFood()));
 updateDinnerAvailability();
}
$('foodSearch').oninput=renderPantry;
function editFood(item=null){
 $('foodId').value=item?.id||'';$('food').value=item?.name||'';$('foodCategory').value=item?categoryFor(item):'auto';
 $('foodQuantity').value=item?.quantity_level||'normal';
 $('foodDialogTitle').textContent=item?'食材を編集':'食材を追加';$('deleteFood').classList.toggle('hidden',!item);openSheet('foodDialog');
}
$('addFood').onclick=()=>editFood();$('emptyAddFood').onclick=()=>editFood();
async function loadItems(){
 if(!householdId)return;
 const scope=scopeVersion,target=householdId,request=++pantryRequest;
 const {data,error}=await db.from('ingredients').select('id,name,category,quantity_level').eq('household_id',target).order('created_at',{ascending:false});
 if(scope!==scopeVersion||request!==pantryRequest)return;
 if(error){$('stockSummary').textContent='読み込めませんでした。もう一度画面を開いてください。';throw error;}
 const next=data||[];
 if(JSON.stringify((mealItems||[]).map(i=>[i.id,i.name]))!==JSON.stringify(next.map(i=>[i.id,i.name])))resetDinner('食材が更新されました。新しい献立を提案できます。');
 mealItems=next;renderPantry();
}
$('foodForm').onsubmit=async e=>{
 e.preventDefault();if(!householdId||!activeUser||pantrySaving)return;
 const name=$('food').value.trim(),id=$('foodId').value,category=$('foodCategory').value==='auto'?categoryFor({name}):$('foodCategory').value;
 const quantity_level=$('foodQuantity').value;
 if(!name||!Object.hasOwn(quantityLevels,quantity_level))return;
 if(!id){await addPantryItems([{name,category,quantity_level}],'foodDialog');return;}
 const scope=scopeVersion,target=householdId;$('saveFood').disabled=true;
 try{const {error}=await db.from('ingredients').update({name,category,quantity_level}).eq('id',id).eq('household_id',target);if(error)throw error;if(scope!==scopeVersion)return;$('foodDialog').close();await loadItems();message('食材を更新しました。');}
 catch(e){message('保存できませんでした：'+e.message);}finally{$('saveFood').disabled=false;}
};
async function setFoodQuantity(item,value){
 if(!activeUser||!householdId||quantityLocks.has(item.id)||!Object.hasOwn(quantityLevels,value)||(item.quantity_level||'normal')===value)return;
 const scope=scopeVersion,target=householdId;quantityLocks.add(item.id);renderPantry();
 try{const {data,error}=await db.from('ingredients').update({quantity_level:value}).eq('id',item.id).eq('household_id',target).select('id');if(error)throw error;if(!data?.length)throw Error('食材が削除されたか、共有先が変わっています。');if(scope===scopeVersion)await loadItems();}
 catch(e){if(scope===scopeVersion)message('量を保存できませんでした：'+e.message);}finally{quantityLocks.delete(item.id);if(scope===scopeVersion)renderPantry();}
}
function pantryBusy(on){
 pantrySaving=on;for(const id of ['saveFood','saveCandidates','duplicateAdd','duplicateCancel','duplicateBack'])$(id).disabled=on;
 for(const id of ['foodDialog','photoDialog','duplicateDialog'])$(id).classList.toggle('is-saving',on);
}
async function addPantryItems(items,sourceDialog,allowDuplicates=false){
 if(!activeUser||!householdId||pantrySaving)return;
 const scope=scopeVersion,target=householdId;let saved=false;pantryBusy(true);
 try{
  const {data,error}=await db.rpc('add_pantry_items',{p_household:target,p_items:items,p_allow_duplicates:allowDuplicates});
  if(error)throw error;if(scope!==scopeVersion||target!==householdId)return;
  if(data?.status==='duplicate'&&Array.isArray(data.duplicates)){
   pendingPantryAdd={items,sourceDialog,scope,target};$('duplicateNames').replaceChildren();for(const name of data.duplicates)$('duplicateNames').append(el('li','',name));
   $('duplicateDescription').textContent=items.length>1?'同じ名前の食材があります。「別の項目として追加」で今回の候補をすべて登録します。「追加しない」は今回の登録全体をキャンセルします。':'すでに同じ名前の食材があります。別の項目として追加しますか？';
   openSheet('duplicateDialog');return;
  }
  if(data?.status!=='saved')throw Error('保存結果を確認できませんでした。');
  saved=true;
  pendingPantryAdd=null;$(sourceDialog).close();$('duplicateDialog').close();if(sourceDialog==='photoDialog')clearPhoto();await loadItems();message(data.count+'件の食材を登録しました。');
 }catch(e){if(scope===scopeVersion)message(saved?'登録は完了しました。一覧を開き直してください。':'保存できませんでした：'+e.message);}finally{if(scope===scopeVersion)pantryBusy(false);}
}
$('duplicateAdd').onclick=()=>{const p=pendingPantryAdd;if(p&&p.scope===scopeVersion&&p.target===householdId)return addPantryItems(p.items,p.sourceDialog,true);};
$('duplicateCancel').onclick=()=>{if(pantrySaving)return;pendingPantryAdd=null;$('duplicateDialog').close();message('今回の登録をキャンセルしました。');};
$('duplicateBack').onclick=()=>{if(pantrySaving)return;const p=pendingPantryAdd;pendingPantryAdd=null;if(p&&p.scope===scopeVersion)openSheet(p.sourceDialog);};
$('duplicateDialog').addEventListener('cancel',e=>{e.preventDefault();if(!pantrySaving)$('duplicateBack').onclick();});
$('foodDialog').addEventListener('cancel',e=>{if(pantrySaving)e.preventDefault();});
$('photoDialog').addEventListener('cancel',e=>{if(pantrySaving)e.preventDefault();});
$('deleteFood').onclick=async()=>{
 const id=$('foodId').value;if(!id||!householdId)return;
 const target=householdId,scope=scopeVersion;$('deleteFood').disabled=true;
 try{const {error}=await db.from('ingredients').delete().eq('id',id).eq('household_id',target);if(error)throw error;if(scope!==scopeVersion)return;$('foodDialog').close();await loadItems();message('食材を削除しました。');}catch(e){message('削除できませんでした：'+e.message);}finally{$('deleteFood').disabled=false;}
};

function renderShopping(){
 const pending=shoppingItems.filter(i=>!i.purchased),done=shoppingItems.filter(i=>i.purchased);
 $('homeShopping').textContent=String(pending.length);$('pendingCount').textContent=String(pending.length);
 $('shoppingSummary').textContent=shoppingLoaded?'あと'+pending.length+'点。家族でひとつの買い物メモ。':'買い物メモを読み込み中…';
 $('shoppingItems').replaceChildren();$('purchasedItems').replaceChildren();
 for(const item of [...pending,...done]){
  const row=el('div','shopping-row'+(item.purchased?' done':''));
  const check=button('','shopping-check',()=>toggleShopping(item));check.setAttribute('aria-label',item.name+(item.purchased?'を未購入に戻す':'を購入済みにする'));check.setAttribute('aria-pressed',String(item.purchased));check.disabled=shoppingLocks.has(item.id);
  const box=el('span');if(item.purchased)box.append(icon('check'));check.append(box);
  const info=el('div','shopping-info');info.append(el('div','shopping-name',item.name));const amount=[item.quantity,item.unit].filter(Boolean).join(' ');if(amount)info.append(el('div','shopping-quantity',amount));
  const edit=button('','shopping-edit',()=>editShopping(item));edit.append(icon('edit'));edit.setAttribute('aria-label',item.name+'の数量などを編集');
  row.append(check,info,edit);$(item.purchased?'purchasedItems':'shoppingItems').append(row);
 }
 $('shoppingEmpty').classList.toggle('hidden',!shoppingLoaded||pending.length>0);$('purchasedSection').classList.toggle('hidden',!done.length);$('purchasedSummary').textContent='購入済み（'+done.length+'）';
}
async function loadShopping(){
 if(!householdId)return;
 const scope=scopeVersion,target=householdId,request=++shoppingRequest;
 const {data,error}=await db.from('shopping_items').select('id,name,quantity,unit,purchased,created_at').eq('household_id',target).order('created_at',{ascending:false});
 if(scope!==scopeVersion||request!==shoppingRequest)return;
 if(error){$('shoppingSummary').textContent='読み込めませんでした。「更新」でもう一度お試しください。';throw error;}
 const next=data||[],changed=!shoppingLoaded||JSON.stringify(shoppingItems)!==JSON.stringify(next);shoppingItems=next;shoppingLoaded=true;if(changed)renderShopping();$('shoppingSync').textContent='同じ世帯の家族と共有中 · '+new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})+' 更新';
}
function editShopping(item=null){$('shoppingId').value=item?.id||'';$('shoppingName').value=item?.name||'';$('shoppingQuantity').value=item?.quantity||'';$('shoppingUnit').value=item?.unit||'';$('shoppingDialogTitle').textContent=item?'買い物メモを編集':'買うものを追加';$('deleteShopping').classList.toggle('hidden',!item);openSheet('shoppingDialog');}
$('addShopping').onclick=()=>editShopping();
async function saveShoppingItem(values,id=''){
 if(!householdId||!activeUser)throw Error('ログインと共有先を確認してください。');
 const target=householdId,scope=scopeVersion;
 const query=db.from('shopping_items');const {error}=id?await query.update(values).eq('id',id).eq('household_id',target):await query.insert({...values,household_id:target});
 if(error)throw error;if(scope!==scopeVersion)return false;await loadShopping();return true;
}
$('quickShopping').onsubmit=async e=>{
 e.preventDefault();const input=$('quickShoppingName'),name=input.value.trim();if(!name)return;
 const b=$('quickShopping').querySelector('button');b.disabled=true;
 try{if(await saveShoppingItem({name,quantity:'',unit:''})){input.value='';message('買い物メモに追加しました。');}}catch(e){message('追加できませんでした：'+e.message);}finally{b.disabled=false;}
};
$('shoppingForm').onsubmit=async e=>{
 e.preventDefault();const name=$('shoppingName').value.trim();if(!name)return;$('saveShopping').disabled=true;
 try{if(await saveShoppingItem({name,quantity:$('shoppingQuantity').value.trim(),unit:$('shoppingUnit').value.trim()},$('shoppingId').value)){$('shoppingDialog').close();message('買い物メモを保存しました。');}}catch(e){message('保存できませんでした：'+e.message);}finally{$('saveShopping').disabled=false;}
};
async function toggleShopping(item){
 if(shoppingLocks.has(item.id)||!householdId)return;shoppingLocks.add(item.id);renderShopping();
 const scope=scopeVersion,target=householdId;
 try{const {error}=await db.from('shopping_items').update({purchased:!item.purchased}).eq('id',item.id).eq('household_id',target);if(error)throw error;if(scope===scopeVersion)await loadShopping();}catch(e){message('更新できませんでした：'+e.message);}finally{shoppingLocks.delete(item.id);if(scope===scopeVersion)renderShopping();}
}
$('deleteShopping').onclick=async()=>{
 const id=$('shoppingId').value;if(!id||!householdId)return;$('deleteShopping').disabled=true;const scope=scopeVersion,target=householdId;
 try{const {error}=await db.from('shopping_items').delete().eq('id',id).eq('household_id',target);if(error)throw error;if(scope!==scopeVersion)return;$('shoppingDialog').close();await loadShopping();message('買い物メモを削除しました。');}catch(e){message('削除できませんでした：'+e.message);}finally{$('deleteShopping').disabled=false;}
};
$('refreshShopping').onclick=()=>loadShopping().then(()=>message('最新の買い物メモに更新しました。')).catch(e=>message(e.message));
function subscribeHousehold(){
 if(channel){db.removeChannel(channel);channel=null;}
 if(!householdId||!activeUser)return;const scope=scopeVersion;
 channel=db.channel('household-'+householdId+'-'+scope).on('postgres_changes',{event:'*',schema:'public',table:'shopping_items',filter:'household_id=eq.'+householdId},()=>{if(scope===scopeVersion)loadShopping().catch(()=>{});}).subscribe();
}
// Visibility/focus and a light poll also cover missed events and deletes on other devices.
function refreshVisible(){if(!activeUser||!householdId||document.visibilityState==='hidden')return;loadShopping().catch(()=>{});if(currentPage==='fridge')loadItems().catch(()=>{});feedback.refresh().catch(()=>{});}
window.addEventListener('focus',refreshVisible);document.addEventListener('visibilitychange',refreshVisible);setInterval(refreshVisible,20000);

function resetDinner(text='冷蔵庫の食材から、今夜の献立を考えましょう。'){
 dinnerVersion++;dinnerBusy=false;dinnerPlans=[];$('dinnerResults').replaceChildren();$('dinnerResults').setAttribute('aria-busy','false');$('dinnerLoading').classList.add('hidden');$('dinnerIntro').classList.remove('hidden');$('dinnerStatus').textContent=text;$('generateDinner').textContent='冷蔵庫から3つの献立を提案';if($('recipeDialog').open)$('recipeDialog').close();updateDinnerAvailability();
}
function updateDinnerAvailability(){
 $('generateDinner').disabled=dinnerBusy||!activeUser||!householdId||!mealItems?.length;
 if(!dinnerBusy&&mealItems?.length&&!dinnerPlans.length&&$('dinnerStatus').textContent==='冷蔵庫を読み込み中です。')$('dinnerStatus').textContent='冷蔵庫の食材から、家族に合う夕飯を提案します。';
 if(!dinnerBusy&&!mealItems?.length)$('dinnerStatus').textContent=mealItems===null?'冷蔵庫を読み込み中です。':'冷蔵庫に食材を登録すると、献立を提案できます。';
}
function renderDinner(data){
 if(!Array.isArray(data?.patterns)||data.patterns.length!==3||data.patterns.some(p=>!Array.isArray(p.dishes)||p.dishes.length!==3))throw Error('献立の形式が正しくありません。再生成してください。');
 dinnerPlans=data.patterns;const fragment=document.createDocumentFragment();
 for(const [index,plan] of dinnerPlans.entries()){
  const names=plan.title+' '+plan.dishes.map(d=>d.name).join(' ');
  const genre=/中華|麻婆|チャーハン|オイスター|餃子|酢豚/.test(names)?'中華風':/洋風|パスタ|グラタン|ミネストローネ|クリーム|ポトフ|ソテー|ハンバーグ/.test(names)?'洋風':/和風|和の|味噌|みそ|照り|煮物|おひたし|卵とじ/.test(names)?'和風':'家庭料理';
  const card=el('article','plan-card'),top=el('div','plan-top');top.append(el('span','plan-no','0'+(index+1)),el('small','',genre+' · DINNER PLAN'));
  const body=el('div','plan-body');body.append(el('h2','',plan.title));
  const list=el('ul','plan-menu');for(const dish of plan.dishes){const li=el('li');li.append(el('span','course-label',dish.role),el('span','',dish.name));list.append(li);}body.append(list);
  const bottom=el('div','plan-bottom');bottom.append(el('small','',plan.missingIngredients?.length?'買い足し '+new Set(plan.missingIngredients.map(i=>i.name)).size+'種類':'主な食材は登録済み'));
  const open=button('レシピを見る','plan-open',()=>openRecipe(index));open.append(icon('arrow'));bottom.append(open);body.append(bottom);card.append(top,body);fragment.append(card);
 }
 $('dinnerResults').replaceChildren(fragment);$('dinnerIntro').classList.add('hidden');
}
function openRecipe(index){selectedPlan=index;const plan=dinnerPlans[index];$('recipeTitle').textContent=plan.title;$('recipeDescription').textContent=plan.description;renderDish(0);openSheet('recipeDialog');}
function renderDish(index){
 const plan=dinnerPlans[selectedPlan],dish=plan.dishes[index];$('dishTabs').replaceChildren();
 plan.dishes.forEach((d,i)=>{const b=button(d.role,i===index?'active':'',()=>{renderDish(i);$('recipeDialog').scrollTop=0;});b.setAttribute('role','tab');b.setAttribute('aria-selected',String(i===index));b.setAttribute('aria-controls','recipeContent');$('dishTabs').append(b);});
 const wrap=$('recipeContent');wrap.replaceChildren();wrap.setAttribute('role','tabpanel');
 wrap.append(el('h3','recipe-course-title',dish.name),el('p','portion','盛り付け目安：大人1人 '+dish.adultPortion+' ／ 子ども1人 '+dish.childPortion));
 if(plan.missingIngredients?.length){const box=el('details','missing-box');box.append(el('summary','','この献立で買い足すもの（'+plan.missingIngredients.length+'件）'));const ul=el('ul');for(const i of plan.missingIngredients)ul.append(el('li','',i.name+' '+i.quantity+' · '+i.dish));box.append(ul);wrap.append(box);}
 function section(title,no){const s=el('section','recipe-section'),h=el('h3');h.append(el('span','',no),document.createTextNode(title));s.append(h);wrap.append(s);return s;}
 const ingredients=section('材料 · 大人2人＋子ども1人分','01'),ul=el('ul','ingredient-list');
 for(const item of dish.ingredients){const li=el('li'),name=el('span','',item.name);name.append(el('small','stock-label'+(item.availability==='買い足し候補'?' missing-label':''),item.availability));li.append(name,el('span','ingredient-amount',item.quantity));ul.append(li);}ingredients.append(ul);
 const prep=section('下ごしらえ','02'),pl=el('ul','prep-list');for(const text of dish.preparation)pl.append(el('li','',text));prep.append(pl);
 const steps=section('作り方','03'),ol=el('ol','cooking-steps');
 dish.steps.forEach((step,i)=>{const li=el('li');li.append(el('p','',step.instruction));const meta=el('div','step-meta');meta.append(el('span','',step.heat),el('span','',step.time));li.append(meta,el('p','step-check','✓ '+step.doneness));if(dish.childServing.afterStep===i+1){const box=el('div','child-box');box.append(el('strong','','ここで子ども用を取り分け'),el('div','',dish.childServing.instruction));li.append(box);}ol.append(li);});steps.append(ol);
 const finish=section('大人用の仕上げ','04');finish.append(el('div','adult-box',dish.adultFinish));wrap.append(el('p','safety-note','子どもが食べる前に：'+dish.childSafety));
}
$('generateDinner').onclick=async()=>{
 if(dinnerBusy||!activeUser||!householdId||!mealItems?.length)return;
 const version=++dinnerVersion,target=householdId;dinnerBusy=true;dinnerPlans=[];$('dinnerResults').replaceChildren();$('dinnerIntro').classList.add('hidden');$('dinnerLoading').classList.remove('hidden');$('dinnerResults').setAttribute('aria-busy','true');$('dinnerStatus').textContent='家族の好みに合わせて、献立を作成中です。';$('generateDinner').textContent='献立を考えています…';updateDinnerAvailability();
 try{
  const {data,error}=await db.functions.invoke('generate-dinner',{body:{householdId:target}});
  if(version!==dinnerVersion||target!==householdId||!activeUser)return;
  if(error){let detail='献立に接続できませんでした。少し待って再度お試しください。';if(error.context){try{const b=await error.context.json();if(typeof b.error==='string')detail=b.error;}catch{}}if(/Gemini HTTP 50[234]/.test(detail))detail='AIが一時的に混み合っています。1分ほど待って再度お試しください。';throw Error(detail);}
  if(data?.error)throw Error(data.error);if(data?.householdId!==target)throw Error('冷蔵庫が切り替わりました。再生成してください。');
  renderDinner(data);$('dinnerStatus').textContent='3つの食卓ができました。気になる献立を選んでください。';$('generateDinner').textContent='別の3つの献立を提案してもらう';
 }catch(e){if(version===dinnerVersion){$('dinnerResults').replaceChildren();$('dinnerStatus').textContent=e.message;$('generateDinner').textContent='もう一度、献立を提案してもらう';$('dinnerIntro').classList.remove('hidden');}}
 finally{if(version===dinnerVersion){dinnerBusy=false;$('dinnerLoading').classList.add('hidden');$('dinnerResults').setAttribute('aria-busy','false');updateDinnerAvailability();}}
};

function clearPhoto(){if(photoURL)URL.revokeObjectURL(photoURL);photoURL=null;selectedFile=null;$('photoInput').value='';$('photoPreview').removeAttribute('src');$('photoName').textContent='';$('photoPreviewBox').classList.add('hidden');$('recognize').classList.add('hidden');$('resultBox').classList.add('hidden');$('candidates').replaceChildren();}
$('photoOpen').onclick=()=>openSheet('photoDialog');$('foodToPhoto').onclick=()=>openSheet('photoDialog');
$('photoInput').onchange=()=>{const file=$('photoInput').files?.[0];clearPhoto();if(!file)return;if(!file.type.startsWith('image/')){message('画像ファイルを選択してください。');return;}if(file.size>15*1024*1024){message('15MB以下の画像を選択してください。');return;}selectedFile=file;photoURL=URL.createObjectURL(file);$('photoPreview').src=photoURL;$('photoName').textContent=file.name;$('photoPreviewBox').classList.remove('hidden');$('recognize').classList.remove('hidden');};
$('clearPhoto').onclick=()=>{if(!busy)clearPhoto();};
function addCandidateRow(name=''){const row=el('div','candidate'),check=el('input'),input=el('input');check.type='checkbox';check.checked=true;check.setAttribute('aria-label','この食材を登録');input.type='text';input.maxLength=100;input.value=name;input.setAttribute('aria-label','食材名');row.append(check,input);$('candidates').append(row);}
$('addCandidate').onclick=()=>addCandidateRow();
function fileToJpeg(file){return new Promise((resolve,reject)=>{const img=new Image(),src=URL.createObjectURL(file);img.onload=()=>{try{const scale=Math.min(1,1200/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const dataURL=canvas.toDataURL('image/jpeg',.75);resolve({mimeType:'image/jpeg',image:dataURL.split(',')[1]});}catch(e){reject(e);}finally{URL.revokeObjectURL(src);}};img.onerror=()=>{URL.revokeObjectURL(src);reject(Error('写真を読み込めませんでした。'));};img.src=src;});}
$('recognize').onclick=async()=>{
 if(!selectedFile||busy)return;busy=true;$('recognize').disabled=true;$('recognize').textContent='写真を確認しています…';const scope=scopeVersion;
 try{const image=await fileToJpeg(selectedFile);if(image.image.length>5600000)throw Error('写真が大きすぎます。');const {data,error}=await db.functions.invoke('recognize-ingredients',{body:image});if(scope!==scopeVersion)return;if(error)throw Error('食材を読み取れませんでした。時間をおいて試してください。');if(data?.error)throw Error(data.error);if(!Array.isArray(data?.ingredients))throw Error('AIの回答を読み取れませんでした。');$('candidates').replaceChildren();for(const name of data.ingredients)if(typeof name==='string')addCandidateRow(name.slice(0,100));$('resultBox').classList.remove('hidden');message(data.ingredients.length?'読み取った名前を確認して登録してください。':'候補を手動で追加できます。');}catch(e){message(e.message);}finally{busy=false;$('recognize').disabled=false;$('recognize').textContent='AIで食材を読み取る';}
};
$('saveCandidates').onclick=async()=>{
 if(busy||pantrySaving||!householdId)return;
 const names=[...new Set([...$('candidates').querySelectorAll('.candidate')].filter(r=>r.querySelector('[type=checkbox]').checked).map(r=>r.querySelector('[type=text]').value.trim()).filter(Boolean))];if(!names.length){message('登録する食材を選んでください。');return;}
 await addPantryItems(names.map(name=>({name,category:categoryFor({name}),quantity_level:'normal'})),'photoDialog');
};

function savedKey(){return activeUser?'reizouko-household-'+activeUser.id:'';}
function resetScope(){collapsedPantryCategories.clear();scopeVersion++;pantryRequest++;shoppingRequest++;mealItems=null;shoppingItems=[];shoppingLoaded=false;shoppingLocks.clear();quantityLocks.clear();pendingPantryAdd=null;pantryBusy(false);closeSheets();clearPhoto();resetDinner();renderPantry();renderShopping();feedback.reset();feedback.sync();if(channel){db.removeChannel(channel);channel=null;}}
function show(user){$('authBox').classList.toggle('hidden',!!user);$('appBox').classList.toggle('hidden',!user);$('bottomNav').classList.toggle('hidden',!user);$('settingsOpen').classList.toggle('hidden',!user);$('account').textContent=user?'ログイン中：'+user.email:'';feedback.sync();}
async function getHouseholds(){const {data,error}=await db.from('households').select('id,name').order('created_at',{ascending:true});if(error)throw error;return data||[];}
async function refreshHouseholds(preferredId){
 const scope=scopeVersion;let households=await getHouseholds();if(scope!==scopeVersion)return;
 if(!households.length){const {error}=await db.rpc('create_household',{household_name:'うちの冷蔵庫'});if(error)throw error;households=await getHouseholds();if(scope!==scopeVersion)return;if(!households.length)throw Error('冷蔵庫を取得できませんでした。');}
 const stored=preferredId||localStorage.getItem(savedKey()),selected=households.find(h=>h.id===stored)||households[0];householdId=selected.id;$('householdSelect').replaceChildren();
 for(const h of households){const option=el('option','',h.name||'家族の冷蔵庫');option.value=h.id;$('householdSelect').append(option);}$('householdSelect').value=householdId;localStorage.setItem(savedKey(),householdId);
 await Promise.all([loadItems(),loadShopping()]);subscribeHousehold();feedback.sync();
}
async function initialize(user){activeUser=user;householdId=null;resetScope();show(user);inviteValue='';$('inviteCode').classList.add('hidden');$('copyInvite').classList.add('hidden');navigate('home');if(!user)return;try{await refreshHouseholds();}catch(e){message('読み込みに失敗しました：'+e.message);}}
$('loginForm').onsubmit=async e=>{e.preventDefault();$('login').disabled=true;try{const {data,error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)throw error;$('password').value='';await initialize(data.user);}catch(e){message('ログインできませんでした：'+e.message);}finally{$('login').disabled=false;}};
function authNotice(text){$('authNotice').textContent=text;$('authNotice').classList.remove('hidden');}
$('signup').onclick=async()=>{const email=$('email').value.trim(),password=$('password').value;if(!email||password.length<6){authNotice('メールアドレスと6文字以上のパスワードを入力してください。');return;}$('signup').disabled=true;try{const {data,error}=await db.auth.signUp({email,password,options:{emailRedirectTo:AUTH_REDIRECT_URL}});if(error)throw error;if(data.session)await initialize(data.user);else authNotice('確認メールを送信しました。メール内のリンクを開くと「うちの暮らし」に戻ります。すでに登録を試した方は、ログインするか、確認メールの再送をご利用ください。');}catch(e){authNotice('登録できませんでした：'+e.message);}finally{$('signup').disabled=false;}};
$('resendConfirmation').onclick=async()=>{
 const email=$('email').value.trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){authNotice('登録に使ったメールアドレスを入力してから、確認メールを再送してください。パスワードの入力は不要です。');return;}
 const btn=$('resendConfirmation');btn.disabled=true;let sent=false;
 try{const {error}=await db.auth.resend({type:'signup',email,options:{emailRedirectTo:AUTH_REDIRECT_URL}});if(error)throw error;sent=true;authNotice('未確認の登録がある場合は、確認メールが再送されます。古いメールではなく、いちばん新しいメールのリンクを開いてください。すでに確認済みなら、そのままログインできます。再送は1分ほど間をあけてください。');}
 catch(e){authNotice('再送できませんでした：'+(e.status===429?'しばらく待ってからもう一度お試しください。':e.message));}
 finally{if(sent)setTimeout(()=>{btn.disabled=false;},60000);else btn.disabled=false;}
};
$('logout').onclick=async()=>{const {error}=await db.auth.signOut();if(error){message(error.message);return;}await initialize(null);};
$('householdSelect').onchange=async()=>{const target=$('householdSelect').value;householdId=target;resetScope();localStorage.setItem(savedKey(),target);try{await Promise.all([loadItems(),loadShopping()]);subscribeHousehold();message('共有する冷蔵庫と買い物リストを切り替えました。');}catch(e){message(e.message);}};
$('makeInvite').onclick=async()=>{if(!householdId)return;$('makeInvite').disabled=true;const scope=scopeVersion;try{const {data,error}=await db.rpc('create_household_invitation',{target_household_id:householdId});if(error)throw error;if(scope!==scopeVersion)return;inviteValue=data;$('inviteCode').textContent=data;$('inviteCode').classList.remove('hidden');$('copyInvite').classList.remove('hidden');message('家族に招待コードを伝えてください。');}catch(e){message(e.message);}finally{$('makeInvite').disabled=false;}};
$('copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText(inviteValue);message('招待コードをコピーしました。');}catch{message('表示された招待コードを選択してコピーしてください。');}};
$('joinForm').onsubmit=async e=>{e.preventDefault();const code=$('joinCode').value.trim().toLowerCase();if(!code)return;const btn=$('joinForm').querySelector('button');btn.disabled=true;try{const {data,error}=await db.rpc('join_household',{invitation_code:code});if(error)throw error;householdId=null;resetScope();await refreshHouseholds(data);$('joinCode').value='';navigate('fridge');message('家族の冷蔵庫と買い物リストに参加しました。');}catch(e){message(e.message);}finally{btn.disabled=false;}};
const feedback=createFeedback({document,window,db,getScope:()=>({user:activeUser,householdId,version:scopeVersion,page:currentPage}),notify:message,navigate,openSheet,el,button,icon});
renderFilters();
// Show a useful recovery message for expired/reused confirmation links, without displaying tokens.
if(new URLSearchParams(window.location.hash.slice(1)).has('error'))authNotice('確認リンクが期限切れ、または使用済みの可能性があります。まずログインを試し、未確認と表示された場合は、登録したメールアドレスで確認メールを再送してください。');
try{const {data:{session},error}=await db.auth.getSession();if(error)throw error;await initialize(session?.user||null);db.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){activeUser=null;householdId=null;resetScope();show(null);}});}catch(e){message('起動できませんでした：'+e.message);}
