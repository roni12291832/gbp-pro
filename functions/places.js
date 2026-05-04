/**
 * Cloudflare Pages Function — proxy seguro para Google Places API
 * Arquivo: /functions/places.js
 * Variável de ambiente necessária: GOOGLE_API_KEY
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const endpoint = url.searchParams.get('endpoint'); // textsearch | details | nearbysearch | photo
  const apiKey = env.GOOGLE_API_KEY;

  if (!apiKey) {
    return json({ error: 'GOOGLE_API_KEY não configurada nas variáveis de ambiente do Cloudflare.' }, 500);
  }

  if (!endpoint) {
    return json({ error: 'Parâmetro "endpoint" obrigatório.' }, 400);
  }

  try {
    let googleUrl;
    const base = 'https://maps.googleapis.com/maps/api/place';

    if (endpoint === 'textsearch') {
      const query = url.searchParams.get('query') || '';
      googleUrl = `${base}/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}&language=pt-BR`;

    } else if (endpoint === 'details') {
      const place_id = url.searchParams.get('place_id') || '';
      const fields = 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,opening_hours,photos,reviews,types,business_status,price_level,editorial_summary,geometry,url';
      googleUrl = `${base}/details/json?place_id=${encodeURIComponent(place_id)}&fields=${fields}&key=${apiKey}&language=pt-BR`;

    } else if (endpoint === 'nearbysearch') {
      const lat = url.searchParams.get('lat') || '';
      const lng = url.searchParams.get('lng') || '';
      const type = url.searchParams.get('type') || 'establishment';
      const radius = url.searchParams.get('radius') || '2000';
      googleUrl = `${base}/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${encodeURIComponent(type)}&key=${apiKey}&language=pt-BR`;

    } else if (endpoint === 'photo') {
      const ref = url.searchParams.get('ref') || '';
      const maxwidth = url.searchParams.get('maxwidth') || '400';
      googleUrl = `${base}/photo?maxwidth=${maxwidth}&photoreference=${encodeURIComponent(ref)}&key=${apiKey}`;

      // Photos redirect, return as blob
      const res = await fetch(googleUrl);
      const blob = await res.arrayBuffer();
      return new Response(blob, {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': res.headers.get('Content-Type') || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
        },
      });

    } else {
      return json({ error: `Endpoint desconhecido: ${endpoint}` }, 400);
    }

    const response = await fetch(googleUrl);
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });

  } catch (err) {
    return json({ error: 'Erro interno: ' + err.message }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
