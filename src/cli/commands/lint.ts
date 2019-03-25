import { Command, flags as flagHelpers } from '@oclif/command';
import { parseWithPointers } from '@stoplight/yaml';
import { existsSync, readFileSync } from 'fs';

// @ts-ignore
import * as fetch from 'node-fetch';

import { json, stylish } from '../../formatters';
import { oas2Functions, oas2Rules } from '../../rulesets/oas2';
import { oas3Functions, oas3Rules } from '../../rulesets/oas3';
import { Spectral } from '../../spectral';
import { IRuleResult } from '../../types';

export default class Lint extends Command {
  public static description = 'lint a JSON/YAML document from a file or URL';

  public static examples = [
    `$ spectral lint .openapi.yaml
linting ./openapi.yaml
`,
  ];

  public static flags = {
    help: flagHelpers.help({ char: 'h' }),
    encoding: flagHelpers.string({
      char: 'e',
      default: 'utf8',
      description: 'text encoding to use',
    }),
    format: flagHelpers.string({
      char: 'f',
      default: 'stylish',
      description: 'formatter to use for outputting results',
      options: ['json', 'stylish'],
    }),
    maxResults: flagHelpers.integer({
      char: 'm',
      description: '[default: all] maximum results to show',
    }),
    verbose: flagHelpers.boolean({
      char: 'v',
      description: 'increase verbosity',
    }),
  };

  public static args = [{ name: 'source' }];

  public async run() {
    const { args, flags } = this.parse(Lint);

    if (args.source) {
      try {
        await lint(args.source, flags, this);
      } catch (ex) {
        this.error(ex.message);
      }
    } else {
      this.error('You must specify a document to lint');
    }
  }
}

async function lint(name: string, flags: any, command: Lint) {
  command.log(`linting ${name}`);
  let obj: any;
  try {
    obj = await readInputArguments(name, flags.encoding);
  } catch (ex) {
    throw new Error(`Could not parse ${name}: ${ex.message}`);
  }

  const spectral = new Spectral();
  if (obj.data.swagger && obj.data.swagger === '2.0') {
    command.log('OpenAPI 2.0 (Swagger) detected');
    spectral.addFunctions(oas2Functions());
    spectral.addRules(oas2Rules());
  } else if (obj.data.openapi && typeof obj.data.openapi === 'string' && obj.data.openapi.startsWith('3.')) {
    command.log('OpenAPI 3.x detected');
    spectral.addFunctions(oas3Functions());
    spectral.addRules(oas3Rules());
  } else {
    throw new Error('Input document specification type could not be determined');
  }

  let results = [];
  try {
    results = await spectral.run(obj.data);
    if (results.length === 0) {
      command.log('No errors or warnings found!');
      return;
    }
  } catch (ex) {
    process.exitCode = 2;
    throw new Error(ex);
  }
  // Keep only the requested number of warnings
  if (flags.maxResults) {
    results = results.slice(0, flags.maxResults);
  }
  process.exitCode = 1;
  const output = await formatOutput(results, flags.format);
  command.log(output);
}

async function formatOutput(results: IRuleResult[], format: any) {
  return {
    json: () => json(results),
    stylish: () => stylish(results),
  }[format]();
}

async function readInputArguments(name: string, encoding: string) {
  if (name.startsWith('http')) {
    const result = await fetch(name);
    return parseWithPointers(await result.text());
  } else if (existsSync(name)) {
    try {
      return parseWithPointers(readFileSync(name, encoding));
    } catch (ex) {
      throw new Error(`Could not read ${name}: ${ex.message}`);
    }
  }
  throw new Error(`${name} does not exist`);
}