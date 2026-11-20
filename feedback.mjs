export const feedbackPages={home:'ホーム',fridge:'冷蔵庫',dinner:'AI献立',shopping:'買い物',feedback:'ご意見メモ'};
export const feedbackStatuses=['未対応','検討中','対応済み'];
export function feedbackImagePath(household,id){return `${household}/${id}/attachment.jpg`;}
export function formatFeedbackExport(notes){
 return ['うちの暮らし｜ご意見メモ',...notes.map((n,i)=>[
  `\n--- ${i+1} / ${n.id} ---`,`状態: ${n.status}`,`画面: ${feedbackPages[n.source_page]||n.source_page}`,
  `投稿者: ${n.author_label||'家族'}`,`投稿日時: ${n.created_at}`,`更新日時: ${n.updated_at}`,
  n.body,n.image_path?'添付画像: あり（このテキストには画像・閲覧URLを含めていません）':'添付画像: なし'
 ].join('\n'))].join('\n');
}

export function createFeedback({document,window,db,getScope,notify,navigate,openSheet,el,button,icon}){
 const $=id=>document.getElementById(id),bucket=db.storage?.from('feedback-images');
 let notes=[],selected=new Set(),request=0,epoch=0,renderVersion=0,origin='home',attachment=null,previewURL=null,saving=false,converting=false,loaded=false,more=false;
 const imageURLs=new Set(),locks=new Set();
 const scope=()=>({...getScope(),epoch});
 const current=s=>s.epoch===epoch&&s.version===getScope().version&&s.householdId===getScope().householdId&&s.user?.id===getScope().user?.id;
 const ready=()=>!!getScope().user&&!!getScope().householdId;
 function clearPreview(){if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;attachment=null;$('feedbackFile').value='';$('feedbackPreview').removeAttribute('src');$('feedbackPreviewBox').classList.add('hidden');}
 function revokeImages(){for(const url of imageURLs)URL.revokeObjectURL(url);imageURLs.clear();}
 function setBusy(){ $('feedbackSubmit').disabled=saving||converting; $('feedbackFile').disabled=saving||converting;$('feedbackRemovePreview').disabled=saving||converting;$('feedbackBody').readOnly=saving; }
 function reset(){epoch++;request++;renderVersion++;notes=[];selected.clear();loaded=false;more=false;locks.clear();clearPreview();revokeImages();saving=false;converting=false;setBusy();$('feedbackCompose').classList.remove('is-saving');$('feedbackBody').value='';$('feedbackExportText').value='';$('feedbackItems').replaceChildren();$('feedbackStatus').textContent='ご意見メモを読み込みます。';}
 function sync(){ $('feedbackFab').classList.toggle('hidden',!getScope().user);$('feedbackFab').disabled=!ready(); }
 function open(){
  if(!ready()){notify('共有する世帯を読み込み中です。少し待ってからお試しください。');return;}
  origin=Object.hasOwn(feedbackPages,getScope().page)?getScope().page:'home';
  $('feedbackOrigin').textContent='対象画面：'+feedbackPages[origin];openSheet('feedbackCompose');
 }
 async function prepareImage(file){
  if(saving||converting)return;
  if(!file?.type?.startsWith('image/')||file.size>15*1024*1024){notify('15MB以下の写真・スクリーンショットを選んでください。');return;}
  const s=scope();converting=true;setBusy();
  try{
   const blob=await new Promise((resolve,reject)=>{
    const image=new Image(),url=URL.createObjectURL(file);
    image.onload=()=>{try{const scale=Math.min(1,2048/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);canvas.toBlob(b=>b?resolve(b):reject(Error('画像を変換できませんでした。')),'image/jpeg',.88);}catch(e){reject(e);}finally{URL.revokeObjectURL(url);}};
    image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('この画像を開けませんでした。スクリーンショットやJPEG・PNGでお試しください。'));};image.src=url;
   });
   if(!current(s))return;if(blob.size>5*1024*1024)throw Error('画像が大きすぎます。小さくしてから選び直してください。');
   clearPreview();attachment=blob;previewURL=URL.createObjectURL(blob);$('feedbackPreview').src=previewURL;$('feedbackPreviewBox').classList.remove('hidden');
  }catch(e){if(current(s))notify(e.message);}finally{if(current(s)){converting=false;setBusy();}}
 }
 async function load({next=false}={}){
  if(!ready())return;const s=scope(),ticket=++request;
  const count=next?notes.length+50:Math.max(50,notes.length);
  const {data,error}=await db.from('feedback_notes').select('id,household_id,author_id,author_label,body,source_page,status,image_path,created_at,updated_at').eq('household_id',s.householdId).order('created_at',{ascending:false}).order('id').range(0,count);
  if(!current(s)||ticket!==request)return;
  if(error){$('feedbackStatus').textContent='読み込めませんでした。「更新」でもう一度お試しください。';throw error;}
  const rows=data||[];more=rows.length>count;const nextNotes=rows.slice(0,count),changed=!loaded||JSON.stringify(notes)!==JSON.stringify(nextNotes);notes=nextNotes;loaded=true;
  selected=new Set([...selected].filter(id=>notes.some(n=>n.id===id)));
  if(changed)render();else updateSelection();$('feedbackMore').classList.toggle('hidden',!more);
  $('feedbackStatus').textContent=`${notes.length}件のご意見${more?'（続きがあります）':''} · 同じ世帯の家族と共有中`;
 }
 function updateSelection(){ $('feedbackExport').textContent=selected.size?`選んだ${selected.size}件をテキスト出力`:'表示中のメモをテキスト出力';$('feedbackExport').disabled=!selected.size&&!notes.some(n=>!$('feedbackFilter').value||n.status===$('feedbackFilter').value); }
 async function copy(text){try{await navigator.clipboard.writeText(text);notify('コピーしました。');}catch{$('feedbackExportText').value=text;openSheet('feedbackExportDialog');notify('テキストを長押ししてコピーしてください。');}}
 async function changeStatus(note,status){
  if(!feedbackStatuses.includes(status)||locks.has(note.id)||!ready())return;const s=scope();locks.add(note.id);
  try{const {data,error}=await db.from('feedback_notes').update({status}).eq('id',note.id).eq('household_id',s.householdId).select('id');if(error)throw error;if(!data?.length)throw Error('このメモは削除されたか、共有先が変わっています。');if(current(s))await load();}
  catch(e){if(current(s)){notify('更新できませんでした：'+e.message);render();}}finally{locks.delete(note.id);}
 }
 async function remove(note,imageOnly=false){
  if(locks.has(note.id)||!ready())return;
  if(!window.confirm(imageOnly?'この添付画像を削除しますか？':'このご意見メモと添付画像を削除しますか？'))return;
  const s=scope();locks.add(note.id);
  try{
   if(note.image_path){const {error}=await bucket.remove([note.image_path]);if(error)throw error;}
   // Storage must succeed first, so a failed upload cleanup can be retried from the note.
   const q=db.from('feedback_notes');const {error}=imageOnly?await q.update({image_path:null}).eq('id',note.id).eq('household_id',s.householdId):await q.delete().eq('id',note.id).eq('household_id',s.householdId);
   if(error)throw error;if(!current(s))return;await load();notify(imageOnly?'添付画像を削除しました。':'ご意見メモを削除しました。');
  }catch(e){if(current(s))notify('削除を完了できませんでした。もう一度お試しください：'+e.message);}finally{locks.delete(note.id);}
 }
 function render(){
  const s=scope(),version=++renderVersion;revokeImages();$('feedbackItems').replaceChildren();
  const filter=$('feedbackFilter').value,visible=notes.filter(n=>!filter||n.status===filter);
  if(!visible.length)$('feedbackItems').append(el('p','feedback-empty',notes.length?'この状態のメモはありません。':'まだご意見メモはありません。気づいたことを気軽に残してね。'));
  for(const note of visible){
   const card=el('article','feedback-card'),head=el('div','feedback-card-head'),check=el('input');check.type='checkbox';check.checked=selected.has(note.id);check.setAttribute('aria-label','このメモをまとめて出力する');check.onchange=()=>{check.checked?selected.add(note.id):selected.delete(note.id);updateSelection();};
   const meta=el('div','feedback-meta');const date=new Date(note.created_at).toLocaleString('ja-JP',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});meta.append(el('strong','',note.author_label||'家族'),el('small','',date+' · '+(feedbackPages[note.source_page]||'画面不明')));head.append(check,meta);card.append(head,el('p','feedback-body',note.body));
   if(note.image_path){
    const wrap=el('div','feedback-image'),caption=el('p','caption','添付画像');
    const show=button('添付画像を見る','secondary',async()=>{
     show.disabled=true;
     try{const {data,error}=await bucket.download(note.image_path);if(error)throw error;if(!current(s)||version!==renderVersion)return;const url=URL.createObjectURL(data);imageURLs.add(url);const img=el('img');img.src=url;img.alt='ご意見メモの添付画像';wrap.replaceChildren(img,caption);}
     catch{if(current(s)&&version===renderVersion){show.disabled=false;caption.textContent='画像を読み込めませんでした。もう一度お試しください。';}}
    });wrap.append(show,caption);card.append(wrap);
   }
   const actions=el('div','feedback-actions'),status=el('select');status.setAttribute('aria-label','対応状況');for(const label of feedbackStatuses){const option=el('option','',label);option.value=label;status.append(option);}status.value=note.status;status.onchange=()=>changeStatus(note,status.value);
   actions.append(status,button('コピー','text-button',()=>copy(formatFeedbackExport([note]))));
   if(note.image_path)actions.append(button('画像を削除','text-button',()=>remove(note,true)));
   actions.append(button('メモを削除','text-button feedback-delete',()=>remove(note)));card.append(actions);$('feedbackItems').append(card);
  }updateSelection();
 }
 $('feedbackFab').onclick=open;$('feedbackNew').onclick=open;
 $('feedbackFile').onchange=()=>{const file=$('feedbackFile').files?.[0];if(file)prepareImage(file);};
 $('feedbackRemovePreview').onclick=()=>{if(!saving&&!converting)clearPreview();};
 document.addEventListener('paste',e=>{if(!$('feedbackCompose').open||saving||converting)return;const file=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'))?.getAsFile();if(file){e.preventDefault();prepareImage(file);}});
 $('feedbackToList').onclick=()=>{if(!saving)navigate('feedback');};
 $('feedbackRefresh').onclick=()=>load().catch(e=>notify('読み込めませんでした：'+e.message));
 $('feedbackMore').onclick=()=>load({next:true}).catch(e=>notify(e.message));$('feedbackFilter').onchange=render;
 $('feedbackExport').onclick=()=>{const rows=selected.size?notes.filter(n=>selected.has(n.id)):notes.filter(n=>!$('feedbackFilter').value||n.status===$('feedbackFilter').value);$('feedbackExportText').value=formatFeedbackExport(rows);openSheet('feedbackExportDialog');};
 $('feedbackCopyExport').onclick=()=>copy($('feedbackExportText').value);
 $('feedbackSelectText').onclick=()=>{$('feedbackExportText').focus();$('feedbackExportText').select();};
 $('feedbackForm').onsubmit=async e=>{
  e.preventDefault();if(saving||converting||!ready())return;const body=$('feedbackBody').value.trim();if(!body||body.length>5000){notify('ご意見を1〜5000文字で入力してください。');return;}
  const s=scope(),id=crypto.randomUUID(),image=attachment,path=image?feedbackImagePath(s.householdId,id):null;let uploaded=false,posted=false;
  saving=true;setBusy();$('feedbackCompose').classList.add('is-saving');
  try{
   if(image){const {error}=await bucket.upload(path,image,{contentType:'image/jpeg',cacheControl:'0',upsert:false});if(error)throw error;uploaded=true;}
   if(!current(s))throw Error('共有先が切り替わりました。');
   const {error}=await db.from('feedback_notes').insert({id,household_id:s.householdId,body,source_page:origin,image_path:path});if(error)throw error;posted=true;
   if(!current(s))return;clearPreview();$('feedbackBody').value='';$('feedbackCompose').close();loaded=false;
   if(getScope().page==='feedback')await load();notify('ご意見メモを投稿しました。ありがとう！');
  }catch(e){
   let cleanupFailed=false;if(uploaded&&!posted){try{const result=await bucket.remove([path]);cleanupFailed=!!result.error;}catch{cleanupFailed=true;}}
   if(current(s))notify(posted?'投稿は保存できました。一覧を「更新」してください。':'投稿を完了できませんでした。本文と画像は残しています。'+(cleanupFailed?'添付画像の一時保存が残っている可能性があります。':'')+' '+e.message);
  }finally{if(current(s)){saving=false;setBusy();$('feedbackCompose').classList.remove('is-saving');}}
 };
 // Do not dismiss the composer halfway through an upload.
 $('feedbackCompose').addEventListener('cancel',e=>{if(saving)e.preventDefault();});
 return {open,reset,sync,load,refresh(){if(getScope().page==='feedback')return load();return Promise.resolve();}};
}
