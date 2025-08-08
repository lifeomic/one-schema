import { describe, expect, test } from 'vitest';
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
            'DELETE /posts/:id': {
              Name: 'deletePost',
              Response: {},
              // Test no Request field
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
    Request: {
      input?: string;
    };
    PathParams: {};
    Response: {
      output?: string;
    };
  };
  "DELETE /posts/:id": {
    Request: unknown;
    PathParams: {
      id: string;
    };
    Response: unknown;
  };
  "PUT /posts/:id": {
    Request: {
      message: string;
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

export const Schema: OneSchema<Endpoints> = {
  Resources: {},
  Endpoints: {
    "GET /posts": {
      Name: "getPosts",
      Request: {
        type: "object",
        additionalProperties: false,
        properties: { input: { type: "string" } },
      },
      Response: {
        type: "object",
        additionalProperties: false,
        properties: { output: { type: "string" } },
      },
    },
    "DELETE /posts/:id": { Name: "deletePost", Response: {} },
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
    {
      input: {
        spec: {
          Resources: {
            Fruit: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'price'],
              properties: {
                name: { type: 'string' },
                price: { type: 'number' },
              },
            },
            // This resource is not referenced by any endpoint, but should be
            // included in the generated types.
            Pet: {
              type: 'object',
              // type-level comments should be preserved.
              description: 'A pet from the animal kingdom.',
              additionalProperties: false,
              required: ['name', 'age', 'species'],
              properties: {
                name: {
                  type: 'string',
                  // field-level comments should be preserved.
                  description: 'The name of the pet as given by the owner.',
                },
                age: { type: 'number' },
                species: { type: 'string' },
              },
            },
          },
          Endpoints: {
            'GET /fruits': {
              Name: 'getPosts',
              Description: 'Fetches an array of all fruits.',
              Request: {},
              Response: {
                type: 'array',
                items: {
                  $ref: '#/definitions/Fruit',
                },
              },
            },
          },
        },
      },
      expected: `/* eslint-disable */
import type { OneSchema } from "@lifeomic/one-schema";

export type Endpoints = {
  /**
   * Fetches an array of all fruits.
   */
  "GET /fruits": {
    Request: unknown;
    PathParams: {};
    Response: Fruit[];
  };
};

export type Fruit = {
  name: string;
  price: number;
};
/**
 * A pet from the animal kingdom.
 */
export type Pet = {
  /**
   * The name of the pet as given by the owner.
   */
  name: string;
  age: number;
  species: string;
};

export const Schema: OneSchema<Endpoints> = {
  Resources: {
    Fruit: {
      type: "object",
      additionalProperties: false,
      required: ["name", "price"],
      properties: { name: { type: "string" }, price: { type: "number" } },
    },
    Pet: {
      type: "object",
      description: "A pet from the animal kingdom.",
      additionalProperties: false,
      required: ["name", "age", "species"],
      properties: {
        name: {
          type: "string",
          description: "The name of the pet as given by the owner.",
        },
        age: { type: "number" },
        species: { type: "string" },
      },
    },
  },
  Endpoints: {
    "GET /fruits": {
      Name: "getPosts",
      Description: "Fetches an array of all fruits.",
      Request: {},
      Response: { type: "array", items: { $ref: "#/definitions/Fruit" } },
    },
  },
};
`,
    },
  ];

  FIXTURES.forEach(({ input, expected }, idx) => {
    test(`fixture ${idx}`, async () => {
      const result = await generateAPITypes(input);

      const formatted = await format(result, { parser: 'typescript' });

      expect(formatted).toStrictEqual(expected);
    });
  });
});
