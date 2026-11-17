import {dinnerSchema,systemPrompt,validateDinner,annotateStock} from './contract.mjs';

class PublicError extends Error{
 constructor(status,message){super(message);this.status=status;}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Dependency injection keeps tests entirely offline. Never use a service-role key.
export function createDinnerHandler({env,fetchImpl=fetch,now=Date.now,preview=false}){
 const attempts=new Map();
 return async request=>{
  const origin=request.headers.get('origin');
  const allowed=(env('DINNER_ALLOWED_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean);
  const cors={'Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
  if(origin&&allowed.includes(origin))cors['Access-Control-Allow-Origin']=origin;
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
  try{
   if(origin&&!allowed.includes(origin))throw new PublicError(403,'この画面からは利用できません。テスト環境の接続先を確認してください。');
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
   if(request.method!=='POST')throw new PublicError(405,'POSTで呼び出してください。');
   const authorization=request.headers.get('authorization')||'';
   if(!/^Bearer\s+\S+$/i.test(authorization))throw new PublicError(401,'ログインし直してください。');
   if(!request.headers.get('content-type')?.includes('application/json'))throw new PublicError(415,'JSON形式で送信してください。');
   const supabaseUrl=env('SUPABASE_URL');
   const anonKey=env('SUPABASE_ANON_KEY');
   const geminiKey=env('DINNER_GEMINI_API_KEY')||env('GEMINI_API_KEY');
   // Dinner-specific settings never require changing existing photo-recognition settings.
   const model=env('DINNER_GEMINI_MODEL')||(preview?env('GEMINI_MODEL'):null)||'gemini-3.5-flash-lite';
   if(!supabaseUrl||!anonKey||!geminiKey||!model||!/^[a-zA-Z0-9._-]+$/.test(model))throw new PublicError(503,'AI献立のサーバー設定がまだ完了していません。');
   if(preview){
    const testRef=env('DINNER_TEST_PROJECT_REF');
    if(env('DINNER_TEST_MODE')!=='true'||!testRef||supabaseUrl!==`https://${testRef}.supabase.co`||testRef==='moorgivgwmkbxyjvwuih')throw new PublicError(403,'献立プレビューは指定したテスト環境でのみ利用できます。');
   }
   // Bound the body before parsing; do not accept inventory supplied by the browser.
   const reader=request.body?.getReader();
   let raw='';let bytes=0;
   const decoder=new TextDecoder();
   if(reader){for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>(preview?32000:2048)){await reader.cancel();throw new PublicError(413,'リクエストが大きすぎます。');}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}
   let body;try{body=JSON.parse(raw);}catch{throw new PublicError(400,'リクエストを読み取れませんでした。');}
   if(preview){
    if(!body||Object.keys(body).some(k=>k!=='inventory')||!Array.isArray(body.inventory)||body.inventory.length>100||body.inventory.some(n=>typeof n!=='string'||!n.trim()||n.length>100))throw new PublicError(400,'食材名を1〜100件、各100文字以内で指定してください。');
   }else if(!body||!uuid.test(body.householdId)||Object.keys(body).some(k=>!['householdId'].includes(k)))throw new PublicError(400,'冷蔵庫の指定が正しくありません。');
   const headers={apikey:anonKey,Authorization:authorization};
   const userResponse=await fetchImpl(supabaseUrl+'/auth/v1/user',{headers,signal:AbortSignal.timeout(10000)});
   if(!userResponse.ok)throw new PublicError(401,'ログインの有効期限が切れています。ログインし直してください。');
   const user=await userResponse.json();
   if(!uuid.test(user.id))throw new PublicError(401,'ログインし直してください。');
   let rows;
   if(preview){rows=body.inventory.map(name=>({name}));}
   else{
   // RLS-scoped reads verify membership, including empty households. No admin bypass.
   const households=await fetchImpl(supabaseUrl+'/rest/v1/households?select=id&id=eq.'+body.householdId,{headers,signal:AbortSignal.timeout(10000)});
   if(!households.ok)throw new PublicError(503,'冷蔵庫の共有権限を確認できませんでした。');
   const visible=await households.json();
   if(!Array.isArray(visible)||!visible.some(h=>h.id===body.householdId))throw new PublicError(403,'この冷蔵庫を使う権限がありません。');
   const stockResponse=await fetchImpl(supabaseUrl+'/rest/v1/ingredients?select=name&household_id=eq.'+body.householdId+'&order=name.asc&limit=101',{headers,signal:AbortSignal.timeout(10000)});
   if(!stockResponse.ok)throw new PublicError(503,'食材を読み込めませんでした。時間をおいて試してください。');
   rows=await stockResponse.json();
   }
   if(!Array.isArray(rows))throw new PublicError(503,'食材を読み込めませんでした。');
   if(rows.length>100)throw new PublicError(422,'食材が100件を超えています。献立用に扱える件数を超えました。');
   const inventory=[...new Set(rows.map(r=>r.name).filter(n=>typeof n==='string'&&n.trim()).map(n=>n.trim().slice(0,100)))];
   if(!inventory.length)throw new PublicError(422,'まず冷蔵庫に食材を登録してください。');
   // Best-effort per-instance cooldown. Project/provider quotas remain necessary.
   for(const [id,t] of attempts)if(now()-t>=60000)attempts.delete(id);
   if(attempts.has(user.id))throw new PublicError(429,'生成後は1分ほど待ってから、もう一度試してください。');
   if(attempts.size>=1000)throw new PublicError(429,'ただいま混み合っています。少し待ってください。');
   attempts.set(user.id,now());
   const response=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':geminiKey},signal:AbortSignal.timeout(75000),
    body:JSON.stringify({systemInstruction:{parts:[{text:systemPrompt}]},contents:[{role:'user',parts:[{text:JSON.stringify({inventory,variation:crypto.randomUUID()})}]}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:dinnerSchema,maxOutputTokens:24576,temperature:0.9}})
   });
   if(response.status===429)throw new PublicError(429,'AIが混み合っているか利用上限に達しました。時間をおいて試してください。');
   if(!response.ok){
    let detail='';try{detail=String((await response.json())?.error?.message||'');}catch{}
    // Classify without exposing Google's message, inventory or the credential.
    const reason=/api.?key|API_KEY/i.test(detail)?'APIキー設定':/schema|JSON|constraint/i.test(detail)?'応答形式の設定':response.status===404||/model.*not (found|supported|available)/i.test(detail)?'モデルの利用設定':response.status===403?'利用権限の設定':'接続設定';
    throw new PublicError(502,'AIの'+reason+'を確認してください（Gemini HTTP '+response.status+'）。');
   }
   const payload=await response.json();
   const candidate=payload.candidates?.[0];
   if(candidate?.finishReason!=='STOP')throw new PublicError(502,'献立を最後まで作成できませんでした。時間をおいて再生成してください。');
   let dinner;
   try{
    const text=candidate.content.parts.filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('');
    if(text.length>180000)throw Error('large');
    dinner=validateDinner(JSON.parse(text));
   }catch{throw new PublicError(502,'献立の形式を確認できませんでした。再生成してください。');}
   const annotated=annotateStock(dinner,inventory);
   if(annotated.patterns.some(p=>!p.dishes.some(d=>d.ingredients.some(i=>i.availability==='登録あり（量を確認）'))))throw new PublicError(502,'冷蔵庫の食材を使う献立になりませんでした。再生成してください。');
   return reply(200,{...annotated,inventory,householdId:preview?null:body.householdId,mode:preview?'preview':'registered',model,generatedAt:new Date(now()).toISOString()});
  }catch(e){
   if(e instanceof PublicError)return reply(e.status,{error:e.message});
   // Never return provider errors, prompts, authorization headers or credentials.
   return reply(e?.name==='TimeoutError'?504:502,{error:e?.name==='TimeoutError'?'AIの応答に時間がかかっています。時間をおいて再生成してください。':'献立を取得できませんでした。通信状況を確認して再度お試しください。'});
  }
 };
}
