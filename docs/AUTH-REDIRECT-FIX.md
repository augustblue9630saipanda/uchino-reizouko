# メール認証の戻り先（2026年11月18日）

本番URL：`https://augustblue9630saipanda.github.io/uchino-reizouko/`

## 問題と修正

新規登録時の `signUp` に `emailRedirectTo` がありませんでした。また、実アカウントを使わない無効な確認リンクでの検証では、既定・本番URL指定のどちらも `http://localhost:3000/` に転送されました。本番URLが有効な戻り先として扱われていない状態です。

アプリでは以下を修正しました。

- 新規登録で `options.emailRedirectTo` に本番URLを明示。
- 「確認メールを再送」を追加。既存の未確認アカウントへ、同じ本番URLを指定して再送できます。パスワードは不要です。
- 再送後は最新メールを開く案内を表示し、1分間の連打を抑制。
- 期限切れ・使用済みリンクで本番へ戻った場合は、ログインまたは再送の案内を表示。トークンは画面に表示しません。
- 既存のログイン・世帯共有・アカウント・登録データは変更していません。

## Supabaseの必要な設定

[本番のAuthentication → URL Configuration](https://supabase.com/dashboard/project/moorgivgwmkbxyjvwuih/auth/url-configuration) で以下を設定します。

| 設定 | 値 |
| --- | --- |
| Site URL | `https://augustblue9630saipanda.github.io/uchino-reizouko/` |
| Redirect URLs | 同じURLを追加（末尾の `/` を含む） |

本番のサブパスまで含めます。`https://augustblue9630saipanda.github.io/` だけや、存在しない `/auth/callback` にはしません。メール認証を無効にする必要はありません。メールテンプレートを独自に変更している場合は、リンクにlocalhostが直書きされていないか確認し、Supabaseの `{{ .ConfirmationURL }}` を利用します。

管理画面の自動操作はWindows側のブラウザURL確認で停止したため、利用者が上記2項目を保存しました。その後の再検証で、既定の戻り先・本番URLを明示した戻り先の両方が本番URLになることを確認済みです。

## すでに登録を試みたアカウント

1. まず本番アプリを開き、登録したメールとパスワードでログインします。古いリンクを押した時点でメール確認自体は済んでいて、戻り先だけが失敗した場合もあります。
2. 「メール未確認」でログインできない場合、本番アプリのメール欄に登録済みのアドレスを入力し、「確認メールを再送」を押します。新規登録し直す必要はありません。
3. いちばん新しいメールのリンクを開きます。古いメールの転送先は、新しい設定に自動で書き換わるとは限りません。
4. 本番へ戻った後、必要なら同じアカウントでログインします。
5. 夫の設定画面で招待コードを発行し、妻の設定画面から同じ世帯へ参加します。メール認証と世帯への招待は別の手順です。

## 検証

`node --check app.js` と `node --test tests/*.test.mjs` は25件成功。新規登録・再送の本番URL固定、パスワードなしでの再送、期限切れ案内、再送エラー時の復帰を確認しました。

`node scripts/check-auth-redirects.mjs` は実アカウントやメールを使わず、意図的に無効な確認リンクのLocationだけを検証します。修正前はどちらもlocalhostでした。利用者による設定保存後、両方が303で本番URLへ戻り、`productionMatch: true` になりました。検証の `otp_expired` は無効なテスト用リンクを使ったための想定どおりの結果で、実アカウントの認証失敗を示すものではありません。実際の確認メールの受信・クリック完了は本人による確認が必要です。

参考：[Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)、[signUp](https://supabase.com/docs/reference/javascript/auth-signup)、[resend](https://supabase.com/docs/reference/javascript/auth-resend)。
