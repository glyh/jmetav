import {ConsolaInstance, createConsola, LogLevel} from 'consola';
import {Browser, launch} from 'puppeteer';
import {Liquid} from 'liquidjs';
import {Knex} from 'knex';
import knex = require('knex');

export type MatchRuleConfig = readonly [string, string, string];

import {JavLibrary} from './sources/javLib';

export const sourcesMap = {
  JavLibrary: JavLibrary,
};

export type Config = {
  databasePath: string;
  from: string;
  to: string | null;
  logLevel: LogLevel;
  hang: boolean;
  // locale: 'en_US' | 'zh_CN' | 'zh_TW' | 'ja_JP';
  locale: 'en' | 'cn' | 'tw' | 'ja';
  scraper: {
    proxy: {
      protocol: string;
      host: string;
      port: number;
    } | null;
    headless: boolean;
    implementation: string;
    pathFormatter: string;
  };
  detector: {
    extensions: string[];
    ignoreKeywordRegex: string;
    matchRules: MatchRuleConfig[];
  };
  sources: {
    javLib: {
      interval: number;
    };
  };
};

export const defaultConfig = {
  databasePath: ':memory:',
  from: '.',
  // logLevel is set by arg parser
  hang: false,
  locale: 'cn',
  to: null,
  scraper: {
    proxy: {
      protocol: 'http',
      host: '127.0.0.1',
      port: 20171,
    },
    headless: true,

    pathFormatter: `
      {%- if actresses and actresses.first -%}
        {{actresses.first}}
      {%- else -%}
        Unknown
      {%- endif -%}
      /{{ID}}/`,
  },
  detector: {
    extensions: ['.mp4', '.avi', '.wmv'],
    ignoreKeywordRegex: '144P|240P|360P|480P|720P|1080P|2K|4K',
    matchRules: [
      // NOTE: the order matters here, will match rules in the beginning first
      ['259LUXU-(?<ID>\\d+)', '259LUXU-{{ID}}', '259LUXU'],
      [
        'FC2[^A-Z\\d]{0,5}(ppv[^A-Z\\d]{0,5})?(?<ID>\\d{5,7})',
        'FC2-PPV-{{ID}}',
        'FC2',
      ],
      [
        '(?<PREFIX>[A-Z]{2,10})[-_]?(?<ID>\\d{2,5})',
        '{{PREFIX}}-{{ID}}',
        'REGULAR',
      ],
      ['(?<CODE>\\d{6}[-_]\\d{2,3})', '{{CODE}}', 'REGULAR-UNCENSORED'],
    ] as MatchRuleConfig[],
  },
  sources: {
    javLib: {
      interval: 3000,
    },
  },
} as Config;

export type Environment = {
  logger: ConsolaInstance;
  templater: Liquid;
  browser: Browser;
  browserProxied: Browser | null;
  db: Knex;
};

export let env = {} as Environment;
export let conf = {} as Config;

async function generateBrowser(conf: Config, proxied: boolean) {
  const args = [] as string[];
  const p = conf.scraper.proxy;
  if (p && proxied) {
    const proxyString = `${p.protocol}://${p.host}:${p.port}`;
    args.push(`--proxy-server=${proxyString}`);
  }
  return await launch({
    headless: conf.scraper.headless,
    args: args,
  });
}

async function installTables(db: Knex) {
  // TODO: https://knexjs.org/guide/#typescript
  for (const scrapKey in ['genres', 'actresses']) {
    const infoTable = `${scrapKey}$info`;
    if (!(await db.schema.hasTable(infoTable))) {
      await db.schema.createTable(infoTable, table => {
        table.increments('ID').primary();
        table.string('source');
        table.string('scrapeID');
        table.unique(['source', 'scrapeID']);
        table.string('preferredRepresentation');
        table.timestamps();
      });
    }
    const mapTable = `${scrapKey}$map`;
    if (!(await db.schema.hasTable(mapTable))) {
      await db.schema.createTable(mapTable, table => {
        table.increments('ID').primary();
        table.string('source');
        table.string('scrapeID');
        table.unique(['source', 'scrapeID']);
        table.integer('targetID').unsigned();
        table.foreign('targetID').references(`${scrapKey}$info.ID`);
        table.timestamps();
      });
    }
  }
}

export async function loadConfig(config: Config) {
  conf = config;
  env = {
    browser: await generateBrowser(conf, false),
    browserProxied: conf.scraper.proxy
      ? await generateBrowser(conf, true)
      : null,
    templater: new Liquid(),
    logger: createConsola({level: conf.logLevel}),
    db: knex({
      // better-sqlite3 won't work
      // https://github.com/oven-sh/bun/issues/4290
      client: 'sqlite3',
      connection: {
        filename: conf.databasePath,
      },
      useNullAsDefault: true,
    }),
  };
  installTables(env.db);
}
export async function destroyEnvironment() {
  env.logger.info('Gracefully shutting down...');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todo = [] as Promise<any>[];
  if (env.browserProxied) {
    todo.push(env.browserProxied.close());
  }
  todo.push(env.browser.close());
  todo.push(env.db.destroy());
  await Promise.all(todo);
}
