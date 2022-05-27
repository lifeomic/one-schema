import {
  generateAxiosClient,
  GenerateAxiosClientInput,
} from './generate-axios-client';
import { format } from 'prettier';

describe('generate', () => {
  const generateAndFormat = (input: GenerateAxiosClientInput) =>
    generateAxiosClient(input).then((source) =>
      format(source, { parser: 'typescript' }),
    );

  const FIXTURES: { input: GenerateAxiosClientInput; expected: string }[] = [
    {
      input: {
        outputClass: 'Client',
        spec: {
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
        },
      },
      expected: `/* eslint-disable */
import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

export type Endpoints = {
  "GET /posts": {
    Request: {
      input?: string;
    };
    PathParams: {};
    Response: {
      output?: string;
    };
  };
  "PUT /posts/:id": {
    Request: {
      message?: string;
    };
    PathParams: {
      id: string;
    };
    Response: {
      id?: string;
      message?: string;
    };
  };
};

const substituteParams = (url: string, params: any) =>
  Object.entries(params).reduce(
    (url, [name, value]) => url.replace(":" + name, value as any),
    url
  );

const removePathParams = (url: string, params: any) =>
  Object.entries(params).reduce(
    (accum, [name, value]) =>
      url.includes(":" + name) ? accum : { ...accum, [name]: value },
    {}
  );

export class Client {
  constructor(private readonly client: AxiosInstance) {}

  getPosts(
    params: Endpoints["GET /posts"]["Request"] &
      Endpoints["GET /posts"]["PathParams"],
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<Endpoints["GET /posts"]["Response"]>> {
    return this.client.request({
      ...config,
      method: "GET",
      params: removePathParams("/posts", params),
      url: substituteParams("/posts", params),
    });
  }

  putPost(
    data: Endpoints["PUT /posts/:id"]["Request"] &
      Endpoints["PUT /posts/:id"]["PathParams"],
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<Endpoints["PUT /posts/:id"]["Response"]>> {
    return this.client.request({
      ...config,
      method: "PUT",
      data: removePathParams("/posts/:id", data),
      url: substituteParams("/posts/:id", data),
    });
  }
}
`,
    },
  ];

  FIXTURES.forEach(({ input, expected }, idx) => {
    test(`fixture ${idx}`, async () => {
      const result = await generateAndFormat(input);
      expect(result).toStrictEqual(expected);
    });
  });
});
