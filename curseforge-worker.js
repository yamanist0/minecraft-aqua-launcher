/**
 * CurseForge API Proxy - Cloudflare Worker
 * 
 * SETUP INSTRUCTIONS (via Cloudflare Dashboard):
 * 1. Log in to your Cloudflare account and go to the "Workers & Pages" tab.
 * 2. Click on the "Create application" -> "Create Worker" button.
 * 3. Give your Worker a name (e.g., aqua-cf-proxy) and click "Deploy".
 * 4. Once successfully created, click the "Edit code" button.
 * 5. Copy all the code from this file and paste it into the editor there.
 * 6. Save the code by clicking the "Save and deploy" button.
 * 7. Go to your Worker's settings (Settings -> Variables).
 * 8. Click "Add variable" under "Environment Variables".
 * 9. Enter CF_API_KEY as the Variable name.
 * 10. Paste your API key obtained from CurseForge into the Value section. 
 * 11. Save the variables by clicking "Deploy" or "Save".
 * 12. Copy the URL assigned to your Worker (e.g., https://aqua-cf-proxy.yaman.workers.dev).
 * 13. Paste this URL into the "CurseForge API Proxy URL" field in the Aqua Launcher settings!
 */

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
    // make sure the api key is actually set in the environment
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
