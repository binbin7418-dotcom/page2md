# page2md — Web page to clean Markdown

Paste a URL, get the page's real content back as clean Markdown. No login, no clutter — the article, not the navigation bars.

By [NewKwLab](https://api.newkwlab.com), the makers of [newkwlab-ai-site-check](https://github.com/binbin7418-dotcom/newkwlab-ai-site-check).

## What it does

Input a URL → the server fetches the page → [Readability](https://github.com/mozilla/readability) extracts the main content → [Turndown](https://github.com/mixmark-io/turndown) converts it to Markdown → you copy it with one click. Error details are expandable, and a "copy bug report" button makes feedback easy.

Typical uses: feeding articles into LLM workflows, archiving reading material, migrating blog posts, and cleaning pages before further processing.

## Use the hosted API instead

Don't want to run anything? The same conversion is a hosted API by NewKwLab — **Page2MD**, listed on RapidAPI and api.market, and included in the [NewKwLab API bundle](https://api.newkwlab.com/bundle) (one key, a pool of small tools, credits that never expire). Batch endpoints included: convert a list of URLs in one call.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, paste an article URL, click Clean, copy the Markdown.

## Tech stack

- Next.js 14 (App Router), Tailwind CSS
- Serverless API route: `/api/clean` — POST body `{ "url": "https://..." }`
- @mozilla/readability for content extraction, Turndown for HTML → Markdown
- No login, no payment code — deploys cleanly to Vercel

## Feedback

Trying it on a page that breaks? Open an issue with the failing URL and the technical details the app shows you — that is exactly the feedback that makes the extractor better.

## More from NewKwLab

- [newkwlab-ai-site-check](https://github.com/binbin7418-dotcom/newkwlab-ai-site-check) — is your website visible to AI? A free checker for robots.txt, llms.txt, sitemap and raw-HTML readiness.
- [api.newkwlab.com](https://api.newkwlab.com) — small tools, finished results: APIs for email checks, PDF generation, flight data and more.
