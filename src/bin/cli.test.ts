import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { tmpNameSync } from 'tmp';
import { OneSchemaDefinition } from '../types';

const executeCLI = (command: string): string => {
  try {
    return execSync(`ts-node cli.ts ${command}`, {
      cwd: __dirname,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  } catch (err) {
    return err.stderr.toString();
  }
};

/**
 * Writes the `schema`, and returns its filepath.
 */
const writeSchema = (schema: OneSchemaDefinition): string => {
  const path = `${__dirname}/../test-schema.json`;
  writeFileSync(path, JSON.stringify(schema, null, 2), { encoding: 'utf8' });
  return path;
};

describe('schema validation snapshots', () => {
  const SCENARIOS: {
    test: string;
    schema: string;
    expectOutputContaining: string;
  }[] = [
    {
      test: 'malformed yaml',
      schema: '-this is:bad',
      expectOutputContaining:
        'Error: Detected invalid schema: data must be object',
    },
  ];

  SCENARIOS.forEach(({ test: name, schema, expectOutputContaining }) => {
    test(`${name}`, () => {
      const filepath = tmpNameSync();

      writeFileSync(filepath, schema.trim(), { encoding: 'utf-8' });

      const result = executeCLI(
        `generate-api-types --schema ${filepath} --output ${tmpNameSync()}`,
      );

      expect(result).toContain(expectOutputContaining);
    });
  });
});

describe('input validation snapshots', () => {
  const SCENARIOS: { test: string; input: string }[] = [
    {
      test: 'empty input',
      input: '',
    },
    {
      test: 'bogus command name',
      input: 'generate-bogus',
    },
    {
      test: 'missing arguments - generate-axios-client',
      input: 'generate-axios-client',
    },
    {
      test: 'missing arguments - generate-api-types',
      input: 'generate-api-types',
    },
    {
      test: 'missing arguments - generate-open-api-spec',
      input: 'generate-open-api-spec',
    },
    {
      test: 'missing arguments - fetch-remote-schema',
      input: 'fetch-remote-schema',
    },
  ];

  SCENARIOS.forEach(({ test: name, input }) => {
    test(`${name}`, () => {
      const result = executeCLI(input);
      expect(result.trim()).toMatchSnapshot();
    });
  });
});

describe('generate-open-api-spec', () => {
  it('does not create new newlines when serializing + deserializing to YAML', () => {
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

    executeCLI(
      `generate-open-api-spec --schema '${path}' --output '${output}' --apiTitle 'test title'`,
    );

    const yamlContent = readFileSync(output, { encoding: 'utf8' });

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
  });
});
