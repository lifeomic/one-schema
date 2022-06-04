This package generates helpful client-side and server-side TypeScript code using simple schemas.

The package also supports generating [OpenAPI](https://www.openapis.org/) schemas using the simple schema format.

## Installation

```
yarn add @lifeomic/one-schema
```

## Usage

First, define an API schema file. Schemas look like this:

```yml
# schema.yml
Resources:
  Post:
    type: 'object'
    properties:
      id:
        description: The post's unique identifier.
        type: string
      message:
        description: The post message.
        type: string
Endpoints:
  POST /posts:
    Name: createPost
    Request:
      type: 'object'
      properties:
        message: { type: string }
    Response:
      $ref: '#/definitions/Post'
  GET /posts:
    Name: listPosts
    Request:
      type: object
      properties:
        filter: { type: string }
    Response:
      type: array
      items:
        $ref: '#/definitions/Post'
```

### API Type Generation

Use the `generate-api-types` command to generate helpful types to use for server-side input validation.

```
one-schema generate-api-types \
  --schema schema.yml \
  --output generated-api.ts \
  --format
```

The output (in `generated-api.ts`):

```typescript
/* eslint-disable */
import type { OneSchema } from '@lifeomic/one-schema';

export type Endpoints = {
  'POST /posts': {
    Request: {
      message: string;
    };
    PathParams: {};
    Response: Post;
  };
  'GET /posts': {
    Request: {
      filter: string;
    };
    PathParams: {};
    Response: Post[];
  };
};

export type Post = {
  /**
   * The post's unique identifier.
   */
  id: string;
  /**
   * The post message.
   */
  message: string;
};

export const Schema: OneSchema<Endpoints> = {
  // ... the full schema definition, as a JavaScript object.
};
```

If you're building a Koa app, you can use these generated types with the `implementSchema` function to provide a type-safe interface for implementing your API specification:

```typescript
// app.ts
import Koa from 'koa';
import Router from 'koa-router';

import { implementSchema } from '@lifeomic/one-schema';

import { Schema } from './generated-api';

const router = new Router();

implementSchema(Schema, {
  on: router,
  parse: (ctx, { schema, data }) => {
    // validate that `data` matches `schema`, using whatever
    // library you like, and return the parsed response.

    return data;
  },
  implementation: {
    'POST /posts': (ctx) => {
      // `ctx.request.body` is well-typed and has been run-time validated.
      console.log(ctx.request.body.message);

      // TypeScript enforces that this matches the `Response` schema.
      return { id: '123', message: 'test message' };
    },
    'GET /posts': (ctx) => {
      // `ctx.request.query` is well-typed and has been run-time validated
      console.log(ctx.request.query.filter);

      // TypeScript enforces that this matches the `Response` schema.
      return [{ id: '123', message: 'test message' }];
    },
  },
  introspection: {
    route: '/private/introspection',
    serviceVersion: process.env.LIFEOMIC_BUILD_ID!,
  },
});

const server = new Koa()
  .use(router.routes())
  .use(router.allowedMethods())
  .listen();
```

### Axios Client Generation

Projects that want to safely consume a service that uses `one-schema` can perform introspection using `fetch-remote-schema`.

```
one-schema fetch-remote-schema \
  --url lambda://my-service:deployed/private/introspection \
  --output src/schemas/my-service.json
```

Then, use the `generate-axios-client` command to generate a nicely typed Axios-based client from the schema.

```
one-schema generate-axios-client \
  --schema src/schemas/my-service.json \
  --output generated-client.ts \
  --format
```

This command will output two files:

- `generated-client.js`
- `generated-client.d.ts`

How to use the generated client:

```typescript
import axios from 'axios';
import { Client } from './generated-client';

// Provide any AxiosInstance, customized to your needs.
const client = new Client(axios.create({ baseURL: 'https://my.api.com/' }));

const response = await client.createPost({
  message: 'some-message',
});

console.log(response.data);
// {
//   id: 'some-id',
//   message: 'some-message'
// }

const response = await client.listPosts({
  filter: 'some-filter',
});

console.log(response.data);
// [
//   {
//     id: 'some-id',
//     message: 'some-message'
//   },
//   ...
// ]
```

#### Pagination

The generated client provides a built-in helper for reading from paginated LifeOmic APIs:

```yaml
# Example endpoint
Name: listPaginatedPosts
Request:
  type: object
  properties:
    filter: { type: string }
    nextPageToken: { type: string }
    pageSize: { type: string }
Response:
  type: object
  properties:
    items:
      $ref: '#/definitions/Post'
    links:
      type: object
      properties:
        self: { type: string }
        next: { type: string }
```

```typescript
// Usage
const result = await client.paginate(client.listPaginatedPosts, {
  filter: '...',
  pageSize: '10',
});

result.length; // result is the fully-paginated list of posts
```

### OpenAPI Spec generation

Use the `generate-open-api-spec` command to generate an OpenAPI spec from a simple schema, which may be useful for interfacing with common OpenAPI tooling.

```
one-schema generate-open-api-spec \
  --schema schema.yml \
  --output openapi-schema.json \
  --apiVersion "1.0.0" \
  --apiTitle "Simple API" \
  --format
```

The output (in `generated-openapi-schema.json`):

```json
{
  "openapi": "3.1.0",
  "info": {
    "version": "Simple API",
    "title": "Simple API"
  },
  "components": {
    "schemas": {
      "Post": {
        "additionalProperties": false,
        "properties": {
          "id": {
            "description": "The post's unique identifier.",
            "type": "string"
          },
          "message": {
            "description": "The post message.",
            "type": "string"
          }
        },
        "required": ["id", "message"]
      }
    }
  },
  "paths": {
    "/posts": {
      "post": {
        "operationId": "createPost",
        "responses": {
          "200": {
            "description": "TODO",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Post"
                }
              }
            }
          }
        },
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "message": {
                    "type": "string"
                  }
                },
                "required": ["message"]
              }
            }
          }
        }
      },
      "get": {
        "operationId": "listPosts",
        "responses": {
          "200": {
            "description": "TODO",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Post"
                  }
                }
              }
            }
          }
        },
        "parameters": [
          {
            "in": "query",
            "name": "filter",
            "schema": {
              "type": "string"
            },
            "required": true
          }
        ]
      }
    }
  }
}
```

### Schema Assumptions

`one-schema` provides a set of JSONSchema assumptions to help simplify Request/Response JSONSchema entries in commonly desired ways.

These assumptions are described by the `SchemaAssumptions` type in [`src/meta-schema.ts`](src/meta-schema.ts) and can be individually or wholly disabled in the Node API and at the command line via the `--asssumptions` flag.

By default, all assumptions are applied.

#### noAdditionalPropertiesOnObjects

Enabling this assumption will automatically add `additionalProperties: false` to all `object` JSONSchemas. Example:

```yaml
PUT /posts/:id:
  Request:
    type: object
    properties:
      message:
        type: string

# Automatically interpreted as:
PUT /posts/:id:
  Request:
    type: object
    additionalProperties: false
    properties:
      message:
        type: string
```

#### objectPropertiesRequiredByDefault

Enabling this assumption will automatically add mark every object property as "required", unless that property's schema has `optional: true` defined. Example:

```yaml
PUT /posts/:id:
  Request:
    type: object
    properties:
      message:
        type: string
      title:
        type: string
        optional: true

# Automatically interpreted as:
PUT /posts/:id:
  Request:
    type: object
    required:
      - message
    properties:
      message:
        type: string
      title:
        type: string
```
