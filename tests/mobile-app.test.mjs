import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {dinnerFixture} from './dinner-fixture.mjs';
import {annotateStock} from '../supabase/functions/generate-dinner/contract.mjs';
import {createFeedback} from '../feedback.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const hh='11111111-1111-4111-8111-111111111111';
function node(tag='div'){
 const classes=new Set();return {tagName:tag.toUpperCase(),id:'',textContent:'',value:'',children:[],dataset:{},attributes:{},disabled:false,open:false,
 classList:{add(...xs){xs.forEach(x=>classes.add(x));},remove(...xs){xs.forEach(x=>classes.delete(x));},toggle(x,force){const on=force??!classes.has(x);on?classes.add(x):classes.delete(x);return on;},contains(x){return classes.has(x);}},
 append(...xs){this.children.push(...xs.flatMap(x=>x.fragment?x.children:[x]));},replaceChildren(...xs){this.children=[];this.append(...xs);},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},remove(){},querySelector(s){if(s==='button')return this.children.find(x=>x.tagName==='BUTTON')||node('button');return null;},querySelectorAll(){return[];}
 };
}
async function setup(options={}){
 const nodes=new Map();for(const m of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)){const n=node(m[1]);n.id=m[2];nodes.set(n.id,n);}
 const nav=['home','fridge','dinner','shopping'].map(page=>Object.assign(node('button'),{dataset:{page}}));
 const document={visibilityState:'visible',getElementById:id=>nodes.get(id),createElement:node,createElementNS:(ns,tag)=>node(tag),createDocumentFragment:()=>({...node(),fragment:true}),createTextNode:text=>({textContent:text,children:[]}),addEventListener(){},querySelector(s){if(s==='dialog[open]')return [...nodes.values()].find(n=>n.tagName==='DIALOG'&&n.open)||null;return null;},querySelectorAll(s){if(s==='dialog')return [...nodes.values()].filter(n=>n.tagName==='DIALOG');if(s==='dialog[open]')return [...nodes.values()].filter(n=>n.tagName==='DIALOG'&&n.open);if(s==='.page')return ['home','fridge','dinner','shopping'].map(p=>nodes.get('page-'+p));if(s==='.navBtn')return nav;return[];}};
 let items=[];const calls=[],subscriptions=[];
 const db={rpc:async(name,args)=>{calls.push({rpc:name,args});return options.rpc?options.rpc(name,args):{data:{status:"saved",count:args.p_items.length},error:null};},auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){},signUp:options.signUp,resend:options.resend},functions:{invoke:options.invoke||(async()=>({data:{...annotateStock(dinnerFixture(),['卵']),householdId:hh},error:null}))},removeChannel(){},channel(){const ch={on(event,filter,callback){subscriptions.push({filter,callback});return ch;},subscribe(){return ch;}};return ch;},from(table){
  const call={table,op:'select',filters:{}};const query={select(){return query;},order(){return query;},eq(k,v){call.filters[k]=v;return query;},insert(values){call.op='insert';call.values=values;return query;},update(values){call.op='update';call.values=values;return query;},delete(){call.op='delete';return query;},then(resolve,reject){calls.push(call);return Promise.resolve().then(async()=>{
   if(options.query)return options.query(call);
   if(options.fail&&call.op!=='select')return {error:{message:'保存失敗'}};
   if(table==='shopping_items'){
    if(call.op==='insert')items.unshift({id:'s'+(items.length+1),quantity:'',unit:'',purchased:false,...call.values});
    if(call.op==='update')items=items.map(i=>i.id===call.filters.id?{...i,...call.values}:i);
    if(call.op==='delete')items=items.filter(i=>i.id!==call.filters.id);
    return {data:items,error:null};
   }
   return {data:[],error:null};
  }).then(resolve,reject);}};return query;
 }};
 const context=vm.createContext({document,window:{location:{hash:options.hash||'',origin:'http://localhost:3000'},scrollTo(){},addEventListener(){}},createClient:()=>db,createFeedback,URL,URLSearchParams,Intl,Date,console,setTimeout:()=>0,clearTimeout(){},setInterval(){},localStorage:{getItem(){return null;},setItem(){}},navigator:{clipboard:{writeText:async()=>{}}}});
 const api=await vm.runInContext('(async()=>{'+source+`
 return {setup(){activeUser={id:'u',email:'test@example.test'};householdId='${hh}';mealItems=[{id:'f1',name:'卵'}];shoppingLoaded=true;renderPantry();renderShopping();},state(){return {householdId,currentPage,dinnerPlans,shoppingItems,mealItems,dinnerBusy,pendingPantryAdd,pantrySaving};},setStock(items){mealItems=items;renderPantry();},renderFilters,renderPantry,setFoodQuantity,addPantryItems,navigate,renderDinner,openRecipe,renderDish,resetScope,categoryFor,loadShopping,loadItems,subscribeHousehold,toggleShopping,editShopping,editFood,logout(){activeUser=null;householdId=null;resetScope();},switchScope(){householdId='other';resetScope();},addExternal(){},};
 })()`,context);
 api.setup();return {api,nodes,nav,calls,subscriptions,document};
}
const text=n=>[n.textContent,...(n.children||[]).map(text)].join('\n');
const submit={preventDefault(){}};

