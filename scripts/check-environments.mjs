// Read-only checks; no login, row data, Gemini request or database writes.
const projects=[
 ['production','https://moorgivgwmkbxyjvwuih.supabase.co','sb_publishable_4cMwMgr654spcCXTKnsabw_a6AEu77x'],
 ['test','https://cvkaimuqcsoxrmfkhvfr.supabase.co','sb_publishable_ilbJPnLxOS3O0zBynndI3g_r29hxBrb']
];
for(const [name,url,apikey] of projects){
 for(const [path,method] of [['/auth/v1/settings','GET'],['/rest/v1/households?select=id&limit=0','GET'],['/rest/v1/ingredients?select=id&limit=0','GET'],['/functions/v1/recognize-ingredients','OPTIONS'],['/functions/v1/generate-dinner','OPTIONS'],['/functions/v1/generate-dinner-preview','OPTIONS']]){
  try{const r=await fetch(url+path,{method,headers:{apikey,Origin:'https://augustblue9630saipanda.github.io'},signal:AbortSignal.timeout(15000)});console.log(JSON.stringify({project:name,path,method,status:r.status}));}
  catch(e){console.log(JSON.stringify({project:name,path,error:e.cause?.code||e.name}));process.exitCode=1;}
 }
}
