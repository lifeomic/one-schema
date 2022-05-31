import { writeFileSync } from 'fs';
import { dump } from 'js-yaml';
import { tmpNameSync } from 'tmp';
import { OneSchemaDefinition } from '.';
import {
  loadSchemaFromFile,
  SchemaAssumptions,
  validateSchema,
  withAssumptions,
} from './meta-schema';

describe('assumptions', () => {
  const FIXTURES: {
    name: string;
    input: {
      schema: OneSchemaDefinition;
      assumptions: Partial<SchemaAssumptions>;
    };
    expect: OneSchemaDefinition;
  }[] = [
    {
      name: 'noAdditionalPropertiesOnObjects',
      input: {
        assumptions: {
          noAdditionalPropertiesOnObjects: true,
        },
        schema: {
          Resources: {
            Post: {
              type: 'object',
              properties: { message: { type: 'string' } },
            },
          },
          Endpoints: {
            'GET /posts': {
              Name: 'getPosts',
              Request: {
                type: 'object',
                properties: { message: { type: 'string' } },
              },
              Response: {
                $ref: '#/definitions/Post',
              },
            },
          },
        },
      },
      expect: {
        Resources: {
          Post: {
            type: 'object',
            additionalProperties: false,
            properties: { message: { type: 'string' } },
          },
        },
        Endpoints: {
          'GET /posts': {
            Name: 'getPosts',
            Request: {
              type: 'object',
              additionalProperties: false,
              properties: { message: { type: 'string' } },
            },
            Response: {
              $ref: '#/definitions/Post',
            },
          },
        },
      },
    },
    {
      name: 'objectPropertiesRequiredByDefault',
      input: {
        assumptions: {
          objectPropertiesRequiredByDefault: true,
        },
        schema: {
          Resources: {
            Post: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                message: { type: 'string' },
                title: { type: 'string', optional: true },
              },
            },
          },
          Endpoints: {
            'GET /posts': {
              Name: 'getPosts',
              Request: {
                type: 'object',
                properties: { message: { type: 'string' } },
              },
              Response: {
                $ref: '#/definitions/Post',
              },
            },
          },
        },
      },
      expect: {
        Resources: {
          Post: {
            type: 'object',
            required: ['id', 'message'],
            properties: {
              id: { type: 'string' },
              message: { type: 'string' },
              title: { type: 'string', optional: true },
            },
          },
        },
        Endpoints: {
          'GET /posts': {
            Name: 'getPosts',
            Request: {
              type: 'object',
              required: ['message'],
              properties: { message: { type: 'string' } },
            },
            Response: {
              $ref: '#/definitions/Post',
            },
          },
        },
      },
    },
  ];

  const NO_ASSUMPTIONS: SchemaAssumptions = {
    noAdditionalPropertiesOnObjects: false,
    objectPropertiesRequiredByDefault: false,
  };

  FIXTURES.forEach(
    ({ name, input: { schema, assumptions }, expect: expectedOutput }) => {
      test(`${name}`, () => {
        // Test withAssumptions
        expect(
          withAssumptions(schema, { ...NO_ASSUMPTIONS, ...assumptions }),
        ).toStrictEqual(expectedOutput);

        // Test loadSchemaFromFile
        const filename = tmpNameSync();
        writeFileSync(filename, dump(schema), { encoding: 'utf-8' });

        expect(
          loadSchemaFromFile(filename, {
            ...NO_ASSUMPTIONS,
            ...assumptions,
          }),
        ).toStrictEqual(expectedOutput);
        expect(loadSchemaFromFile(filename, NO_ASSUMPTIONS)).toStrictEqual(
          schema,
        );
      });
    },
  );
});

describe('loadSchemaFromFile', () => {
  test('validates the schema matches the meta-schema', () => {
    const filename = tmpNameSync();
    writeFileSync(filename, dump({ message: 'bogus data' }), {
      encoding: 'utf-8',
    });

    expect(() => loadSchemaFromFile(filename)).toThrow(
      'Detected invalid schema:',
    );
  });
});

describe('validateSchema', () => {
  test('allows undefined Request schemas', () => {
    expect(() =>
      validateSchema({
        Endpoints: {
          'POST /posts': {
            Name: 'something',
            Response: {},
          },
        },
      }),
    ).not.toThrow();
  });

  test('checks for object types in Request schemas', () => {
    expect(() =>
      validateSchema({
        Endpoints: {
          'POST posts': {
            Name: 'something',
            Request: { type: 'array' },
            Response: {},
          },
        },
      }),
    ).toThrowError(
      'Detected a non-object Request schema for POST posts. Request schemas must be objects.',
    );
  });

  test('checks for colliding path/request parameters', () => {
    expect(() =>
      validateSchema({
        Endpoints: {
          'PUT posts/:id': {
            Name: 'something',
            Request: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                message: { type: 'string' },
              },
            },
            Response: {},
          },
        },
      }),
    ).toThrowError(
      'The id parameter was declared as a path parameter and a Request property for PUT posts/:id. Rename either the path parameter or the request property to avoid a collision.',
    );
  });
});
