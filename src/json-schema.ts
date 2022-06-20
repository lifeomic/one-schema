import { JSONSchema4 } from 'json-schema';
import { deepCopy } from './generate-endpoints';

/**
 * Applies a `transform` to every node of a provided `root` JSON Schema.
 * The provided schema object is not modified.
 *
 * @param root The JSON Schema to transform.
 * @param transform The transform function to apply.
 * @returns The transformed schema.
 */
export const transformJSONSchema = (
  root: JSONSchema4,
  transform: (schema: JSONSchema4) => JSONSchema4,
): JSONSchema4 => {
  const copy = deepCopy(root);

  return deepCopy(
    transform({
      ...copy,
      properties: copy.properties
        ? Object.entries(copy.properties).reduce(
            (accum, [name, schema]) => ({
              ...accum,
              [name]: transformJSONSchema(schema, transform),
            }),
            {},
          )
        : undefined,
      items: copy.items
        ? Array.isArray(copy.items)
          ? copy.items.map((schema) => transformJSONSchema(schema, transform))
          : transformJSONSchema(copy.items, transform)
        : undefined,
      anyOf: copy.anyOf?.map((schema) =>
        transformJSONSchema(schema, transform),
      ),
      oneOf: copy.oneOf?.map((schema) =>
        transformJSONSchema(schema, transform),
      ),
      allOf: copy.allOf?.map((schema) =>
        transformJSONSchema(schema, transform),
      ),
    }),
  );
};

/**
 * "Resolves" any $ref entries within the provided `root` schema, using
 * the provided `definitions`. Returns the "resolved" version of the schema.
 *
 * @example
 * const schema = {
 *   type: 'array',
 *   items: {
 *     $ref: '#/definitions/Item'
 *   }
 * }
 *
 * const resolved = withResolvedDefinitions(
 *   schema,
 *   {
 *     Item: {
 *       type: 'string',
 *       description: 'An item'
 *     }
 *   }
 * )
 *
 * console.log(resolved)
 *
 * // {
 * //   type: 'array',
 * //   items: {
 * //     type: 'string',
 * //     description: 'An item'
 * //   }
 * // }
 */
export const withResolvedDefinitions = (
  root: JSONSchema4,
  definitions: Record<string, JSONSchema4 | undefined>,
): JSONSchema4 =>
  transformJSONSchema(root, (schema) => {
    if (!schema.$ref) {
      return schema;
    }

    const resourceName = schema.$ref.split('/')[2];
    if (!resourceName) {
      throw new Error(`Encountered an invalid ref: ${schema.$ref}`);
    }
    const resource = definitions[resourceName];
    if (!resource) {
      throw new Error(`Encountered an invalid ref: ${schema.$ref}`);
    }
    return withResolvedDefinitions(resource, definitions);
  });
