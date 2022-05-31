import { generateAxiosClient } from './generate-axios-client';
import { generatePublishableClient } from './generate-publishable-client';
import { generatePublishableSchema } from './generate-publishable-schema';

test('skips generating a package.json if there is no PackageJSON entry', async () => {
  const result = await generatePublishableClient({
    outputClass: 'Client',
    spec: {
      Endpoints: {
        'GET /posts': {
          Name: 'listPosts',
          Response: {},
          Request: {},
        },
      },
    },
  });

  expect(result.files['package.json']).toBeUndefined();
});

test('generates the correct files when there is a PackageJSON entry', async () => {
  const spec = {
    Meta: {
      PackageJSON: {
        name: '@lifeomic/test-service-schema',
        description: 'The OneSchema for a test-service',
        testObject: {
          some: 'value',
        },
      },
    },
    Endpoints: {
      'GET /posts': {
        Name: 'listPosts',
        Response: {},
        Request: {},
      },
    },
  };
  const result = await generatePublishableClient({
    outputClass: 'Client',
    spec,
  });

  expect(Object.keys(result.files)).toStrictEqual([
    'schema.json',
    'schema.yaml',
    'package.json',
    'index.js',
    'index.d.ts',
  ]);

  const schemaArtifact = generatePublishableSchema({ spec });

  expect(result.files['schema.json']).toStrictEqual(
    schemaArtifact.files['schema.json'],
  );

  expect(result.files['schema.yaml']).toStrictEqual(
    schemaArtifact.files['schema.yaml'],
  );

  const client = await generateAxiosClient({ outputClass: 'Client', spec });

  expect(result.files['index.js']).toStrictEqual(client.javascript);

  expect(result.files['index.d.ts']).toStrictEqual(client.declaration);

  expect(result.files['package.json']).toStrictEqual(
    `
{
  "name": "@lifeomic/test-service-schema",
  "description": "The OneSchema for a test-service",
  "testObject": {
    "some": "value"
  },
  "main": "index.js",
  "peerDependencies": {
    "axios": "*"
  }
}
`.trim(),
  );
});
