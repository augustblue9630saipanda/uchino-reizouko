// Read-only smoke test: deliberately invalid login prevents any Gemini call or DB write.
const url='https://moorgivgwmkbxyjvwuih.supabase.co/functions/v1/generate-dinner';
const apikey='sb_publishable_4cMwMgr654spcCXTKnsabw_a6AEu77x';
const page=await fetch('https://augustblue9630saipanda.github.io/uchino-reizouko/',{signal:AbortSignal.timeout(15000)});
const html=await page.text();
const enabled=html.includes('id="page-dinner"')&&html.includes('app.js')&&!html.includes('🍳 冷蔵庫から献立提案');
console.log(JSON.stringify({case:'published-app',status:page.status,dinnerEnabled:enabled}));
if(!page.ok||!enabled)process.exitCode=1;
for(const token of ['', 'Bearer deliberately-invalid-login']){
 const response=await fetch(url,{method:'POST',headers:{apikey,Origin:'https://augustblue9630saipanda.github.io','Content-Type':'application/json',...(token?{Authorization:token}:{})},body:JSON.stringify({householdId:'11111111-1111-4111-8111-111111111111'}),signal:AbortSignal.timeout(15000)});
 const body=await response.json();
 console.log(JSON.stringify({case:token?'invalid-login':'no-login',status:response.status,code:body.code,message:body.error||body.message,cors:response.headers.get('access-control-allow-origin')}));
 if(response.status!==401)process.exitCode=1;
}
