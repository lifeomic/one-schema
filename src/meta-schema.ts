import { readFileSync } from 'fs';
import Ajv from 'ajv';
import { load } from 'js-yaml';
import type { JSONSchema4 } from 'json-schema';
import { OneSchemaDefinition } from '.';
import { deepCopy } from './generate-endpoints';
import { transformJSONSchema } from './json-schema';

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
          required: ['Name', 'Request', 'Response'],
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
  for (const [name, { Request }] of Object.entries(spec.Endpoints)) {
    // Requests must be object type.
    if (Request.type && Request.type !== 'object') {
      throw new Error(
        `Detected a non-object Request schema for ${name}. Request schemas must be objects.`,
      );
    }

    const collidingParam = getPathParams(name).find(
      (param) => param in (Request.properties ?? {}),
    );

    if (collidingParam) {
      throw new Error(
        `The ${collidingParam} parameter was declared as a path parameter and a Request property for ${name}. Rename either the path parameter or the request property to avoid a collision.`,
      );
    }
  }
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
  const copy = deepCopy(spec);

  const assumptions = { ...DEFAULT_ASSUMPTIONS, ...overrides };

  if (assumptions.noAdditionalPropertiesOnObjects) {
    const transform = (schema: JSONSchema4) =>
      schema.type === 'object'
        ? { additionalProperties: false, ...schema }
        : schema;

    for (const key in copy.Resources) {
      copy.Resources[key] = transformJSONSchema(copy.Resources[key], transform);
    }
    for (const key in copy.Endpoints) {
      copy.Endpoints[key].Request = transformJSONSchema(
        copy.Endpoints[key].Request,
        transform,
      );
      copy.Endpoints[key].Response = transformJSONSchema(
        copy.Endpoints[key].Response,
        transform,
      );
    }
  }

  if (assumptions.objectPropertiesRequiredByDefault) {
    const transform = (schema: JSONSchema4) =>
      schema.type === 'object' && schema.properties
        ? {
            required: Object.keys(schema.properties).filter(
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              (name) => schema.properties![name].optional !== true,
            ),
            ...schema,
          }
        : schema;

    for (const key in copy.Resources) {
      copy.Resources[key] = transformJSONSchema(copy.Resources[key], transform);
    }
    for (const key in copy.Endpoints) {
      copy.Endpoints[key].Request = transformJSONSchema(
        copy.Endpoints[key].Request,
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

export const loadSchemaFromFile = (
  filename: string,
  assumptions: SchemaAssumptions = DEFAULT_ASSUMPTIONS,
): OneSchemaDefinition => {
  const spec = load(readFileSync(filename, { encoding: 'utf-8' }));

  const ajv = new Ajv();
  if (!ajv.validate(ONE_SCHEMA_META_SCHEMA, spec)) {
    throw new Error('Detected invalid schema: ' + ajv.errorsText(ajv.errors));
  }

  validateSchema(spec as OneSchemaDefinition);

  return withAssumptions(spec as OneSchemaDefinition, assumptions);
};
