// Public configuration only. No sign-in, data writes or Gemini calls.
const project='https://cvkaimuqcsoxrmfkhvfr.supabase.co';
const apikey='sb_publishable_ilbJPnLxOS3O0zBynndI3g_r29hxBrb';
for(const path of ['/auth/v1/settings','/functions/v1/generate-dinner-preview']){
 try{
  const response=await fetch(project+path,{headers:{apikey},signal:AbortSignal.timeout(15000)});
  const body=await response.json().catch(()=>({}));
  console.log(JSON.stringify({path,status:response.status,message:body.error||body.message||null,authConfigured:path.includes('/auth/')&&response.ok}));
 }catch(e){console.log(JSON.stringify({path,connectionError:e.cause?.code||e.name}));process.exitCode=1;}
}
