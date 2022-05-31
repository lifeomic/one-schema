import { generatePublishableSchema } from './generate-publishable-schema';

test('skips generating a package.json if there is no PackageJSON entry', () => {
  const result = generatePublishableSchema({
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

test('generates the correct files when there is a PackageJSON entry', () => {
  const result = generatePublishableSchema({
    spec: {
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
    },
  });

  expect(Object.keys(result.files)).toStrictEqual([
    'schema.json',
    'schema.yaml',
    'package.json',
  ]);

  expect(result.files['schema.json']).toStrictEqual(
    `
{
  "Meta": {
    "PackageJSON": {
      "name": "@lifeomic/test-service-schema",
      "description": "The OneSchema for a test-service",
      "testObject": {
        "some": "value"
      }
    }
  },
  "Endpoints": {
    "GET /posts": {
      "Name": "listPosts",
      "Response": {},
      "Request": {}
    }
  }
}`.trim(),
  );

  expect(result.files['schema.yaml']).toStrictEqual(
    `
Meta:
  PackageJSON:
    name: '@lifeomic/test-service-schema'
    description: The OneSchema for a test-service
    testObject:
      some: value
Endpoints:
  GET /posts:
    Name: listPosts
    Response: {}
    Request: {}
`.trimStart(),
  );

  expect(result.files['package.json']).toStrictEqual(
    `
{
  "name": "@lifeomic/test-service-schema",
  "description": "The OneSchema for a test-service",
  "testObject": {
    "some": "value"
  }
}
`.trim(),
  );
});
