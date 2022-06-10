import {
  generateAxiosClient,
  GenerateAxiosClientInput,
} from './generate-axios-client';
import { format } from 'prettier';

describe('generate', () => {
  const generateAndFormat = (input: GenerateAxiosClientInput) =>
    generateAxiosClient(input).then((source) => ({
      javascript: format(source.javascript, { parser: 'babel' }),
      declaration: format(source.declaration, { parser: 'typescript' }),
    }));

  const FIXTURES: {
    input: GenerateAxiosClientInput;
    expected: { javascript: string; declaration: string };
  }[] = [
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
      expected: {
        javascript: `/* eslint-disable */

const substituteParams = (url, params) =>
  Object.entries(params).reduce(
    (url, [name, value]) => url.replace(":" + name, encodeURIComponent(value)),
    url
  );

const removePathParams = (url, params) =>
  Object.entries(params)
    .filter(([key, value]) => value !== undefined)
    .reduce(
      (accum, [name, value]) =>
        url.includes(":" + name) ? accum : { ...accum, [name]: value },
      {}
    );

const parseQueryParamsFromPagingLink = (link) => {
  const params = new URLSearchParams(link.split("?")[1]);

  return {
    nextPageToken: params.get("nextPageToken"),
    pageSize: params.get("pageSize"),
  };
};

class Client {
  constructor(client) {
    this.client = client;
  }

  getPosts(data, config) {
    return this.client.request({
      ...config,
      method: "GET",
      params: removePathParams("/posts", data),
      url: substituteParams("/posts", data),
    });
  }

  putPost(data, config) {
    return this.client.request({
      ...config,
      method: "PUT",
      data: removePathParams("/posts/:id", data),
      url: substituteParams("/posts/:id", data),
    });
  }

  /**
   * Paginates exhaustively through the provided \`request\`, using the specified
   * \`data\`. A \`pageSize\` can be specified in the \`data\` to customize the
   * page size for pagination.
   */
  async paginate(request, data, config) {
    const result = [];

    let nextPageParams = {};
    do {
      const response = await this[request.name](
        { ...nextPageParams, ...data },
        config
      );

      result.push(...response.data.items);

      nextPageParams = response.data.links.next
        ? parseQueryParamsFromPagingLink(response.data.links.next)
        : {};
    } while (!!nextPageParams.nextPageToken);

    return result;
  }
}

module.exports.Client = Client;
`,
        declaration: `/* eslint-disable */
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

export declare class Client {
  constructor(client: AxiosInstance);

  getPosts(
    params: Endpoints["GET /posts"]["Request"] &
      Endpoints["GET /posts"]["PathParams"],
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<Endpoints["GET /posts"]["Response"]>>;

  putPost(
    data: Endpoints["PUT /posts/:id"]["Request"] &
      Endpoints["PUT /posts/:id"]["PathParams"],
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<Endpoints["PUT /posts/:id"]["Response"]>>;

  paginate<T extends { nextPageToken?: string; pageSize?: string }, Item>(
    request: (
      data: T,
      config?: AxiosRequestConfig
    ) => Promise<
      AxiosResponse<{ items: Item[]; links: { self: string; next?: string } }>
    >,
    data: T,
    config?: AxiosRequestConfig
  ): Promise<Item[]>;
}
`,
      },
    },
  ];

  FIXTURES.forEach(({ input, expected }, idx) => {
    test(`fixture ${idx}`, async () => {
      const result = await generateAndFormat(input);
      expect(result.javascript).toStrictEqual(expected.javascript);
      expect(result.declaration).toStrictEqual(expected.declaration);
    });
  });
});
