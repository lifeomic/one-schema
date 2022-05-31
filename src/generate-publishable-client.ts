import { OneSchemaDefinition } from '.';
import { generateAxiosClient } from './generate-axios-client';
import { generatePublishableSchema } from './generate-publishable-schema';

export type GeneratePublishableClientInput = {
  spec: OneSchemaDefinition;
  outputClass: string;
};

export type GeneratePublishableClientOutput = {
  /**
   * A map of filename -> file content to generate.
   */
  files: Record<string, string>;
};

export const generatePublishableClient = async ({
  spec,
  outputClass,
}: GeneratePublishableClientInput): Promise<GeneratePublishableClientOutput> => {
  const { files: baseFiles } = generatePublishableSchema({ spec });

  const { declaration, javascript } = await generateAxiosClient({
    spec,
    outputClass,
  });

  const files: Record<string, string> = {
    ...baseFiles,
    'index.js': javascript,
    'index.d.ts': declaration,
  };

  if (files['package.json']) {
    files['package.json'] = JSON.stringify(
      {
        ...JSON.parse(files['package.json']),
        main: 'index.js',
        peerDependencies: {
          axios: '*',
        },
      },
      null,
      2,
    );
  }

  return { files };
};
