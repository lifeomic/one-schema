import axios, { AxiosInstance } from 'axios';
import { Server } from 'http';
import { v4 as uuid } from 'uuid';
import { format } from 'prettier';
import Koa = require('koa');
import Router = require('@koa/router');
import bodyparser = require('koa-bodyparser');
import { NamedClient, OneSchemaRouter, ZodSchema } from './router';
import { z } from 'zod';
import { generateAxiosClient } from './generate-axios-client';
import { OneSchemaCompatRouter, createCompatRouter } from './compat-router';

let server: Server | undefined = undefined;
afterEach(() => {
  server?.close();
});

const setup = <Schema extends ZodSchema>(
  expose: (
    router: OneSchemaRouter<{}, Router>,
  ) => OneSchemaRouter<Schema, any> | OneSchemaCompatRouter<Schema, any>,
): { client: AxiosInstance; typed: NamedClient<Schema> } => {
  const router = expose(
    OneSchemaRouter.create({ using: new Router(), introspection: undefined }),
  );

  const { client } = serve(router);

  return {
    client,
    typed: router.client(client),
  };
};

const serve = (
  router: OneSchemaRouter<any, any> | OneSchemaCompatRouter<any, any>,
): { client: AxiosInstance } => {
  server = new Koa().use(bodyparser()).use(router.middleware()).listen();

  const { port } = server.address() as any;

  const client = axios.create({
    baseURL: `http://localhost:${port}`,
    validateStatus: () => true,
  });

  return { client };
};

test('introspection', async () => {
  const { client } = setup(() =>
    OneSchemaRouter.create({
      using: new Router(),
      introspection: { route: '/private/introspection', serviceVersion: '123' },
    })
      .declare({
        name: 'getSomething',
        route: 'GET /something/:id',
        description: 'it gets something',
        request: z.object({ filter: z.string() }),
        response: z.object({ message: z.string(), id: z.string() }),
      })
      .implement('GET /something/:id', () => ({ id: '', message: '' }))
      .declare({
        name: 'createSomething',
        route: 'POST /something',
        description: 'it creates something',
        request: z.object({ message: z.string() }),
        response: z.object({ message: z.string(), id: z.string() }),
      })
      .implement('POST /something', () => ({ id: '', message: '' })),
  );

  const result = await client.get('/private/introspection');

  expect(result.status).toStrictEqual(200);
  expect(result.data).toStrictEqual({
    serviceVersion: '123',
    schema: {
      Endpoints: {
        'GET /something/:id': {
          Description: 'it gets something',
          Name: 'getSomething',
          Request: {
            $schema: 'http://json-schema.org/draft-07/schema#',
            additionalProperties: false,
            properties: {
              filter: { type: 'string' },
            },
            required: ['filter'],
            type: 'object',
          },
          Response: {
            $schema: 'http://json-schema.org/draft-07/schema#',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['message', 'id'],
            type: 'object',
          },
        },
        'POST /something': {
          Description: 'it creates something',
          Name: 'createSomething',
          Request: {
            $schema: 'http://json-schema.org/draft-07/schema#',
            additionalProperties: false,
            properties: {
              message: { type: 'string' },
            },
            required: ['message'],
            type: 'object',
          },
          Response: {
            $schema: 'http://json-schema.org/draft-07/schema#',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['message', 'id'],
            type: 'object',
          },
        },
      },
    },
  });
});

