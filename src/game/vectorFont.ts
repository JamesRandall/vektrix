// Vector font definitions - 7-segment style digits + geometric letters
// Each character is defined as line segments [x1, y1, x2, y2] in normalized 0-1 space

export type Segment = [number, number, number, number];
export type CharDef = Segment[];

// 7-segment layout:
//  ___
// |   |
//  ---
// |   |
//  ___

const SEG_TOP: Segment = [0.1, 0, 0.9, 0];
const SEG_TOP_LEFT: Segment = [0, 0, 0, 0.45];
const SEG_TOP_RIGHT: Segment = [1, 0, 1, 0.45];
const SEG_MID: Segment = [0.1, 0.5, 0.9, 0.5];
const SEG_BOT_LEFT: Segment = [0, 0.55, 0, 1];
const SEG_BOT_RIGHT: Segment = [1, 0.55, 1, 1];
const SEG_BOT: Segment = [0.1, 1, 0.9, 1];

export const DIGITS: Record<string, CharDef> = {
  '0': [SEG_TOP, SEG_TOP_LEFT, SEG_TOP_RIGHT, SEG_BOT_LEFT, SEG_BOT_RIGHT, SEG_BOT],
  '1': [SEG_TOP_RIGHT, SEG_BOT_RIGHT],
  '2': [SEG_TOP, SEG_TOP_RIGHT, SEG_MID, SEG_BOT_LEFT, SEG_BOT],
  '3': [SEG_TOP, SEG_TOP_RIGHT, SEG_MID, SEG_BOT_RIGHT, SEG_BOT],
  '4': [SEG_TOP_LEFT, SEG_TOP_RIGHT, SEG_MID, SEG_BOT_RIGHT],
  '5': [SEG_TOP, SEG_TOP_LEFT, SEG_MID, SEG_BOT_RIGHT, SEG_BOT],
  '6': [SEG_TOP, SEG_TOP_LEFT, SEG_MID, SEG_BOT_LEFT, SEG_BOT_RIGHT, SEG_BOT],
  '7': [SEG_TOP, SEG_TOP_RIGHT, SEG_BOT_RIGHT],
  '8': [SEG_TOP, SEG_TOP_LEFT, SEG_TOP_RIGHT, SEG_MID, SEG_BOT_LEFT, SEG_BOT_RIGHT, SEG_BOT],
  '9': [SEG_TOP, SEG_TOP_LEFT, SEG_TOP_RIGHT, SEG_MID, SEG_BOT_RIGHT, SEG_BOT],
};

