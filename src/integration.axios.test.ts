import { writeFileSync } from 'fs';
import { format } from 'prettier';
import Koa from 'koa';
import bodyparser = require('koa-bodyparser');
import { OneSchemaDefinition } from '.';
import {
  generateAxiosClient,
  GenerateAxiosClientInput,
} from './generate-axios-client';
import { useServiceClient } from './test-utils';

const testGeneratedFile = (ext: string) => `${__dirname}/test-generated${ext}`;

const generateAndFormat = (input: GenerateAxiosClientInput) =>
  generateAxiosClient(input).then((source) => ({
    javascript: format(source.javascript, { parser: 'babel' }),
    declaration: format(source.declaration, { parser: 'typescript' }),
  }));

const mockMiddleware = jest.fn();

/**
 * We use an actual HTTP server to help with assertions. Why: this
 * helps us protect against supply chain problems with Axios, and
 * confirm end-behavior (rather than just assert "we passed the right
 * parameters to Axios").
 */
const context = useServiceClient({
  service: new Koa()
    .use(bodyparser())
    .use((ctx, next) => {
      ctx.status = 200;
      // Just return data about the request, to be used for assertions.
      ctx.body = {
        method: ctx.method,
        query: ctx.query,
        path: ctx.path,
        body: ctx.request.body,
      };
      return next();
    })
    .use(mockMiddleware),
});

/** The "well-typed" client generated from the schema. */
let client: any;

beforeEach(async () => {
  mockMiddleware.mockReset().mockImplementation((ctx, next) => next());

  const spec: OneSchemaDefinition = {
    Resources: {},
    Endpoints: {
      'GET /posts': {
        Name: 'getPosts',
        Request: {
          type: 'object',
          additionalProperties: false,
          properties: {
            input: { type: 'string' },
          },
        },
        Response: {
          type: 'object',
          additionalProperties: false,
          properties: {
            output: { type: 'string' },
          },
        },
      },
      'PUT /posts/:id': {
        Name: 'putPost',
        Request: {
          type: 'object',
          additionalProperties: false,
          properties: {
            message: { type: 'string' },
          },
        },
        Response: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
      'GET /posts/list': {
        Name: 'listPosts',
        Request: {
          type: 'object',
          additionalProperties: false,
          properties: {
            filter: { type: 'string' },
            url: { type: 'string' },
            nextPageToken: { type: 'string' },
            pageSize: { type: 'string' },
          },
        },
        Response: {
          type: 'object',
          additionalProperties: false,
          required: ['items', 'links'],
          properties: {
            items: {
              type: 'array',
              items: { type: 'string' },
            },
            links: {
              type: 'object',
              properties: {
                self: { type: 'string' },
                next: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };

  const output = await generateAndFormat({ spec, outputClass: 'Service' });

  writeFileSync(testGeneratedFile('.js'), output.javascript);
  writeFileSync(testGeneratedFile('.d.ts'), output.declaration);

  const { Service } = await import(testGeneratedFile('.js'));
  client = new Service(context.client);
});

describe('integration tests', () => {
  test('compile + execute', async () => {
    expect(client).toMatchObject({
      getPosts: expect.any(Function),
      putPost: expect.any(Function),
    });

    const getResult = await client.getPosts({ input: 'some-input' });
    expect(mockMiddleware).toHaveBeenCalledTimes(1);
    expect(getResult.data).toStrictEqual({
      method: 'GET',
      path: '/posts',
      body: {},
      query: {
        input: 'some-input',
      },
    });

    const putResult = await client.putPost({
      id: 'some-id',
      message: 'some-message',
    });
    expect(mockMiddleware).toHaveBeenCalledTimes(2);
    expect(putResult.data).toStrictEqual({
      method: 'PUT',
      path: '/posts/some-id',
      body: {
        message: 'some-message',
      },
      query: {},
    });
  });

  test('generated code URI-encodes path parameters', async () => {
    const result = await client.putPost({
      id: 'some,bogus,param',
      message: 'some-message',
    });

    expect(mockMiddleware).toHaveBeenCalledTimes(1);
    expect(result.data).toStrictEqual({
      method: 'PUT',
      path: '/posts/some%2Cbogus%2Cparam',
      body: {
        message: 'some-message',
      },
      query: {},
    });
  });

  test('generated code URI-encodes query parameters', async () => {
    const filter = 'some/evil/string';
    const result = await client.listPosts({ filter });

    expect(mockMiddleware).toHaveBeenCalledTimes(1);
    expect(result.data).toStrictEqual({
      method: 'GET',
      path: '/posts/list',
      body: {},
      query: { filter },
    });
  });

  test('generated code does not send undefined query parameters', async () => {
    const result = await client.listPosts({ filter: undefined });

    expect(mockMiddleware).toHaveBeenCalledTimes(1);
    expect(result.data).toStrictEqual({
      method: 'GET',
      path: '/posts/list',
      body: {},
      query: {},
    });
  });

  test('pagination', async () => {
    const requestSpy = jest.spyOn(client.client, 'request');

    mockMiddleware
      .mockImplementationOnce((ctx) => {
        if (ctx.body)
          ctx.body = {
            items: ['first', 'second'],
            links: {
              self: 'blah-blah',
              next: '/posts/list?nextPageToken=firstpagetoken&pageSize=10&randomProperty=blah',
            },
          };
      })
      .mockImplementationOnce((ctx) => {
        ctx.body = {
          items: ['third', 'fourth'],
          links: {
            self: 'blah-blah',
            next: '/posts/list?nextPageToken=secondpagetoken&pageSize=10&randomProperty=blah',
          },
        };
      })
      .mockImplementationOnce((ctx) => {
        ctx.body = {
          items: ['fifth'],
          links: {
            self: 'blah-blah',
          },
        };
      });

    const result = await client.paginate(client.listPosts, {
      filter: 'something',
    });

    expect(mockMiddleware).toHaveBeenCalledTimes(3);
    expect(requestSpy).toHaveBeenCalledTimes(3);
    expect(requestSpy).toHaveBeenNthCalledWith(1, {
      method: 'GET',
      params: {
        filter: 'something',
      },
      url: '/posts/list',
    });
    // After first requests, inherits default page size
    expect(requestSpy).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      params: {
        filter: 'something',
        nextPageToken: 'firstpagetoken',
        pageSize: '10',
      },
      url: '/posts/list',
    });
    expect(requestSpy).toHaveBeenNthCalledWith(3, {
      method: 'GET',
      params: {
        filter: 'something',
        nextPageToken: 'secondpagetoken',
        pageSize: '10',
      },
      url: '/posts/list',
    });

    expect(result).toStrictEqual([
      'first',
      'second',
      'third',
      'fourth',
      'fifth',
    ]);
  });
});
