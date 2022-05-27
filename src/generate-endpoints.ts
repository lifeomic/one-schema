import { JSONSchema4 } from 'json-schema';
import { compile } from 'json-schema-to-typescript';
import { OneSchemaDefinition } from '.';
import { getPathParams } from './meta-schema';

export const deepCopy = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

/**
 * Generates input + output types for the provided schema. Returns a
 * string of TypeScript source code.
 */
export const generateEndpointTypes = async ({
  Resources,
  Endpoints,
}: OneSchemaDefinition) => {
  const masterSchema: JSONSchema4 = Object.entries(Endpoints).reduce(
    (accum, [key, { Request, Response }]) => ({
      ...accum,
      properties: {
        ...accum.properties,
        [key]: {
          type: 'object',
          additionalProperties: false,
          required: ['Request', 'PathParams', 'Response'],
          properties: {
            Request,
            PathParams: {
              type: 'object',
              additionalProperties: false,
              required: getPathParams(key),
              properties: getPathParams(key).reduce(
                (accum, name) => ({
                  ...accum,
                  [name]: { type: 'string' },
                }),
                {},
              ),
            },
            Response,
          },
        },
      },
    }),
    {
      definitions: Resources,
      title: 'Endpoints',
      type: 'object',
      additionalProperties: false,
      properties: {},
      required: Object.keys(Endpoints),
    } as JSONSchema4,
  );

  // Unfortunately, compile(...) mutates the input object. So, deep copy.
  return (
    (
      await compile(deepCopy(masterSchema), '', {
        format: false,
        bannerComment: '',
      })
    )
      /**
       * Currently, our json-schema-to-typescript version (10.1.4) does not support configuring
       * interface vs. type generation.
       *
       * This caused problems for us in at least one case, and generally allows for unintentional
       * type merging. so, just replace them all.
       *
       * Relevant GitHub issue in json-schema-to-typescript:
       * https://github.com/bcherny/json-schema-to-typescript/issues/307
       */
      .replace(/export interface ([a-zA-Z]+) \{/g, (matched) => {
        const name = matched.split(' ')[2];
        return `export type ${name} = {`;
      })
  );
};
