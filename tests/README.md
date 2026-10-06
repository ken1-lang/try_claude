# 電卓アプリのテスト

`cases.json` のテスト項目(テスト仕様書の元データ)を Playwright でブラウザ操作して実行し、結果を Excel にまとめます。

| ファイル | 役割 |
|---|---|
| `cases.json` | テスト項目(分類・項目名・操作手順・期待結果)。仕様書の内容を変えるときはここを編集 |
| `run_tests.js` | 各項目を自動実行して `output/results.json` に結果を出力(NG があれば終了コード 1) |
| `build_report.py` | `output/results.json` から `calculator_test_spec.xlsx` を生成(`openpyxl` が必要) |

## 実行方法

```
cd tests
npm install
npx playwright install chromium   # ブラウザ未導入の場合のみ
npm test                          # 自動テストを実行
python3 build_report.py           # ../calculator_test_spec.xlsx を生成
```

- 既定ではリポジトリ直下の `index.html` を `file://` で開いてテストします。別の URL を対象にするときは `TARGET_URL=https://... npm test`。
- 導入済みのブラウザを使うときは `CHROMIUM_PATH=/path/to/chromium npm test`。
- `cases.json` と `run_tests.js` の項目は先頭から同じ順番で対応しています。項目を追加・削除するときは両方を更新してください。
- Edge / Safari / Android / 公開URL の項目は自動化していないため、結果は「未実施」になります。手動で確認し、Excel の「結果」列を更新してください。
