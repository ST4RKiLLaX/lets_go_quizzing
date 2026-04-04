/**
 * Emoji palette for player avatar selection.
 *
 * Ownership pattern A (leaf import): EmojiCategoryPicker, PlayerJoinForm,
 * PlayerLobbyForm, and PlayerSettingsModal each import EMOJI_CATEGORIES
 * directly. The play-page route imports EMOJI_OPTIONS (flat) only for the
 * firstAvailable lookup; it does NOT pass the list down as a prop.
 */

export interface EmojiCategory {
  id: string;
  label: string;
  emojis: string[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'faces',
    label: 'Faces',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
      '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
      '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
      '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
      '😌', '😔', '😪', '🤤', '😴', '😎', '🤓', '🥳', '😈', '🤡',
      '👻', '💀', '😤', '😡', '😠',
    ],
  },
  {
    id: 'animals_nature',
    label: 'Animals & Nature',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🦆', '🦅', '🦉',
      '🦇', '🐺', '🐴', '🦄', '🐝', '🦋', '🐌', '🐢', '🐍', '🦎',
      '🦖', '🐙', '🐡', '🐟', '🐬', '🐳', '🦈', '🐊', '🐘', '🦒',
      '🌸', '🌺', '🌻', '🌹', '🌷', '🍀', '🌿', '🌲', '🌴', '🌵',
      '🍄', '🌊', '🌙', '☀️', '⛅',
    ],
  },
  {
    id: 'food_drink',
    label: 'Food & Drink',
    emojis: [
      '🍕', '🍔', '🌭', '🍟', '🌮', '🌯', '🫔', '🧆', '🥚', '🍳',
      '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🍣', '🍱', '🍜', '🍝',
      '🍛', '🍲', '🥘', '🫕', '🍦', '🍧', '🍨', '🍩', '🎂', '🍰',
      '🧁', '🍪', '🍫', '🍬', '🍭', '🍡', '🍿', '🥜', '🍯', '☕',
      '🍵', '🧋', '🥤', '🧃', '🍺', '🍷', '🍎', '🍋', '🍉', '🍇',
      '🍓', '🍒', '🍍', '🥑', '🥨',
    ],
  },
  {
    id: 'sports_games',
    label: 'Sports & Games',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱',
      '🏓', '🏸', '🏒', '🏑', '🏏', '🥍', '🏹', '🥊', '🥋', '⛳',
      '🏌️', '🎿', '🛷', '🏂', '🤸', '🏊', '🚴', '🏋️', '🤼', '🤺',
      '🏇', '🏆', '🥇', '🥈', '🥉', '🎯', '🎮', '🕹️', '🧩', '♟️',
      '🎲', '🃏', '🎴', '🀄', '🎳', '🏅', '🎽', '🥅', '🎣', '🤿',
      '🛹', '🛼', '⛸️', '🚵', '🧗',
    ],
  },
  {
    id: 'celebration',
    label: 'Celebration',
    emojis: [
      '🎉', '🎊', '🎈', '🎁', '🎀', '🥂', '🍾', '🎆', '🎇', '✨',
      '💫', '⭐', '🌟', '💥', '🔥', '🚀', '💯', '🎖️', '🎗️', '🎟️',
      '💪', '👊', '🤜', '🤛', '🙌', '👐', '🤲', '🙏', '🫶', '👑',
      '💎', '🌈', '⚡', '🌠', '📣', '📢', '🔔', '🥁', '🕺', '💃',
      '🎭', '🎪', '🎠', '🎡', '🎢', '🎩', '🪅', '🎋', '🎍', '🎎',
      '🎐', '🎑', '🧨', '🎏', '🎃',
    ],
  },
  {
    id: 'hobbies',
    label: 'Hobbies & Arts',
    emojis: [
      '📚', '📖', '📝', '✏️', '🖊️', '🖌️', '🎨', '🖼️', '🧵', '🧶',
      '🎬', '🎥', '📷', '📸', '🔭', '🔬', '🧪', '🧫', '🧬', '💻',
      '🎓', '📐', '📏', '🗺️', '🧭', '🪄', '🎸', '🎺', '🎷', '🎻',
      '🎤', '🎙️', '🎧', '📻', '🎵', '🎶', '🧠', '💡', '🔮', '🪩',
      '📜', '📰', '📓', '🗒️', '🪡', '🧸', '🪆', '🪀', '🪁', '🏺',
      '🗿', '🔑', '🔐', '📡', '🛸',
    ],
  },
  {
    id: 'symbols',
    label: 'Symbols',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️',
      '☯️', '♾️', '🔱', '⚜️', '♻️', '☢️', '☣️', '🔴', '🟠', '🟡',
      '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '💠', '🔺', '🔻', '🔶',
      '🔷', '🔸', '🔹', '🌀', '💢', '💬', '💭', '💤', '✅', '❌',
      '⭕', '❎', '🌐', '🌍', '🌎',
    ],
  },
];

/**
 * Mirrors server-side emoji normalization from handlers.ts
 * (player:join ~L734, player:register ~L833).
 *
 * Exported so tests can assert post-truncation uniqueness against
 * the same logic as the server, without duplicating the expression.
 * When updating the server's normalization, update this function too.
 */
export function normalizePlayerEmoji(emoji?: string): string {
  return (emoji || '👤').slice(0, 4);
}

/** Flat list preserving category order — use for firstAvailable lookups. */
export const EMOJI_OPTIONS: string[] = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
