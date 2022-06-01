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

describe('integration tests', () => {
  test('compile + execute', async () => {
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
      },
    };

    const output = await generateAndFormat({ spec, outputClass: 'Service' });

    writeFileSync(testGeneratedFile('.js'), output.javascript);
    writeFileSync(testGeneratedFile('.d.ts'), output.declaration);

    const { Service } = await import(testGeneratedFile('.js'));

    const mockRequest = jest.fn();
    const instance = new Service({
      request: mockRequest,
    } as any);

    expect(instance).toMatchObject({
      getPosts: expect.any(Function),
      putPost: expect.any(Function),
    });

    await instance.getPosts({ input: 'some-input' });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenNthCalledWith(1, {
      method: 'GET',
      url: '/posts',
      params: {
        input: 'some-input',
      },
    });

    await instance.putPost({ id: 'some-id', message: 'some-message' });
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest).toHaveBeenNthCalledWith(2, {
      method: 'PUT',
      url: '/posts/some-id',
      data: {
        message: 'some-message',
      },
    });
  });
});
