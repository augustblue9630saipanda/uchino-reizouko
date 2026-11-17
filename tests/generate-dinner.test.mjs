import test from 'node:test';
import assert from 'node:assert/strict';
import {createDinnerHandler} from '../supabase/functions/generate-dinner/handler.mjs';
import {validateDinner,annotateStock} from '../supabase/functions/generate-dinner/contract.mjs';
import {dinnerFixture} from './dinner-fixture.mjs';
const householdId='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';
function harness(options={}){
 const calls=[];
 const config={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'public-test-key',GEMINI_API_KEY:'SERVER_ONLY_SECRET',GEMINI_MODEL:'gemini-3.5-flash-lite',DINNER_ALLOWED_ORIGINS:'http://localhost:8000',...options.env};
 let clock=100000;
 const fetchImpl=async(url,init)=>{
  calls.push({url,init});
  if(url.endsWith('/auth/v1/user'))return Response.json({id:userId},{status:options.authStatus||200});
  if(url.includes('/rest/v1/households'))return Response.json(options.forbidden?[]:[{id:householdId}]);
  if(url.includes('/rest/v1/ingredients'))return Response.json(options.rows||[{name:'卵'},{name:'玉ねぎ'}]);
  if(options.throwError)throw options.throwError;
  return Response.json({candidates:[{finishReason:options.finishReason||'STOP',content:{parts:[{text:JSON.stringify(options.output||dinnerFixture())}]}}]},{status:options.geminiStatus||200});
 };
 const handler=createDinnerHandler({env:k=>config[k],fetchImpl,now:()=>clock,preview:options.preview||false});
 const request=(body={householdId},headers={})=>new Request('https://test.supabase.co/functions/v1/generate-dinner',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer user-jwt',Origin:'http://localhost:8000',...headers},body:JSON.stringify(body)});
 return {handler,calls,request,tick(){clock+=61000;}};
}
test('authenticated RLS reads and server-only Gemini call return exactly three complete patterns',async()=>{
 const h=harness();const response=await h.handler(h.request());
 assert.equal(response.status,200);const data=await response.json();
 assert.equal(data.patterns.length,3);assert.equal(data.householdId,householdId);
 assert.ok(data.patterns.every(p=>p.dishes.length===3));
 assert.equal(data.patterns[0].dishes[0].ingredients[0].availability,'登録あり（量を確認）');
 assert.equal(data.patterns[0].missingIngredients[0].name,'しめじ');
 assert.equal(data.patterns[0].pantryToCheck[0].name,'しょうゆ');
 for(const {url,init} of h.calls.filter(c=>c.url.includes('/rest/'))){assert.equal(init.headers.Authorization,'Bearer user-jwt');assert.ok(url.includes(householdId));assert.equal(init.method,undefined);}
 const gemini=h.calls.at(-1);assert.equal(gemini.init.headers['x-goog-api-key'],'SERVER_ONLY_SECRET');assert.ok(!gemini.url.includes('SERVER_ONLY_SECRET'));
 const sent=JSON.parse(gemini.init.body);assert.ok(!JSON.stringify(sent).includes(userId));assert.ok(!JSON.stringify(sent).includes('user-jwt'));
 assert.deepEqual(JSON.parse(sent.contents[0].parts[0].text).inventory,['卵','玉ねぎ']);
 assert.ok(!JSON.stringify(data).includes('SERVER_ONLY_SECRET'));
});
test('unauthenticated callers and foreign households cannot call Gemini',async()=>{
 for(const option of [{authStatus:401},{forbidden:true}]){
  const h=harness(option);const r=await h.handler(h.request());assert.equal(r.status,option.forbidden?403:401);
  assert.ok(h.calls.every(c=>!c.url.includes('googleapis')));
 }
 const h=harness();assert.equal((await h.handler(h.request({householdId},{Authorization:''}))).status,401);assert.equal(h.calls.length,0);
});
test('reject untrusted client inventory, invalid ids, origins, oversized input and missing configuration',async()=>{
 for(const body of [{householdId,inventory:['forged']},{householdId:'bad'}]){const h=harness();assert.equal((await h.handler(h.request(body))).status,400);assert.equal(h.calls.length,0);}
 const h=harness();assert.equal((await h.handler(h.request({householdId},{Origin:'https://evil.example'}))).status,403);
 assert.equal((await h.handler(h.request({householdId,padding:'x'.repeat(3000)}))).status,413);
 const unset=harness({env:{GEMINI_API_KEY:''}});const r=await unset.handler(unset.request());assert.equal(r.status,503);assert.equal(unset.calls.length,0);
});
test('empty/oversized stock and cooldown do not issue extra provider requests',async()=>{
 for(const rows of [[],Array.from({length:101},()=>({name:'卵'}))]){const h=harness({rows});assert.equal((await h.handler(h.request())).status,422);assert.ok(!h.calls.some(c=>c.url.includes('googleapis')));}
 const h=harness();assert.equal((await h.handler(h.request())).status,200);assert.equal((await h.handler(h.request())).status,429);
 h.tick();assert.equal((await h.handler(h.request())).status,200);
});
test('provider failures, truncation, timeout and malformed recipes fail closed without leaking errors',async()=>{
 const invalid=dinnerFixture();invalid.patterns[0].dishes[0].childServing.afterStep=15;
 for(const option of [{geminiStatus:429},{geminiStatus:500},{finishReason:'MAX_TOKENS'},{output:{patterns:[]}},{output:invalid},{rows:[{name:'牛乳'}]},{throwError:new Error('SERVER_ONLY_SECRET')},{throwError:new DOMException('secret','TimeoutError')}]){
  const h=harness(option);const r=await h.handler(h.request());assert.ok(r.status>=400);assert.ok(!(await r.text()).includes('SERVER_ONLY_SECRET'));
 }
});
test('contract rejects wrong role counts, missing quantities and duplicate patterns',()=>{
 for(const mutate of [d=>d.patterns.pop(),d=>d.patterns[0].dishes[1].role='主菜',d=>d.patterns[0].dishes[0].ingredients[0].quantity='',d=>d.patterns[1].title=d.patterns[0].title]){
  const d=dinnerFixture();mutate(d);assert.throws(()=>validateDinner(d));
 }
 assert.equal(annotateStock(dinnerFixture(),['卵豆腐']).patterns[0].dishes[0].ingredients[0].availability,'買い足し候補');
});
test('CORS preflight works only for configured origins',async()=>{
 const h=harness();const r=await h.handler(new Request('https://test.example',{method:'OPTIONS',headers:{Origin:'http://localhost:8000'}}));
 assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'http://localhost:8000');assert.equal(h.calls.length,0);
});

