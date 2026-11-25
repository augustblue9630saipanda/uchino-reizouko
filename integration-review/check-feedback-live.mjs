import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='https://augustblue9630saipanda.github.io/uchino-reizouko/';
const results=await Promise.all(['index.html','app.js','feedback.mjs','feedback.css','pantry.css','purchase-import.mjs','purchase-import.css','supabase/functions/scan-receipt/products.mjs','supabase/functions/generate-dinner/context.mjs'].map(async path=>{
 const r=await fetch(base+path,{cache:'no-store'});assert.equal(r.status,200,path);
 const actual=Buffer.from(await r.arrayBuffer()),expected=await readFile(new URL('../'+path,import.meta.url));
 const hash=b=>createHash('sha256').update(b).digest('hex');assert.equal(hash(actual),hash(expected),path);
 return {path,status:r.status,bytes:actual.length};
}));
const key='sb_publishable_4cMwMgr654spcCXTKnsabw_a6AEu77x';
const denied=await fetch('https://moorgivgwmkbxyjvwuih.supabase.co/rest/v1/feedback_notes?select=id&limit=1',{headers:{apikey:key}});
assert.ok([401,403].includes(denied.status),'Unauthenticated requests must be denied');
console.log(JSON.stringify({assets:results,anonymousFeedbackAccess:denied.status},null,2));
