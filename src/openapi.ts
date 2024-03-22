import type { OpenAPIV3 } from 'openapi-types';
import type { OneSchemaDefinition } from './types';
import { deepCopy } from './generate-endpoints';
import { validateSchema } from './meta-schema';
import { JSONSchema4 } from 'json-schema';

/**
 * Converts e.g. `/users/:id/profile` to `/users/{id}/profile`.
 */
const toOpenAPIPathParts = (koaPath: string) =>
  koaPath
    .split('/')
    .map((part) => (part.startsWith(':') ? `{${part.slice(1)}}` : part))
    .join('/');

const getPathParameters = (koaPath: string) =>
  koaPath
    .split('/')
    .filter((part) => part.startsWith(':'))
    .map((part) => part.slice(1));

const toQueryParam = (
  item: JSONSchema4,
  name: string,
  schema: JSONSchema4,
) => ({
  in: 'query',
  name,
  description: schema.description,
  schema: schema,
  required: Array.isArray(item.required) && item.required.includes(name),
});

export const toOpenAPISpec = (
  schema: OneSchemaDefinition,
  config: {
    info: OpenAPIV3.InfoObject;
  },
): OpenAPIV3.Document => {
  validateSchema(schema);

  // 1. Declare the document. We'll build it as we go.
  const openAPIDocument: OpenAPIV3.Document = {
    openapi: '3.0.0',
    info: config.info,
    components: {},
    paths: {},
  };

  // 2. Set the Resources in the `components` field, and convert the schema's
  // `definitions` references to use OpenAPI's components instead.

  const { Resources, Endpoints }: OneSchemaDefinition = JSON.parse(
    JSON.stringify(schema).replace(/#\/definitions/g, '#/components/schemas'),
  );
  // @ts-expect-error TS detects a mismatch between the JSONSchema types
  // between openapi-types and json-schema. Ignore and assume everything
  // is cool.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  openAPIDocument.components!.schemas = Resources;

  for (const [
    endpoint,
    { Name, Description, Request, Response },
  ] of Object.entries(Endpoints)) {
    const [method, path] = endpoint.split(' ');

    const operation: OpenAPIV3.OperationObject = {
      operationId: Name,
      description: Description,
      responses: {
        '200': {
          description: 'A successful response',
          content: {
            'application/json': {
              // @ts-expect-error TS detects a mismatch between the JSONSchema types
              // between openapi-types and json-schema. Ignore and assume everything
              // is cool.
              schema: Response,
            },
          },
        },
      },
    };

    const parameters: OpenAPIV3.ParameterObject[] = getPathParameters(path).map(
      (name) => ({
        name,
        in: 'path',
        schema: { type: 'string' },
        required: true,
      }),
    );

    if (Request) {
      if (['GET', 'DELETE'].includes(method)) {
        // Add the query parameters for GET/DELETE methods
        for (const [name, schema] of Object.entries(Request.properties ?? {})) {
          // @ts-expect-error TS detects a mismatch between the JSONSchema types
          // between openapi-types and json-schema. Ignore and assume everything
          // is cool.
          parameters.push(toQueryParam(Request, name, schema));
        }

        for (const item of Request.allOf ?? []) {
          for (const [name, schema] of Object.entries(item.properties ?? {})) {
            // @ts-expect-error TS detects a mismatch between the JSONSchema types
            // between openapi-types and json-schema. Ignore and assume everything
            // is cool.
            parameters.push(toQueryParam(item, name, schema));
          }
        }
      } else {
        // Add the body spec parameters for non-GET/DELETE methods
        operation.requestBody = {
          content: {
            'application/json': {
              // @ts-expect-error TS detects a mismatch between the JSONSchema types
              // between openapi-types and json-schema. Ignore and assume everything
              // is cool.
              schema: Request,
            },
          },
        };
      }
    }

    if (parameters.length) {
      operation.parameters = parameters;
    }

    const openAPIPath = toOpenAPIPathParts(path);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    openAPIDocument.paths![openAPIPath] = {
      // Spread existing, in case there are multiple methods for a single route.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      ...openAPIDocument.paths![openAPIPath],
      [method.toLowerCase()]: operation,
    };
  }

  // This deep copy ensures that we don't prune any `undefined` values from the object.
  return deepCopy(openAPIDocument);
};
