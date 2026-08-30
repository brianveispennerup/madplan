/**
 * Madplan CORS-proxy — kører på Cloudflare Workers (gratis niveau).
 * Henter en side server-til-server og sender den videre med de rette
 * CORS-headers, så madplan-appen kan læse indholdet i browseren.
 *
 * Kald: https://<din-worker>.workers.dev/?url=https://eksempel.dk/opskrift
 *
 * To beskyttelseslag (stopper tilfældigt misbrug/bots, ikke en målrettet angriber):
 * 1) Kun kald fra din egen app (ALLOWED_ORIGIN) accepteres.
 * 2) Kun hentning fra en godkendt liste af opskriftssider (ALLOWED_TARGET_DOMAINS) tillades.
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
  // Tilføj flere domæner her efter behov, fx 'eksempel.dk',
];

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

export default {
  async fetch(request) {
    const { searchParams } = new URL(request.url);
    const target = searchParams.get('url');

    // CORS-preflight (browseren spørger "må jeg?" før selve kaldet)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (!isAllowedOrigin(request)) {
      return new Response('Ikke tilladt herfra.', {
        status: 403,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      });
    }

    if (!target) {
      return new Response('Mangler ?url= parameter', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      });
    }

    if (!isAllowedTarget(target)) {
      return new Response('Dette domæne er ikke på listen over tilladte opskriftssider.', {
        status: 403,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
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
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') || 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Cache-Control': 'no-store',
        },
      });
    } catch (err) {
      return new Response('Kunne ikke hente siden: ' + err.message, {
        status: 502,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      });
    }
  },
};