test('default model uses the verified 3.5 Flash-Lite when only Gemini key is set',async()=>{
 const h=harness({env:{GEMINI_MODEL:''}});const r=await h.handler(h.request());
 assert.equal(r.status,200);assert.equal((await r.json()).model,'gemini-3.5-flash-lite');
 const call=h.calls.at(-1);assert.ok(call.url.endsWith('/gemini-3.5-flash-lite:generateContent'));
 const generation=JSON.parse(call.init.body).generationConfig;assert.equal(generation.responseMimeType,'application/json');assert.ok(generation.responseJsonSchema.properties.patterns);
});
test('preview authenticates but never reads or writes database; explicit staging configuration is mandatory',async()=>{
 const config={DINNER_TEST_MODE:'true',DINNER_TEST_PROJECT_REF:'test'};
 const h=harness({preview:true,env:config});const r=await h.handler(h.request({inventory:['卵','しめじ']}));
 assert.equal(r.status,200);const d=await r.json();assert.equal(d.mode,'preview');assert.equal(d.householdId,null);
 assert.deepEqual(d.inventory,['卵','しめじ']);assert.ok(h.calls.every(c=>!c.url.includes('/rest/')));
 for(const env of [{},{...config,DINNER_TEST_MODE:'false'},{...config,DINNER_TEST_PROJECT_REF:'other'},{...config,DINNER_TEST_PROJECT_REF:'moorgivgwmkbxyjvwuih',SUPABASE_URL:'https://moorgivgwmkbxyjvwuih.supabase.co'}]){
  const denied=harness({preview:true,env});assert.equal((await denied.handler(denied.request({inventory:['卵']}))).status,403);assert.equal(denied.calls.length,0);
 }
 const unauthorized=harness({preview:true,env:config,authStatus:401});assert.equal((await unauthorized.handler(unauthorized.request({inventory:['卵']}))).status,401);assert.ok(unauthorized.calls.every(c=>!c.url.includes('googleapis')));
});
test('preview validates supplied sample food, normal endpoint continues to reject client inventory',async()=>{
 for(const inventory of [null,['x'.repeat(101)],[''],Array.from({length:101},()=> '卵')]){
  const h=harness({preview:true,env:{DINNER_TEST_MODE:'true',DINNER_TEST_PROJECT_REF:'test'}});assert.equal((await h.handler(h.request({inventory}))).status,400);assert.equal(h.calls.length,0);
 }
 const h=harness();assert.equal((await h.handler(h.request({inventory:['卵']}))).status,400);
});
