import axios from 'axios';
import Koa = require('koa');
import bodyParser = require('koa-bodyparser');
import Router = require('koa-router');
import { implementSchema } from '.';
import { withAssumptions } from './meta-schema';

test('using unsupported methods throws immediately', () => {
  expect(() => {
    implementSchema(
      withAssumptions({
        Endpoints: {
          'OPTIONS /post': {
            Name: 'test',
            Request: {},
            Response: {},
          },
        },
      }),
      {
        // @ts-ignore
        on: new Router(),
        parse: () => null as any,
        implementation: {
          'OPTIONS /post': () => ({}),
        },
        introspection: undefined,
      },
    );
  }).toThrowError('Unsupported method detected: OPTIONS /post');
});

test('setting a 200-level response code overrides the response', async () => {
  const router = new Router();
  implementSchema(
    withAssumptions({
      Endpoints: {
        'DELETE /post/:id': {
          Name: 'deletePost',
          Response: {},
        },
        'POST /posts': {
          Name: 'createPost',
          Response: {},
        },
      },
    }),
    {
      on: router,
      parse: () => null as any,
      implementation: {
        'DELETE /post/:id': (ctx) => {
          ctx.response.status = 204;

          // This comment essentially serves as a "test" that the `body` property
          // has been removed from the `request` object.
          // @ts-expect-error
          ctx.request.body;

          // This line serves as an implicit test that the `query` property
          // is present on the `request` object.
          ctx.request.query;

          return {};
        },
        'POST /posts': (ctx) => {
          ctx.response.status = 301;

          // This line serves as an implicit test that the `body` property
          // is present on the `request` object.
          ctx.request.body;

          // This comment essentially serves as a "test" that the `query` property
          // has been removed from the `request` object.
          // @ts-expect-error
          ctx.request.query;

          return {};
        },
      },
      introspection: undefined,
    },
  );

  const server = new Koa()
    .use(bodyParser())
    .use(router.routes())
    .use(router.allowedMethods())
    .listen();

  const { port } = server.address() as any;

  const client = axios.create({
    baseURL: `http://localhost:${port}`,
    validateStatus: () => true,
  });

  const deleteRes = await client.delete('/post/bogus');
  expect(deleteRes.status).toStrictEqual(204);

  const createRes = await client.post('/posts');
  expect(createRes.status).toStrictEqual(200);

  server.close();
});
