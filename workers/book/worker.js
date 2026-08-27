// Cloudflare Worker: nevrai-book
// Booking API for nevr.aicpo.ru/book
// Deploy: cd workers/book && npx wrangler deploy
// KV binding: BOOKINGS (reuses SUBSCRIBERS KV namespace, prefix "book:")
// Secrets: npx wrangler secret put RESEND_API_KEY

const FROM_EMAIL = 'Роман Неверов <noreply@nevrai.com>';
const NOTIFY_EMAIL = 'roman.neverov@aicpo.ru';

// Slots: Mon-Fri 10:00-19:00, step 15 min
const SLOT_START = 10 * 60; // 10:00 in minutes
const SLOT_END   = 19 * 60; // 19:00
const SLOT_STEP  = 15;

function allSlots() {
  const slots = [];
  for (let m = SLOT_START; m < SLOT_END; m += SLOT_STEP) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

function isWeekday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun, 6=Sat
  return dow >= 1 && dow <= 5;
}

function cors(response) {
  response.headers.set('Access-Control-Allow-Origin', 'https://nevr.aicpo.ru');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}

function json(data, status = 200) {
  return cors(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }));
    }

    // GET /slots?date=YYYY-MM-DD
    if (request.method === 'GET' && url.pathname === '/slots') {
      const date = url.searchParams.get('date');
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return json({ error: 'Invalid date' }, 400);
      }
      if (!isWeekday(date)) {
        return json({ slots: [] });
      }

      // Load booked slots from KV
      const key = `book:${date}`;
      const raw = await env.BOOKINGS.get(key);
      const booked = raw ? JSON.parse(raw) : {};

      const available = allSlots().filter(t => !booked[t]);
      return json({ date, slots: available });
    }

    // POST /book
    if (request.method === 'POST' && url.pathname === '/book') {
      let body;
      try { body = await request.json(); } catch {
        return json({ error: 'Invalid JSON' }, 400);
      }

      const { date, time, name, email, message } = body;

      if (!date || !time || !name || !email) {
        return json({ error: 'date, time, name, email required' }, 400);
      }
      if (!isWeekday(date)) {
        return json({ error: 'Weekdays only' }, 400);
      }
      if (!allSlots().includes(time)) {
        return json({ error: 'Invalid time slot' }, 400);
      }

      // Check availability (atomic-ish with KV)
      const key = `book:${date}`;
      const raw = await env.BOOKINGS.get(key);
      const booked = raw ? JSON.parse(raw) : {};

      if (booked[time]) {
        return json({ error: 'Slot already taken' }, 409);
      }

      // Save booking
      booked[time] = { name, email, message: message || '', booked_at: new Date().toISOString() };
      await env.BOOKINGS.put(key, JSON.stringify(booked), { expirationTtl: 60 * 60 * 24 * 90 });

      // Send email notification
      if (env.RESEND_API_KEY) {
        await sendEmail(env.RESEND_API_KEY, {
          to: NOTIFY_EMAIL,
          subject: `Новая запись: ${name} — ${date} ${time}`,
          html: `
            <h2>Новая запись на консультацию</h2>
            <p><b>Имя:</b> ${escHtml(name)}</p>
            <p><b>Email:</b> ${escHtml(email)}</p>
            <p><b>Дата:</b> ${escHtml(date)}</p>
            <p><b>Время:</b> ${escHtml(time)} МСК</p>
            ${message ? `<p><b>Сообщение:</b> ${escHtml(message)}</p>` : ''}
          `,
        });
      }

      return json({ success: true });
    }

    return json({ error: 'Not found' }, 404);
  },
};

async function sendEmail(apiKey, { to, subject, html }) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
  });
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
