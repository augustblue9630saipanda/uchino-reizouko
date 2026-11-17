# うちの暮らし：今後の開発先

今後の開発・利用先は次の1組です。

- コード：GitHub `augustblue9630saipanda/uchino-reizouko` のmain
- 画面：`https://augustblue9630saipanda.github.io/uchino-reizouko/`
- Supabase：`moorgivgwmkbxyjvwuih`（既存の本番）

ログイン、夫婦共有、食材、写真認識、AI献立を同じSupabaseで扱います。テストSupabase `cvkaimuqcsoxrmfkhvfr` は今後の開発対象にしません。

2026年11月17日に献立用関数を本番Supabaseへ配置し、mainから公開アプリへ反映しました。既存Geminiキーをサーバー内で利用し、公開アプリの呼び出し元を接続済みです。未ログインと無効なログインが401で拒否されることを確認しました。実ユーザーの食材からの生成とご夫婦それぞれの画面操作は確認待ちです。具体的な反映手順と調査結果は [本番統合の手順](docs/PRODUCTION-INTEGRATION.md) を参照してください。

通常のコード・画面・DB変更や本番への反映は、毎回確認を挟まず進めます。現在の食材・テストデータは必要なら削除できます。認証情報・個人情報の漏洩、想定外の費用、公開範囲の拡大につながる操作は必要に応じて確認します。Geminiキーはサーバー側だけで管理し、夫婦のアカウントと共有設定を維持します。詳細は [AGENTS.md](AGENTS.md) を参照してください。

## 変更の確認

```sh
node scripts/build-dinner-preview.mjs
node scripts/prepare-production-integration.mjs
node --test meal-suggestions.test.mjs tests/*.test.mjs
```

`dinner-test.html` とテスト環境関連の手順書は以前の開発履歴です。今後の利用・開発の入口は公開アプリです。既存コードを編集する際は、認証・夫婦共有・写真認識・食材保存を維持してください。
