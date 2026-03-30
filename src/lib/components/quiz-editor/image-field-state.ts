const IMPORTABLE_IMAGE_URL_REGEX = /^https?:\/\//i;
const IMAGE_URL_DRAFT_REGEX = /^(h|ht|htt|http|https|http:|https:|http:\/|https:\/)$/i;

export type ImageFieldChange =
  | { type: 'clear' }
  | { type: 'draft-url'; value: string }
  | { type: 'saved-image'; value: string };

export function getImageFieldDisplayValue(savedImage: string | undefined, draftImportUrl: string): string {
  return draftImportUrl || savedImage || '';
}

export function isImportableImageUrl(value: string): boolean {
  return IMPORTABLE_IMAGE_URL_REGEX.test(value.trim());
}

export function classifyImageFieldInput(value: string): ImageFieldChange {
  const trimmed = value.trim();
  if (!trimmed) {
    return { type: 'clear' };
  }
  if (isImportableImageUrl(trimmed) || IMAGE_URL_DRAFT_REGEX.test(trimmed.toLowerCase())) {
    return { type: 'draft-url', value };
  }
  return { type: 'saved-image', value };
}
