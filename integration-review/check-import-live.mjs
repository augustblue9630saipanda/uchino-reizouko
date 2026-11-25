import assert from 'node:assert/strict';
const base='https://moorgivgwmkbxyjvwuih.supabase.co',headers={apikey:'sb_publishable_4cMwMgr654spcCXTKnsabw_a6AEu77x','Content-Type':'application/json'};
const paths=[['/rest/v1/pantry_imports?select=batch_id&limit=1',{}],['/rest/v1/rpc/commit_pantry_import',{method:'POST',body:'{}'}],['/functions/v1/scan-receipt',{method:'POST',body:'{}'}]];
const results=await Promise.all(paths.map(async([path,init])=>{const r=await fetch(base+path,{headers,...init});assert.ok([401,403].includes(r.status),path+' must reject anonymous access');return {path,status:r.status};}));
console.log(JSON.stringify(results,null,2));
