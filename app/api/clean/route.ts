import { NextRequest, NextResponse } from 'next/server';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// --- Safety & thresholds (tune here; see README) ---
const MIN_TEXT_LENGTH = 200;
const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5MB
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 10;
const FETCH_TIMEOUT_MS = 15000;
// SSRF: isBlockedBySSRF() blocks localhost, 127.0.0.1, private IPs, .local
// ---

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

turndown.addRule('strikethrough', {
  filter: (node) => {
    const el = node as { nodeName?: string };
    const name = (el.nodeName ?? '').toUpperCase();
    return name === 'DEL' || name === 'S' || name === 'STRIKE';
  },
  replacement: (content) => `~~${content}~~`,
});

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return 'anonymous';
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_MAX_REQUESTS;
}

function isBlockedBySSRF(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
  if (host === '[::1]' || host === '::1') return true;
  if (host.endsWith('.local')) return true;
  const parts = host.split('.');
  if (parts.length === 4) {
    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function err(
  code: string,
  error: string,
  extra?: { upstreamStatus?: number; contentType?: string; message?: string }
) {
  return { code, error, ...extra };
}

function logError(code: string, host: string, start: number, upstream?: number): void {
  const up = upstream ?? '-';
  const ms = Date.now() - start;
  console.log(`PAGE2MD_ERROR code=${code} upstream=${up} host=${host} ms=${ms}`);
}

function isAbortError(e: unknown): boolean {
  if (e instanceof Error && e.name === 'AbortError') return true;
  return false;
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  let host = '-';

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    logError('INVALID_JSON', host, start);
    return NextResponse.json(err('INVALID_JSON', 'Invalid JSON body'), { status: 400 });
  }

  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!url) {
    logError('MISSING_URL', host, start);
    return NextResponse.json(err('MISSING_URL', 'Missing or empty url'), { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    logError('INVALID_URL', host, start);
    return NextResponse.json(err('INVALID_URL', 'Invalid URL'), { status: 400 });
  }
  host = parsed.hostname;

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    logError('INVALID_PROTOCOL', host, start);
    return NextResponse.json(
      err('INVALID_PROTOCOL', 'Only http and https URLs are allowed'),
      { status: 400 }
    );
  }
  if (isBlockedBySSRF(parsed)) {
    logError('SSRF_BLOCKED', host, start);
    return NextResponse.json(
      err('SSRF_BLOCKED', 'This URL is not allowed for security reasons'),
      { status: 400 }
    );
  }

  const ip = getClientIp(request);
  if (!checkRateLimit(ip)) {
    logError('RATE_LIMITED', host, start);
    return NextResponse.json(
      err('RATE_LIMITED', 'Too many requests. Try again later.'),
      { status: 429 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
  } catch (e: unknown) {
    clearTimeout(timeout);
    if (isAbortError(e)) {
      logError('UPSTREAM_TIMEOUT', host, start);
      return NextResponse.json(
        err('UPSTREAM_TIMEOUT', 'Request timeout'),
        { status: 504 }
      );
    }
    logError('UPSTREAM_FETCH_FAILED', host, start);
    const message = e instanceof Error ? e.message : undefined;
    return NextResponse.json(
      err('UPSTREAM_FETCH_FAILED', 'Failed to fetch the URL', { message }),
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const upstreamStatus = res.status;
    logError('UPSTREAM_ERROR', host, start, upstreamStatus);
    return NextResponse.json(
      err(
        'UPSTREAM_ERROR',
        `Failed to fetch: ${res.status} ${res.statusText}`,
        { upstreamStatus }
      ),
      { status: 502 }
    );
  }

  const contentLength = res.headers.get('content-length');
  if (contentLength) {
    const len = parseInt(contentLength, 10);
    if (!Number.isNaN(len) && len > MAX_HTML_BYTES) {
      logError('CONTENT_TOO_LARGE', host, start);
      return NextResponse.json(
        err('CONTENT_TOO_LARGE', 'Page is too large to process'),
        { status: 413 }
      );
    }
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('text/html')) {
    const contentTypeValue = contentType.split(';')[0].trim() || 'unknown';
    logError('UNSUPPORTED_MEDIA_TYPE', host, start);
    return NextResponse.json(
      err('UNSUPPORTED_MEDIA_TYPE', 'URL did not return HTML (e.g. PDF or image)', {
        contentType: contentTypeValue,
      }),
      { status: 415 }
    );
  }

  try {
    const html = await res.text();
    if (html.length > MAX_HTML_BYTES) {
      logError('CONTENT_TOO_LARGE', host, start);
      return NextResponse.json(
        err('CONTENT_TOO_LARGE', 'Page is too large to process'),
        { status: 413 }
      );
    }
    const finalUrl = res.url;

    const dom = new JSDOM(html, { url: finalUrl });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      logError('PARSE_FAILED', host, start);
      return NextResponse.json(
        err('PARSE_FAILED', 'Could not extract article content'),
        { status: 422 }
      );
    }

    const textLen = (article.textContent ?? '').trim().length;
    if (textLen < MIN_TEXT_LENGTH) {
      logError('CONTENT_TOO_SHORT', host, start);
      return NextResponse.json(
        err('CONTENT_TOO_SHORT', 'Extracted content is too short or empty'),
        { status: 422 }
      );
    }

    const markdown = turndown.turndown(article.content);

    return NextResponse.json({
      title: article.title,
      byline: article.byline ?? undefined,
      excerpt: article.excerpt ?? undefined,
      markdown,
      textContent: article.textContent,
    });
  } catch (_e: unknown) {
    logError('SERVER_ERROR', host, start);
    return NextResponse.json(
      { code: 'SERVER_ERROR', error: 'Server error while cleaning content' },
      { status: 500 }
    );
  }
}
