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
```

Next, run some generation.

### Axios Client Generation

Use the `generate-axios-client` command to generate a nicely typed Axios-based client.

```
one-schema generate-axios-client \
  --schema schema.yml \
  --output generated-client.ts \
  --format
```

The output (in `generated-client.ts`):

```typescript
/* eslint-disable */
import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

export type Endpoints = {
  'POST /posts': {
    Request: {
      message: string;
    };
    Response: Post;
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

// ... various helpers ...

export class Client {
  constructor(private readonly client: AxiosInstance) {}

  createPost(
    data: Endpoints['POST /posts']['Request'],
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<Endpoints['POST /posts']['Response']>> {
    return this.client.request({
      ...config,
      method: 'POST',
      data: removePathParams('/posts', data),
      url: substituteParams('/posts', data),
    });
  }
}
```

Usage:

```typescript
import axios from 'axios';
import { Client } from './generated-client.ts';

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
    Response: Post;
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

import { Schema } from './generated-api.ts';

const router = new Router();

implementSchema(Schema, {
  on: router,
  parse: (ctx, endpoint, schema, data) => {
    // validate that `data` matches `schema`, using whatever
    // library you like, and return the parsed response.
  },
  implementation: {
    'POST /posts': (ctx) => {
      // `ctx.request.body` is well-typed and has been run-time-validated.
      console.log(ctx.request.body.message);

      // TypeScript enforces that this matches the `Response` schema.
      return { id: '123', message: 'test message' };
    },
  },
});

const server = new Koa()
  .use(router.routes())
  .use(router.allowedMethods())
  .listen();
```

### Distributing Schemas

Use the `generate-publishable-schema` command in concert with the `Meta.PackageJSON` entry to generate a ready-to-publish NPM artifact containing the schema.

```yaml
# schema.yml
Meta:
  PackageJSON:
    name: desired-package-name
    description: A description of the package
    # ... any other desired package.json values
# ...
```

```bash
one-schema generate-publishable \
  --schema schema.yml \
  --output output-directory
```

The `output-directory` will have this file structure:

```
output-directory/
  package.json
  schema.json
  schema.yaml
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
      }
    }
  }
}
```

### Schema Assumptions

`one-schema` provides a set of JSONSchema assumptions to help simplify Request/Response JSONSchema entries in commonly desired ways.

These assumptions are described by the `SchemaAssumptions` type in [`src/meta-schema.ts`](src/meta-schema.ts) and can be individually or wholly disabled in the Node API and at the command line via the `--asssumptions` flag.
