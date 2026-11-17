# 次に行うテスト：夕飯3パターンの実生成

## できていること

- テスト接続先 `https://cvkaimuqcsoxrmfkhvfr.supabase.co` の認証設定は、公開キーを使った読み取りでHTTP 200を確認しました。
- `generate-dinner-preview` はまだ未配置でHTTP 404でした。既存の `test-gemini` は変更していません。
- `dinner-test.html` には確認済みのテストURLと公開キーを入力済みです。ログイン用パスワードやGeminiキーは含みません。

- 利用者の報告：テスト用SupabaseにGEMINI_API_KEYを登録済み。`test-gemini` から `gemini-3.5-flash-lite` がHTTP 200でJSONを返すことを確認済み。
- 献立サーバーの既定モデルも `gemini-3.5-flash-lite` に変更しました。`GEMINI_MODEL` を設定すれば切り替えられます。
- 本番アプリとは別の `dinner-test.html` と、DBを読み書きしない `generate-dinner-preview` を追加しました。主菜・副菜・汁物の3案、家族3人分の分量、取り分け手順、買い足し食材まで確認できます。
- 本番の `index.html`、既存データ、mainは今回変更していません。既存の `test-gemini` も上書きしません。

## 最短の確認手順（既存DBの準備は不要）

### 1. テスト用サーバーの設定

テスト用SupabaseのSecretsで次を確認してください。Geminiキーは登録済みの値をそのまま使います。

| 名前 | 値 |
| --- | --- |
| GEMINI_API_KEY | 登録済みのテスト用キー |
| GEMINI_MODEL | `gemini-3.5-flash-lite`（省略時も同じモデル） |
| DINNER_TEST_MODE | `true` |
| DINNER_TEST_PROJECT_REF | `cvkaimuqcsoxrmfkhvfr` |
| DINNER_ALLOWED_ORIGINS | ファイルを直接開くなら `null`。ローカルサーバーなら `http://localhost:8000`。両方許可する場合は `null,http://localhost:8000` |

`null` はローカルファイルのOriginです。他のローカル文書も同じOriginになるためテスト限定で使います。どのOriginでも、有効なテスト用アカウントのJWTが必要です。

### 2. 新しい関数を作る

Supabaseの**テスト用プロジェクト** → Edge Functionsで、`generate-dinner-preview` という新しい関数を作成します。

管理画面のエディターを使う場合は、このブランチの `supabase/dashboard/generate-dinner-preview.ts` の全文を貼り付けて配置します。複数ファイルを手動で用意する必要はありません。

関数のゲートウェイ側の旧JWT検証（Verify JWT）を無効にする構成です。これは**テスト用の新関数だけ**に適用してください。関数内部でSupabase Authへ問い合わせ、有効な利用者JWTを必ず検証します。既存の関数や本番の設定は変更しません。

CLIを使う場合のコマンドは次のとおりです。

```sh
supabase functions deploy generate-dinner-preview --project-ref YOUR_TEST_PROJECT_REF --no-verify-jwt
```

`test-gemini` の成功は通信の確認です。この新関数では献立の構造や利用者認証も検証するため、別の確認が必要です。

### 3. テスト用アカウントで開く

1. テスト用SupabaseのAuthenticationで、ログイン可能なテスト専用ユーザーを1つ用意します。すでにあればそのアカウントを使います。本番のパスワードは使いません。
2. 作業フォルダーの **`dinner-test.html`** を開きます。いつもの `index.html` とは別ファイルです。
3. テスト用SupabaseのURL、公開キー（publishable / anon）、テスト用メール・パスワードを入力し、ログインします。
4. 表示済みの架空食材を確認し、「夕飯を3パターン生成する」を押します。

この画面は接続情報を本番へ書き込まず、DBの食材を取得・追加・削除しません。メールとパスワードは指定したテスト用Supabaseのログインだけに使い、Geminiには送りません。認証セッションはこのページのメモリー内だけで扱います。

### 4. 表示された献立を確認する

- 3パターンが表示され、それぞれ主菜・副菜・汁物がある。
- 架空の入力食材を使い、足りない食材と調味料の確認が表示される。
- 材料は大人2人＋子ども1人の合計量で、単位がある。
- 下ごしらえの切り方、火加減、加熱時間、火の通りの確認、取り分け位置が具体的。
- 子どもは十分な加熱後に取り分け、濃い味・辛味はその後に大人へ追加する。
- 大人向けの仕上げも楽しめる内容で、甘め・キノコ・野菜の混ぜ込みの希望を反映している。
- 食材欄を変更すると古い献立が消える。ログアウト後に遅い応答が戻っても表示されない。

調理手順の妥当性は実際の生成内容で確認してください。JSONの形式チェックは安全や栄養を保証するものではありません。在庫量・鮮度は不明であり、数量は利用者の確認が必要です。

## エラーが出た場合

- **401**：テスト用アカウントでログインし直します。公開キーだけでは生成できません。
- **403／画面から利用できない**：DINNER_ALLOWED_ORIGINSを確認します。
- **403／指定したテスト環境のみ**：DINNER_TEST_MODEとDINNER_TEST_PROJECT_REFを確認します。
- **404／接続エラー**：関数名が `generate-dinner-preview` で、テスト用プロジェクトに配置済みか確認します。
- **429**：1分以上あけます。Google側の利用枠も確認します。
- **502／献立形式**：3案の構造が不完全等で表示を止めています。再生成しても続く場合は、その画面のメッセージを共有してください。キーやJWTは共有しません。

## 登録済みの冷蔵庫を使う確認はその次

実生成の内容が確認できた後、テストプロジェクトに既存アプリと同じ認証・共有・DB構造を準備し、通常の `generate-dinner` を確認します。こちらは利用者の共有権限で登録食材を読み取り、クライアントから渡した食材一覧は受け付けません。

プレビューの食材は保存されません。本番の冷蔵庫をテストに流用せず、テスト用食材で確認します。本番反映は利用者の確認後に別途行います。

## 開発者向け

`node scripts/build-dinner-preview.mjs` で専用画面と管理画面用の単一ファイルを再生成します。元は `tests/dinner-preview.template.html` と既存画面の献立表示処理、サーバーのモジュールです。生成物は直接編集しません。

```sh
node --test meal-suggestions.test.mjs tests/generate-dinner.test.mjs tests/dinner-ui.test.mjs tests/preview-page.test.mjs
```

Geminiモデルと構造化JSONの参考：[Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)、[generateContent API](https://ai.google.dev/api/generate-content)。
