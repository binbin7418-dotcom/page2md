# Web Content Cleaner

MVP: 輸入 URL → 抓取網頁 → Readability 提取正文 → 轉 Markdown → 一鍵複製。

## 技術棧

- **Next.js 14** (App Router)
- **Serverless API**：`/api/clean`（POST body: `{ "url": "https://..." }`）
- **Readability.js**（@mozilla/readability）+ **Turndown**（HTML → Markdown）
- **Tailwind CSS**
- 無登錄、無 Stripe，部署相容 Vercel

## 本地運行

```bash
cd web-content-cleaner
npm install
npm run dev
```

打開 http://localhost:3000 ，輸入文章 URL 點擊 Clean，結果區可一鍵複製 Markdown。

## 發帖與收反饋（建議今天發）

已有 Demo 按鈕、錯誤可展開、導出方式與「Copy bug report」，足夠讓陌生用戶用起來。把產品鏈接扔進三處，統一訴求：**給我失敗鏈接和 Technical details**。

1. **X**：一條主貼，帶產品鏈接 +「失敗了請把 URL 和 Technical details 發給我」。
2. **Reddit**：一條求反饋帖（如 r/SideProject、r/InternetIsBeautiful），同上訴求。
3. **Indie Hackers**：一條 build in public，同上訴求。

用戶報 bug 時請對方點錯誤區的 **Copy bug report**，貼給你即可快速定位。Vercel Logs 搜 `PAGE2MD_ERROR` 看錯誤分布。

## 部署到 Vercel（上線說明）

1. 將專案推送到 GitHub。
2. 在 [Vercel](https://vercel.com) 導入該倉庫，根目錄選 `web-content-cleaner`（若 monorepo）或專案根目錄。
3. Build Command: `npm run build`，Output: Next.js 默認。
4. 部署後即可使用；API Route 自動作為 Serverless Function。

上線前建議：確認 `route.ts` 頂部常量區（閾值、SSRF）已按需求調整；限流為 best effort，見「限流與防護」。上線後用「上線後的最小埋點」一節跑一週看數據。

## 專案結構

```
web-content-cleaner/
├── app/
│   ├── api/clean/route.ts   # 抓取 + Readability + Turndown
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx             # Hero、輸入框、Demo、結果區、Pricing 占位
├── package.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── tsconfig.json
└── README.md
```

## 安全與閾值（調參集中管理）

所有可調參數在 `app/api/clean/route.ts` 頂部常量區，上線後調參只改該處即可：

| 常量 | 默認值 | 說明 |
|------|--------|------|
| `MIN_TEXT_LENGTH` | 200 | 提取正文少於此字數視為失敗，回 422 |
| `MAX_HTML_BYTES` | 5MB | 超過則拒絕抓取/解析，回 413 |
| `RATE_WINDOW_MS` | 60_000 | 限流窗口（毫秒） |
| `RATE_MAX_REQUESTS` | 10 | 每 IP 每窗口最大請求數 |
| SSRF 攔截 | — | `isBlockedBySSRF()`：localhost、127.0.0.1、私網段（10.x、172.16–31.x、192.168.x）、.local |

## 限流與防護

- **Rate limit**：依 IP 每分鐘約 10 次，用內存 Map 實現，**best effort 僅供 MVP 公開測試**。Serverless 多實例、冷啟動下會漂，不能當成正式防護；要嚴肅防濫用請後續接 KV 或邊緣限流。

## 上線後的最小埋點

先不接複雜 analytics，只關注三類數字：

1. **請求次數**：Vercel Dashboard → 專案 → Logs / Analytics  
2. **成功率**：在 Logs 裡搜 `code`，成功回應無 `code` 或為 2xx；失敗為 4xx/5xx 且 body 含 `code`  
3. **常見錯誤 code 分布**：搜 `UPSTREAM_TIMEOUT`、`RATE_LIMITED`、`PARSE_FAILED` 等，看哪個 code 最多  

可先跑一週，再決定是否在 API 裡把 `code` 打到 console 或接正式埋點。

## API 說明

- **POST /api/clean**
- Body: `{ "url": "https://example.com/article" }`
- 成功: `{ title, byline?, excerpt?, markdown }`
- 錯誤: `{ code, error, ... }` + 4xx/5xx status（如 `UPSTREAM_TIMEOUT`、`CONTENT_TOO_LARGE` 等）
