import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPurchaseImport} from '../purchase-import.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function node(tag='div',className='',text=''){
 const classes=new Set();return {tagName:tag.toUpperCase(),className,textContent:text,value:'',children:[],attributes:{},disabled:false,open:false,
 classList:{toggle(k,on){on?classes.add(k):classes.delete(k);},add(k){classes.add(k);},remove(k){classes.delete(k);}},
 append(...xs){this.children.push(...xs);},replaceChildren(...xs){this.children=xs;},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},addEventListener(){},close(){this.open=false;}};
}
function setup(options={}){
 const nodes=new Map([...html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)].map(m=>[m[2],node(m[1])]));
 let scope={householdId:'h',userId:'u',scopeVersion:1};const calls=[],notices=[];
 const db={functions:{invoke:async(name,args)=>{calls.push({type:'ocr',name,args});return options.invoke?options.invoke():{data:{householdId:'h',elapsedMs:2500,items:[{originalName:'成分無調整牛乳1L',name:'牛乳',kind:'食材',category:'卵・乳製品',quantityText:'1本'},{originalName:'食器用洗剤',name:'食器用洗剤',kind:'日用品',category:'その他',quantityText:'1本'},{originalName:'不明な品',name:'不明な品',kind:'不明',category:'その他',quantityText:''}]},error:null};}},rpc:async(name,args)=>{calls.push({type:'save',name,args});return {data:{status:'saved',added:0,updated:1,purchased:2,already:0},error:null};}};
 const api=createPurchaseImport({document:{getElementById:id=>nodes.get(id)},window:{},db,getScope:()=>scope,getStock:()=>[{id:'f',name:'牛乳',quantity_level:'low',registered_on:'2026-11-01'}],getShopping:()=>[{id:'s',name:'牛乳',purchased:false},{id:'d',name:'食器用洗剤',purchased:false}],refresh:async()=>{},notify:s=>notices.push(s),openSheet:id=>{for(const n of nodes.values())n.open=false;nodes.get(id).open=true;},el:node,button:(text,cls,action)=>Object.assign(node('button',cls,text),{onclick:action}),categoryFor:()=> 'その他',foodGlyph:()=> '🥛',prepareReceiptImage:async()=>({mimeType:'image/jpeg',image:'/9j/2Q=='})});
 const all=n=>[n,...n.children.flatMap(all)],control=label=>all(nodes.get('importRows')).find(n=>n.attributes['aria-label']===label);
 async function image(){api.openReceipt();nodes.get('receiptLibrary').files=[new File([Buffer.from('/9j/2Q==','base64')],'fake.jpg',{type:'image/jpeg'})];await nodes.get('receiptLibrary').onchange();}
 return {api,nodes,calls,notices,control,image,switchScope(){scope={...scope,scopeVersion:2,householdId:'other'};api.reset();}};
}
test('receipt OCR requires confirmation, defaults daily/unknown off, and never auto-confirms even exact shopping matches',async()=>{
 const h=setup();await h.image();await h.nodes.get('receiptRead').onclick();
 const state=h.api.state();assert.deepEqual(state.candidates.map(i=>i.selected),[true,false,false]);assert.ok(state.candidates.every(i=>!i.shopping_id&&!i.purchase));assert.ok(state.candidates.every(i=>i.quantity_level==='normal'));assert.equal(h.calls.filter(c=>c.type==='save').length,0);
 assert.match(state.receiptKey,/^[a-f0-9]{64}$/);assert.equal(h.nodes.get('receiptLibrary').value,'');
 const match=h.control('成分無調整牛乳1Lの買い物リスト照合');match.value='s';match.onchange();
 const duplicate=h.control('成分無調整牛乳1Lの重複時の処理');duplicate.value='update';duplicate.onchange();
 const daily=h.control('食器用洗剤の買い物リスト照合');daily.value='d';daily.onchange();
 await h.nodes.get('importSave').onclick();const save=h.calls.find(c=>c.type==='save');assert.equal(save.args.p_source,'receipt');assert.equal(save.args.p_entries.length,2);assert.equal(save.args.p_entries[0].action,'update');assert.equal(save.args.p_entries[0].target_id,'f');assert.equal(save.args.p_entries[1].action,'purchase_only');assert.equal(save.args.p_entries[1].shopping_id,'d');assert.match(save.args.p_receipt_key,/^[a-f0-9]{64}$/);
 await h.nodes.get('importSave').onclick();assert.equal(h.calls.filter(c=>c.type==='save').length,1);
});
test('manual receipt additions are editable and blank names never save silently',async()=>{
 const h=setup();await h.image();await h.nodes.get('receiptRead').onclick();h.nodes.get('importAddRow').onclick();assert.equal(h.api.state().candidates.at(-1).selected,true);await h.nodes.get('importSave').onclick();assert.equal(h.calls.filter(c=>c.type==='save').length,0);assert.ok(h.notices.length);
});
test('receipt failure retains the image for explicit retry and restores enabled controls',async()=>{
 const h=setup({invoke:async()=>{throw new DOMException('timeout','AbortError');}});await h.image();await h.nodes.get('receiptRead').onclick();assert.equal(h.api.state().loading,false);assert.equal(h.nodes.get('receiptRead').disabled,false);assert.match(h.nodes.get('receiptStatus').textContent,/再試行/);assert.equal(h.calls.length,1);h.api.reset();
});
test('receipt responses after household change are discarded and drafts/images cleared',async()=>{
 let resolve;const h=setup({invoke:()=>new Promise(r=>resolve=r)});await h.image();const pending=h.nodes.get('receiptRead').onclick();while(!resolve)await new Promise(r=>setTimeout(r,0));h.switchScope();resolve({data:{householdId:'h',items:[]},error:null});await pending;assert.equal(h.api.state().candidates.length,0);assert.equal(h.api.state().receiptKey,null);assert.equal(h.nodes.get('importStatus').textContent,'');
});
test('SDK-wrapped abort errors also show the specific retry message and unlock the screen',async()=>{
 const h=setup({invoke:async()=>({data:null,error:{name:'FunctionsFetchError',context:new DOMException('timeout','AbortError')}})});await h.image();await h.nodes.get('receiptRead').onclick();assert.match(h.nodes.get('receiptStatus').textContent,/時間がかかりすぎ/);assert.equal(h.nodes.get('receiptRead').disabled,false);h.api.reset();
});
