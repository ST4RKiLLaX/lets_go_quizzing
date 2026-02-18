import { json } from '@sveltejs/kit';
import { createSession, requireHostPassword } from '$lib/server/auth.js';

export async function POST({ request }) {
  if (!requireHostPassword()) {
    return json({ error: 'Authentication not configured' }, { status: 503 });
  }
  try {
    const { password } = await request.json();
    const hostPassword = process.env.HOST_PASSWORD;
    if (!password || password !== hostPassword) {
      return json({ error: 'Invalid password' }, { status: 401 });
    }
    const { cookie } = createSession();
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie,
      },
    });
  } catch {
    return json({ error: 'Invalid request' }, { status: 400 });
  }
}
