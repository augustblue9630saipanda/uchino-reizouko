import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
// Review artifact only. Do not edit the user's currently running local app before approval.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
if(!html.includes("const url='https://moorgivgwmkbxyjvwuih.supabase.co';"))throw Error('Unexpected production project');
const integrated=html.replace('const dinnerEnabled=false;','const dinnerEnabled=true;')
 .replace('// Enable only in a copy connected to a TEST Supabase project with generate-dinner deployed.','// Production integration: enable only after generate-dinner is deployed and verified.')
 .replace('AI献立のテスト環境はまだ接続されていません。','AI献立は現在準備中です。')
 .replace('AI献立に接続できませんでした。テスト環境の設定と通信状況を確認してください。','AI献立に接続できませんでした。少し待ってから試してください。');
mkdirSync(new URL('../integration-review/',import.meta.url),{recursive:true});
writeFileSync(new URL('../integration-review/index.html',import.meta.url),integrated);
