// curseforge api proxy (cloudflare worker)
// kurulum: yeni worker ac, bu kodu yapistir, env'e CF_API_KEY ekle,
// launcher ayarlarina worker url'sini yaz
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, User-Agent',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const apiKey = env.CF_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: "CF_API_KEY is missing. Please add it to your Cloudflare Worker Environment Variables."
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const targetUrl = new URL(url.pathname + url.search, 'https://api.curseforge.com');

    const newHeaders = new Headers(request.headers);
    newHeaders.set('x-api-key', apiKey);
    newHeaders.set('Host', targetUrl.hostname);

    newHeaders.delete('Origin');
    newHeaders.delete('Referer');

    const init = {
      method: request.method,
      headers: newHeaders,
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }

    try {
      const response = await fetch(targetUrl.toString(), init);

      const newResponse = new Response(response.body, response);
      for (const [key, value] of Object.entries(corsHeaders)) {
        newResponse.headers.set(key, value);
      }

      return newResponse;
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
