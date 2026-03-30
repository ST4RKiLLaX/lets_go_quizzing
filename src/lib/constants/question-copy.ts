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

/** Short player hints shown above answer controls */
export const PLAYER_QUESTION_HINTS: Record<string, string> = {
  choice: 'Pick one answer. Submits immediately.',
  true_false: 'Pick True or False. Submits immediately.',
  poll: 'Pick one option. Vote submits immediately.',
  multi_select: 'Pick all correct options, then press Submit.',
  reorder: 'Put the items in order, then press Submit.',
  matching: 'Match each item, then press Submit.',
  hotspot: 'Tap the image, then press Submit.',
  slider: 'Move the slider, then press Submit.',
  input: 'Type your answer, then press Submit.',
  open_ended: 'Write your response, then press Submit.',
  word_cloud: 'Enter a short response, then press Submit.',
};

/** Short host hints describing player interaction */
export const HOST_QUESTION_HINTS: Record<string, string> = {
  choice: 'Players pick one answer. Submits immediately.',
  true_false: 'Players pick True or False. Submits immediately.',
  poll: 'Players pick one option. Votes submit immediately.',
  multi_select: 'Players pick multiple options, then press Submit.',
  reorder: 'Players arrange the items in order, then press Submit.',
  matching: 'Players match each item, then press Submit.',
  hotspot: 'Players tap the image, then press Submit.',
  slider: 'Players move the slider, then press Submit.',
  input: 'Players type an answer, then press Submit.',
  open_ended: 'Players write a response, then press Submit.',
  word_cloud: 'Players enter a short response, then press Submit.',
};

/** Backward-compatible alias for host preview copy */
export const QUESTION_MECHANIC_REMINDER = HOST_QUESTION_HINTS;
