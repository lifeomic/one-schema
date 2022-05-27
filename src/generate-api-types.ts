import { OneSchemaDefinition } from '.';
import { generateEndpointTypes } from './generate-endpoints';
import { validateSchema } from './meta-schema';

export type GenerateAPITypesInput = {
  spec: OneSchemaDefinition;
};

export const generateAPITypes = async ({
  spec,
}: GenerateAPITypesInput): Promise<string> => {
  validateSchema(spec);
  return [
    '/* eslint-disable */',
    `
    import type { OneSchema } from "@lifeomic/one-schema";
    `,
    '',
    await generateEndpointTypes(spec),
    '',
    `
    export const Schema: OneSchema<Endpoints> = ${JSON.stringify(spec)};
    `,
  ]
    .map((s) => s.trim())
    .join('\n');
};
