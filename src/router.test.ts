import axios, { AxiosInstance } from 'axios';
import { Server } from 'http';
import { v4 as uuid } from 'uuid';
import { format } from 'prettier';
import Koa = require('koa');
import Router = require('@koa/router');
import bodyparser = require('koa-bodyparser');
import { OneSchemaRouter } from './router';
import { z } from 'zod';
import { generateAxiosClient } from './generate-axios-client';

let server: Server | undefined = undefined;
afterEach(() => {
  server?.close();
});

const setup = <T extends OneSchemaRouter<any, any>>(
  expose: (router: OneSchemaRouter<{}, Router>) => T,
): { client: AxiosInstance } => {
  const router = expose(
    OneSchemaRouter.create({ using: new Router(), introspection: undefined }),
  );
  return serve(router);
};

const serve = (
  router: OneSchemaRouter<{}, Router>,
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
      .route({
        name: 'getSomething',
        route: 'GET /something/:id',
        description: 'it gets something',
        request: z.object({ filter: z.string() }),
        response: z.object({ message: z.string(), id: z.string() }),
      })
      .implement('GET /something/:id', () => ({ id: '', message: '' }))
      .route({
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

describe('type inference', () => {
  test('type inference for implementation return type', () => {
    setup((router) =>
      router
        .route({
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
        .route({
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
        .route({
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
});

describe('input validation', () => {
  (['POST', 'PUT', 'PATCH'] as const).forEach((method) => {
    test(`rejects requests that do not match the schema for ${method} requests`, async () => {
      const { client } = setup((router) =>
        router
          .route({
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
          .route({
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
        .route({
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

describe('implementations', () => {
  (['POST', 'PUT', 'PATCH'] as const).forEach((method) => {
    test(`rejects requests that do not match the schema for ${method} requests`, async () => {
      const { client } = setup((router) =>
        router
          .route({
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
          .route({
            name: 'createItem',
            route: `${method} /items`,
            request: z.object({ message: z.string() }),
            response: z.object({ message: z.string() }),
          })
          .implement(`${method} /items`, (ctx) => ({
            message: ctx.request.query.message + '-response',
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
        .route({
          name: 'createItem',
          route: 'POST /items',
          request: z.object({ message: z.string() }),
          response: z.object({ id: z.string(), message: z.string() }),
        })
        .implement('POST /items', (ctx) => ({
          id: 'something',
          message: ctx.request.body.message + '-response',
        }))
        .route({
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
});
