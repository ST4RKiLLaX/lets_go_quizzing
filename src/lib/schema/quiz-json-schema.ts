export const QUIZ_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['meta', 'rounds'],
  properties: {
    meta: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Quiz title' },
        author: { type: 'string', description: 'Author name' },
        default_timer: {
          type: 'integer',
          minimum: 0,
          description: 'Default timer (seconds)',
        },
        fuzzy_threshold: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    rounds: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'questions'],
        properties: {
          name: { type: 'string' },
          questions: {
            type: 'array',
            items: {
              oneOf: [
                {
                  type: 'object',
                  required: ['id', 'type', 'text', 'options', 'answer'],
                  properties: {
                    id: { type: 'string' },
                    type: { const: 'choice' },
                    text: { type: 'string' },
                    image: { type: 'string' },
                    options: { type: 'array', items: { type: 'string' } },
                    answer: { type: 'integer', minimum: 0 },
                  },
                },
                {
                  type: 'object',
                  required: ['id', 'type', 'text', 'answer'],
                  properties: {
                    id: { type: 'string' },
                    type: { const: 'input' },
                    text: { type: 'string' },
                    image: { type: 'string' },
                    answer: { type: 'array', items: { type: 'string' } },
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
