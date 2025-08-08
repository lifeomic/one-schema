import { describe, expect, test } from 'vitest';
import OpenAPIValidator from 'openapi-schema-validator';
import { withAssumptions } from './meta-schema';
import { toOpenAPISpec } from './openapi';
import { OneSchemaDefinition } from './types';

const TEST_SPEC: OneSchemaDefinition = withAssumptions({
  Resources: {
    Post: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        message: { type: 'string' },
      },
    },
  },
  Endpoints: {
    'GET /posts': {
      Name: 'getPosts',
      Description: 'This endpoint has a description',
      Request: {
        type: 'object',
        required: ['sort'],
        properties: {
          sort: {
            enum: ['asc', 'desc'],
          },
          filter: {
            description: 'A filter to apply to posts',
            type: 'string',
            optional: true,
          },
          limit: {
            description: 'page size',
            type: 'integer',
            optional: true,
          },
          updatedAt: {
            description: 'epoch time',
            type: 'number',
            optional: true,
          },
        },
      },
      Response: {
        type: 'array',
        items: {
          $ref: '#/definitions/Post',
        },
      },
    },
    'GET /posts/:id': {
      Name: 'getPostById',
      Request: {},
      Response: {
        $ref: '#/definitions/Post',
      },
    },
    'PUT /posts/:id': {
      Name: 'putPost',
      Request: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
      },
      Response: {
        $ref: '#/definitions/Post',
      },
    },
    'POST /posts': {
      Name: 'createPost',
      Request: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          message: { type: 'string' },
        },
      },
      Response: {
        $ref: '#/definitions/Post',
      },
    },
    'DELETE /posts/:id': {
      Name: 'deletePost',
      Response: {
        $ref: '#/definitions/Post',
      },
    },
  },
});

describe('toOpenAPISpec', () => {
  test('works', () => {
    const result = toOpenAPISpec(TEST_SPEC, {
      info: { title: 'test title', version: '1.2.3' },
    });

    // Ensure result is a valid OpenAPI spec
    const { errors } = new OpenAPIValidator({
      version: '3.0.0',
    }).validate(result);

    expect(errors).toHaveLength(0);

    // Assert on specific response.
    expect(result).toStrictEqual({
      openapi: '3.0.0',
      info: { title: 'test title', version: '1.2.3' },
      components: {
        schemas: {
          Post: {
            additionalProperties: false,
            properties: {
              id: {
                type: 'number',
              },
              message: {
                type: 'string',
              },
            },
            required: ['id', 'message'],
            type: 'object',
          },
        },
      },
      paths: {
        '/posts': {
          get: {
            operationId: 'getPosts',
            description: 'This endpoint has a description',
            parameters: [
              {
                in: 'query',
                name: 'sort',
                required: true,
                schema: { enum: ['asc', 'desc'] },
              },
              {
                in: 'query',
                description: 'A filter to apply to posts',
                name: 'filter',
                required: false,
                schema: {
                  type: 'string',
                  description: 'A filter to apply to posts',
                },
              },
              {
                in: 'query',
                description: 'page size',
                name: 'limit',
                required: false,
                schema: {
                  type: 'integer',
                  description: 'page size',
                },
              },
              {
                in: 'query',
                description: 'epoch time',
                name: 'updatedAt',
                required: false,
                schema: {
                  type: 'number',
                  description: 'epoch time',
                },
              },
            ],
            responses: {
              '200': {
                description: 'A successful response',
                content: {
                  'application/json': {
                    schema: {
                      items: {
                        $ref: '#/components/schemas/Post',
                      },
                      type: 'array',
                    },
                  },
                },
              },
            },
          },
          post: {
            operationId: 'createPost',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      id: {
                        type: 'string',
                      },
                      message: {
                        type: 'string',
                      },
                    },
                    required: ['id', 'message'],
                    type: 'object',
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'A successful response',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/Post',
                    },
                  },
                },
              },
            },
          },
        },
        '/posts/{id}': {
          delete: {
            operationId: 'deletePost',
            parameters: [
              {
                in: 'path',
                name: 'id',
                required: true,
                schema: {
                  type: 'string',
                },
              },
            ],
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/Post',
                    },
                  },
                },
                description: 'A successful response',
              },
            },
          },
          get: {
            operationId: 'getPostById',
            parameters: [
              {
                in: 'path',
                name: 'id',
                required: true,
                schema: {
                  type: 'string',
                },
              },
            ],
            responses: {
              '200': {
                description: 'A successful response',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/Post',
                    },
                  },
                },
              },
            },
          },
          put: {
            operationId: 'putPost',
            parameters: [
              {
                in: 'path',
                name: 'id',
                required: true,
                schema: {
                  type: 'string',
                },
              },
            ],
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      message: {
                        type: 'string',
                      },
                    },
                    required: ['message'],
                    type: 'object',
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'A successful response',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/Post',
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  });
  test("handles spec with 'allOf' query parameters", () => {
    const spec: OneSchemaDefinition = withAssumptions(
      {
        Resources: {
          Post: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              message: { type: 'string' },
            },
          },
        },
        Endpoints: {
          'GET /posts/:id': {
            Name: 'getPostByIdWithParams',
            Request: {
              allOf: [
                {
                  type: 'object',
                  properties: {
                    project: {
                      type: 'string',
                    },
                  },
                  required: ['project'],
                },
                {
                  type: 'object',
                  properties: {
                    count: {
                      type: 'string',
                    },
                  },
                },
                {
                  type: 'string', // handles a code coverage for a non-object allOf entry
                },
              ],
            },
            Response: {
              $ref: '#/definitions/Post',
            },
          },
        },
      },
      {
        objectPropertiesRequiredByDefault: false,
        noAdditionalPropertiesOnObjects: true,
      },
    );
    const result = toOpenAPISpec(spec, {
      info: { title: 'test title', version: '1.2.3' },
    });

    // Ensure result is a valid OpenAPI spec
    const { errors } = new OpenAPIValidator({
      version: '3.0.0',
    }).validate(result);

    expect(errors).toHaveLength(0);

    expect(result).toStrictEqual({
      openapi: '3.0.0',
      info: {
        title: 'test title',
        version: '1.2.3',
      },
      components: {
        schemas: {
          Post: {
            additionalProperties: false,
            properties: {
              id: {
                type: 'number',
              },
              message: {
                type: 'string',
              },
            },
            type: 'object',
          },
        },
      },
      paths: {
        '/posts/{id}': {
          get: {
            operationId: 'getPostByIdWithParams',
            parameters: [
              {
                in: 'path',
                name: 'id',
                required: true,
                schema: {
                  type: 'string',
                },
              },
              {
                in: 'query',
                name: 'project',
                required: true,
                schema: {
                  type: 'string',
                },
              },
              {
                in: 'query',
                name: 'count',
                required: false,
                schema: {
                  type: 'string',
                },
              },
            ],
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/Post',
                    },
                  },
                },
                description: 'A successful response',
              },
            },
          },
        },
      },
    });
  });
});
