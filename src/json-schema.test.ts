import { JSONSchema4 } from 'json-schema';
import { transformJSONSchema } from './json-schema';

describe('transformJSONSchema', () => {
  const FIXTURES: {
    name: string;
    transform: (schema: JSONSchema4) => JSONSchema4;
    input: JSONSchema4;
    expect: JSONSchema4;
  }[] = [
    {
      name: 'no-op transform',
      transform: (schema) => schema,
      input: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          profile: { type: 'object' },
          list: { type: 'array' },
        },
      },
      expect: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          profile: { type: 'object' },
          list: { type: 'array' },
        },
      },
    },
    {
      name: 'complete transform',
      transform: (schema) => ({ ...schema, testField: 'test-value' }),
      input: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          profile: { type: 'object' },
          list: { type: 'array', items: { type: 'number' } },
          specialList: {
            type: 'array',
            items: [{ type: 'number' }, { type: 'string' }],
          },
          anyOfTest: {
            anyOf: [{ type: 'string' }, { type: 'number' }],
          },
          oneOfTest: {
            oneOf: [{ type: 'string' }, { type: 'number' }],
          },
          allOfTest: {
            allOf: [{ type: 'string' }, { type: 'number' }],
          },
        },
      },
      expect: {
        testField: 'test-value',
        type: 'object',
        properties: {
          id: { testField: 'test-value', type: 'string' },
          profile: { testField: 'test-value', type: 'object' },
          list: {
            testField: 'test-value',
            type: 'array',
            items: { testField: 'test-value', type: 'number' },
          },
          specialList: {
            testField: 'test-value',
            type: 'array',
            items: [
              { testField: 'test-value', type: 'number' },
              { testField: 'test-value', type: 'string' },
            ],
          },
          anyOfTest: {
            testField: 'test-value',
            anyOf: [
              { testField: 'test-value', type: 'string' },
              { testField: 'test-value', type: 'number' },
            ],
          },
          oneOfTest: {
            testField: 'test-value',
            oneOf: [
              { testField: 'test-value', type: 'string' },
              { testField: 'test-value', type: 'number' },
            ],
          },
          allOfTest: {
            testField: 'test-value',
            allOf: [
              { testField: 'test-value', type: 'string' },
              { testField: 'test-value', type: 'number' },
            ],
          },
        },
      },
    },
  ];

  FIXTURES.forEach(({ name, transform, input, expect: expectedOutput }) => {
    test(`${name}`, () => {
      expect(transformJSONSchema(input, transform)).toStrictEqual(
        expectedOutput,
      );
    });
  });
});