test('introspection with custom router', async () => {
  const { client } = setup(() =>
    OneSchemaRouter.create({
      using: new Router(),
      introspection: {
        route: '/private/introspection',
        serviceVersion: '123',
        router: new Router({ prefix: '/custom' }),
      },
    })
      .declare({
        name: 'getSomething',
        route: 'GET /something/:id',
        description: 'it gets something',
        request: z.object({ filter: z.string() }),
        response: z.object({ message: z.string(), id: z.string() }),
      })
      .implement('GET /something/:id', () => ({ id: '', message: '' })),
  );

  const wrongIntroRouter = await client.get('/private/introspection');
  expect(wrongIntroRouter.status).toStrictEqual(404);

  const result = await client.get('/custom/private/introspection');

  expect(result.data).toStrictEqual({
    serviceVersion: '123',
    schema: {
      Endpoints: {
        'GET /something/:id': {
          Description: 'it gets something',
          Name: 'getSomething',
          Request: {
            $schema: 'http://json-schema.org/draft-07/schema#',
            additionalProperties: false,
            properties: {
              filter: { type: 'string' },
            },
            required: ['filter'],
            type: 'object',
          },
          Response: {
            $schema: 'http://json-schema.org/draft-07/schema#',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['message', 'id'],
            type: 'object',
          },
        },
      },
    },
  });
});

describe('type inference', () => {
  test('type inference for implementation return type', () => {
    setup((router) =>
      router
        .declare({
          name: 'getItem',
          route: 'GET /items/:id',
          request: z.object({ message: z.string() }),
          response: z.object({
            id: z.string(),
            message: z.string(),
          }),
        })
        .implement(
          'GET /items/:id',
          // This should not compile, since we're returning an object that does not match the schema.
          // @ts-expect-error
          () => ({ bogus: 'data' }),
        ),
    );
  });

  test('type inference for POST body + params', () => {
    setup((router) =>
      router
        .declare({
          name: 'createItem',
          route: 'POST /items/:id',
          request: z.object({ message: z.string() }),
          response: z.object({ message: z.string() }),
        })
        .implement('POST /items/:id', (ctx) => {
          // this statement helps us validate that the body is typed correctly
          ctx.request.body.message.trim();

          // This expect-error helps us confirm that the query is not on the ctx.
          // @ts-expect-error
          ctx.request.query;

          // this statement helps us validate that the params are typed correctly
          ctx.params.id.trim();

          return ctx.request.body;
        }),
    );
  });

  test('type inference for GET body + params', () => {
    setup((router) =>
      router
        .declare({
          name: 'get',
          route: 'GET /items/:id',
          request: z.object({ message: z.string() }),
          response: z.object({ message: z.string() }),
        })
        .implement('GET /items/:id', (ctx) => {
          // this statement helps us validate that the body is typed correctly
          ctx.request.query.message.trim();

          // This expect-error helps us confirm that the query is not on the ctx.
          // @ts-expect-error
          ctx.request.body;

          // this statement helps us validate that the params are typed correctly
          ctx.params.id.trim();

          return ctx.request.query;
        }),
    );
  });

  test('type inference when using Zod transforms', async () => {
    const clients = setup((router) =>
      router
        .declare({
          name: 'getItems',
          route: 'GET /items',
          request: z.object({
            // API should enforce a string, but the code should receive a number.
            message: z.string().transform((val) => Number(val)),
          }),
          response: z.object({ message: z.number() }),
        })
        .implement('GET /items', (ctx) => {
          // this statement helps us validate that the message is typed as a Number
          ctx.request.query.message.toFixed();
          // This should compile -- it's enforcing a number.
          return { message: 1 };
        })
        .declare({
          name: 'createItem',
          route: 'POST /items',
          request: z.object({
            // API should enforce a string, but the code should receive a number.
            message: z.string().transform((val) => Number(val)),
          }),
          response: z.object({ message: z.number() }),
        })
        .implement('POST /items', (ctx) => {
          // this statement helps us validate that the message is typed as a Number
          ctx.request.body.message.toFixed();
          // This should compile -- it's enforcing a number.
          return { message: 2 };
        }),
    );
    // ---- GET VALIDATIONS ----

    // Assert that client types enforce the API types.
    const getInput: Parameters<typeof clients.typed.getItems>[0] = {} as any;
    // @ts-expect-error This should fail -- the API requires a string
    getInput.message = 1;

    // This should compile -- the API requires a string.
    const getResult = await clients.typed.getItems({ message: '1' });

    // Confirm response is runtime correct.
    expect(getResult.data).toStrictEqual({ message: 1 });
    // this statement helps us validate that the response is typed correctly, as a number.
    getResult.data.message.toFixed();

    // ---- POST VALIDATIONS ----
    // Assert that client types enforce the API types.
    const postInput: Parameters<typeof clients.typed.createItem>[0] = {} as any;
    // @ts-expect-error This should fail -- the API requires a string
    postInput.message = 1;

    // This should compile -- the API requires a string.
    const postResult = await clients.typed.createItem({ message: '1' });

    // Confirm response is runtime correct.
    expect(postResult.data).toStrictEqual({ message: 2 });
    // this statement helps us validate that the response is typed correctly, as a number.
    postResult.data.message.toFixed();
  });
});

