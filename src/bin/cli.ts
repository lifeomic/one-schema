#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'fs';
import { extname } from 'path';
import yargs = require('yargs');
import { format, BuiltInParserName } from 'prettier';
import { dump } from 'js-yaml';

import { generateAxiosClient } from '../generate-axios-client';
import { generateAPITypes } from '../generate-api-types';
import { loadSchemaFromFile, SchemaAssumptions } from '../meta-schema';
import { toOpenAPISpec } from '../openapi';
import { generatePublishableSchema } from '../generate-publishable-schema';
import path = require('path');

const getPrettierParser = (outputFilename: string): BuiltInParserName => {
  const extension = extname(outputFilename).replace('.', '');
  if (['yml', 'yaml'].includes(extension)) {
    return 'yaml';
  }
  if (extension === 'json') {
    return 'json';
  }
  return 'typescript';
};

const writeGeneratedFile = (
  filepath: string,
  content: string,
  options: { format: boolean },
) => {
  mkdirSync(path.dirname(filepath), { recursive: true });
  writeFileSync(
    filepath,
    options.format
      ? format(content, { parser: getPrettierParser(filepath) })
      : content,
    { encoding: 'utf-8' },
  );
};

const VALID_ASSUMPTION_KEYS: (keyof SchemaAssumptions)[] = [
  'noAdditionalPropertiesOnObjects',
  'objectPropertiesRequiredByDefault',
];

const parseAssumptions = (input: string): SchemaAssumptions => {
  const containsOnlyValidAssumptionKeys = (
    arr: string[],
  ): arr is (keyof SchemaAssumptions)[] =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    arr.every((value) => VALID_ASSUMPTION_KEYS.includes(value as any));

  if (input === 'all') {
    return {
      noAdditionalPropertiesOnObjects: true,
      objectPropertiesRequiredByDefault: true,
    };
  }

  if (input === 'none') {
    return {
      noAdditionalPropertiesOnObjects: false,
      objectPropertiesRequiredByDefault: false,
    };
  }

  const assumptions = input.split(',');

  if (!containsOnlyValidAssumptionKeys(assumptions)) {
    throw new Error(
      "Detected an invalid assumptions input. Must be either 'all', 'none', or a comma-separated list containing one or more of: " +
        VALID_ASSUMPTION_KEYS.join(', '),
    );
  }

  return assumptions.reduce((accum, next) => ({ ...accum, [next]: true }), {
    requestsAreObjects: false,
    responsesAreObjects: false,
    noAdditionalPropertiesOnObjects: false,
    objectPropertiesRequiredByDefault: false,
  });
};

const getCommonOptions = (argv: yargs.Argv) =>
  argv
    .option('schema', {
      type: 'string',
      description: 'The filepath of the schema spec.',
      demandOption: true,
    })
    .option('output', {
      type: 'string',
      description: 'A filepath for the generated output.',
      demandOption: true,
    })
    .option('format', {
      type: 'boolean',
      description: 'Whether to format the output using prettier.',
      default: false,
    })
    .option('assumptions', {
      type: 'string',
      description:
        "Which JSONSchema assumptions to apply. Must be either 'all', 'none', or a comma-separated list containing one or more of: " +
        VALID_ASSUMPTION_KEYS.join(', '),
      default: 'all',
    });

const program = yargs(process.argv.slice(2))
  .command(
    'generate-axios-client',
    'Generates an Axios client using the specified schema and options.',
    (y) =>
      getCommonOptions(y).option('className', {
        type: 'string',
        description: 'The name of the generated client class.',
        default: 'Client',
      }),
    async (argv) => {
      const spec = loadSchemaFromFile(
        argv.schema,
        parseAssumptions(argv.assumptions),
      );
      const output = await generateAxiosClient({
        spec,
        outputClass: argv.className,
      });

      writeGeneratedFile(argv.output, output, { format: argv.format });
    },
  )
  .command(
    'generate-api-types',
    'Generates API types using the specified schema and options.',
    getCommonOptions,
    async (argv) => {
      const spec = loadSchemaFromFile(
        argv.schema,
        parseAssumptions(argv.assumptions),
      );

      const output = await generateAPITypes({ spec });

      writeGeneratedFile(argv.output, output, { format: argv.format });
    },
  )
  .command(
    'generate-open-api-spec',
    'Generates an OpenAPI v3.1.0 spec using the specified schema and options.',
    (y) =>
      getCommonOptions(y)
        .option('apiVersion', {
          type: 'string',
          description: 'The current version of this API schema.',
          default: '1.0.0',
        })
        .option('apiTitle', {
          type: 'string',
          description: 'The API title.',
          demandOption: true,
        }),
    (argv) => {
      const spec = loadSchemaFromFile(
        argv.schema,
        parseAssumptions(argv.assumptions),
      );

      const openAPISpec = toOpenAPISpec(spec, {
        info: { version: argv.apiTitle, title: argv.apiTitle },
      });

      const output =
        argv.output.endsWith('.yml') || argv.output.endsWith('.yaml')
          ? dump(openAPISpec)
          : JSON.stringify(openAPISpec, null, 2);

      writeGeneratedFile(argv.output, output, { format: argv.format });
    },
  )
  .command(
    'generate-publishable-schema',
    'Generates a publishable schema artifact.',
    getCommonOptions,
    (argv) => {
      const spec = loadSchemaFromFile(
        argv.schema,
        parseAssumptions(argv.assumptions),
      );

      const { files } = generatePublishableSchema({ spec });

      for (const [filename, content] of Object.entries(files)) {
        writeGeneratedFile(path.resolve(argv.output, filename), content, {
          format: true,
        });
      }
    },
  )
  .demandCommand()
  .strict();

program.parseAsync().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
