import { describe, expect, test } from 'vitest';
import {
  generateAxiosClient,
  GenerateAxiosClientInput,
} from './generate-axios-client';
import { format } from 'prettier';
import { writeFileSync } from 'fs';

const LONG_DESCRIPTION = `
This is a long description about a field. It contains lots of very long text. Sometimes the text might be over the desired line length.

It contains newlines.

## It contains markdown.
`.trim();

describe('generate', () => {
  const generateAndFormat = async (input: GenerateAxiosClientInput) => {
    const source = await generateAxiosClient(input);
    return {
      typescript: await format(source.typescript, { parser: 'typescript' }),
    };
  };

  const FIXTURES: {
    input: GenerateAxiosClientInput;
    expected: { typescript: string };
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
              Description: LONG_DESCRIPTION,
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
        typescript: `/* eslint-disable */
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
  /**
   * This is a long description about a field. It contains lots of very long text. Sometimes the text might be over the desired line length.
   *
   * It contains newlines.
   *
   * ## It contains markdown.
   */
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

/* eslint-disable */

const substituteParams = (url: string, params: Object) =>
  Object.entries(params).reduce(
    (url, [name, value]) => url.replace(":" + name, encodeURIComponent(value)),
    url,
  );

const removePathParams = (url: string, params: Object) =>
  Object.entries(params)
    .filter(([key, value]) => value !== undefined)
    .reduce(
      (accum, [name, value]) =>
        url.includes(":" + name) ? accum : { ...accum, [name]: value },
      {},
    );

const parseQueryParamsFromPagingLink = (link: string) => {
  const params = new URLSearchParams(link.split("?")[1]);

  return {
    nextPageToken: params.get("nextPageToken"),
    pageSize: params.get("pageSize"),
  };
};

export class Client {
  client: AxiosInstance;

  constructor(client: AxiosInstance) {
    this.client = client;
  }

  /**
   * Executes the \`GET /posts\` endpoint.
   *
   * @param data The request data.
   * @param config The Axios request overrides for the request.
   *
   * @returns An AxiosResponse object representing the response.
   */
  getPosts(
    data: Endpoints["GET /posts"]["Request"] &
      Endpoints["GET /posts"]["PathParams"],
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<Endpoints["GET /posts"]["Response"]>> {
    return this.client.request({
      ...config,
      method: "GET",
      params: removePathParams("/posts", data),
      url: substituteParams("/posts", data),
    });
  }

  /**
   * This is a long description about a field. It contains lots of very long text. Sometimes the text might be over the desired line length.
   *
   * It contains newlines.
   *
   * ## It contains markdown.
   *
   * @param data The request data.
   * @param config The Axios request overrides for the request.
   *
   * @returns An AxiosResponse object representing the response.
   */
  putPost(
    data: Endpoints["PUT /posts/:id"]["Request"] &
      Endpoints["PUT /posts/:id"]["PathParams"],
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<Endpoints["PUT /posts/:id"]["Response"]>> {
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
  async paginate<T extends { nextPageToken?: string; pageSize?: string }, Item>(
    request: (
      data: T,
      config?: AxiosRequestConfig,
    ) => Promise<
      AxiosResponse<{ items: Item[]; links: { self: string; next?: string } }>
    >,
    data: T,
    config?: AxiosRequestConfig,
  ): Promise<Item[]> {
    const result = [];

    let nextPageParams = {};
    do {
      // @ts-expect-error
      const response = await this[request.name](
        { ...nextPageParams, ...data },
        config,
      );

      result.push(...response.data.items);

      nextPageParams = response.data.links.next
        ? parseQueryParamsFromPagingLink(response.data.links.next)
        : {};
      // @ts-expect-error
    } while (!!nextPageParams.nextPageToken);

    return result;
  }
}

module.exports.Client = Client;
`,
      },
    },
  ];

  FIXTURES.forEach(({ input, expected }, idx) => {
    test(`fixture ${idx}`, async () => {
      const result = await generateAndFormat(input);
      expect(result.typescript).toStrictEqual(expected.typescript);

      writeFileSync(`${__dirname}/test-generated.ts`, result.typescript);
    });
  });
});
