import { format } from 'prettier';
import { generateAPITypes, GenerateAPITypesInput } from './generate-api-types';

describe('generate', () => {
  const FIXTURES: { input: GenerateAPITypesInput; expected: string }[] = [
    {
      input: {
        spec: {
          Resources: {},
          Endpoints: {
            'GET /posts': {
              Name: 'getPosts',
              Query: {
                input: { type: 'string' },
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
                required: ['message'],
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
import type { OneSchema } from "@lifeomic/one-schema";

export type Endpoints = {
  "GET /posts": {
    Request: unknown;
    Query: {
      input?: string;
    };
    PathParams: {};
    Response: {
      output?: string;
    };
  };
  "PUT /posts/:id": {
    Request: {
      message: string;
    };
    Query: unknown;
    PathParams: {
      id: string;
    };
    Response: {
      id?: string;
      message?: string;
    };
  };
};

export const Schema: OneSchema<Endpoints> = {
  Resources: {},
  Endpoints: {
    "GET /posts": {
      Name: "getPosts",
      Query: { input: { type: "string" } },
      Response: {
        type: "object",
        additionalProperties: false,
        properties: { output: { type: "string" } },
      },
    },
    "PUT /posts/:id": {
      Name: "putPost",
      Request: {
        type: "object",
        additionalProperties: false,
        required: ["message"],
        properties: { message: { type: "string" } },
      },
      Response: {
        type: "object",
        additionalProperties: false,
        properties: { id: { type: "string" }, message: { type: "string" } },
      },
    },
  },
};
`,
    },
  ];

  FIXTURES.forEach(({ input, expected }, idx) => {
    test(`fixture ${idx}`, async () => {
      const result = await generateAPITypes(input);

      const formatted = format(result, { parser: 'typescript' });

      expect(formatted).toStrictEqual(expected);
    });
  });
});
