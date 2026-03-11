import { json } from '@sveltejs/kit';
import { requireHostAuth } from '$lib/server/auth.js';

export async function GET() {
  return json({ required: requireHostAuth() });
}
