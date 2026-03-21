/** Labels for question type badges (host preview, etc.) */
export const QUESTION_TYPE_LABELS: Record<string, string> = {
  choice: 'Multiple choice',
  true_false: 'True or false',
  poll: 'Opinion poll',
  multi_select: 'Choose multiple',
  reorder: 'Order items',
  matching: 'Matching',
  hotspot: 'Hotspot',
  slider: 'Slider',
  input: 'Fill in the blank',
  open_ended: 'Open ended',
  word_cloud: 'Word cloud',
};

/** Short mechanic hints for host question preview */
export const QUESTION_MECHANIC_REMINDER: Record<string, string> = {
  choice: 'Players pick one option.',
  true_false: 'Players pick True or False.',
  poll: 'Players pick an option (no correct answer).',
  multi_select: 'Players select all correct options.',
  reorder: 'Players drag to reorder.',
  matching: 'Players tap to match items to options.',
  hotspot: 'Players tap a region on the image.',
  slider: 'Players move a slider to the value.',
  input: 'Players type their answer.',
  open_ended: 'Players write a text response.',
  word_cloud: 'Players submit short words.',
};