test('compact food row has three independent 44px-friendly amount controls and an edit action',async()=>{
 const {api,nodes}=await setup();const row=nodes.get('items').children[0].children[1].children[0];assert.equal(row.className,'food-row');
 const group=row.children[1];assert.equal(group.children.length,3);assert.equal(group.children[1].attributes['aria-pressed'],'true');
 row.children[2].onclick();assert.equal(nodes.get('foodDialog').open,true);assert.equal(nodes.get('foodQuantity').value,'normal');
 api.editFood();assert.equal(nodes.get('foodQuantity').value,'normal');
});

test('new food uses server duplicate check before insertion and defaults to normal quantity',async()=>{
 const {nodes,calls}=await setup();nodes.get('food').value='  牛乳  ';nodes.get('foodCategory').value='auto';nodes.get('foodQuantity').value='normal';
 await nodes.get('foodForm').onsubmit(submit);const call=calls.find(c=>c.rpc==='add_pantry_items');
 assert.equal(call.args.p_household,hh);assert.equal(call.args.p_allow_duplicates,false);assert.equal(call.args.p_items[0].quantity_level,'normal');assert.equal(call.args.p_items[0].name,'牛乳');
 assert.ok(!calls.some(c=>c.table==='ingredients'&&c.op==='insert'));
});

test('duplicate Back preserves input; cancel never submits an override; explicit Add does',async()=>{
 for(const choice of ['duplicateBack','duplicateCancel','duplicateAdd']){
  const {api,nodes,calls}=await setup({rpc:async(name,args)=>({data:args.p_allow_duplicates?{status:'saved',count:1}:{status:'duplicate',duplicates:['卵']},error:null})});
  api.editFood();nodes.get('food').value=' 卵 ';nodes.get('foodCategory').value='auto';await nodes.get('foodForm').onsubmit(submit);
  assert.equal(nodes.get('duplicateDialog').open,true);assert.ok(text(nodes.get('duplicateNames')).includes('卵'));await nodes.get(choice).onclick();
  assert.equal(calls.filter(c=>c.rpc).length,choice==='duplicateAdd'?2:1);
  if(choice==='duplicateBack'){assert.equal(nodes.get('foodDialog').open,true);assert.equal(nodes.get('food').value,' 卵 ');}
  if(choice==='duplicateCancel'){assert.equal(nodes.get('duplicateDialog').open,false);assert.equal(api.state().pendingPantryAdd,null);}
 }
});

