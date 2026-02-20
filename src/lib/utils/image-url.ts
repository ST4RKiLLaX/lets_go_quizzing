export function getQuestionImageSrc(
  image: string | undefined,
  quizFilename: string | undefined
): string | undefined {
  if (!image) return undefined;
  if (image.startsWith('http://') || image.startsWith('https://')) return image;
  if (quizFilename)
    return `/api/quizzes/images/${encodeURIComponent(quizFilename)}/${encodeURIComponent(image)}`;
  return undefined;
}
