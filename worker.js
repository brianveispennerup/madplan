/**
 * Madplan Worker — kører på Cloudflare Workers (gratis niveau).
 * To funktioner i én Worker:
 *
 * 1) CORS-proxy til at hente opskrifter:
 *    GET /?url=https://eksempel.dk/opskrift
 *
 * 2) Midlertidig dataoverførsel (PC -> mobil via QR-kode):
 *    POST /transfer   (body: JSON-data)         -> {"id":"abc123"}
 *    GET  /transfer?id=abc123                    -> det gemte JSON-data
 *    Data slettes automatisk efter 10 minutter. Kræver en KV-database
 *    bundet som "TRANSFER_KV" (se README for opsætning).
 *
 * To beskyttelseslag (stopper tilfældigt misbrug/bots, ikke en målrettet angriber):
 * a) Kun kald fra din egen app (ALLOWED_ORIGIN) accepteres.
 * b) Opskrift-hentning: kun en godkendt liste af sider (ALLOWED_TARGET_DOMAINS) tillades.
 */

const ALLOWED_ORIGIN = 'https://brianveispennerup.github.io';

const ALLOWED_TARGET_DOMAINS = [
  'webopskrifter.dk',
  'valdemarsro.dk',
  'arla.dk',
  'mummum.dk',
  'emmaolsen.dk',
  'foodiee.dk',
  'meny.dk',
  'vegetariskhverdag.dk',
  // Tilføj flere domæner her efter behov, fx 'eksempel.dk',
];

const TRANSFER_TTL_SECONDS = 600; // 10 minutter
const TRANSFER_MAX_BYTES = 300000; // ~300 KB, rigeligt til en hel ugeplan

function corsHeaders(extra) {
  return { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, ...(extra || {}) };
}

function isAllowedOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  const referer = request.headers.get('Referer') || '';
  return origin.startsWith(ALLOWED_ORIGIN) || referer.startsWith(ALLOWED_ORIGIN);
}

function isAllowedTarget(urlStr) {
  try {
    const host = new URL(urlStr).hostname.replace(/^www\./, '');
    return ALLOWED_TARGET_DOMAINS.some(d => host === d || host.endsWith('.' + d));
  } catch (e) {
    return false;
  }
}

async function handleSync(request, env, url) {
  if (!env.TRANSFER_KV) {
    return new Response('KV-lager ("TRANSFER_KV") er ikke bundet til denne Worker endnu — se README.', {
      status: 500,
      headers: corsHeaders(),
    });
  }
  const code = (url.searchParams.get('code') || '').trim();
  if (!code || code.length < 4) {
    return new Response('Ugyldig eller manglende synkroniseringskode (mindst 4 tegn).', { status: 400, headers: corsHeaders() });
  }
  const kvKey = 'sync:' + code;

  if (request.method === 'PUT' || request.method === 'POST') {
    const body = await request.text();
    if (body.length > TRANSFER_MAX_BYTES) {
      return new Response('Data er for stort.', { status: 413, headers: corsHeaders() });
    }
    await env.TRANSFER_KV.put(kvKey, body); // ingen expirationTtl = permanent, indtil den overskrives igen
    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders({ 'Content-Type': 'application/json' }) });
  }

  if (request.method === 'GET') {
    const data = await env.TRANSFER_KV.get(kvKey);
    if (data === null) {
      return new Response('Ingen data fundet for denne kode endnu.', { status: 404, headers: corsHeaders() });
    }
    return new Response(data, { headers: corsHeaders({ 'Content-Type': 'application/json' }) });
  }

  return new Response('Metode ikke understøttet.', { status: 405, headers: corsHeaders() });
}

async function handleTransfer(request, env, url) {
  if (!env.TRANSFER_KV) {
    return new Response('KV-lager ("TRANSFER_KV") er ikke bundet til denne Worker endnu — se README.', {
      status: 500,
      headers: corsHeaders(),
    });
  }

  if (request.method === 'POST') {
    const body = await request.text();
    if (body.length > TRANSFER_MAX_BYTES) {
      return new Response('Data er for stort til overførsel.', { status: 413, headers: corsHeaders() });
    }
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    await env.TRANSFER_KV.put(id, body, { expirationTtl: TRANSFER_TTL_SECONDS });
    return new Response(JSON.stringify({ id }), {
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }

  if (request.method === 'GET') {
    const id = url.searchParams.get('id');
    if (!id) return new Response('Mangler ?id=', { status: 400, headers: corsHeaders() });
    const data = await env.TRANSFER_KV.get(id);
    if (data === null) {
      return new Response('Ikke fundet — koden er enten forkert eller udløbet (10 min. levetid).', {
        status: 404,
        headers: corsHeaders(),
      });
    }
    return new Response(data, { headers: corsHeaders({ 'Content-Type': 'application/json' }) });
  }

  return new Response('Metode ikke understøttet.', { status: 405, headers: corsHeaders() });
}

async function handleRecipeProxy(request, url) {
  const target = url.searchParams.get('url');
  if (!target) {
    return new Response('Mangler ?url= parameter', { status: 400, headers: corsHeaders() });
  }
  if (!isAllowedTarget(target)) {
    return new Response('Dette domæne er ikke på listen over tilladte opskriftssider.', {
      status: 403,
      headers: corsHeaders(),
    });
  }
  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MadplanRecipeProxy/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: corsHeaders({
        'Content-Type': upstream.headers.get('Content-Type') || 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      }),
    });
  } catch (err) {
    return new Response('Kunne ikke hente siden: ' + err.message, { status: 502, headers: corsHeaders() });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders({
          'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }),
      });
    }

    if (!isAllowedOrigin(request)) {
      return new Response('Ikke tilladt herfra.', { status: 403, headers: corsHeaders() });
    }

    if (url.pathname === '/transfer') {
      return handleTransfer(request, env, url);
    }

    if (url.pathname === '/sync') {
      return handleSync(request, env, url);
    }

    return handleRecipeProxy(request, url);
  },
};