describe('input validation', () => {
  (['POST', 'PUT', 'PATCH'] as const).forEach((method) => {
    test(`rejects requests that do not match the schema for ${method} requests`, async () => {
      const { client } = setup((router) =>
        router
          .declare({
            name: 'createItem',
            route: `${method} /items`,
            request: z.object({ message: z.string() }),
            response: z.object({ message: z.string() }),
          })
          .implement(`${method} /items`, () => ({ message: '' })),
      );

      const { status, data } = await client.request({
        method,
        url: '/items',
        data: { bogus: 'value' },
      });

      expect(status).toStrictEqual(400);
      expect(data).toStrictEqual(
        'The request input did not conform to the required schema: Required at "message"',
      );
    });
  });

  (['GET', 'DELETE'] as const).forEach((method) => {
    test(`rejects requests that do not match the schema for ${method} requests`, async () => {
      const { client } = setup((router) =>
        router
          .declare({
            name: 'getItem',
            route: `${method} /items`,
            request: z.object({ message: z.string() }),
            response: z.object({ message: z.string() }),
          })
          .implement(`${method} /items`, () => ({ message: '' })),
      );

      const { status, data } = await client.request({
        method,
        url: '/items',
        params: { bogus: 'value' },
      });

      expect(status).toStrictEqual(400);
      expect(data).toStrictEqual(
        'The request input did not conform to the required schema: Required at "message"',
      );
    });
  });

  test('error messages when there are multiple validation errors', async () => {
    const { client } = setup((router) =>
      router
        .declare({
          name: 'createItem',
          route: 'POST /items',
          request: z.object({ message: z.string(), private: z.boolean() }),
          response: z.object({ message: z.string() }),
        })
        .implement('POST /items', () => ({ message: '' })),
    );

    const { status, data } = await client.request({
      method: 'POST',
      url: '/items',
      data: { bogus: 'value' },
    });

    expect(status).toStrictEqual(400);
    expect(data).toStrictEqual(
      'The request input did not conform to the required schema: Required at "message"; Required at "private"',
    );
  });
});

describe('output validation', () => {
  (['GET', 'DELETE', 'POST', 'PUT', 'PATCH'] as const).forEach((method) => {
    test(`${method} requests throw an Error when response type does not match the schema`, async () => {
      const { client } = setup((router) =>
        router
          .declare({
            name: 'createItem',
            route: `${method} /items`,
            request: z.object({}),
            response: z.object({ message: z.string() }),
          })
          .implement(
            `${method} /items`,
            // @ts-expect-error Intentionally writing incorrect TS here
            () => ({ message: 123 }),
          ),
      );

      const { status } = await client.request({
        method,
        url: '/items',
      });

      expect(status).toStrictEqual(500);
    });

    test(`${method} requests allow extra fields on response values and strip them from responses`, async () => {
      const { client } = setup((router) =>
        router
          .declare({
            name: 'createItem',
            route: `${method} /items`,
            request: z.object({}),
            response: z.object({ message: z.string() }),
          })
          .implement(`${method} /items`, () => ({
            message: 'test-message',
            anotherField: 1234,
          })),
      );

      const { status, data } = await client.request({
        method,
        url: '/items',
      });

      expect(status).toStrictEqual(200);
      // Ensure `anotherField` was stripped.
      expect(data).toStrictEqual({ message: 'test-message' });
    });
  });
});

