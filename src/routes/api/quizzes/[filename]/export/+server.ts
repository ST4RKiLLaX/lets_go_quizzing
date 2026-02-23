import { json } from '@sveltejs/kit';
import { isAuthenticated, requireHostPassword } from '$lib/server/auth.js';
import { isValidQuizFilename } from '$lib/server/storage/parser.js';
import { loadQuizRaw, readQuizYamlRaw } from '$lib/server/storage/quiz-storage.js';
import { buildQuizExportZip } from '$lib/server/storage/quiz-archive.js';

export async function GET({ params, request }) {
  if (!requireHostPassword()) {
    return json({ error: 'Hosting disabled' }, { status: 503 });
  }
  if (!isAuthenticated(request.headers.get('cookie') ?? undefined)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const filename = params.filename;
  if (!filename || !isValidQuizFilename(filename)) {
    return json({ error: 'Invalid filename' }, { status: 400 });
  }

  try {
    const quiz = loadQuizRaw(filename);
    const quizYaml = readQuizYamlRaw(filename);
    const zipBuffer = buildQuizExportZip({ filename, quiz, quizYaml });
    const stem = filename.replace(/\.(yaml|yml)$/i, '');
    const exportName = `${stem}_LGQ.zip`;

    return new Response(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${exportName}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 404 });
  }
}
