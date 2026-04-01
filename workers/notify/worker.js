// Cloudflare Worker: nevrai-notify
// Reads subscribers from KV, sends emails via Resend API
// Deploy: cd workers/notify && npx wrangler deploy
// Secrets: npx wrangler secret put RESEND_API_KEY
//
// Usage:
//   POST / with Bearer token auth
//   Body: { "subject": "...", "preview": "...", "url": "..." }

const UNSUB_BASE = 'https://nevrai-subscribe.aicpo-relay.workers.dev/unsubscribe';
const FROM_EMAIL = 'Nevr <updates@nevrai.com>';
const BATCH_SIZE = 50; // Resend rate limit safety

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    // Bearer token auth
    const auth = request.headers.get('Authorization');
    if (!auth || auth !== `Bearer ${env.NOTIFY_TOKEN}`) {
      return json({ error: 'Unauthorized' }, 401);
    }

    try {
      const { subject, preview, url } = await request.json();

      if (!subject || !url) {
        return json({ error: 'subject and url are required' }, 400);
      }

      if (!env.RESEND_API_KEY || env.RESEND_API_KEY === 're_PLACEHOLDER') {
        // List subscribers count even without Resend key
        const subscribers = await listAllSubscribers(env);
        return json({
          success: false,
          error: 'RESEND_API_KEY not configured',
          subscriber_count: subscribers.length,
        }, 503);
      }

      // Fetch all subscribers from KV
      const subscribers = await listAllSubscribers(env);

      if (!subscribers.length) {
        return json({ success: true, sent: 0, detail: 'No subscribers' });
      }

      let sent = 0;
      let errors = 0;

      for (const sub of subscribers) {
        try {
          const unsubLink = `${UNSUB_BASE}?email=${btoa(sub.email)}`;
          const html = buildEmailHtml(subject, preview || '', url, unsubLink);

          const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to: sub.email,
              subject,
              html,
              headers: {
                'List-Unsubscribe': `<${unsubLink}>`,
              },
            }),
          });

          if (resp.ok) {
            sent++;
          } else {
            errors++;
            const errText = await resp.text();
            console.error(`Resend error for ${sub.email}: ${resp.status} ${errText}`);
          }
        } catch (e) {
          errors++;
          console.error(`Send error for ${sub.email}: ${e.message}`);
        }
      }

      return json({ success: true, sent, errors, total: subscribers.length });

    } catch (e) {
      console.error('Worker error:', e);
      return json({ error: 'Server error', detail: e.message }, 500);
    }
  },
};

async function listAllSubscribers(env) {
  const subscribers = [];
  let cursor = undefined;

  while (true) {
    const opts = { limit: 1000 };
    if (cursor) opts.cursor = cursor;

    const result = await env.SUBSCRIBERS.list(opts);

    for (const key of result.keys) {
      const val = await env.SUBSCRIBERS.get(key.name);
      if (val) {
        try {
          subscribers.push(JSON.parse(val));
        } catch {
          subscribers.push({ email: key.name });
        }
      }
    }

    if (result.list_complete) break;
    cursor = result.cursor;
  }

  return subscribers;
}

function buildEmailHtml(subject, preview, url, unsubLink) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#1a1a1a;line-height:1.6;">
  <div style="display:none;font-size:1px;color:#fff;max-height:0;overflow:hidden;">${escapeHtml(preview)}</div>

  <div style="border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:24px;">
    <strong style="font-size:18px;">NevrAI</strong>
  </div>

  <p style="font-size:16px;margin:0 0 20px;">${escapeHtml(preview)}</p>

  <a href="${escapeHtml(url)}" style="display:inline-block;background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-size:15px;font-weight:500;">
    Check it out &rarr;
  </a>

  <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0 16px;">

  <p style="font-size:12px;color:#888;margin:0;">
    <a href="${escapeHtml(unsubLink)}" style="color:#888;">Unsubscribe</a>
  </p>
</body>
</html>`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
