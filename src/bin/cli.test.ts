import { describe, expect, it, test } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { tmpNameSync } from 'tmp';
import { OneSchemaDefinition } from '../types';
import * as yaml from 'js-yaml';
import { createProgram } from './cli';

/**
 * Writes the `schema`, and returns its filepath.
 */
const writeSchema = (schema: OneSchemaDefinition): string => {
  const path = `${__dirname}/../test-schema.json`;
  writeFileSync(path, JSON.stringify(schema, null, 2), { encoding: 'utf8' });
  return path;
};

describe('schema validation errors', () => {
  const SCENARIOS: {
    test: string;
    schema: string;
    expectOutputContaining: string;
  }[] = [
    {
      test: 'malformed yaml',
      schema: '-this is:bad',
      expectOutputContaining: 'Detected invalid schema: data must be object',
    },
  ];

  SCENARIOS.forEach(({ test: name, schema, expectOutputContaining }) => {
    test(`${name}`, async () => {
      const filepath = tmpNameSync();

      writeFileSync(filepath, schema.trim(), { encoding: 'utf-8' });

      await expect(
        createProgram([
          'generate-api-types',
          '--schema',
          filepath,
          '--output',
          tmpNameSync(),
        ]).parseAsync(),
      ).rejects.toThrow(expectOutputContaining);
    });
  });
});

describe('input validation errors', () => {
  const SCENARIOS: {
    test: string;
    input: string;
    expectOutputContaining: string;
  }[] = [
    {
      test: 'empty input',
      input: '',
      expectOutputContaining: 'Unknown argument: ""',
    },
    {
      test: 'bogus command name',
      input: 'generate-bogus',
      expectOutputContaining: 'Unknown argument: generate-bogus',
    },
    {
      test: 'missing arguments - generate-axios-client',
      input: 'generate-axios-client',
      expectOutputContaining:
        'Missing required arguments: schema, output, name',
    },
    {
      test: 'missing arguments - generate-api-types',
      input: 'generate-api-types',
      expectOutputContaining: 'Missing required arguments: schema, output',
    },
    {
      test: 'missing arguments - generate-open-api-spec',
      input: 'generate-open-api-spec',
      expectOutputContaining:
        'Missing required arguments: schema, output, apiTitle',
    },
    {
      test: 'missing arguments - fetch-remote-schema',
      input: 'fetch-remote-schema',
      expectOutputContaining: 'Missing required arguments: from, output',
    },
  ];

  SCENARIOS.forEach(({ test: name, input, expectOutputContaining }) => {
    test(`${name}`, () => {
      expect(() => createProgram([input]).parse()).toThrow(
        expectOutputContaining,
      );
    });
  });
});

describe('generate-open-api-spec', () => {
  it('does not create new newlines when serializing + deserializing to YAML', async () => {
    const description =
      'This is a long description that might go over the js-yaml default line length.\nIt also contains newlines.\n\nLots of newlines!';

    const path = writeSchema({
      Endpoints: {
        'GET /something': {
          Name: 'getSomething',
          Description: description,
          Response: {
            type: 'object',
          },
        },
      },
    });

    const output = `${__dirname}/../test-generated.yaml`;

    await createProgram([
      'generate-open-api-spec',
      '--schema',
      path,
      '--output',
      output,
      '--apiTitle',
      'test title',
    ]).parseAsync();

    const yamlContent = readFileSync(output, { encoding: 'utf8' });

    // Assert the output looks right.
    expect(yamlContent.trim()).toStrictEqual(
      `
openapi: 3.0.0
info:
  version: 1.0.0
  title: test title
components: {}
paths:
  /something:
    get:
      operationId: getSomething
      description: |-
        This is a long description that might go over the js-yaml default line length.
        It also contains newlines.

        Lots of newlines!
      responses:
        "200":
          description: A successful response
          content:
            application/json:
              schema:
                additionalProperties: false
                type: object
`.trim(),
    );

    // Assert the output deserializes correctly.
    const openapi: any = yaml.load(yamlContent);

    expect(openapi.paths['/something'].get.description).toStrictEqual(
      description,
    );
  });
});
