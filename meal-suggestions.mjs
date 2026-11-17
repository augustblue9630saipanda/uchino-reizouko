// Name matching is deliberately explicit: unrelated foods must not match substrings.
const groups = [
 ['卵','たまご','玉子','タマゴ'], ['豚肉','豚こま','豚こま肉','豚バラ','豚バラ肉','豚ロース','豚ロース肉'],
 ['鶏肉','鶏もも肉','鶏むね肉','とり肉','とりもも','とりむね'], ['ひき肉','合いびき肉','合挽き肉','豚ひき肉'],
 ['玉ねぎ','たまねぎ','タマネギ'], ['にんじん','人参','ニンジン'], ['じゃがいも','ジャガイモ'],
 ['キャベツ','きゃべつ'], ['ほうれん草','ほうれんそう'], ['豆腐','とうふ','木綿豆腐','絹ごし豆腐'],
 ['ご飯','ごはん','白米','冷凍ご飯'], ['ねぎ','長ねぎ','長ネギ','長葱'], ['もやし','モヤシ'],
 ['トマト','とまと'], ['きゅうり','キュウリ'], ['ツナ','ツナ缶'], ['パスタ','スパゲッティ'],
 ['うどん','冷凍うどん'], ['鮭','さけ','サケ','生鮭'], ['しめじ','シメジ'], ['ピーマン','ぴーまん']
];
const normalize = value => String(value).normalize('NFKC').replace(/[\s　]/g,'').toLowerCase();
const aliases = new Map(groups.flatMap(group => group.map(name => [normalize(name), group[0]])));
export const canonicalName = name => aliases.get(normalize(name)) || normalize(name);
export const recipes = [
 ['親子丼',['鶏肉','玉ねぎ','卵','ご飯'],['しょうゆ','みりん','だし'],'鶏肉と玉ねぎをだしで煮て、卵でとじ、ご飯にのせます。'],
 ['豚肉とキャベツの炒め物',['豚肉','キャベツ'],['油','塩','こしょう'],'豚肉を炒め、キャベツを加えて火を通し、味を調えます。'],
 ['肉じゃが',['豚肉','じゃがいも','玉ねぎ','にんじん'],['しょうゆ','砂糖','だし'],'肉と野菜を炒め、だしと調味料を加えてやわらかく煮ます。'],
 ['卵チャーハン',['ご飯','卵','ねぎ'],['油','塩','しょうゆ'],'卵とご飯を炒め、刻んだねぎを加えて味を調えます。'],
 ['ほうれん草の卵炒め',['ほうれん草','卵'],['油','塩','こしょう'],'ほうれん草を下ゆでして水を切り、卵と炒めます。'],
 ['豆腐とねぎのみそ汁',['豆腐','ねぎ'],['みそ','だし'],'だしで豆腐とねぎを温め、火を弱めてみそを溶きます。'],
 ['もやしと豚肉の蒸し焼き',['もやし','豚肉'],['酒','ポン酢'],'もやしに豚肉を重ね、酒を振り、ふたをして中まで加熱します。'],
 ['トマトとツナのパスタ',['トマト','ツナ','パスタ'],['油','塩','こしょう'],'トマトとツナを炒め、ゆでたパスタと和えます。'],
 ['きゅうりとツナのサラダ',['きゅうり','ツナ'],['マヨネーズ','塩'],'きゅうりを切って軽く塩もみし、水を切ってツナと和えます。'],
 ['焼きうどん',['うどん','豚肉','キャベツ','にんじん'],['油','しょうゆ'],'肉と野菜を炒め、うどんを加えてほぐし、しょうゆで味付けします。'],
 ['鮭としめじの蒸し焼き',['鮭','しめじ'],['酒','バター','しょうゆ'],'鮭としめじに酒を振り、ふたをして中まで加熱し、味を調えます。'],
 ['ピーマンとひき肉の炒め物',['ピーマン','ひき肉'],['油','しょうゆ','砂糖'],'ひき肉と細切りのピーマンを炒め、中まで火を通して味付けします。']
].map(([name,ingredients,seasonings,method])=>({name,ingredients,seasonings,method}));

export function suggestMeals(names, readyOnly = false) {
 const stock = new Set(names.filter(name=>typeof name==='string' && name.trim()).map(canonicalName));
 if (!stock.size) return [];
 return recipes.map(recipe => ({...recipe,
  available: recipe.ingredients.filter(name=>stock.has(canonicalName(name))),
  missing: recipe.ingredients.filter(name=>!stock.has(canonicalName(name)))
 })).filter(recipe=>recipe.available.length && (!readyOnly || !recipe.missing.length))
 .sort((a,b)=>a.missing.length-b.missing.length || b.available.length-a.available.length || a.name.localeCompare(b.name,'ja'));
}
