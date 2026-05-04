/**
 * Cloudflare Pages Function — proxy seguro para Claude (Anthropic) API
 * Arquivo: /functions/claude.js
 * Variável de ambiente necessária: CLAUDE_API_KEY
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Método não permitido. Use POST.' }, 405);
  }

  const apiKey = env.CLAUDE_API_KEY;
  if (!apiKey) {
    return json({ error: 'CLAUDE_API_KEY não configurada nas variáveis de ambiente do Cloudflare.' }, 500);
  }

  try {
    const body = await request.json();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: body.model || 'claude-sonnet-4-20250514',
        max_tokens: body.max_tokens || 1000,
        messages: body.messages,
        system: body.system,
      }),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
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
