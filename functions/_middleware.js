// Cloudflare Pages Function: serve the résumé in the visitor's language.
//
// Precedence:
//   1. ?lang=zh|en in the URL  (an explicit click on a language link; remembered in a cookie)
//   2. "lang" cookie           (a previous explicit choice)
//   3. Accept-Language header  (the browser's language)
//
// Chinese-preferring browsers get index.html; everyone else is redirected to /en
// (Cloudflare Pages serves en.html at the clean URL /en).

const ZH = 'zh';
const EN = 'en';
const COOKIE = 'lang';
const ONE_YEAR = 60 * 60 * 24 * 365;

function fromQuery(url) {
    const v = url.searchParams.get('lang');
    return v === ZH || v === EN ? v : null;
}

function fromCookie(request) {
    const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)lang=(zh|en)(?:;|$)/);
    return m ? m[1] : null;
}

function fromAcceptLanguage(request) {
    const header = request.headers.get('Accept-Language');
    if (!header) return ZH; // no preference stated: default to the site's native language

    let best = null;
    let bestQ = -1;
    for (const part of header.split(',')) {
        const [tag, ...params] = part.trim().split(';');
        if (!tag) continue;
        const qParam = params.map(p => p.trim()).find(p => p.startsWith('q='));
        const q = qParam ? parseFloat(qParam.slice(2)) : 1;
        if (Number.isNaN(q) || q <= 0) continue;
        const lang = tag.toLowerCase().startsWith('zh') ? ZH : EN; // any non-Chinese language -> English
        if (q > bestQ) {
            bestQ = q;
            best = lang;
        }
    }
    return best || ZH;
}

export async function onRequest({ request, next }) {
    const url = new URL(request.url);
    const path = url.pathname;
    const isHome = path === '/' || path === '/index.html';
    if (!isHome && path !== '/en' && path !== '/en.html') return next();

    const chosen = fromQuery(url);
    const lang = chosen || fromCookie(request) || fromAcceptLanguage(request);

    let response;
    if (isHome && lang === EN) {
        response = Response.redirect(new URL('/en', url), 302);
    } else {
        response = await next();
    }

    // Copy so headers are mutable (Response.redirect and asset responses are immutable).
    response = new Response(response.body, response);
    response.headers.append('Vary', 'Accept-Language, Cookie');
    if (chosen) {
        response.headers.append('Set-Cookie', `${COOKIE}=${chosen}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax`);
    }
    return response;
}
