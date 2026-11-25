import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createReceiptHandler,validateReceipt} from '../supabase/functions/scan-receipt/handler.mjs';
import {describeProduct,shoppingMatches,ingredientKey} from '../supabase/functions/scan-receipt/products.mjs';
const householdId='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222';
const item=(originalName='国産豚バラ切落し',extra={})=>({originalName,name:originalName,kind:'食材',category:'その他',quantityText:'1パック',...extra});
test('product normalization and classification are conservative and preserve original receipt names',()=>{
 for(const [raw,name] of [['国産豚バラ切落し','豚バラ肉'],['北海道産玉葱3P','玉ねぎ'],['成分無調整牛乳1L','牛乳'],['ぶなしめじWパック','しめじ']]){assert.equal(describeProduct(raw).name,name);const [i]=validateReceipt({items:[item(raw)]});assert.equal(i.originalName,raw);assert.equal(i.name,name);}
 assert.equal(describeProduct('食器用洗剤').kind,'日用品');assert.equal(describeProduct('謎の品').kind,'不明');
 assert.equal(ingredientKey(' ﾀﾏﾈｷﾞ '),ingredientKey('玉ねぎ'));assert.equal(ingredientKey('たまご'),ingredientKey('卵'));
});
test('receipt output drops metadata and never upgrades unclear products to confident foods',()=>{
 const items=validateReceipt({items:[item('牛乳'),item('合計 1234'),item('ポイント'),item('会員 123456789012'),item('謎の商品',{kind:'不明',name:'謎の商品',quantityText:''}),item('洗濯洗剤')]});
 assert.equal(items.length,3);assert.equal(items[1].kind,'不明');assert.equal(items[2].kind,'日用品');
 assert.throws(()=>validateReceipt({items:[item('牛乳',{kind:'anything'})]}));
});
test('shopping suggestions handle names and aliases, exclude registered items and remain explicitly labeled candidates',()=>{
 const matches=shoppingMatches({name:'玉ねぎ',originalName:'北海道産玉葱3P'},[{id:'a',name:'玉ねぎ'},{id:'b',name:'タマネギ'},{id:'c',name:'牛乳'},{id:'d',name:'玉ねぎ',pantry_registered_at:'2026-11-25'}]);
 assert.deepEqual(matches.map(i=>i.id),['a','b']);assert.equal(matches[0].match,'完全一致');assert.equal(matches[1].match,'表記違いの候補');
});
function harness(options={}){
 const calls=[],config={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'public-key',GEMINI_API_KEY:'SERVER_RECEIPT_SECRET',DINNER_ALLOWED_ORIGINS:'https://app.example',...options.env};let clock=1000;
 const handler=createReceiptHandler({env:k=>config[k],now:()=>clock,fetchImpl:async(url,init)=>{
  calls.push({url,init});if(url.endsWith('/auth/v1/user'))return Response.json({id:userId},{status:options.authStatus||200});if(url.includes('/households'))return Response.json(options.foreign?[]:[{id:householdId}]);
  if(options.throwError)throw options.throwError;
  return Response.json(options.providerError?{error:{message:'SERVER_RECEIPT_SECRET'}}:{candidates:[{finishReason:options.finishReason||'STOP',content:{parts:[{text:JSON.stringify(options.output||{items:[item()]})}]}}],usageMetadata:{promptTokenCount:1200,candidatesTokenCount:300,thoughtsTokenCount:10}},{status:options.providerError||200});
 }});
 const request=(body={householdId,image:'/9j/2Q==',mimeType:'image/jpeg'},headers={})=>new Request('https://test/functions/v1/scan-receipt',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer jwt',Origin:'https://app.example',...headers},body:JSON.stringify(body)});
 return {handler,calls,request,tick(){clock+=16000;}};
}
test('receipt handler authenticates and checks RLS membership, calls Gemini once, returns no image or credentials',async()=>{
 const h=harness();const r=await h.handler(h.request());assert.equal(r.status,200);const data=await r.json();assert.equal(data.items[0].name,'豚バラ肉');assert.equal(data.householdId,householdId);assert.deepEqual(data.usage,{inputTokens:1200,outputTokens:310});
 assert.equal(h.calls.length,3);const provider=h.calls.at(-1);assert.equal(provider.init.headers['x-goog-api-key'],'SERVER_RECEIPT_SECRET');assert.ok(!provider.url.includes('SECRET'));
 const body=JSON.parse(provider.init.body);assert.equal(body.contents[0].parts[1].inlineData.data,'/9j/2Q==');assert.ok(!JSON.stringify(data).includes('/9j/'));assert.ok(!JSON.stringify(data).includes('SECRET'));
 assert.equal(h.calls[1].init.headers.Authorization,'Bearer jwt');assert.equal(h.calls[1].init.method,undefined);
});
test('foreign households and unauthenticated requests cannot send images to AI',async()=>{
 for(const options of [{foreign:true},{authStatus:401}]){const h=harness(options);assert.ok((await h.handler(h.request())).status>=400);assert.ok(!h.calls.some(c=>c.url.includes('googleapis')));}
 const h=harness();assert.equal((await h.handler(h.request(undefined,{Authorization:''}))).status,401);assert.equal(h.calls.length,0);
});
test('receipt request bounds, origin and image type fail before provider use',async()=>{
 const h=harness();for(const body of [{householdId,image:'abc',mimeType:'image/jpeg'},{householdId,image:'/9j/2Q==',mimeType:'image/png'},{householdId,image:'/9j/2Q==',mimeType:'image/jpeg',secret:'x'}])assert.equal((await h.handler(h.request(body))).status,400);
 assert.equal((await h.handler(h.request(undefined,{Origin:'https://evil.example'}))).status,403);assert.equal(h.calls.length,0);
 assert.equal((await h.handler(h.request({householdId,image:'x'.repeat(5000001),mimeType:'image/jpeg'}))).status,413);
});
test('timeouts, quotas, incomplete OCR and malformed responses permit manual retry, never auto retry or leak provider errors',async()=>{
 for(const options of [{providerError:429},{providerError:500},{finishReason:'MAX_TOKENS'},{output:{items:'bad'}},{throwError:new DOMException('SECRET','TimeoutError')}]){const h=harness(options);const r=await h.handler(h.request());assert.ok(r.status>=400);assert.ok(!(await r.text()).includes('SECRET'));assert.equal(h.calls.filter(c=>c.url.includes('googleapis')).length,1);}
 const h=harness();assert.equal((await h.handler(h.request())).status,200);assert.equal((await h.handler(h.request())).status,429);h.tick();assert.equal((await h.handler(h.request())).status,200);
});
test('dashboard receipt bundle compiles and includes all current handler code',()=>{
 const source=readFileSync(new URL('../supabase/dashboard/scan-receipt.ts',import.meta.url),'utf8');assert.doesNotThrow(()=>new vm.Script(source.replace('(name:string)','(name)')));assert.ok(source.includes('createReceiptHandler'));assert.ok(!source.includes('SERVER_RECEIPT_SECRET'));
});
