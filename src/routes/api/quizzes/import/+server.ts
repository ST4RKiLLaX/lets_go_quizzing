import { json } from '@sveltejs/kit';
import { isAuthenticated, requireHostPassword } from '$lib/server/auth.js';
import {
  generateFilenameFromTitle,
  resolveUniqueQuizFilename,
  saveQuiz,
} from '$lib/server/storage/quiz-storage.js';
import {
  parseQuizImportZip,
  writeImportedQuizImages,
} from '$lib/server/storage/quiz-archive.js';

export async function POST({ request }) {
  if (!requireHostPassword()) {
    return json({ error: 'Hosting disabled' }, { status: 503 });
  }
  if (!isAuthenticated(request.headers.get('cookie') ?? undefined)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return json({ error: 'No ZIP file provided' }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith('.zip')) {
    return json({ error: 'Only .zip files are supported' }, { status: 400 });
  }

  try {
    const zipBuffer = Buffer.from(await file.arrayBuffer());
    const { quiz, images } = parseQuizImportZip(zipBuffer);
    const desiredFilename = generateFilenameFromTitle(quiz.meta.name);
    const filename = resolveUniqueQuizFilename(desiredFilename);

    saveQuiz(quiz, filename);
    const { importedImages, skippedImages } = writeImportedQuizImages(filename, images);

    return json({
      ok: true,
      filename,
      importedImages,
      skippedImages,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