// Geometric letter definitions - clean, consistent strokes
export const LETTERS: Record<string, CharDef> = {
  'A': [[0, 1, 0.5, 0], [0.5, 0, 1, 1], [0.15, 0.65, 0.85, 0.65]],
  'B': [[0, 0, 0, 1], [0, 0, 0.7, 0], [0.7, 0, 1, 0.25], [1, 0.25, 0.7, 0.5], [0.7, 0.5, 0, 0.5], [0.7, 0.5, 1, 0.75], [1, 0.75, 0.7, 1], [0.7, 1, 0, 1]],
  'C': [[1, 0, 0, 0], [0, 0, 0, 1], [0, 1, 1, 1]],
  'D': [[0, 0, 0, 1], [0, 0, 0.6, 0], [0.6, 0, 1, 0.3], [1, 0.3, 1, 0.7], [1, 0.7, 0.6, 1], [0.6, 1, 0, 1]],
  'E': [[0, 0, 1, 0], [0, 0, 0, 1], [0, 1, 1, 1], [0, 0.5, 0.8, 0.5]],
  'F': [[0, 0, 1, 0], [0, 0, 0, 1], [0, 0.5, 0.8, 0.5]],
  'G': [[1, 0, 0, 0], [0, 0, 0, 1], [0, 1, 1, 1], [1, 1, 1, 0.5], [1, 0.5, 0.5, 0.5]],
  'H': [[0, 0, 0, 1], [1, 0, 1, 1], [0, 0.5, 1, 0.5]],
  'I': [[0.2, 0, 0.8, 0], [0.5, 0, 0.5, 1], [0.2, 1, 0.8, 1]],
  'J': [[0.2, 0, 1, 0], [0.7, 0, 0.7, 0.8], [0.7, 0.8, 0.5, 1], [0.5, 1, 0.2, 1], [0.2, 1, 0, 0.8]],
  'K': [[0, 0, 0, 1], [1, 0, 0, 0.5], [0, 0.5, 1, 1]],
  'L': [[0, 0, 0, 1], [0, 1, 1, 1]],
  'M': [[0, 1, 0, 0], [0, 0, 0.5, 0.4], [0.5, 0.4, 1, 0], [1, 0, 1, 1]],
  'N': [[0, 1, 0, 0], [0, 0, 1, 1], [1, 1, 1, 0]],
  'O': [[0.2, 0, 0.8, 0], [0.8, 0, 1, 0.2], [1, 0.2, 1, 0.8], [1, 0.8, 0.8, 1], [0.8, 1, 0.2, 1], [0.2, 1, 0, 0.8], [0, 0.8, 0, 0.2], [0, 0.2, 0.2, 0]],
  'P': [[0, 1, 0, 0], [0, 0, 0.8, 0], [0.8, 0, 1, 0.25], [1, 0.25, 0.8, 0.5], [0.8, 0.5, 0, 0.5]],
  'Q': [[0.2, 0, 0.8, 0], [0.8, 0, 1, 0.2], [1, 0.2, 1, 0.8], [1, 0.8, 0.8, 1], [0.8, 1, 0.2, 1], [0.2, 1, 0, 0.8], [0, 0.8, 0, 0.2], [0, 0.2, 0.2, 0], [0.6, 0.7, 1.1, 1.1]],
  'R': [[0, 1, 0, 0], [0, 0, 0.8, 0], [0.8, 0, 1, 0.25], [1, 0.25, 0.8, 0.5], [0.8, 0.5, 0, 0.5], [0.4, 0.5, 1, 1]],
  'S': [[1, 0, 0.2, 0], [0.2, 0, 0, 0.2], [0, 0.2, 0.2, 0.5], [0.2, 0.5, 0.8, 0.5], [0.8, 0.5, 1, 0.8], [1, 0.8, 0.8, 1], [0.8, 1, 0, 1]],
  'T': [[0, 0, 1, 0], [0.5, 0, 0.5, 1]],
  'U': [[0, 0, 0, 0.8], [0, 0.8, 0.2, 1], [0.2, 1, 0.8, 1], [0.8, 1, 1, 0.8], [1, 0.8, 1, 0]],
  'V': [[0, 0, 0.5, 1], [0.5, 1, 1, 0]],
  'W': [[0, 0, 0.25, 1], [0.25, 1, 0.5, 0.5], [0.5, 0.5, 0.75, 1], [0.75, 1, 1, 0]],
  'X': [[0, 0, 1, 1], [1, 0, 0, 1]],
  'Y': [[0, 0, 0.5, 0.5], [1, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 1]],
  'Z': [[0, 0, 1, 0], [1, 0, 0, 1], [0, 1, 1, 1]],
};

// Special characters
export const SPECIAL: Record<string, CharDef> = {
  ' ': [],
  ':': [[0.4, 0.25, 0.6, 0.25], [0.4, 0.75, 0.6, 0.75]],
  '.': [[0.4, 0.9, 0.6, 0.9]],
  ',': [[0.5, 0.85, 0.4, 1.05]],
  '-': [[0.2, 0.5, 0.8, 0.5]],
  '+': [[0.5, 0.2, 0.5, 0.8], [0.2, 0.5, 0.8, 0.5]],
  '/': [[0.9, 0, 0.1, 1]],
  'x': [[0.2, 0.3, 0.8, 0.7], [0.8, 0.3, 0.2, 0.7]], // small x for multiplier
  '[': [[0.7, 0, 0.3, 0], [0.3, 0, 0.3, 1], [0.3, 1, 0.7, 1]], // left bracket
  ']': [[0.3, 0, 0.7, 0], [0.7, 0, 0.7, 1], [0.7, 1, 0.3, 1]], // right bracket
};

export function getCharDef(char: string): CharDef {
  const upper = char.toUpperCase();
  return DIGITS[char] || LETTERS[upper] || SPECIAL[char] || SPECIAL[' '];
}

// Color palette matching game graphics (HDR values for bloom)
export const COLORS = {
  CYAN: [0, 2.0, 2.0],      // Player/score color
  YELLOW: [2.0, 2.0, 0],    // Multiplier/mines
  WHITE: [1.8, 1.8, 1.8],   // Wave number
  GRAY: [0.6, 0.6, 0.6],    // High score
  MAGENTA: [2.0, 0, 1.5],   // Game over
  GREEN: [0, 2.0, 0],       // Budget display
} as const;
