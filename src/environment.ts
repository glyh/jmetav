import {ConsolaInstance, createConsola, LogLevel} from 'consola';
import {Browser, launch} from 'puppeteer';
import {Liquid} from 'liquidjs';

export type MatchRuleConfig = readonly [string, string, string];

export type Config = {
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
      timeout: number;
    };
  };
};

export const defaultConfig = {
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
      timeout: 3000,
    },
  },
} as Config;

export type Environment = {
  logger: ConsolaInstance;
  templater: Liquid;
  browser: Browser;
  browserProxied: Browser | null;
};

export const env = {} as Environment;
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

export async function loadConfig(config: Config) {
  conf = config;
  env.browser = await generateBrowser(conf, false);
  if (conf.scraper.proxy) {
    env.browserProxied = await generateBrowser(conf, true);
  } else {
    env.browserProxied = null;
  }
  env.templater = new Liquid();
  env.logger = createConsola({level: conf.logLevel});
}
export async function destroyEnvironment() {
  if (env.browserProxied) {
    await env.browserProxied.close();
  }
  await env.browser.close();
}
