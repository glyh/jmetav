import {program, Option} from '@commander-js/extra-typings';
import * as TOML from '@iarna/toml';
import {promises as fsp} from 'fs';
import {merge as deepmerge} from 'ts-deepmerge';
import {match} from 'ts-pattern';
import {LogLevels} from 'consola';

import {detect} from './detector';
import {
  defaultConfig,
  Config,
  environmentFromConfig,
  destroyEnvironment,
} from './environment';

program
  .option('-c, --config <file>', 'config file')
  .option('-f, --from <dir>', 'folder to scan')
  .addOption(
    new Option('-l, --log-level <level>', 'log level')
      .choices(['debug', 'verbose', 'silent', 'info'] as const)
      .default('info' as const)
  )
  .action(async options => {
    let readToml = {};
    if (typeof options.config === 'string') {
      // NOTE: until @types/bun works with @types/node we don't use Bun.file
      const configFile = await fsp.readFile(options.config);
      readToml = TOML.parse(configFile.toString());
    }
    const cliOptions = {
      logLevel: match(options.logLevel)
        .with('debug', () => LogLevels.debug)
        .with('verbose', () => LogLevels.verbose)
        .with('silent', () => LogLevels.silent)
        .with('info', () => LogLevels.info)
        .exhaustive(),
    } as Config;
    if (options.from) {
      cliOptions.from = options.from;
    }
    const configParsed = deepmerge(defaultConfig, readToml, cliOptions);
    const env = await environmentFromConfig(configParsed);
    for await (const _ of detect(env));
    if (!env.hang) {
      destroyEnvironment(env);
    } else {
      const sleep = (ms: number) =>
        new Promise(resolve => setTimeout(resolve, ms));
      for (;;) {
        await sleep(1000);
      }
    }
  })
  .parse();
