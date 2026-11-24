import test from 'node:test';
import assert from 'node:assert/strict';
import {japanToday,validDay,registrationDay,elapsedDays,ageLabel,sortPantry,dinnerPreferences,inventoryContext} from '../supabase/functions/generate-dinner/context.mjs';
test('JST date rolls over at 15:00 UTC, uses calendar days and preserves explicit unknown dates',()=>{
 const before=Date.parse('2026-11-23T14:59:59Z'),after=before+1000;
 assert.equal(japanToday(before),'2026-11-23');assert.equal(japanToday(after),'2026-11-24');
 assert.equal(registrationDay({created_at:'2026-11-22T15:10:00Z'}),'2026-11-23');
 assert.equal(registrationDay({registered_on:null,created_at:'2026-11-22T15:10:00Z'}),null);
 assert.equal(elapsedDays({registered_on:'2026-11-23'},after),1);
 assert.equal(ageLabel({registered_on:'2026-11-24'},after),'今日登録');
 assert.equal(ageLabel({},after),'登録日不明');assert.equal(validDay('2026-02-30'),false);
});
test('date sort crosses categories and unknowns remain last in both directions',()=>{
 const rows=[{id:'unknown',registered_on:null},{id:'new',registered_on:'2026-11-24',category:'野菜・果物'},{id:'old',registered_on:'2026-11-20',category:'肉・魚'}];
 assert.deepEqual(sortPantry(rows,'oldest').map(i=>i.id),['old','new','unknown']);
 assert.deepEqual(sortPantry(rows,'newest').map(i=>i.id),['new','old','unknown']);assert.equal(rows[0].id,'unknown');
});
test('preferences accept empty or combined requests, reject invalid values and use qualitative stock only',()=>{
 assert.deepEqual(dinnerPreferences({}),{requestText:'',moods:[],purchaseMode:'balanced'});
 assert.deepEqual(dinnerPreferences({requestText:' カレー ',moods:['お肉','時短','お肉'],purchaseMode:'flexible'}).moods,['お肉','時短']);
 for(const input of [{requestText:'x'.repeat(401)},{moods:['unknown']},{moods:'時短'},{purchaseMode:'bad'}])assert.throws(()=>dinnerPreferences(input));
 assert.deepEqual(inventoryContext([{name:'にんじん',quantity_level:'low',registered_on:'2026-11-20'}],Date.parse('2026-11-23T15:00Z')),[{name:'にんじん',quantityLevel:'少',elapsedDays:4}]);
});
