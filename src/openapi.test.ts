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
  },
});

describe('toOpenAPISpec', () => {
  test('works', () => {
    const result = toOpenAPISpec(TEST_SPEC, {
      info: { title: 'test title', version: '1.2.3' },
    });

    // Ensure result is a valid OpenAPI spec
    const { errors } = new OpenAPIValidator({
      version: '3.1.0',
    }).validate(result);

    expect(errors).toHaveLength(0);

    // Assert on specific response.
    expect(result).toStrictEqual({
      openapi: '3.1.0',
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
            parameters: [
              {
                in: 'query',
                name: 'sort',
                required: true,
                schema: { type: 'string' },
              },
              {
                in: 'query',
                description: 'A filter to apply to posts',
                name: 'filter',
                required: false,
                schema: { type: 'string' },
              },
            ],
            responses: {
              '200': {
                description: 'TODO',
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
                description: 'TODO',
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
                description: 'TODO',
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
                description: 'TODO',
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
});
