import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {annotateStock} from '../supabase/functions/generate-dinner/contract.mjs';
import {dinnerFixture} from './dinner-fixture.mjs';
const householdId='11111111-1111-4111-8111-111111111111';
function sample(){return {...annotateStock(dinnerFixture(),['卵']),householdId};}
async function setup(invoke){
 const nodes=new Map();
 const element=()=>({textContent:'',children:[],value:'all',disabled:false,attributes:{},classList:{add(){},remove(){},toggle(){}},
  setAttribute(k,v){this.attributes[k]=v;},removeAttribute(){},append(...xs){this.children.push(...xs.flatMap(x=>x.fragment?x.children:[x]));},
  replaceChildren(...xs){this.children=[];this.append(...xs);},querySelectorAll(){return[];}
 });
 const document={getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element,createDocumentFragment(){return {...element(),fragment:true};},querySelectorAll(){return[];}};
 const db={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){}},functions:{invoke}};
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?\n/gm,'').replace('const dinnerEnabled=false;','const dinnerEnabled=true;');
 const context=vm.createContext({document,createClient:()=>db,window:{scrollTo(){}},URL,console});
 const api=await vm.runInContext('(async()=>{'+script+`
 return {setup(){activeUser={id:'user'};householdId='${householdId}';mealItems=[{name:'卵'}];updateDinnerAvailability();},generate:()=>$('generateDinner').onclick(),reset:()=>resetMeals(),logout:()=>initialize(null)};
 })()`,context);
 api.setup();return {api,nodes};
}
const content=node=>[node.textContent,...node.children.map(content)].join('\n');
test('renders all three detailed menus, child timing and missing food without HTML injection',async()=>{
 const data=sample();data.patterns[0].title='<img src=x onerror=alert(1)>';
 let sent;
 const {api,nodes}=await setup(async(name,args)=>{sent={name,args};return {data,error:null};});
 await api.generate();
 assert.equal(sent.name,'generate-dinner');assert.equal(JSON.stringify(sent.args.body),JSON.stringify({householdId}));
 assert.equal(nodes.get('dinnerResults').children.length,3);
 const rendered=content(nodes.get('dinnerResults'));
 for(const expected of ['<img src=x onerror=alert(1)>','主菜','副菜','汁物','下ごしらえ','火加減','時間','子ども用を取り分け','大人用の仕上げ','しめじ','100g'])assert.ok(rendered.includes(expected),expected);
 assert.equal(nodes.get('dinnerResults').attributes['aria-busy'],'false');
 assert.equal(nodes.get('generateDinner').disabled,false);
});
test('single click in flight, and switching/reset/logout discard old AI responses',async()=>{
 for(const action of ['reset','logout']){
  let resolve;let calls=0;
  const {api,nodes}=await setup(()=>{calls++;return new Promise(r=>resolve=r);});
  const pending=api.generate();await api.generate();assert.equal(calls,1);assert.equal(nodes.get('generateDinner').disabled,true);
  await api[action]();resolve({data:sample(),error:null});await pending;
  assert.equal(nodes.get('dinnerResults').children.length,0);assert.equal(nodes.get('generateDinner').disabled,true);
 }
});
test('error and malformed responses show retry and no partial results',async()=>{
 for(const response of [{error:{context:{json:async()=>({error:'1分待ってください。'})}}},{data:{patterns:[],householdId},error:null},{data:{...sample(),householdId:'foreign'},error:null}]){
  const {api,nodes}=await setup(async()=>response);await api.generate();
  assert.equal(nodes.get('dinnerResults').children.length,0);assert.equal(nodes.get('generateDinner').disabled,false);
  assert.ok(nodes.get('generateDinner').textContent.includes('もう一度'));
 }
});
test('AI is disabled in the shipped page until a test project is configured',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(html.includes('const dinnerEnabled=false;'));
 assert.doesNotMatch(html,/generativelanguage\.googleapis\.com|AIza[\w-]{20,}/);
 assert.doesNotMatch(html,/import\s+.*from\s+['"]\.\//);
});
