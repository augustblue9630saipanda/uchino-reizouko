import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createFeedback,formatFeedbackExport,feedbackImagePath} from '../feedback.mjs';
import {readFileSync} from 'node:fs';
globalThis.crypto??=webcrypto;
const hh='11111111-1111-4111-8111-111111111111',uid='22222222-2222-4222-8222-222222222222';
const note={id:'33333333-3333-4333-8333-333333333333',household_id:hh,author_id:uid,author_label:'家族A',body:'<img onerror=alert(1)>\nここを改善してほしい',source_page:'dinner',status:'未対応',image_path:null,created_at:'2026-11-20T00:00:00Z',updated_at:'2026-11-20T00:00:00Z'};
function node(tag='div'){
 const classes=new Set();return {tagName:tag.toUpperCase(),children:[],attributes:{},value:'',textContent:'',open:false,disabled:false,files:[],
 classList:{add(...xs){xs.forEach(x=>classes.add(x));},remove(...xs){xs.forEach(x=>classes.delete(x));},toggle(x,f){f?classes.add(x):classes.delete(x);},contains:x=>classes.has(x)},append(...ns){this.children.push(...ns);},replaceChildren(...ns){this.children=ns;},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},addEventListener(){},close(){this.open=false;},focus(){},select(){}};
}
function setup(options={}){
 const nodes=new Map();const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');for(const m of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"/g)){const n=node(m[1]);nodes.set(m[2],n);}
 const $=id=>nodes.get(id),calls=[],messages=[];let state={user:{id:uid},householdId:hh,version:1,page:'dinner'},rows=structuredClone(options.rows||[note]);
 const db={storage:{from(bucket){assert.equal(bucket,'feedback-images');return {download:async path=>{calls.push({op:'download',path});return {data:new Blob(['image']),error:null};},remove:async paths=>{calls.push({op:'storage-delete',paths});return {error:options.storageError||null};}};}},from(table){assert.equal(table,'feedback_notes');const call={op:'select',filters:{}};const q={select(){return q;},eq(k,v){call.filters[k]=v;return q;},order(){return q;},range(a,b){call.range=[a,b];return q;},insert(value){call.op='insert';call.value=value;return q;},update(value){call.op='update';call.value=value;return q;},delete(){call.op='delete';return q;},then(resolve,reject){calls.push(call);return Promise.resolve().then(()=>options.query?options.query(call):{data:call.op==='select'?rows:[{id:note.id}],error:options.writeError&&call.op!=='select'?new Error('保存失敗'):null}).then(resolve,reject);}};return q;}};
 const api=createFeedback({document:{getElementById:$,createElement:node,addEventListener(){}},window:{confirm:()=>true},db,getScope:()=>state,notify:t=>messages.push(t),navigate:p=>{state.page=p;},openSheet:id=>{$(id).open=true;},el:(tag,c='',text='')=>Object.assign(node(tag),{textContent:text,className:c}),button:(text,c,fn)=>Object.assign(node('button'),{textContent:text,onclick:fn}),icon:()=>node('svg')});
 return {api,$,calls,messages,setScope:next=>{state={...state,...next};},setRows:next=>{rows=next;}};
}
const submit={preventDefault(){}};
const text=n=>[n.textContent,...n.children.map(text)].join('\n');
test('text-only post captures source and household without trusting author or dates from client',async()=>{
 const h=setup();h.api.open();assert.equal(h.$('feedbackOrigin').textContent,'対象画面：AI献立');h.$('feedbackBody').value='  気づいたこと  ';
 await h.$('feedbackForm').onsubmit(submit);const sent=h.calls.find(c=>c.op==='insert').value;
 assert.equal(sent.source_page,'dinner');assert.equal(sent.household_id,hh);assert.equal(sent.body,'気づいたこと');assert.equal(sent.image_path,null);
 for(const k of ['author_id','author_label','created_at','status'])assert.ok(!Object.hasOwn(sent,k));assert.equal(h.$('feedbackBody').value,'');
});
test('failed writes keep text, and one post at a time prevents double submission',async()=>{
 const h=setup({writeError:true});h.api.open();h.$('feedbackBody').value='残す本文';await h.$('feedbackForm').onsubmit(submit);assert.equal(h.$('feedbackBody').value,'残す本文');assert.equal(h.$('feedbackSubmit').disabled,false);
 let resolve;const pending=setup({query:c=>c.op==='insert'?new Promise(r=>resolve=r):{data:[]}});pending.api.open();pending.$('feedbackBody').value='投稿';const first=pending.$('feedbackForm').onsubmit(submit);await pending.$('feedbackForm').onsubmit(submit);assert.equal(pending.calls.filter(c=>c.op==='insert').length,1);await new Promise(setImmediate);resolve({error:null});await first;
});
test('late household reads are discarded and logout clears private text and selections',async()=>{
 let resolve;const h=setup({query:()=>new Promise(r=>resolve=r)});const load=h.api.load();await new Promise(setImmediate);h.setScope({householdId:'other',version:2});h.api.reset();resolve({data:[note]});await load;assert.equal(h.$('feedbackItems').children.length,0);h.$('feedbackBody').value='非公開';h.$('feedbackExportText').value='非公開';h.api.reset();assert.equal(h.$('feedbackBody').value,'');assert.equal(h.$('feedbackExportText').value,'');
});
test('private image retrieval is explicit, comments stay text, export excludes image URLs',async()=>{
 const n={...note,image_path:feedbackImagePath(hh,note.id)};const h=setup({rows:[n]});await h.api.load();assert.ok(text(h.$('feedbackItems')).includes(note.body));assert.ok(!h.calls.some(c=>c.op==='download'));
 const card=h.$('feedbackItems').children[0],image=card.children.find(c=>c.className==='feedback-image');await image.children[0].onclick();assert.equal(h.calls.at(-1).op,'download');
 const output=formatFeedbackExport([n]);assert.match(output,/AI献立/);assert.match(output,/家族A/);assert.ok(!output.includes(n.image_path));assert.ok(!output.includes('supabase.co'));h.api.reset();
});
test('filter, selected export and status update remain household-scoped',async()=>{
 const other={...note,id:'44444444-4444-4444-8444-444444444444',body:'対応済みのメモ',status:'対応済み'};const h=setup({rows:[note,other]});await h.api.load();
 const card=h.$('feedbackItems').children[0],check=card.children[0].children[0];check.checked=true;check.onchange();h.$('feedbackExport').onclick();assert.ok(h.$('feedbackExportText').value.includes(note.body));assert.ok(!h.$('feedbackExportText').value.includes(other.body));
 const actions=card.children.at(-1),select=actions.children[0];select.value='検討中';await select.onchange();const update=h.calls.find(c=>c.op==='update');assert.equal(update.filters.household_id,hh);assert.deepEqual(update.value,{status:'検討中'});
 h.$('feedbackFilter').value='対応済み';h.$('feedbackFilter').onchange();assert.equal(h.$('feedbackItems').children.length,1);
});
test('storage removal failure prevents note deletion; image-only removal keeps the note',async()=>{
 const n={...note,image_path:feedbackImagePath(hh,note.id)},h=setup({rows:[n],storageError:new Error('通信失敗')});await h.api.load();let actions=h.$('feedbackItems').children[0].children.at(-1);await actions.children.at(-1).onclick();assert.ok(!h.calls.some(c=>c.op==='delete'));
 const ok=setup({rows:[n]});await ok.api.load();actions=ok.$('feedbackItems').children[0].children.at(-1);await actions.children.find(c=>c.textContent==='画像を削除').onclick();const change=ok.calls.find(c=>c.op==='update');assert.deepEqual(change.value,{image_path:null});assert.equal(change.filters.household_id,hh);
});
test('unauthenticated state cannot post or load feedback',async()=>{
 const h=setup();h.setScope({user:null,householdId:null});h.api.sync();h.api.open();h.$('feedbackBody').value='送らない';await h.$('feedbackForm').onsubmit(submit);await h.api.load();assert.equal(h.calls.length,0);assert.equal(h.$('feedbackFab').disabled,true);
});