describe('implementations', () => {
  (['POST', 'PUT', 'PATCH'] as const).forEach((method) => {
    test(`rejects requests that do not match the schema for ${method} requests`, async () => {
      const { client } = setup((router) =>
        router
          .declare({
            name: 'createItem',
            route: `${method} /items`,
            request: z.object({ message: z.string() }),
            response: z.object({ message: z.string() }),
          })
          .implement(`${method} /items`, (ctx) => ({
            message: ctx.request.body.message + '-response',
          })),
      );

      const message = uuid();

      const { status, data } = await client.request({
        method,
        url: '/items',
        data: { message },
      });

      expect(status).toStrictEqual(200);
      expect(data).toStrictEqual({ message: `${message}-response` });
    });
  });

  (['GET', 'DELETE'] as const).forEach((method) => {
    test(`rejects requests that do not match the schema for ${method} requests`, async () => {
      const { client } = setup((router) =>
        router
          .declare({
            name: 'createItem',
            route: `${method} /items`,
            request: z.object({ message: z.string() }),
            response: z.object({ message: z.string() }),
          })
          .implement(`${method} /items`, (ctx) => ({
            message: (ctx.request.query.message as string) + '-response',
          })),
      );

      const message = uuid();

      const { status, data } = await client.request({
        method,
        url: '/items',
        params: { message },
      });

      expect(status).toStrictEqual(200);
      expect(data).toStrictEqual({ message: `${message}-response` });
    });
  });
});

describe('using middleware', () => {
  test('type errors are caught when using middleware', () => {
    type CustomState = { message: string };

    setup(() =>
      OneSchemaRouter.create({
        using: new Router<CustomState>(),
        introspection: undefined,
      })
        .declare({
          name: 'putItem',
          route: 'PUT /items/:id',
          request: z.object({ message: z.string() }),
          response: z.object({ id: z.string(), message: z.string() }),
        })
        .implement(
          'PUT /items/:id',
          // @ts-expect-error
          async (ctx, next) => {
            ctx.state.message = ctx.request.body.message + '-response';
            await next();
          },
          // We're leaving out the id value here, which should cause the TS error.
          (ctx) => ({ message: ctx.state.message }),
        )
        .implement(
          'PUT /items/:id',
          async (ctx, next) => {
            ctx.params.id;

            ctx.request.body.message;

            // @ts-expect-error The params should be well-typed.
            ctx.params.bogus;

            // @ts-expect-error The body should be well-typed.
            ctx.request.body.bogus;

            await next();
          },
          (ctx) => ({ id: 'test-id', message: ctx.state.message }),
        )
        .implement(
          'PUT /items/:id',
          (ctx, next) => {
            // This call implicitly tests that `message` is a string.
            ctx.state.message.endsWith('');

            // @ts-expect-error The state should be well-typed.
            ctx.state.bogus;

            return next();
          },
          (ctx) => ({ id: 'test-id', message: ctx.state.message }),
        ),
    );
  });

  test('middlewares are actually executed', async () => {
    const mock = jest.fn();
    const { typed: client } = setup((router) =>
      router
        .declare({
          name: 'putItem',
          route: 'PUT /items/:id',
          request: z.object({ message: z.string() }),
          response: z.object({ id: z.string(), message: z.string() }),
        })
        .implement(
          'PUT /items/:id',
          async (ctx, next) => {
            mock('middleware 1', ctx.state.message);
            ctx.state.message = 'message 1';
            await next();
          },
          (ctx, next) => {
            mock('middleware 2', ctx.state.message);
            ctx.state.message = 'message 2';
            return next();
          },
          (ctx) => ({ id: ctx.params.id, message: ctx.state.message }),
        ),
    );

    const { status, data } = await client.putItem({
      id: 'test-id-bleh',
      message: 'test-message',
    });

    expect(status).toStrictEqual(200);
    expect(data).toStrictEqual({ id: 'test-id-bleh', message: 'message 2' });

    expect(mock.mock.calls).toEqual([
      ['middleware 1', undefined],
      ['middleware 2', 'message 1'],
    ]);
  });
});

