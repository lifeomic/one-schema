import type { OpenAPIV3 } from 'openapi-types';
import type { EndpointDefinition, OneSchemaDefinition } from './types';
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
        for (const [name, schema] of Object.entries(Request.properties ?? {}))
          parameters.push({
            in: 'query',
            name,
            description: schema.description,
            // @ts-expect-error TS detects a mismatch between the JSONSchema types
            // between openapi-types and json-schema. Ignore and assume everything
            // is cool.
            schema: schema,
            required:
              Array.isArray(Request.required) &&
              Request.required.includes(name),
          });
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

const SUPPORTED_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

type HTTPMethod = typeof SUPPORTED_METHODS[number];

const translateOpenAPIPath = (path: string) =>
  path
    .split('/')
    .map((part) => {
      // Translate from "{param}" -> ":param"
      if (part.startsWith('{') && part.endsWith('}')) {
        return `:${part.slice(1, -1)}`;
      }
      return part;
    })
    .join('/');

const toEndpointDefinition = (
  method: HTTPMethod,
  operation: OpenAPIV3.OperationObject,
): EndpointDefinition => {
  if (!operation.operationId) {
    throw new Error('No operationId on path.');
  }

  // 1. Validate + extract the response schema.
  const successResponse = [200, 201, 202]
    .map((status) => operation.responses[status])
    .find(Boolean);

  if (!successResponse) {
    throw new Error(
      `No success response found for operation: ${operation.operationId}`,
    );
  }
  // This `as` clause was already runtime-checked above.
  const response = successResponse as OpenAPIV3.ResponseObject;
  const jsonResponse = response.content?.['application/json'];
  if (!jsonResponse?.schema) {
    throw new Error(
      `No JSON response found for operation: ${operation.operationId}`,
    );
  }

  let requestSchema: any = {};
  // 2a. Validate + extract the "request" schema for methods that use query params.
  if (method === 'get' || method === 'delete') {
    const schema = {
      type: 'object',
      properties: {} as Record<string, JSONSchema4>,
      required: [] as string[],
      additionalProperties: false,
    };

    /* istanbul ignore next */
    const parameters = (operation.parameters ?? []).filter(
      (param) => !('ref' in param),
    ) as OpenAPIV3.ParameterObject[];

    const queryParams = parameters.filter((param) => param.in === 'query');

    for (const param of queryParams) {
      schema.properties[param.name] = param.schema ?? {
        type: 'string',
        description: param.description,
      };
      if (param.required) {
        schema.required.push(param.name);
      }
    }

    requestSchema = schema;
  } else {
    // 2b. Validate + extract the "request" schema for methods that use bodies.
    if (!operation.requestBody) {
      throw new Error(
        `No request body defined for operation: ${operation.operationId}`,
      );
    }

    if (!('content' in operation.requestBody)) {
      throw new Error(
        `No request body content defined for operation: ${operation.operationId}`,
      );
    }
    const jsonRequestSchema =
      operation.requestBody.content['application/json']?.schema;
    if (!jsonRequestSchema) {
      throw new Error(
        `No JSON request body defined for operation: ${operation.operationId}`,
      );
    }
    requestSchema = jsonRequestSchema;
  }

  return {
    Name: operation.operationId,
    Description: operation.description,
    Request: requestSchema,
    Response: jsonResponse.schema,
  };
};

export const fromOpenAPISpec = (
  spec: OpenAPIV3.Document,
): OneSchemaDefinition => {
  // 1. Declare the schema document. We'll build it as we go.
  const schema: OneSchemaDefinition = {
    Resources: {},
    Endpoints: {},
  };

  for (const path in spec.paths) {
    const pathDef = spec.paths[path];
    /* istanbul ignore next */
    if (!pathDef) {
      continue;
    }

    const oneSchemaPath = translateOpenAPIPath(path);
    for (const method of SUPPORTED_METHODS) {
      const operation = pathDef[method];
      if (!operation) {
        continue;
      }
      schema.Endpoints[`${method.toUpperCase()} ${oneSchemaPath}`] =
        toEndpointDefinition(method, operation);
    }
  }

  validateSchema(schema);

  return schema;
};
