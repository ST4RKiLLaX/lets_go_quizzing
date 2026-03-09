export const QUIZ_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['meta', 'rounds'],
  properties: {
    meta: {
      type: 'object',
      description: 'Quiz metadata (title, author, timer)',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Quiz title' },
        author: { type: 'string', description: 'Author name' },
        default_timer: {
          type: 'integer',
          minimum: 0,
          description: 'Default timer (in seconds). Leave blank for no timer.',
        },
        fuzzy_threshold: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Typo tolerance 0-1 for fill-in answers (e.g. 0.8). Leave blank for no tolerance.',
        },
        scoring_mode: {
          type: 'string',
          enum: ['standard', 'ranked'],
          description: 'standard = 1 point per correct answer. ranked = first correct gets max points, last gets min.',
        },
        option_label_style: {
          type: 'string',
          enum: ['letters', 'numbers'],
          description: 'How choice options are shown to players: letters (A, B, C) or numbers (1, 2, 3).',
        },
        ranked_max_points: {
          type: 'integer',
          minimum: 0,
          description: 'Points for 1st correct answer when scoring_mode is ranked. Default 100.',
        },
        ranked_min_points: {
          type: 'integer',
          minimum: 0,
          description: 'Points for last correct answer when scoring_mode is ranked. Default 10.',
        },
      },
    },
    rounds: {
      type: 'array',
      description: 'List of rounds, each with a name and questions',
      items: {
        type: 'object',
        description: 'A round with a name and list of questions',
        required: ['name', 'questions'],
        properties: {
          name: { type: 'string', description: 'Round name (e.g. Round 1, Geography, Television). Leave blank for no name.' },
          questions: {
            type: 'array',
            description: 'List of questions in this round',
            items: {
              type: 'object',
              description: 'A question: choice, true_false, poll, or input',
              required: ['id', 'type', 'text'],
              properties: {
                id: { type: 'string', description: 'Unique question ID (e.g. q1, q2)' },
                type: {
                  enum: ['choice', 'true_false', 'poll', 'input'],
                  description: 'choice = multiple choice, true_false = fixed true/false, poll = opinion poll, input = fill in the blank',
                },
                text: { type: 'string', description: 'Question text shown to players' },
                explanation: {
                  type: 'string',
                  description: 'Optional explanation shown after revealing the answer',
                },
                image: {
                  type: 'string',
                  description:
                    'Optional image. File: q1.png (upload via Form view). URL: https://example.com/photo.jpg',
                },
                options: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Answer choices; one per line (required for choice and poll)',
                },
                answer: {
                  description: 'Choice: index of correct option (0-based). True/false: true or false. Input: accepted answers',
                  oneOf: [
                    { type: 'integer', minimum: 0 },
                    { type: 'boolean' },
                    { type: 'array', items: { type: 'string' } },
                  ],
                },
              },
              allOf: [
                {
                  if: { properties: { type: { const: 'choice' } }, required: ['type'] },
                  then: {
                    required: ['options', 'answer'],
                    properties: {
                      answer: { type: 'integer', minimum: 0, description: 'Index of correct option (0-based)' },
                    },
                  },
                },
                {
                  if: { properties: { type: { const: 'true_false' } }, required: ['type'] },
                  then: {
                    required: ['answer'],
                    properties: {
                      answer: { type: 'boolean', description: 'true = True is correct, false = False is correct' },
                    },
                  },
                },
                {
                  if: { properties: { type: { const: 'poll' } }, required: ['type'] },
                  then: {
                    required: ['options'],
                    properties: {
                      options: {
                        type: 'array',
                        minItems: 2,
                        items: { type: 'string' },
                        description: 'Poll options; no correct answer is stored',
                      },
                    },
                  },
                },
                {
                  if: { properties: { type: { const: 'input' } }, required: ['type'] },
                  then: {
                    required: ['answer'],
                    properties: {
                      answer: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Accepted answers; add alternatives for common typos',
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
  },
} as const;
