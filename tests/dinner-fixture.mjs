export function dinnerFixture(){
 return {patterns:['和風','洋風','中華風'].map((title,index)=>({title,description:'野菜を細かく混ぜ、取り分けてから大人用に味付けします。',dishes:['主菜','副菜','汁物'].map(role=>({
  role,name:title+role,
  ingredients:[{name:'たまご',quantity:'2個',kind:'食材'},{name:'しめじ',quantity:'100g',kind:'食材'},{name:'しょうゆ',quantity:'取り分け後の大人用に小さじ1',kind:'調味料'}],
  adultPortion:'100g',childPortion:'50g',preparation:['しめじは繊維を断って5mmに刻む。'],
  steps:[{instruction:'鍋に水と具材を入れる。',heat:'中火',time:'2分',doneness:'沸騰を確認する。'},{instruction:'卵を加えて十分に加熱する。',heat:'弱火',time:'5分以上を目安',doneness:'中心75℃で1分以上を確認する。'}],
  childServing:{afterStep:2,instruction:'子ども用を50g取り分け、さらに細かくし、冷ます。'},adultFinish:'取り分けた後、大人用にしょうゆ小さじ1を混ぜる。',childSafety:'骨・筋を除き、やわらかさを確認して見守る。'
 }))}))};
}
