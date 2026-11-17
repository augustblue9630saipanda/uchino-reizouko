# うちの暮らし：今後の開発先

今後の開発・利用先は次の1組です。

- コード：GitHub `augustblue9630saipanda/uchino-reizouko` のmain
- 画面：`https://augustblue9630saipanda.github.io/uchino-reizouko/`
- Supabase：`moorgivgwmkbxyjvwuih`（既存の本番）

ログイン、夫婦共有、食材、写真認識、AI献立を同じSupabaseで扱います。テストSupabase `cvkaimuqcsoxrmfkhvfr` は今後の開発対象にしません。

今回の一本化はまだ確認待ちです。具体的な反映手順と調査結果は [本番統合の手順](docs/PRODUCTION-INTEGRATION.md) を参照してください。

今後もデータ削除や大きな公開変更は、実行前に対象・影響を説明して確認します。Geminiキーはサーバー側だけで管理します。夫婦のアカウントや共有設定を作り直す必要はありません。

## 変更の確認

```sh
node scripts/build-dinner-preview.mjs
node scripts/prepare-production-integration.mjs
node --test meal-suggestions.test.mjs tests/*.test.mjs
```

`dinner-test.html` とテスト環境関連の手順書は以前の開発履歴です。今後の利用・開発の入口は公開アプリです。既存コードを編集する際は、認証・夫婦共有・写真認識・食材保存を維持してください。
