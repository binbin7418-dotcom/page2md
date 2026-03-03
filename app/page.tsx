"use client";

import { useState } from "react";

const DEMO_PLACEHOLDER = "Paste any article URL (e.g. blog, news)...";

const EXAMPLE_URLS = [
  { label: "Example.com", url: "https://example.com" },
  { label: "Wikipedia (Web scraping)", url: "https://en.wikipedia.org/wiki/Web_scraping" },
  { label: "MDN (Fetch API)", url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API" },
  { label: "Paul Graham (essay)", url: "https://paulgraham.com/worked.html" },
];

type CleanResult = {
  title: string;
  byline?: string;
  excerpt?: string;
  markdown: string;
  textContent?: string;
};

type ErrorDetails = {
  code?: string;
  error?: string;
  upstreamStatus?: number;
  contentType?: string;
};

function errorToHumanMessage(details: ErrorDetails): string {
  const { code, error, upstreamStatus, contentType } = details;
  switch (code) {
    case "INVALID_JSON":
      return "Request body is not valid JSON.";
    case "MISSING_URL":
      return "Please enter a URL.";
    case "INVALID_URL":
      return "That doesn’t look like a valid URL.";
    case "INVALID_PROTOCOL":
      return "Only http and https URLs are supported.";
    case "SSRF_BLOCKED":
      return "This URL is not allowed for security reasons.";
    case "RATE_LIMITED":
      return "Too many requests. Please wait a minute and try again.";
    case "UPSTREAM_TIMEOUT":
      return "The page took too long to load. Try again or pick another URL.";
    case "UPSTREAM_FETCH_FAILED":
      return "We couldn’t reach that URL. It may be down or blocking requests.";
    case "UPSTREAM_ERROR":
      return upstreamStatus === 403
        ? "That site returned “Forbidden” — it may be blocking automated access."
        : upstreamStatus === 404
          ? "That page was not found (404)."
          : upstreamStatus === 429
            ? "That site is rate-limiting us. Try again later."
            : "The site returned an error. Try another URL.";
    case "CONTENT_TOO_LARGE":
      return "The page is too large to process.";
    case "UNSUPPORTED_MEDIA_TYPE":
      return contentType
        ? `That URL doesn’t return a web page (we got ${contentType}).`
        : "That URL doesn’t return a web page (e.g. it’s a PDF or image).";
    case "PARSE_FAILED":
      return "We couldn’t find a main article on that page.";
    case "CONTENT_TOO_SHORT":
      return "We extracted very little text — the page might be mostly ads or empty.";
    case "FETCH_TIMEOUT":
    case "SERVER_ERROR":
    default:
      return error || "Something went wrong. Please try again.";
  }
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorDetails, setErrorDetails] = useState<ErrorDetails | null>(null);
  const [errorUrl, setErrorUrl] = useState<string | null>(null);
  const [errorExpanded, setErrorExpanded] = useState(false);
  const [result, setResult] = useState<CleanResult | null>(null);
  const [lastRequestedUrl, setLastRequestedUrl] = useState<string | null>(null);
  const [copiedKind, setCopiedKind] = useState<"markdown" | "full" | "bugreport" | null>(null);

  async function doClean(targetUrl: string) {
    setErrorDetails(null);
    setErrorUrl(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/clean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorUrl(targetUrl);
        setErrorDetails({
          code: data.code,
          error: data.error,
          upstreamStatus: data.upstreamStatus,
          contentType: data.contentType,
        });
        setErrorExpanded(false);
        return;
      }
      setLastRequestedUrl(targetUrl);
      setResult({
        title: data.title,
        byline: data.byline,
        excerpt: data.excerpt,
        markdown: data.markdown,
        textContent: data.textContent,
      });
    } catch (err) {
      setErrorUrl(targetUrl);
      setErrorDetails({
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetUrl = url.trim();
    if (!targetUrl) return;
    doClean(targetUrl);
  }

  function handleExampleClick(exampleUrl: string) {
    setUrl(exampleUrl);
    doClean(exampleUrl);
  }

  function copyText(text: string, kind: "markdown" | "full" | "bugreport") {
    const done = () => {
      setCopiedKind(kind);
      setTimeout(() => setCopiedKind(null), 2000);
    };
    navigator.clipboard.writeText(text).then(done).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        done();
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  function handleCopyMarkdown() {
    if (!result?.markdown) return;
    copyText(result.markdown, "markdown");
  }

  function handleCopyFull() {
    if (!result?.markdown || !lastRequestedUrl) return;
    const full = `${result.title}\nSource: ${lastRequestedUrl}\n\n${result.markdown}`;
    copyText(full, "full");
  }

  function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function handleDownloadMd() {
    if (!result?.markdown || !result?.title) return;
    const safe = result.title.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 60);
    downloadFile(result.markdown, `${safe || "article"}.md`, "text/markdown");
  }

  function handleDownloadTxt() {
    const text = result?.textContent ?? result?.markdown ?? "";
    if (!text || !result?.title) return;
    const safe = result.title.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 60);
    downloadFile(text, `${safe || "article"}.txt`, "text/plain");
  }

  function buildBugReport(): string {
    const u = errorUrl ?? url || "(no URL)";
    const human = errorDetails ? errorToHumanMessage(errorDetails) : "";
    const tech = errorDetails ? JSON.stringify(errorDetails, null, 2) : "{}";
    return `URL
${u}

What happened
${human}

What you expected
(describe what you expected)

Technical details (JSON)
${tech}`;
  }

  function handleCopyBugReport() {
    copyText(buildBugReport(), "bugreport");
  }

  const previewLines = 30;
  const markdownPreview = result?.markdown?.split("\n").slice(0, previewLines).join("\n") ?? "";
  const charCount = result?.markdown?.length ?? 0;
  const paragraphCount = (result?.markdown?.split(/\n\s*\n/).filter(Boolean).length ?? 0);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
            Web Content Cleaner
          </h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300 text-lg max-w-xl mx-auto">
            Paste a URL, get clean article content as Markdown. No ads, one click to copy.
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <section className="mb-10">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={DEMO_PLACEHOLDER}
                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-4 py-3 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-sky-600 hover:bg-sky-700 disabled:bg-slate-400 text-white font-medium px-6 py-3 transition"
              >
                {loading ? "Cleaning…" : "Clean"}
              </button>
            </div>
          </form>
        </section>

        <section className="mb-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
            Try an example
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm mb-3">
            Click to fill the URL and run Clean.
          </p>
          <ul className="flex flex-wrap gap-2">
            {EXAMPLE_URLS.map(({ label, url: u }) => (
              <li key={u}>
                <button
                  type="button"
                  onClick={() => handleExampleClick(u)}
                  disabled={loading}
                  className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition disabled:opacity-50"
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
            How it works
          </h2>
          <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-400 text-sm">
            <li>Enter any article URL or pick an example above.</li>
            <li>We fetch the page and extract the main content (Readability).</li>
            <li>Content is converted to Markdown.</li>
            <li>Copy, download .md/.txt, or use the combined copy.</li>
          </ol>
        </section>

        <section className="mb-12">
          {errorDetails && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 mb-4">
              <p>{errorToHumanMessage(errorDetails)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setErrorExpanded((e) => !e)}
                  className="text-sm underline opacity-80 hover:opacity-100"
                >
                  {errorExpanded ? "Hide technical details" : "Technical details"}
                </button>
                <button
                  type="button"
                  onClick={handleCopyBugReport}
                  className="rounded border border-red-300 dark:border-red-700 px-2 py-1 text-sm hover:bg-red-100/50 dark:hover:bg-red-900/30"
                >
                  {copiedKind === "bugreport" ? "Copied!" : "Copy bug report"}
                </button>
              </div>
              {errorExpanded && (
                <pre className="mt-2 text-xs bg-red-100/50 dark:bg-red-900/30 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(errorDetails, null, 2)}
                </pre>
              )}
            </div>
          )}

          {result && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
              <div className="border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                    {result.title}
                  </h3>
                  {result.byline && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                      {result.byline}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyMarkdown}
                    className="rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium px-3 py-2 text-sm transition"
                  >
                    {copiedKind === "markdown" ? "Copied!" : "Copy Markdown"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyFull}
                    className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                  >
                    {copiedKind === "full" ? "Copied!" : "Copy title + source + body"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadMd}
                    className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                  >
                    Download .md
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadTxt}
                    className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                  >
                    Download .txt
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  <p><strong>Characters:</strong> {charCount.toLocaleString()}</p>
                  <p><strong>Paragraphs:</strong> {paragraphCount}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Preview (first {previewLines} lines)
                  </p>
                  <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono bg-white dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-600 max-h-48 overflow-y-auto">
                    {markdownPreview || "—"}
                  </pre>
                </div>
              </div>

              <div className="p-4 max-h-[50vh] overflow-y-auto">
                <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono">
                  {result.markdown}
                </pre>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-8 text-center">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-2">
            Pricing
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Free during beta. If you like it, I&apos;ll add a Pro mode later.
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-700 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Web Content Cleaner · MVP
      </footer>
    </div>
  );
}
