import * as jsyaml from 'js-yaml';
import { OneSchemaDefinition } from '.';

export type GeneratePublishableSchemaInput = {
  spec: OneSchemaDefinition;
};

export type GeneratePublishableSchemaOutput = {
  /**
   * A map of filename -> file content to generate.
   */
  files: Record<string, string>;
};

export const generatePublishableSchema = ({
  spec,
}: GeneratePublishableSchemaInput): GeneratePublishableSchemaOutput => {
  const files: Record<string, string> = {
    'schema.json': JSON.stringify(spec, null, 2),
    'schema.yaml': jsyaml.dump(spec),
  };

  if (spec.Meta?.PackageJSON) {
    files['package.json'] = JSON.stringify(spec.Meta.PackageJSON, null, 2);
  }

  return { files };
};
