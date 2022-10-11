import axios, { AxiosInstance } from 'axios';
import Koa = require('koa');
import Router = require('@koa/router');
import bodyparser = require('koa-bodyparser');
import { OneSchemaRouter } from './koa-static';
import { z } from 'zod';

const shared = z.object({
  message: z.string({ description: 'a message for the response' }),
});

const router = OneSchemaRouter.create({
  using: new Router(),
  introspection: {
    route: '/private/introspection',
    serviceVersion: 'mock-service-version',
  },
})
  .expose(
    {
      name: 'getSomething',
      route: 'GET /something',
      description: 'it gets something',
      request: z.object({}),
      response: shared,
    },
    () => {
      return { message: '' };
    },
  )
  .expose(
    {
      name: 'createSomething',
      route: 'POST /something',
      description: 'it creates something',
      request: z.object({ message: z.string() }),
      response: shared,
    },
    () => {
      return { message: '' };
    },
  );

const executeTest = async (
  testFn: (client: AxiosInstance) => Promise<void>,
) => {
  const [mw1, mw2] = router.middleware();
  const server = new Koa().use(bodyparser()).use(mw1).use(mw2).listen();

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

test('introspection', async () => {
  await executeTest(async (client) => {
    const result = await client.get('/private/introspection');

    expect(result.status).toStrictEqual(200);
    expect(result.data).toStrictEqual({
      schema: 'blah',
      serviceVersion: 'mock-service-version',
    });
  });
});

test.only('bogus', async () => {
  await executeTest(async (client) => {
    const result = await client.post('/something', { bleh: '' });

    expect(result.status).toStrictEqual(400);
    expect(result.data).toStrictEqual({
      schema: 'blah',
      serviceVersion: 'mock-service-version',
    });
  });
});
