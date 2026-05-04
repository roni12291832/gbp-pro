export async function onRequest(context) {
  const { request, env } = context;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const GOOGLE_KEY = env.GOOGLE_API_KEY;

  if (!GOOGLE_KEY) {
    return new Response(JSON.stringify({ error: 'GOOGLE_API_KEY not configured in environment variables' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let googleUrl = '';

  try {
    if (action === 'search') {
      const query = url.searchParams.get('query');
      googleUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_KEY}&language=pt-BR`;

    } else if (action === 'details') {
      const place_id = url.searchParams.get('place_id');
      const fields = 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,opening_hours,photos,reviews,types,business_status,price_level,editorial_summary,geometry,url';
      googleUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=${fields}&key=${GOOGLE_KEY}&language=pt-BR`;

    } else if (action === 'nearby') {
      const lat = url.searchParams.get('lat');
      const lng = url.searchParams.get('lng');
      const type = url.searchParams.get('type') || 'establishment';
      const radius = url.searchParams.get('radius') || '2000';
      googleUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${GOOGLE_KEY}&language=pt-BR`;

    } else if (action === 'photo') {
      const ref = url.searchParams.get('ref');
      const maxwidth = url.searchParams.get('maxwidth') || '400';
      googleUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxwidth}&photoreference=${ref}&key=${GOOGLE_KEY}`;
      // Photos redirect, return the image directly
      const photoRes = await fetch(googleUrl);
      const imgBuffer = await photoRes.arrayBuffer();
      return new Response(imgBuffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': photoRes.headers.get('Content-Type') || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
        }
      });

    } else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const res = await fetch(googleUrl);
    const data = await res.json();

    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
