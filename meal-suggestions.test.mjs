import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {suggestMeals} from './meal-suggestions.mjs';

test('direct-file entry has no local module imports and matches tested recipes',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/import\s+.*from\s+['"]\.\//);
 const source=readFileSync(new URL('./meal-suggestions.mjs',import.meta.url),'utf8').replace(/^export /gm,'').trim().replace(/\r\n/g,'\n');
 assert.ok(html.replace(/\r\n/g,'\n').includes(source));
});

test('empty stock and unrelated names do not suggest meals',()=>{
 assert.deepEqual(suggestMeals([]),[]);
 assert.deepEqual(suggestMeals(['卵豆腐','牛乳']),[]);
});
test('aliases and duplicates match without hiding missing ingredients',()=>{
 const meal=suggestMeals(['タマゴ','たまご','長ネギ','冷凍ご飯'],true);
 assert.ok(meal.some(r=>r.name==='卵チャーハン' && !r.missing.length));
 const parent=suggestMeals(['玉子']).find(r=>r.name==='親子丼');
 assert.deepEqual(parent.available,['卵']);
 assert.deepEqual(parent.missing,['鶏肉','玉ねぎ','ご飯']);
});
test('fewest missing ingredients first; ready filter excludes incomplete dishes',()=>{
 const names=['卵','ご飯','ねぎ','豚肉'];
 const results=suggestMeals(names);
 assert.ok(results.every((r,i)=>!i || results[i-1].missing.length<=r.missing.length));
 assert.ok(suggestMeals(names,true).every(r=>r.missing.length===0));
 assert.deepEqual(suggestMeals(['トマト'],true),[]);
});

test('app integration refreshes, clears on failure/switch/logout, and never writes for suggestions',async()=>{
 const nodes=new Map();
 const element=()=>({textContent:'',value:'all',children:[],classList:{add(){},remove(){},toggle(){}},append(...xs){this.children.push(...xs);},replaceChildren(){this.children=[];},removeAttribute(){},querySelectorAll(){return[];}});
 const document={getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element,querySelectorAll(){return[];}};
 let response={data:[{id:'1',name:'卵'},{id:'2',name:'ねぎ'},{id:'3',name:'ご飯'}],error:null};
 let pending=null;
 const db={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){}},from(table){assert.equal(table,'ingredients');return{select(){return this;},eq(){return this;},order(){return pending || Promise.resolve(response);}};}};
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?\n/gm,'');
 const context=vm.createContext({document,createClient:()=>db,suggestMeals,window:{scrollTo(){}},URL,console});
 await vm.runInContext('(async()=>{'+script+'\n'+`
 householdId='a';
 await loadItems();
 if(!$('mealResults').children.length)throw Error('missing suggestions');
 $('mealFilter').value='ready';renderMeals();
 if($('mealResults').children.length!==1)throw Error('filter');
 responseHook();
 await loadItems().catch(()=>{});
 if($('mealResults').children.length)throw Error('stale suggestions after failure');
 householdId='b';resetMeals();
 if($('mealResults').children.length)throw Error('stale household');
 await initialize(null);
 if($('mealResults').children.length)throw Error('stale logout');
 `+'})()',Object.assign(context,{responseHook(){response={data:null,error:new Error('offline')};}}));
});