describe('introspection', () => {
  test('introspecting + generating a client', async () => {
    const { client } = serve(
      OneSchemaRouter.create({
        using: new Router(),
        introspection: {
          route: '/private/introspection',
          serviceVersion: '123',
        },
      })
        .declare({
          name: 'createItem',
          route: 'POST /items',
          request: z.object({ message: z.string() }),
          response: z.object({ id: z.string(), message: z.string() }),
        })
        .implement('POST /items', (ctx) => ({
          id: 'something',
          message: ctx.request.body.message + '-response',
        }))
        .declare({
          route: 'GET /items/:id',
          name: 'getItem',
          request: z.object({
            filter: z.string(),
          }),
          response: z.object({ id: z.string(), message: z.string() }),
        })
        .implement('GET /items/:id', (ctx) => ({
          id: ctx.params.id,
          message: ctx.request.query.filter + '-response',
        })),
    );

    const { status, data } = await client.request({
      method: 'GET',
      url: '/private/introspection',
    });

    expect(status).toStrictEqual(200);
    expect(data).toStrictEqual({
      serviceVersion: '123',
      schema: {
        Endpoints: expect.objectContaining({
          'POST /items': expect.anything(),
          'GET /items/:id': expect.anything(),
        }),
      },
    });

    const clientCode = await generateAxiosClient({
      spec: data.schema,
      outputClass: 'Client',
    });

    const formattedDeclaration = format(clientCode.declaration, {
      parser: 'typescript',
    });

    expect(formattedDeclaration).toMatchSnapshot();
  });

  test('when using the same schema reference multiple times, it is always resolved inline', async () => {
    const reusedSchema = z.object({ id: z.string() });

    const router = OneSchemaRouter.create({
      using: new Router(),
      introspection: {
        route: '/private/introspection',
        serviceVersion: '123',
      },
    }).declare({
      route: 'POST /items',
      name: 'createItem',
      request: z.object({}),
      response: z.object({
        resProp1: reusedSchema,
        resProp2: reusedSchema,
      }),
    });

    const { client } = serve(router);

    const introspectionResult = await client.get('/private/introspection');

    expect(introspectionResult.data.schema).toStrictEqual({
      Endpoints: {
        'POST /items': {
          Name: 'createItem',
          Request: {
            type: 'object',
            properties: {},
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
          Response: {
            type: 'object',
            properties: {
              // resProp1 and resProp2 should be inlined, even though they have identical
              // schemas defined using the same reference.
              resProp1: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                  },
                },
                required: ['id'],
                additionalProperties: false,
              },
              resProp2: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                  },
                },
                required: ['id'],
                additionalProperties: false,
              },
            },
            required: ['resProp1', 'resProp2'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
      },
    });
  });

  it('can generate an OpenAPI schema', async () => {
    const { client } = setup(() =>
      OneSchemaRouter.create({
        using: new Router(),
        introspection: {
          route: '/private/introspection',
          serviceVersion: '123',
          openApi: {
            route: '/private/openapi',
            info: {
              title: 'My Service',
            },
          },
        },
      })
        .declare({
          name: 'getSomething',
          route: 'GET /something/:id',
          description: 'it gets something',
          request: z.object({ filter: z.string() }),
          response: z.object({ message: z.string(), id: z.string() }),
        })
        .implement('GET /something/:id', () => ({ id: '', message: '' }))
        .declare({
          name: 'createSomething',
          route: 'POST /something',
          description: 'it creates something',
          request: z.object({ message: z.string() }),
          response: z.object({ message: z.string(), id: z.string() }),
        })
        .implement('POST /something', () => ({ id: '', message: '' })),
    );

    const result = await client.get('/private/openapi');
    expect(result.data).toStrictEqual({
      openapi: '3.0.0',
      info: {
        title: 'My Service',
        version: '123',
      },
      components: {},
      paths: {
        '/something/{id}': {
          get: {
            operationId: 'getSomething',
            description: 'it gets something',
            responses: {
              '200': {
                description: 'A successful response',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        message: {
                          type: 'string',
                        },
                        id: {
                          type: 'string',
                        },
                      },
                      required: ['message', 'id'],
                      additionalProperties: false,
                      $schema: 'http://json-schema.org/draft-07/schema#',
                    },
                  },
                },
              },
            },
            parameters: [
              {
                name: 'id',
                in: 'path',
                schema: {
                  type: 'string',
                },
                required: true,
              },
              {
                in: 'query',
                name: 'filter',
                schema: {
                  type: 'string',
                },
                required: true,
              },
            ],
          },
        },
        '/something': {
          post: {
            operationId: 'createSomething',
            description: 'it creates something',
            responses: {
              '200': {
                description: 'A successful response',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        message: {
                          type: 'string',
                        },
                        id: {
                          type: 'string',
                        },
                      },
                      required: ['message', 'id'],
                      additionalProperties: false,
                      $schema: 'http://json-schema.org/draft-07/schema#',
                    },
                  },
                },
              },
            },
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                      },
                    },
                    required: ['message'],
                    additionalProperties: false,
                    $schema: 'http://json-schema.org/draft-07/schema#',
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

