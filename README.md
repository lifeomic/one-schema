Build end-to-end typesafe REST APIs using TypeScript.

## Getting Started

```shell
yarn add @lifeomic/one-schema @koa/router axios zod
```

**Note**: The `@koa/router`, `axios`, and `zod` packages are peer dependencies of
`@lifeomic/one-schema` and must be installed separately.

## Usage

At a high level, `one-schema` provides end-to-end type safety via the following simple workflow.

- In your service repo, use `OneSchemaRouter` to declare your routes.
- Deploy new service code.
- In your client repo, "introspect" your deployed schema using `one-schema fetch-remote-schema`.
- In your client repo, generate a type-safe client from this^ introspected schema using `one-schema generate-axios-client`.

**Note**: for documentation on the legacy flow of defining schemas in a YAML file, see [the legacy docs](./docs/yaml-flow.md).

### Declaring API Routes

First, declare + implement your API routes using `OneSchemaRouter`. Use [`zod`](https://github.com/colinhacks/zod) to define your request + response schemas.

```typescript
import Router from '@koa/router';
import { OneSchemaRouter } from '@lifeomic/one-schema';
import { z } from 'zod';

const router = OneSchemaRouter.create({
  using: new Router(),
  introspection: {
    route: '/private/introspection',
    serviceVersion: process.env.LIFEOMIC_SERVICE_VERSION,
  },
})
  .declare({
    route: 'POST /items',
    name: 'createItem',
    request: z.object({ message: z.string() }),
    response: z.object({ id: z.string(), message: z.string() }),
  })
  .declare({
    route: 'GET /items/:id',
    name: 'getItemById',
    request: z.object({ filter: z.string() }),
    response: z.object({ id: z.string(), message: z.string() }),
  });

// Be sure to expose your router's routes on a Koa app.
import Koa from 'koa';

const app = new Koa().use(router.middleware());

app.listen();
```

In case the main router requires authorization headers, and you want to query the introspection route without them, you can expose it on a custom router
like so:

```typescript
const router = OneSchemaRouter.create({
  using: new Router(),
  introspection: {
    route: '/introspection',
    router: new Router({ prefix: '/private' }),
    serviceVersion: process.env.LIFEOMIC_SERVICE_VERSION,
  },
})
  .declare({
    route: 'POST /items',
    name: 'createItem',
    request: z.object({ message: z.string() }),
    response: z.object({ id: z.string(), message: z.string() }),
  })
  .declare({
    route: 'GET /items/:id',
    name: 'getItemById',
    request: z.object({ filter: z.string() }),
    response: z.object({ id: z.string(), message: z.string() }),
  });
```

Once you have routes declared, add implementations for each route. Enjoy perfect type inference and auto-complete for path parameters, query parameters, and the request body.

```typescript
router
  .implement('POST /items', async (ctx) => {
    ctx.request.body; // { message: string }
    return { id: 'some-id', message: ctx.request.body.message };
  })
  .implement('GET /items/:id', async (ctx) => {
    ctx.request.query; // { filter: string }
    ctx.params; // { id: string }
    return { id: 'some-id', message:'some-id' };
  })
});
```

### Generating Type-Safe Clients

#### From the Same Project

Generating a type-safe client for use in the same project the API was defined in is straightforward, using `OneSchemaRouter.client(axios: AxiosInstance)`.

```typescript
import axios from 'axios';

// `router` is your previously defined one-schema router.
const client = router.client(
  axios.create({
    baseURL: 'https://my.api.com/',
    headers: {
      // ...any needed headers e.g. LifeOmic-Account
    },
  }),
);

// client is now a type-safe client for the API e.g.:
await client.createItem({ message: 'some-message' });

const response = await client.getItemById({ id: 'some-id' });

response.data; // { id: 'some-id', message: 'some-message' }
```

#### From a Different Project

To generate a type-safe client for this new API, we need to:

1. Introspect the deployed schema using the `one-schema` CLI. Commit this file.
2. Generate a client using the introspected schema + the `one-schema` CLI.

```sh
one-schema fetch-remote-schema \
  --from lambda://my-service:deployed/private/introspection \
  --output src/schemas/my-service.json
```

Then, use the `generate-axios-client` command to generate a nicely typed Axios-based client from the schema.

```sh
one-schema generate-axios-client \
  --schema src/schemas/my-service.json \
  --output generated-client.ts \
  --name MyService
```

Now, use the generated client:

```typescript
import axios from 'axios';
import { MyService } from './generated-client';

// Provide any AxiosInstance, customized to your needs.
const client = new MyService(axios.create({ baseURL: 'https://my.api.com/' }));

// The client has named methods for interacting with each API endpoint.

const response = await client.createItem({
  message: 'some-message',
});

console.log(response.data);
// {
//   id: 'some-id',
//   message: 'some-message'
// }

const response = await client.getItemById({
  id: 'some-id',
  filter: 'some-filter',
});

console.log(response.data);
// {
//   id: 'some-id',
//   message: 'some-message'
// }
```

#### Pagination

The generated client provides a built-in helper for reading from paginated LifeOmic APIs:

```typescript
// example endpoint
router.declare({
  route: 'GET /items',
  name: 'listItems',
  request: z.object({
    nextPageToken: z.string(),
    pageSize: z.string(),
  }),
  response: z.object({
    items: z.array(
      z.object({ id: z.string().optional(), message: z.string().optional() }),
    ),
    links: z.object({
      self: z.string(),
      next: z.string().optional(),
    }),
  }),
});
```

```typescript
// Automatically paginate using the client.
const result = await client.paginate(client.listPaginatedItems, {
  pageSize: '10',
});

result.length; // result is the fully-paginated list of items
```

### OpenAPI Spec generation

Use the `generate-open-api-spec` command to generate an OpenAPI spec from a simple schema, which may be useful for interfacing with common OpenAPI tooling.

```
one-schema generate-open-api-spec \
  --schema schema.yml \
  --output openapi-schema.json \
  --apiVersion "1.0.0" \
  --apiTitle "Simple API"
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
      "Item": {
        "additionalProperties": false,
        "properties": {
          "id": {
            "description": "The item's unique identifier.",
            "type": "string"
          },
          "label": {
            "description": "The item label.",
            "type": "string"
          }
        },
        "required": ["id", "label"]
      }
    }
  },
  "paths": {
    "/items": {
      "item": {
        "operationId": "createItem",
        "responses": {
          "200": {
            "description": "TODO",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Item"
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
                  "label": {
                    "type": "string"
                  }
                },
                "required": ["label"]
              }
            }
          }
        }
      },
      "get": {
        "operationId": "listItems",
        "responses": {
          "200": {
            "description": "TODO",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Item"
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

## CLI Reference

For a full list of API commands and details on usage, run `one-schema --help`.

## API Reference

See the in-line documentation in the source code + package for details on the exposed APIs.
