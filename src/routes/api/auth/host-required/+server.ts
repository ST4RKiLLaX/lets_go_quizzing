import { json } from '@sveltejs/kit';
import { requireHostPassword } from '$lib/server/auth.js';

export async function GET() {
  return json({ required: requireHostPassword() });
}