test('photo batches share duplicate confirmation; returning retains the candidate input',async()=>{
 const {api,nodes,calls}=await setup({rpc:async()=>({data:{status:'duplicate',duplicates:['牛乳']}})});
 const candidate={name:'牛乳',category:'卵・乳製品',quantity_level:'normal'};
 await api.addPantryItems([candidate,{...candidate,name:'にんじん'}],'photoDialog');
 assert.equal(nodes.get('duplicateDialog').open,true);assert.ok(nodes.get('duplicateDescription').textContent.includes('登録全体'));
 await nodes.get('duplicateBack').onclick();assert.equal(nodes.get('photoDialog').open,true);assert.equal(calls.filter(c=>c.rpc).length,1);
});

test('quantity updates use household RLS scope; failed saves retain the previous level',async()=>{
 for(const fail of [false,true]){
  const {api,calls,nodes}=await setup({query:async c=>c.op==='update'?{data:fail?null:[{id:'f1'}],error:fail?{message:'通信失敗'}:null}:{data:[{id:'f1',name:'卵',quantity_level:'high'}],error:null}});
  await api.setFoodQuantity({id:'f1',name:'卵',quantity_level:'normal'},'high');const call=calls.find(c=>c.op==='update');
  assert.equal(call.filters.household_id,hh);assert.equal(call.filters.id,'f1');assert.equal(call.values.quantity_level,'high');
  assert.equal(api.state().mealItems[0].quantity_level,fail?undefined:'high');
  if(fail)assert.ok(nodes.get('status').textContent.includes('保存できませんでした'));
 }
});

test('household switch clears pending duplicate decisions and ignores late confirmation responses',async()=>{
 let resolve;const {api,nodes,calls}=await setup({rpc:()=>new Promise(r=>resolve=r)});
 const pending=api.addPantryItems([{name:'卵'}],'foodDialog');await new Promise(r=>setTimeout(r,0));api.switchScope();resolve({data:{status:'duplicate',duplicates:['卵']}});await pending;
 assert.equal(api.state().pendingPantryAdd,null);assert.equal(nodes.get('duplicateDialog').open,false);await nodes.get('duplicateAdd').onclick();assert.equal(calls.filter(c=>c.rpc).length,1);
});

