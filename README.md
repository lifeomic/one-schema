This package generates helpful client-side and server-side TypeScript code using simple schemas.

The package also supports generating [OpenAPI](https://www.openapis.org/) schemas using the simple schema format.

## Installation

```
yarn add @lifeomic/one-schema
```

## Usage

First, define an API schema file. Schemas look like this:

```yml
# 'Resources' are just JSONSchema definitions that can be shared
# across your endpoints.
Resources:
  Item:
    type: object
    properties:
      id:
        description: The item's unique identifier.
        type: string
      label:
        description: The item's label.
        type: string

# Endpoints is a map of all your endpoints to request + response schemas
Endpoints:
  PUT /items/:id:
    Name: upsertItem
    Request:
      type: object
      properties:
        label: { type: string }
    Response:
      $ref: '#/definitions/Item'

  GET /items/:id:
    Name: getItemById
    Response:
      $ref: '#/definitions/Item'

  GET /items:
    Name: listItems
    Request:
      type: object
      properties:
        filter: { type: string }
    Response:
      type: array
      items:
        $ref: '#/definitions/Item'
```

### Defining Endpoints

Let's look at one endpoint from the schema above, and break down its parts:

```yaml
PUT /items/:id:
  Name: upsertItem
  Request:
    type: object
    properties:
      label: { type: string }
  Response:
    $ref: '#/definitions/Item'
```

- The `PUT /items/:id` key uniquely identifies this endpoint using Koa-style route syntax.

- The `Name` entry is a human-readable name for the endpoint. Every endpoint must have a `Name`
  entry. This value is used for generating nice clients for the application. It should be alphanumeric
  and camelCased.

- The `Request` entry is a JSONSchema definition that describes a valid request object. `Request`
  schemas are optional for `GET` and `DELETE` endpoints.

- The `Response` entry is a JSONSchema definition that describes the response that this endpoint
  returns to clients.

#### Query Parameters

Let's look at another example from the schema above:

```yaml
GET /items:
  Name: listItems
  Request:
    type: object
    properties:
      filter: { type: string }
  Response:
    type: array
    items:
      $ref: '#/definitions/Item'
```

Defining a `Request` schema for a `GET` or `DELETE` request will cause that schema to be applied
against the request's _query parameters_.

The schema will be checked against Koa's runtime representation of the query parameters. So, these
assumptions should be kept in mind:

- The `Request` schema _must_ be an `object` type JSON schema.
- All of the `properties` entries in the schema should validate against `string`-like types. Koa does
  not support parsing query parameters as `number` values, for example.

### API Type Generation

Use the `generate-api-types` command to generate helpful types to use for server-side input validation.

```
one-schema generate-api-types \
  --schema schema.yml \
  --output generated-api.ts
```

If you're building a Koa app, you can use these generated types with the `implementSchema` function to provide a type-safe interface for implementing your API specification:

```typescript
// app.ts
import Koa from 'koa';
import Router from '@koa/router';

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
    'POST /items': (ctx) => {
      // `ctx.request.body` is well-typed and has been run-time validated.
      console.log(ctx.request.body.label);

      // TypeScript enforces that this matches the `Response` schema.
      return { id: '123', label: 'test label' };
    },
    'GET /items': (ctx) => {
      // `ctx.request.query` is well-typed and has been run-time validated
      console.log(ctx.request.query.filter);

      // TypeScript enforces that this matches the `Response` schema.
      return [{ id: '123', label: 'test label' }];
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
  --from lambda://my-service:deployed/private/introspection \
  --output src/schemas/my-service.json
```

Then, use the `generate-axios-client` command to generate a nicely typed Axios-based client from the schema.

```
one-schema generate-axios-client \
  --schema src/schemas/my-service.json \
  --output generated-client.ts \
  --name MyService
```

This command will output two files:

- `generated-client.js`
- `generated-client.d.ts`

How to use the generated client:

```typescript
import axios from 'axios';
import { MyService } from './generated-client';

// Provide any AxiosInstance, customized to your needs.
const client = new MyService(axios.create({ baseURL: 'https://my.api.com/' }));

const response = await client.upsertItem({
  label: 'some-label',
});

console.log(response.data);
// {
//   id: 'some-id',
//   label: 'some-label'
// }

const response = await client.listItems({
  filter: 'some-filter',
});

console.log(response.data);
// [
//   {
//     id: 'some-id',
//     label: 'some-label'
//   },
//   ...
// ]
```

#### Pagination

The generated client provides a built-in helper for reading from paginated LifeOmic APIs:

```yaml
# Example endpoint
Name: listPaginatedItems
Request:
  type: object
  properties:
    filter:
      type: string
      optional: true
    nextPageToken:
      type: string
      optional: true
    pageSize:
      type: string
      optional: true
Response:
  type: object
  properties:
    items:
      $ref: '#/definitions/Item'
    links:
      type: object
      properties:
        self:
          type: string
        next:
          type: string
          optional: true
```

```typescript
// Usage
const result = await client.paginate(client.listPaginatedItems, {
  filter: '...',
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

### Schema Assumptions

`one-schema` provides a set of JSONSchema assumptions to help simplify Request/Response JSONSchema entries in commonly desired ways.

These assumptions are described by the `SchemaAssumptions` type in [`src/meta-schema.ts`](src/meta-schema.ts) and can be individually or wholly disabled in the Node API and at the command line via the `--asssumptions` flag.

By default, all assumptions are applied.

#### noAdditionalPropertiesOnObjects

Enabling this assumption will automatically add `additionalProperties: false` to all `object` JSONSchemas. Example:

```yaml
PUT /items/:id:
  Request:
    type: object
    properties:
      label:
        type: string

# Automatically interpreted as:
PUT /items/:id:
  Request:
    type: object
    additionalProperties: false
    properties:
      label:
        type: string
```

#### objectPropertiesRequiredByDefault

Enabling this assumption will automatically add mark every object property as "required", unless that property's schema has `optional: true` defined. Example:

```yaml
PUT /items/:id:
  Request:
    type: object
    properties:
      label:
        type: string
      title:
        type: string
        optional: true

# Automatically interpreted as:
PUT /items/:id:
  Request:
    type: object
    required:
      - label
    properties:
      label:
        type: string
      title:
        type: string
```
