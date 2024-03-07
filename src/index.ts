import {program, Option} from '@commander-js/extra-typings';
import * as TOML from '@iarna/toml';
import {promises as fsp} from 'fs';
import {merge as deepmerge} from 'ts-deepmerge';
import {match} from 'ts-pattern';
import {LogLevels} from 'consola';

import {
  defaultConfig,
  Config,
  environmentFromConfig,
  destroyEnvironment,
} from './environment';
import {detect} from './detector';
import {JavLibrary} from './sources/javLib';
import {sanitizeMovie, saveNFO} from './info';

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
    } else {
      'We should bail out';
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

    async function exit() {
      await destroyEnvironment(env);
      // eslint-disable-next-line no-process-exit
      process.exit();
    }
    if (!env.from) {
      env.logger.error('No directory specified, exiting');
      await exit();
    }
    ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal =>
      process.on(signal, exit)
    );

    const jl = new JavLibrary();
    const promises: Promise<void>[] = [];
    for await (const [path, id, idTag] of detect(env)) {
      const p = jl.scrapeMovieFromSource(env, id).then(async movies => {
        const pool: Promise<boolean>[] = [];
        for (let m of movies) {
          if (m.ID) {
            m = sanitizeMovie(m);
            env.logger.info(m);
            pool.push(saveNFO(env, m));
          }
        }
        if (pool.length === 0) {
          env.logger.error(`Failed to grab information for ${id} at ${path}`)
        } else {
          await Promise.all(pool);
        }
      });
      promises.push(p);
    }
    await Promise.all(promises);
    if (!env.hang) {
      await destroyEnvironment(env);
    } else {
      // NOTE: until @types/bun works with @types/node we don't use Bun.sleep
      const sleep = (ms: number) =>
        new Promise(resolve => setTimeout(resolve, ms));
      env.logger.info('Hanging...');
      for (;;) {
        await sleep(1000);
      }
    }
  })
  .parse();
