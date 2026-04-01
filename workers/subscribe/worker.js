// Cloudflare Worker: nevrai-subscribe
// Saves subscribers to KV + handles unsubscribe
// Deploy: cd workers/subscribe && npx wrangler deploy
// KV binding: SUBSCRIBERS

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Unsubscribe endpoint
    if (url.pathname === '/unsubscribe') {
      return handleUnsubscribe(url, env);
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    try {
      const { email } = await request.json();

      if (!email || !email.includes('@')) {
        return json({ error: 'Valid email required' }, 400);
      }

      const normalized = email.trim().toLowerCase();

      // Dedup: check if already exists
      const existing = await env.SUBSCRIBERS.get(normalized);
      if (existing) {
        return json({ success: true, message: 'Already subscribed' });
      }

      // Save to KV
      await env.SUBSCRIBERS.put(normalized, JSON.stringify({
        email: normalized,
        subscribed_at: new Date().toISOString(),
        source: 'nevrai.com',
      }));

      return json({ success: true });

    } catch (e) {
      console.error('Worker error:', e);
      return json({ error: 'Server error' }, 500);
    }
  },
};

async function handleUnsubscribe(url, env) {
  const emailB64 = url.searchParams.get('email');
  if (!emailB64) {
    return htmlResponse('Missing email parameter', 400);
  }

  try {
    const email = atob(emailB64).trim().toLowerCase();
    if (!email.includes('@')) {
      return htmlResponse('Invalid email', 400);
    }

    await env.SUBSCRIBERS.delete(email);

    return htmlResponse(`
      <h2>Unsubscribed</h2>
      <p>${escapeHtml(email)} has been removed from the NevrAI mailing list.</p>
    `);
  } catch (e) {
    console.error('Unsubscribe error:', e);
    return htmlResponse('Invalid request', 400);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function htmlResponse(body, status = 200) {
  return new Response(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NevrAI</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:60px auto;padding:0 20px;color:#333;}</style>
</head><body>${body}</body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': 'https://nevrai.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://nevrai.com',
    },
  });
}