test('declaring multiple routes with the same name results in an error', () => {
  expect(() => {
    OneSchemaRouter.create({
      using: new Router(),
      introspection: undefined,
    })
      .declare({
        route: 'POST /items',
        name: 'createSomething',
        request: z.object({}),
        response: z.object({}),
      })
      .declare({
        route: 'PUT /items',
        name: 'createSomething',
        request: z.object({}),
        response: z.object({}),
      });
  }).toThrow(
    'Multiple endpoints were declared with the same name "createSomething". Each endpoint must have a unique name.',
  );
});

test('the client(...) helper', async () => {
  const router = OneSchemaRouter.create({
    using: new Router(),
    introspection: undefined,
  })
    .declare({
      route: 'POST /items',
      name: 'createItem',
      request: z.object({ id: z.string() }),
      response: z.object({ id: z.string() }),
    })
    .implement('POST /items', (ctx) => ({ id: ctx.request.body.id }))
    .declare({
      route: 'GET /items/:id',
      name: 'getItemById',
      request: z.object({
        filter: z.string(),
      }),
      response: z.object({ id: z.string() }),
    })
    .implement('GET /items/:id', (ctx) => ({
      id: ctx.params.id + ':' + ctx.request.query.filter,
    }));

  const { client: axios } = serve(router);

  const client = router.client(axios);

  const getResponse = await client.getItemById({
    id: 'some-id',
    filter: 'some-filter',
  });

  expect(getResponse.status).toStrictEqual(200);
  expect(getResponse.data).toStrictEqual({ id: 'some-id:some-filter' });

  const postResponse = await client.createItem({ id: 'some-id' });
  expect(postResponse.status).toStrictEqual(200);
  expect(postResponse.data).toStrictEqual({ id: 'some-id' });
});

describe('compat router', () => {
  test('get + post', async () => {
    const { typed: client } = setup(() =>
      createCompatRouter({ introspection: undefined, using: new Router() })
        .post(
          '/items',
          {
            name: 'createItem',
            request: z.object({ id: z.string() }),
            response: z.object({ id: z.string() }),
          },
          (ctx) => ({ id: ctx.request.body.id }),
        )
        .get(
          '/items/:id',
          {
            name: 'getItemById',
            request: z.object({
              filter: z.string(),
            }),
            response: z.object({ id: z.string() }),
          },
          (ctx) => ({
            id: ctx.params.id + ':' + ctx.request.query.filter,
          }),
        ),
    );

    const res1 = await client.createItem({ id: 'test-id' });
    expect(res1.status).toStrictEqual(200);
    expect(res1.data).toStrictEqual({ id: 'test-id' });

    const res2 = await client.getItemById({
      id: 'test-id',
      filter: 'test-filter',
    });
    expect(res2.status).toStrictEqual(200);
    expect(res2.data).toStrictEqual({ id: 'test-id:test-filter' });
  });
});