test('four screen navigation, contextual dialogs and no legacy meal section',async()=>{
 const {api,nodes,nav}=await setup();api.navigate('dinner');assert.equal(api.state().currentPage,'dinner');assert.equal(nav[2].attributes['aria-current'],'page');assert.equal(nodes.get('page-home').classList.contains('active'),false);
 assert.doesNotMatch(html,/🍳 冷蔵庫から献立提案|id="mealResults"|data-page="family"/);
 for(const id of source.matchAll(/\$\('([^']+)'\)/g))assert.ok(nodes.has(id[1]),'Missing HTML id '+id[1]);
 api.editFood();assert.equal(nodes.get('foodDialog').open,true);assert.equal(api.categoryFor({name:'牛乳'}),'卵・乳製品');assert.equal(api.categoryFor({name:'しめじ'}),'野菜・果物');assert.equal(api.categoryFor({name:'洗剤'}),'その他');
});
test('shopping create, quantity edit, purchased toggle and delete are scoped to current household',async()=>{
 const {api,nodes,calls}=await setup();nodes.get('quickShoppingName').value='洗剤';await nodes.get('quickShopping').onsubmit(submit);
 assert.equal(api.state().shoppingItems[0].name,'洗剤');assert.equal(nodes.get('quickShoppingName').value,'');
 api.editShopping(api.state().shoppingItems[0]);nodes.get('shoppingQuantity').value='2';nodes.get('shoppingUnit').value='本';await nodes.get('shoppingForm').onsubmit(submit);
 assert.equal(api.state().shoppingItems[0].quantity,'2');await api.toggleShopping(api.state().shoppingItems[0]);assert.equal(api.state().shoppingItems[0].purchased,true);
 api.editShopping(api.state().shoppingItems[0]);await nodes.get('deleteShopping').onclick();assert.equal(api.state().shoppingItems.length,0);
 for(const c of calls.filter(c=>c.op!=='select'))assert.equal(c.values?.household_id||c.filters.household_id,hh);
});
test('failed writes keep user input and avoid fake successful list updates',async()=>{
 const {api,nodes}=await setup({fail:true});nodes.get('quickShoppingName').value='牛乳';await nodes.get('quickShopping').onsubmit(submit);
 assert.equal(nodes.get('quickShoppingName').value,'牛乳');assert.equal(api.state().shoppingItems.length,0);assert.ok(nodes.get('status').textContent.includes('失敗'));assert.equal(nodes.get('quickShopping').querySelector('button').disabled,false);
});
test('ingredient editing persists category and name with household filter',async()=>{
 const {api,nodes,calls}=await setup();api.editFood({id:'f1',name:'卵'});nodes.get('food').value='牛乳';nodes.get('foodCategory').value='卵・乳製品';await nodes.get('foodForm').onsubmit(submit);
 const update=calls.find(c=>c.table==='ingredients'&&c.op==='update');assert.equal(update.filters.household_id,hh);assert.equal(update.filters.id,'f1');assert.equal(update.values.name,'牛乳');assert.equal(update.values.category,'卵・乳製品');
});
test('AI cards open one dish at a time and preserve recipe fields as safe text',async()=>{
 const {api,nodes}=await setup();const data={...annotateStock(dinnerFixture(),['卵']),householdId:hh};data.patterns[0].title='<img onerror=alert(1)>';
 api.renderDinner(data);assert.equal(nodes.get('dinnerResults').children.length,3);assert.ok(text(nodes.get('dinnerResults')).includes('<img onerror=alert(1)>'));
 api.openRecipe(0);assert.equal(nodes.get('recipeDialog').open,true);const detail=text(nodes.get('recipeContent'));for(const term of ['100g','50g','下ごしらえ','作り方','子ども用を取り分け','大人用の仕上げ'])assert.ok(detail.includes(term),term);
 assert.equal(nodes.get('dishTabs').children.length,3);api.renderDish(1);assert.ok(text(nodes.get('recipeContent')).includes('副菜'));
});
test('one generation in flight; late replies after household switch or logout never show old plans',async()=>{
 for(const action of ['switchScope','logout']){
  let resolve,calls=0;const {api,nodes}=await setup({invoke:()=>{calls++;return new Promise(r=>resolve=r);}});
  const pending=nodes.get('generateDinner').onclick();await nodes.get('generateDinner').onclick();assert.equal(calls,1);api[action]();resolve({data:{...annotateStock(dinnerFixture(),['卵']),householdId:hh},error:null});await pending;
  assert.equal(nodes.get('dinnerResults').children.length,0);assert.equal(nodes.get('generateDinner').disabled,true);
 }
});
test('AI errors remove loading state and enable retry',async()=>{
 const {nodes}=await setup({invoke:async()=>({error:{context:{json:async()=>({error:'利用上限です'})}}})});await nodes.get('generateDinner').onclick();assert.equal(nodes.get('generateDinner').disabled,false);assert.equal(nodes.get('dinnerLoading').classList.contains('hidden'),true);assert.equal(nodes.get('dinnerStatus').textContent,'利用上限です');
});
test('late shopping reads from previous household are discarded',async()=>{
 let resolve;const {api}=await setup({query:()=>new Promise(r=>resolve=r)});const pending=api.loadShopping();await new Promise(r=>setTimeout(r,0));api.switchScope();resolve({data:[{id:'private',name:'old household'}],error:null});await pending;assert.equal(api.state().shoppingItems.length,0);
});
test('realtime subscription refreshes only its current household scope',async()=>{
 const {api,subscriptions,calls}=await setup();api.subscribeHousehold();assert.equal(subscriptions[0].filter.filter,'household_id=eq.'+hh);subscriptions[0].callback();await new Promise(r=>setTimeout(r,0));assert.ok(calls.some(c=>c.table==='shopping_items'&&c.filters.household_id===hh));const n=calls.length;api.switchScope();subscriptions[0].callback();await Promise.resolve();assert.equal(calls.length,n);
});

test('signup explicitly redirects to the production app even when opened on localhost',async()=>{
 let sent;const {nodes}=await setup({signUp:async args=>{sent=args;return {data:{session:null},error:null};}});
 nodes.get('email').value='wife@example.test';nodes.get('password').value='test-password';await nodes.get('signup').onclick();
 assert.equal(sent.options.emailRedirectTo,'https://augustblue9630saipanda.github.io/uchino-reizouko/');
 assert.ok(nodes.get('authNotice').textContent.includes('確認メール'));
});
test('confirmation resend uses the existing email without password and the same production redirect',async()=>{
 let sent;const {nodes}=await setup({resend:async args=>{sent=args;return {error:null};}});
 nodes.get('email').value='wife@example.test';nodes.get('password').value='';await nodes.get('resendConfirmation').onclick();
 assert.equal(sent.type,'signup');assert.equal(sent.email,'wife@example.test');assert.equal(sent.options.emailRedirectTo,'https://augustblue9630saipanda.github.io/uchino-reizouko/');
 assert.ok(!Object.hasOwn(sent,'password'));assert.ok(nodes.get('authNotice').textContent.includes('いちばん新しい'));assert.equal(nodes.get('resendConfirmation').disabled,true);
});
test('resend failures allow retry and expired links show recovery instructions without echoing tokens',async()=>{
 const {nodes}=await setup({hash:'#error=access_denied&error_code=otp_expired&access_token=DO_NOT_DISPLAY',resend:async()=>({error:{status:429,message:'limit'}})});
 assert.ok(nodes.get('authNotice').textContent.includes('期限切れ'));assert.ok(!nodes.get('authNotice').textContent.includes('DO_NOT_DISPLAY'));
 nodes.get('email').value='wife@example.test';await nodes.get('resendConfirmation').onclick();assert.equal(nodes.get('resendConfirmation').disabled,false);assert.ok(nodes.get('authNotice').textContent.includes('しばらく'));
});


test('pantry groups have counts, preserve collapse through filtering, and reset on household change',async()=>{
 const {api,nodes}=await setup();
 api.setStock([{id:'a',name:'にんじん'},{id:'b',name:'トマト'},{id:'c',name:'牛乳'},{id:'d',name:'特製だれ',category:'その他'}]);
 let groups=nodes.get('items').children;
 assert.deepEqual(groups.map(g=>g.children[0].children[0].textContent),['野菜・果物','卵・乳製品','その他']);
 assert.equal(groups[0].children[0].children[1].textContent,'2件');
 assert.ok(groups.every(g=>g.tagName==='DETAILS'&&g.open));
 groups[0].isConnected=true;groups[0].open=false;groups[0].ontoggle();
 api.renderPantry();assert.equal(nodes.get('items').children[0].open,false);
 nodes.get('foodSearch').value='牛乳';nodes.get('foodSearch').oninput();
 assert.equal(nodes.get('items').children.length,1);assert.ok(text(nodes.get('items')).includes('1件'));
 nodes.get('foodSearch').value='';api.renderFilters();
 nodes.get('categoryFilters').children.find(b=>b.textContent==='その他').onclick();
 assert.equal(nodes.get('items').children.length,1);assert.ok(text(nodes.get('items')).includes('特製だれ'));
 nodes.get('categoryFilters').children[0].onclick();assert.equal(nodes.get('items').children[0].open,false);
 api.switchScope();api.setStock([{id:'z',name:'にんじん'}]);assert.equal(nodes.get('items').children[0].open,true);
});
