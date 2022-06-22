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
import { IntrospectionResponse } from './types';

beforeEach(() => {
  jest.spyOn(console, 'log').mockReturnValue(void 0);
});

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
      name: 'noAdditionalPropertiesOnObjects adds additionalProperties: false to objects',
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
      name: 'objectPropertiesRequiredByDefault marks all object properties as required by default',
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
              title: { type: 'string' },
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

  test('handles introspection responses', () => {
    const introspectionResponse: IntrospectionResponse = {
      serviceVersion: 'mock-service-version',
      schema: {
        Endpoints: {},
      },
    };

    const filename = tmpNameSync();
    writeFileSync(filename, dump(introspectionResponse), {
      encoding: 'utf-8',
    });

    const result = loadSchemaFromFile(filename);

    expect(result).toStrictEqual({
      Endpoints: {},
    });
  });

  test('does not apply assumptions to introspection responses', () => {
    const introspectionResponse: IntrospectionResponse = {
      serviceVersion: 'mock-service-version',
      schema: {
        Endpoints: {
          'GET /posts': {
            Name: 'getPosts',
            Response: {
              type: 'object',
              properties: {
                something: { type: 'string' },
              },
            },
          },
        },
      },
    };

    const filename = tmpNameSync();
    writeFileSync(filename, dump(introspectionResponse), {
      encoding: 'utf-8',
    });

    const result = loadSchemaFromFile(filename, {
      objectPropertiesRequiredByDefault: true,
      noAdditionalPropertiesOnObjects: true,
    });

    expect(result).toStrictEqual({
      Endpoints: {
        'GET /posts': {
          Name: 'getPosts',
          Response: {
            type: 'object',
            properties: {
              something: { type: 'string' },
            },
          },
        },
      },
    });

    expect(console.log).toHaveBeenCalledWith(
      'Detected one-schema introspection response. Skipping applying schema assumptions.',
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

  test('checks for malformed refs', () => {
    expect(() =>
      validateSchema({
        Endpoints: {
          'POST /posts': {
            Name: 'something',
            Request: {
              $ref: 'bogus-ref',
            },
            Response: {},
          },
        },
      }),
    ).toThrowError('Encountered an invalid ref: bogus-ref');
  });

  test('checks for invalid refs', () => {
    expect(() =>
      validateSchema({
        Endpoints: {
          'POST /posts': {
            Name: 'something',
            Request: {
              $ref: '#/definitions/Bogus',
            },
            Response: {},
          },
        },
      }),
    ).toThrowError('Encountered an invalid ref: #/definitions/Bogus');
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

  test('checks for object types in Request schemas through refs', () => {
    expect(() =>
      validateSchema({
        Resources: {
          Post: {
            type: 'array',
          },
        },
        Endpoints: {
          'POST posts': {
            Name: 'something',
            Request: { $ref: '#/definitions/Post' },
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

  test('checks for colliding path/request parameters through refs', () => {
    expect(() =>
      validateSchema({
        Resources: {
          Post: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
        Endpoints: {
          'PUT posts/:id': {
            Name: 'something',
            Request: { $ref: '#/definitions/Post' },
            Response: {},
          },
        },
      }),
    ).toThrowError(
      'The id parameter was declared as a path parameter and a Request property for PUT posts/:id. Rename either the path parameter or the request property to avoid a collision.',
    );
  });
});
