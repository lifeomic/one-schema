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
            'POST /posts': {
              Name: 'createPost',
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
          'POST /posts': {
            Name: 'createPost',
            Query: {},
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
      name: 'objectPropertiesRequiredByDefault marks all object properties as',
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
            'POST /posts': {
              Name: 'createPost',
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
          'POST /posts': {
            Name: 'createPost',
            Query: {},
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
  test('fails if GET endpoints have a Request schema', () => {
    expect(() =>
      validateSchema({
        Endpoints: {
          'GET /posts': {
            Name: 'something',
            Request: {},
            Response: {},
          },
        },
      }),
    ).toThrowError(
      'Detected a "Request" schema for the "GET /posts" endpoint. GET endpoints should use a "Query" schema instead.',
    );
  });

  test('fails if DELETE endpoints have a Request schema', () => {
    expect(() =>
      validateSchema({
        Endpoints: {
          'DELETE /posts': {
            Name: 'something',
            Request: {},
            Response: {},
          },
        },
      }),
    ).toThrowError(
      'Detected a "Request" schema for the "DELETE /posts" endpoint. DELETE endpoints should use a "Query" schema instead.',
    );
  });

  test('fails if POST endpoints have a Query schema', () => {
    expect(() =>
      validateSchema({
        Endpoints: {
          'POST /posts': {
            Name: 'something',
            Query: {},
            Response: {},
          },
        },
      }),
    ).toThrowError(
      'Detected a "Query" schema for the "POST /posts" endpoint. POST endpoints should use a "Request" schema instead.',
    );
  });

  test('fails if PUT endpoints have a Query schema', () => {
    expect(() =>
      validateSchema({
        Endpoints: {
          'PUT /posts': {
            Name: 'something',
            Query: {},
            Response: {},
          },
        },
      }),
    ).toThrowError(
      'Detected a "Query" schema for the "PUT /posts" endpoint. PUT endpoints should use a "Request" schema instead.',
    );
  });

  test('fails if PATCH endpoints have a Query schema', () => {
    expect(() =>
      validateSchema({
        Endpoints: {
          'PATCH /posts': {
            Name: 'something',
            Query: {},
            Response: {},
          },
        },
      }),
    ).toThrowError(
      'Detected a "Query" schema for the "PATCH /posts" endpoint. PATCH endpoints should use a "Request" schema instead.',
    );
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

  test('checks for string schemas only in Query schemas', () => {
    expect(() =>
      validateSchema({
        Endpoints: {
          'GET /posts': {
            Name: 'something',
            Query: {
              message: { type: 'string' },
              badProperty: { type: 'object' },
            },
            Response: {},
          },
        },
      }),
    ).toThrowError(
      'Detected a non-string "type" for the query parameter "badProperty" in endpoint GET /posts. Query parameter schemas must have a "string" type.',
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

  test('checks for colliding path/query parameters', () => {
    expect(() =>
      validateSchema({
        Endpoints: {
          'GET /posts/:id': {
            Name: 'something',
            Query: {
              id: { type: 'string' },
            },
            Response: {},
          },
        },
      }),
    ).toThrowError(
      'The id parameter was declared as a path parameter and a Query parameter property for GET /posts/:id. Rename either the path parameter or the query parameter to avoid a collision.',
    );
  });
});
