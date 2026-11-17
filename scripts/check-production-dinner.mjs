// Read-only smoke test: deliberately invalid login prevents any Gemini call or DB write.
const url='https://moorgivgwmkbxyjvwuih.supabase.co/functions/v1/generate-dinner';
const apikey='sb_publishable_4cMwMgr654spcCXTKnsabw_a6AEu77x';
for(const token of ['', 'Bearer deliberately-invalid-login']){
 const response=await fetch(url,{method:'POST',headers:{apikey,Origin:'https://augustblue9630saipanda.github.io','Content-Type':'application/json',...(token?{Authorization:token}:{})},body:JSON.stringify({householdId:'11111111-1111-4111-8111-111111111111'}),signal:AbortSignal.timeout(15000)});
 const body=await response.json();
 console.log(JSON.stringify({case:token?'invalid-login':'no-login',status:response.status,code:body.code,message:body.error||body.message,cors:response.headers.get('access-control-allow-origin')}));
 if(response.status!==401)process.exitCode=1;
}
