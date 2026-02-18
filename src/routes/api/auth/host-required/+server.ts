import { json } from '@sveltejs/kit';

export async function GET() {
  return json({ required: !!process.env.HOST_PASSWORD });
}
