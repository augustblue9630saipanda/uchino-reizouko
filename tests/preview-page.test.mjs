import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const page=read('dinner-test.html');
const script=page.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
test('preview is isolated, contains the tested renderer and needs no local module imports',()=>{
 new vm.Script(script);
 assert.doesNotMatch(script,/\.from\(|\.rpc\(|\.insert\(|\.delete\(|signUp\(|import .*from ['"]\.\//);
 assert.ok(script.includes('/functions/v1/generate-dinner-preview'));
 const app=read('index.html');const renderer=app.slice(app.indexOf('function dinnerText('),app.indexOf("$('generateDinner').onclick="));
 assert.ok(script.includes(renderer));
});
test('preview blocks production, secret keys and arbitrary endpoints before sign-in',()=>{
 const configCode=script.slice(script.indexOf('function testConfig('),script.indexOf("$('connectForm').onsubmit="));
 const validate=vm.runInNewContext(configCode+'\ntestConfig',{URL,atob});
 assert.equal(validate('https://staging.supabase.co','sb_publishable_test'),'https://staging.supabase.co');
 for(const url of ['https://moorgivgwmkbxyjvwuih.supabase.co','https://evil.example','http://staging.supabase.co','https://staging.supabase.co/path'])assert.throws(()=>validate(url,'sb_publishable_test'));
 for(const key of ['sb_secret_bad','AIza_test',Buffer.from('header').toString('base64url')+'.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.sig'])assert.throws(()=>validate('https://staging.supabase.co',key));
});
test('dashboard bundle starts the same preview handler without local imports',()=>{
 const code=read('supabase/dashboard/generate-dinner-preview.ts');
 assert.doesNotMatch(code,/^import /m);
 let handler;vm.runInNewContext(code.replace('(name:string)','(name)'),{Deno:{env:{get(){}},serve(fn){handler=fn;}},fetch(){},Date});
 assert.equal(typeof handler,'function');
 assert.ok(code.includes('gemini-3.5-flash-lite'));
});
