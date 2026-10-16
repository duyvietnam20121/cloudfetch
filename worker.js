/**
 * CloudFetch — Cloudflare Worker
 * Deploy with Wrangler: npx wrangler deploy
 * This is a basic public-URL streaming proxy. For a public deployment, add
 * authentication and rate limiting, and review Cloudflare's current limits/terms.
 */
const MAX_URL_LENGTH = 4096;
function cors(origin) {
  // Restrict this to your Pages domain before production deployment.
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, If-Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Disposition, Content-Type',
    'Vary': 'Origin'
  };
}
function isPublicHostname(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === 'metadata.google.internal') return false;
  // Block common literal private, loopback, link-local and reserved IPv4 ranges.
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a=+m[1],b=+m[2],c=+m[3],d=+m[4];
    if ([a,b,c,d].some(x=>x>255)) return false;
    if (a===10 || a===127 || a===0 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&b===168) || (a===100&&b>=64&&b<=127) || a>=224) return false;
  }
  if (h.includes(':')) return false; // IPv6 literals are not accepted in this basic version.
  return true;
}
function safeUrl(raw) {
  if (!raw || raw.length > MAX_URL_LENGTH) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || !isPublicHostname(u.hostname)) return null;
    return u;
  } catch { return null; }
}
function safeFilename(disposition, fallback='download') {
  const star = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  let name = fallback;
  try { if (star) name=decodeURIComponent(star[1]); else if (plain) name=plain[1]; } catch {}
  return name.replace(/[\r\n"\\/]/g,'_').slice(0,180) || 'download';
}
export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
    if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405,headers});
    const incoming = new URL(request.url);
    const target = safeUrl(incoming.searchParams.get('url'));
    if (!target) return new Response('Invalid URL. HTTPS public URLs only.',{status:400,headers});

    // Forward only headers needed for normal downloads and byte-range resume.
    const forward = new Headers();
    for (const h of ['range','if-range','if-none-match','if-modified-since']) {
      const value=request.headers.get(h); if (value) forward.set(h,value);
    }
    let upstream;
    try {
      upstream = await fetch(target.href, {
        method: request.method,
        headers: forward,
        redirect: 'manual'
      });
    } catch {
      return new Response('Could not reach the source server.',{status:502,headers});
    }
    // Validate redirects instead of blindly forwarding them.
    if ([301,302,303,307,308].includes(upstream.status)) {
      const loc=upstream.headers.get('Location');
      if (!loc) return new Response('Source returned an invalid redirect.',{status:502,headers});
      const next=safeUrl(new URL(loc,target).href);
      if (!next) return new Response('Source redirected to a URL that is not allowed.',{status:403,headers});
      try {
        upstream=await fetch(next.href,{method:request.method,headers:forward,redirect:'manual'});
      } catch { return new Response('Could not reach the redirected source.',{status:502,headers}); }
      if ([301,302,303,307,308].includes(upstream.status)) return new Response('Too many redirects.',{status:502,headers});
    }
    const out = new Headers(headers);
    for (const h of ['content-type','content-length','content-range','accept-ranges','etag','last-modified','cache-control']) {
      const v=upstream.headers.get(h); if (v) out.set(h,v);
    }
    out.set('Content-Disposition',`attachment; filename="${safeFilename(upstream.headers.get('content-disposition')||'',target.pathname.split('/').pop()||'download')}"`);
    out.set('Cache-Control','no-store');
    return new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers:out});
  }
};
