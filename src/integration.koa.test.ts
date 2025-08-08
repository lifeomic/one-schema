import { expect, test } from 'vitest';
import axios, { AxiosInstance } from 'axios';
import Koa = require('koa');
import Router = require('@koa/router');
import bodyparser = require('koa-bodyparser');
import { ImplementationConfig, implementSchema, OneSchemaDefinition } from '.';
import { withAssumptions } from './meta-schema';
import Ajv from 'ajv';

const TEST_SPEC: OneSchemaDefinition = withAssumptions({
  Resources: {},
  Endpoints: {
    'GET /posts': {
      Name: 'getPosts',
      Request: {
        type: 'object',
        properties: {
          input: { type: 'string' },
        },
      },
      Response: {
        type: 'object',
        properties: {
          output: { type: 'string' },
        },
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
        type: 'object',
        properties: {
          id: { type: 'string' },
          message: { type: 'string' },
        },
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
        type: 'object',
        properties: {
          id: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
    'PATCH /posts/:id': {
      Name: 'updatePost',
      Request: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
      },
      Response: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
    'DELETE /posts/:id': {
      Name: 'deletePost',
      Request: {},
      Response: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
    },
  },
});

const executeTest = async (
  overrides: Partial<ImplementationConfig<any, Router>>,
  testFn: (client: AxiosInstance) => Promise<void>,
) => {
  const ajv = new Ajv();
  const config: ImplementationConfig<any, Router> = {
    on: new Router(),
    parse: (ctx, { schema, data }) => {
      if (ajv.validate(schema, data)) {
        return data;
      }
      return ctx.throw(400, 'data did not match schema');
    },
    implementation: {},
    introspection: undefined,
    ...overrides,
  };
  implementSchema(TEST_SPEC, config);

  const server = new Koa()
    .use(bodyparser())
    .use(config.on.routes())
    .use(config.on.allowedMethods())
    .listen();

  const { port } = server.address() as any;

  const client = axios.create({
    baseURL: `http://localhost:${port}`,
    validateStatus: () => true,
  });

  try {
    await testFn(client);
  } finally {
    server.close();
  }
};

test('throws on an invalid request', async () => {
  await executeTest(
    {
      implementation: {
        'PUT /posts/:id': (ctx) => ctx.request.body,
      },
    },
    async (client) => {
      const result = await client.put('/posts/some-id', {
        message: 'a message',
        anotherValue: 'bogus',
      });

      expect(result).toMatchObject({
        status: 400,
        data: 'data did not match schema',
      });
    },
  );
});

test('GET method', async () => {
  await executeTest(
    {
      implementation: {
        'GET /posts': (ctx) => {
          // TypeScript isn't smart enough to determine the correct ctx.request
          // property here.
          // @ts-ignore
          return ctx.request.query;
        },
      },
    },
    async (client) => {
      const result = await client.get('/posts?input=some-input');

      expect(result).toMatchObject({
        status: 200,
        data: {
          input: 'some-input',
        },
      });
    },
  );
});

test('POST method', async () => {
  await executeTest(
    {
      implementation: {
        'POST /posts': (ctx) => ctx.request.body,
      },
    },
    async (client) => {
      const result = await client.post('/posts', {
        id: 'some-id',
        message: 'a message',
      });

      expect(result).toMatchObject({
        status: 200,
        data: {
          id: 'some-id',
          message: 'a message',
        },
      });
    },
  );
});

test('PATCH method', async () => {
  await executeTest(
    {
      implementation: {
        'PATCH /posts/:id': (ctx) => ctx.request.body,
      },
    },
    async (client) => {
      const result = await client.patch('/posts/some-id', {
        message: 'a message',
      });

      expect(result).toMatchObject({
        status: 200,
        data: {
          message: 'a message',
        },
      });
    },
  );
});

test('DELETE method', async () => {
  await executeTest(
    {
      implementation: {
        'DELETE /posts/:id': (ctx) => ctx.request.body,
      },
    },
    async (client) => {
      const result = await client.delete('/posts/some-id');

      expect(result).toMatchObject({
        status: 200,
        data: {},
      });
    },
  );
});

test('introspection', async () => {
  await executeTest(
    {
      introspection: {
        route: '/private/introspection',
        serviceVersion: 'mock-service-version',
      },
    },
    async (client) => {
      const result = await client.get('/private/introspection');

      expect(result).toMatchObject({
        status: 200,
        data: {
          schema: TEST_SPEC,
          serviceVersion: 'mock-service-version',
        },
      });
    },
  );
});

test('default parsing for POST fails invalid data', async () => {
  await executeTest(
    {
      parse: undefined,
      implementation: {
        'POST /posts': (ctx) => ctx.request.body,
      },
    },
    async (client) => {
      const result = await client.post('/posts', {});

      expect(result).toMatchObject({
        status: 400,
        data: "The request did not conform to the required schema: payload must have required property 'id'",
      });
    },
  );
});

test('default parsing for POST allows valid data', async () => {
  await executeTest(
    {
      parse: undefined,
      implementation: {
        'POST /posts': (ctx) => ctx.request.body,
      },
    },
    async (client) => {
      const result = await client.post('/posts', {
        id: 'some-id',
        message: 'some-message',
      });

      expect(result).toMatchObject({
        status: 200,
      });
    },
  );
});

test('default parsing for GET fails invalid data', async () => {
  await executeTest(
    {
      parse: undefined,
      implementation: {
        'GET /posts': (ctx) => ctx.request.body,
      },
    },
    async (client) => {
      const result = await client.get(
        '/posts?input=something&input=something-else',
      );

      expect(result).toMatchObject({
        status: 400,
        data: 'The request did not conform to the required schema: query parameters/input must be string',
      });
    },
  );
});

test('default parsing for GET allows valid data', async () => {
  await executeTest(
    {
      parse: undefined,
      implementation: {
        'GET /posts': (ctx) => ctx.request.body,
      },
    },
    async (client) => {
      const result = await client.get('/posts?input=something');

      expect(result).toMatchObject({
        status: 200,
      });
    },
  );
});
