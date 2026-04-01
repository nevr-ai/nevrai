// Cloudflare Worker: nevrai-notify
// Sends update notification emails to all nevrai_subscribers via Loops.so
// Deploy: cd workers/notify && wrangler deploy
// Secrets: wrangler secret put LOOPS_API_KEY
//
// Usage:
//   POST / with Bearer token auth
//   Body: { "subject": "...", "preview": "...", "url": "..." }
//
// TODO: Create a transactional email template in Loops.so dashboard
//       and set the transactionalId below. Alternatively, uses Events API
//       with event "update_published" as a simpler approach.

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

      // Approach 1: Use Loops Events API (simpler, works with automations)
      // This sends an event to ALL contacts in the nevrai_subscribers group
      // Create an automation in Loops dashboard triggered by "update_published" event
      const sent = await sendViaEventsApi(env, { subject, preview, url });

      if (sent.success) {
        return json({ success: true, method: 'events_api', detail: sent.detail });
      }

      // Approach 2 fallback: fetch contacts + send transactional to each
      console.log('Events API failed, trying transactional fallback');
      const result = await sendViaTransactional(env, { subject, preview, url });
      return json(result, result.success ? 200 : 500);

    } catch (e) {
      console.error('Worker error:', e);
      return json({ error: 'Server error', detail: e.message }, 500);
    }
  },
};

// Approach 1: Loops Events API — triggers automation for all matching contacts
async function sendViaEventsApi(env, { subject, preview, url }) {
  // Note: Events API sends to a single contact by email.
  // For broadcast, we need to fetch contacts first, then send event to each.
  // Actually, Loops Events API requires an email — so we still need contact list.
  // Let's go straight to the contact-list approach.

  const contacts = await fetchSubscribers(env);
  if (!contacts.length) {
    return { success: true, detail: 'No subscribers found' };
  }

  let sent = 0;
  let errors = 0;

  for (const contact of contacts) {
    try {
      const resp = await fetch('https://app.loops.so/api/v1/events/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.LOOPS_API_KEY}`,
        },
        body: JSON.stringify({
          email: contact.email,
          eventName: 'update_published',
          eventProperties: {
            subject,
            preview: preview || '',
            url,
            siteName: 'NevrAI',
          },
        }),
      });

      if (resp.ok) {
        sent++;
      } else {
        errors++;
        console.error(`Event send failed for ${contact.email}: ${resp.status}`);
      }
    } catch (e) {
      errors++;
      console.error(`Event send error for ${contact.email}: ${e.message}`);
    }
  }

  return { success: true, detail: `Sent: ${sent}, errors: ${errors}, total: ${contacts.length}` };
}

// Approach 2: Loops Transactional API — requires a transactionalId from dashboard
async function sendViaTransactional(env, { subject, preview, url }) {
  // TODO: Set this after creating template in Loops dashboard
  const TRANSACTIONAL_ID = env.LOOPS_TRANSACTIONAL_ID || '';

  if (!TRANSACTIONAL_ID) {
    return { success: false, error: 'LOOPS_TRANSACTIONAL_ID not configured' };
  }

  const contacts = await fetchSubscribers(env);
  if (!contacts.length) {
    return { success: true, sent: 0, detail: 'No subscribers' };
  }

  let sent = 0;
  let errors = 0;

  for (const contact of contacts) {
    try {
      const resp = await fetch('https://app.loops.so/api/v1/transactional', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.LOOPS_API_KEY}`,
        },
        body: JSON.stringify({
          transactionalId: TRANSACTIONAL_ID,
          email: contact.email,
          dataVariables: {
            subject,
            preview: preview || '',
            url,
            siteName: 'NevrAI',
          },
        }),
      });

      if (resp.ok) {
        sent++;
      } else {
        errors++;
      }
    } catch (e) {
      errors++;
    }
  }

  return { success: true, sent, errors, total: contacts.length };
}

// Fetch all contacts with userGroup = nevrai_subscribers
async function fetchSubscribers(env) {
  try {
    // Loops.so /api/v1/contacts/find endpoint
    const resp = await fetch('https://app.loops.so/api/v1/contacts/find', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.LOOPS_API_KEY}`,
      },
      body: JSON.stringify({
        filter: {
          userGroup: { is: 'nevrai_subscribers' },
        },
      }),
    });

    if (!resp.ok) {
      console.error(`Contacts fetch failed: ${resp.status}`);
      return [];
    }

    return await resp.json();
  } catch (e) {
    console.error('Contacts fetch error:', e.message);
    return [];
  }
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
