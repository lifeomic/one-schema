### YAML Schema Flow (deprecated)

Schemas can be also defined using a YAML file + a codegen step.

First, define an API schema file. Schemas look like this:

```yml
# schema.yml
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

Endpoints:
  PUT /items/:id:
    Name: upsertItem
    Description: |
      Upserts the specified item.

      This description can be long and multiline. It can even include **markdown**!
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
  Description: |
    Upserts the specified item.

    This description can be long and multiline. It can even include **markdown**!
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

- The `Description` entry is a long-form Markdown-compatible description of how the endpoint works.
  This description will be generated into JSDoc in generated code.

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

By default, `implementSchema` will perform input validation on all of your routes, using the defined `Request` schemas.
To customize this input validation, specify a `parse` function:

```typescript
implementSchema(Schema, {
  // ...
  parse: (ctx, { endpoint, schema, data }) => {
    // Validate `data` against the `schema`.
    // If the data is valid, return it, otherwise throw.
  },
});
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
