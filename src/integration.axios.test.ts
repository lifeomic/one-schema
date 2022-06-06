import { writeFileSync } from 'fs';
import { format } from 'prettier';
import { OneSchemaDefinition } from '.';
import {
  generateAxiosClient,
  GenerateAxiosClientInput,
} from './generate-axios-client';

const testGeneratedFile = (ext: string) => `${__dirname}/test-generated${ext}`;

const generateAndFormat = (input: GenerateAxiosClientInput) =>
  generateAxiosClient(input).then((source) => ({
    javascript: format(source.javascript, { parser: 'babel' }),
    declaration: format(source.declaration, { parser: 'typescript' }),
  }));

const prepare = async () => {
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

  const request = jest.fn();
  const client = new Service({ request });
  return { client, request };
};

describe('integration tests', () => {
  test('compile + execute', async () => {
    const { client, request } = await prepare();

    expect(client).toMatchObject({
      getPosts: expect.any(Function),
      putPost: expect.any(Function),
    });

    await client.getPosts({ input: 'some-input' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenNthCalledWith(1, {
      method: 'GET',
      url: '/posts',
      params: {
        input: 'some-input',
      },
    });

    await client.putPost({ id: 'some-id', message: 'some-message' });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenNthCalledWith(2, {
      method: 'PUT',
      url: '/posts/some-id',
      data: {
        message: 'some-message',
      },
    });
  });

  test('generated code URI-encodes path parameters', async () => {
    const { client, request } = await prepare();

    await client.putPost({ id: 'some,bogus,param', message: 'some-message' });

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      method: 'PUT',
      url: '/posts/some%2Cbogus%2Cparam',
      data: {
        message: 'some-message',
      },
    });
  });

  test('pagination', async () => {
    const { client, request } = await prepare();

    request
      .mockResolvedValueOnce({
        data: {
          items: ['first', 'second'],
          links: {
            self: 'blah-blah',
            next: '/posts/list?nextPageToken=firstpagetoken&pageSize=10&randomProperty=blah',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: ['third', 'fourth'],
          links: {
            self: 'blah-blah',
            next: '/posts/list?nextPageToken=secondpagetoken&pageSize=10&randomProperty=blah',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: ['fifth'],
          links: {
            self: 'blah-blah',
          },
        },
      });

    const result = await client.paginate(client.listPosts, {
      filter: 'something',
    });

    expect(request).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenNthCalledWith(1, {
      method: 'GET',
      params: {
        filter: 'something',
      },
      url: '/posts/list',
    });
    // After first requests, inherits default page size
    expect(request).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      params: {
        filter: 'something',
        nextPageToken: 'firstpagetoken',
        pageSize: '10',
      },
      url: '/posts/list',
    });
    expect(request).toHaveBeenNthCalledWith(3, {
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
