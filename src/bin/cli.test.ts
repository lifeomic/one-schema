import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { tmpNameSync } from 'tmp';

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
