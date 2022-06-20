import { readFileSync } from 'fs';
import Ajv from 'ajv';
import { load } from 'js-yaml';
import type { JSONSchema4 } from 'json-schema';
import { OneSchemaDefinition } from '.';
import { deepCopy } from './generate-endpoints';
import { transformJSONSchema, withResolvedDefinitions } from './json-schema';

export const getPathParams = (name: string) =>
  name
    .split(' ')[1]
    .split('/')
    .filter((part) => part.startsWith(':'))
    .map((part) => part.replace(':', ''));

const ONE_SCHEMA_META_SCHEMA: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  required: ['Endpoints'],
  properties: {
    Resources: {
      type: 'object',
      patternProperties: {
        '.*': {
          // JSONSchema
          type: 'object',
        },
      },
    },
    Endpoints: {
      type: 'object',
      patternProperties: {
        '.*': {
          type: 'object',
          additionalProperties: false,
          required: ['Name', 'Response'],
          properties: {
            Name: { type: 'string', pattern: '[a-zA-Z0-9]+' },
            Request: {
              // JSONSchema
              type: 'object',
            },
            Response: {
              // JSONSchema
              type: 'object',
            },
          },
        },
      },
    },
  },
};

export const validateSchema = (spec: OneSchemaDefinition) => {
  const ajv = new Ajv();
  if (!ajv.validate(ONE_SCHEMA_META_SCHEMA, spec)) {
    throw new Error('Detected invalid schema: ' + ajv.errorsText(ajv.errors));
  }

  for (const [name, { Request }] of Object.entries(spec.Endpoints)) {
    if (Request) {
      // In order to fully validate the Request schema, we need to
      // first resolve any $refs
      const resolved = withResolvedDefinitions(Request, spec.Resources ?? {});

      // Requests must be object type.
      if (resolved.type && resolved.type !== 'object') {
        throw new Error(
          `Detected a non-object Request schema for ${name}. Request schemas must be objects.`,
        );
      }

      // Request schemas cannot have colliding path params + input properties. If they
      // do, generated clients will not work correctly.
      const collidingParam = getPathParams(name).find(
        (param) => param in (resolved.properties ?? {}),
      );
      if (collidingParam) {
        throw new Error(
          `The ${collidingParam} parameter was declared as a path parameter and a Request property for ${name}. Rename either the path parameter or the request property to avoid a collision.`,
        );
      }
    }
  }
};

/**
 * Applies a set of transforms to a OneSchema.
 *
 * The provided `transforms` are each fully completed before the next begins.
 *
 * @example
 * transformOneSchema(
 *   spec,
 *   transformA,
 *   transformB
 * )
 * // transformA is applied to the entire schema, then transformB
 * // is applied to the entire schema.
 */
const transformOneSchema = (
  spec: OneSchemaDefinition,
  ...transforms: ((schema: JSONSchema4) => JSONSchema4)[]
): OneSchemaDefinition => {
  const copy = deepCopy(spec);

  for (const transform of transforms) {
    for (const key in copy.Resources) {
      copy.Resources[key] = transformJSONSchema(copy.Resources[key], transform);
    }

    for (const key in copy.Endpoints) {
      copy.Endpoints[key].Request = transformJSONSchema(
        copy.Endpoints[key].Request ?? {},
        transform,
      );
      copy.Endpoints[key].Response = transformJSONSchema(
        copy.Endpoints[key].Response,
        transform,
      );
    }
  }

  return copy;
};

export type SchemaAssumptions = {
  /**
   * Whether to assume that `object` schema nodes should have `additionalProperties: false`.
   * If enabled, can be overriden for a particular node by just specifying `additionalProperties: true`.
   *
   * Enabled by default.
   */
  noAdditionalPropertiesOnObjects: boolean;
  /**
   * Whether to assume that `object` schema nodes should have all properties
   * required by default. If enabled, a single property can be marked as optional
   * by specifying `optional: true` on the child node. Can be overridden for an
   * entire `object` node by specifying a custom `required` list.
   *
   * Enabled by default.
   */
  objectPropertiesRequiredByDefault: boolean;
};

export const DEFAULT_ASSUMPTIONS: SchemaAssumptions = {
  noAdditionalPropertiesOnObjects: true,
  objectPropertiesRequiredByDefault: true,
};

export const withAssumptions = (
  spec: OneSchemaDefinition,
  overrides: SchemaAssumptions = DEFAULT_ASSUMPTIONS,
): OneSchemaDefinition => {
  // Deep copy, then apply assumptions.
  let copy = deepCopy(spec);

  const assumptions = { ...DEFAULT_ASSUMPTIONS, ...overrides };

  if (assumptions.noAdditionalPropertiesOnObjects) {
    copy = transformOneSchema(copy, (schema) =>
      schema.type === 'object'
        ? { additionalProperties: false, ...schema }
        : schema,
    );
  }

  if (assumptions.objectPropertiesRequiredByDefault) {
    copy = transformOneSchema(
      copy,
      (schema) =>
        schema.type === 'object' && schema.properties
          ? {
              required: Object.keys(schema.properties).filter(
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                (name) => schema.properties![name].optional !== true,
              ),
              ...schema,
            }
          : schema,
      // Prune the `optional` keywords from the schema, since they are no longer
      // needed
      (schema) => deepCopy({ ...schema, optional: undefined }),
    );
  }

  return copy;
};

export const loadSchemaFromFile = (
  filename: string,
  assumptions: SchemaAssumptions = DEFAULT_ASSUMPTIONS,
): OneSchemaDefinition => {
  let spec: any = load(readFileSync(filename, { encoding: 'utf-8' }));

  // Check if this in an introspection result. If so, grab the schema.
  if (typeof spec === 'object' && 'schema' in spec) {
    spec = spec.schema;
  }

  validateSchema(spec as OneSchemaDefinition);

  return withAssumptions(spec as OneSchemaDefinition, assumptions);
};
