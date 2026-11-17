import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('production integration keeps existing project, auth and sharing writes unchanged',()=>{
 const before=read('index.html'),after=read('integration-review/index.html');
 assert.ok(after.includes('const dinnerEnabled=true;'));
 assert.ok(after.includes("const url='https://moorgivgwmkbxyjvwuih.supabase.co';"));
 assert.ok(after.includes("db.functions.invoke('generate-dinner'"));
 assert.doesNotMatch(after,/cvkaimuqcsoxrmfkhvfr|generate-dinner-preview|test-gemini/);
 const writes=s=>s.match(/\.(?:insert|delete|rpc|signUp|signInWithPassword|signOut)\([^;]*/g);
 assert.deepEqual(writes(after),writes(before));
 assert.doesNotMatch(after,/generativelanguage\.googleapis\.com|AIza[\w-]{20,}/);
});
test('dashboard production bundle enables registered household mode only',()=>{
 const code=read('supabase/dashboard/generate-dinner.ts');let captured;
 vm.runInNewContext(code.replace('(name:string)','(name)'),{Deno:{env:{get(){}},serve(fn){captured=fn;}},fetch(){},Date});
 assert.equal(typeof captured,'function');
 assert.ok(code.endsWith('Deno.serve(createDinnerHandler({env:(name:string)=>Deno.env.get(name)}));\n'));
});
