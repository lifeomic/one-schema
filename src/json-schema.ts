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
