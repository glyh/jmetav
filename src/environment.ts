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
} as Config;

export type MatchRule = readonly [RegExp, string, string];

export type Detector = {
  extensions: string[];
  ignoreKeywordRegex: RegExp;
  matchRules: MatchRule[];
};

export type Scraper = {
  proxy: {
    protocol: string;
    host: string;
    port: number;
  } | null;
  pathFormatter: string;
  proxiedBrowser: Browser | null;
  unproxiedBrowser: Browser;
};

export type Environment = {
  logger: ConsolaInstance;
  templater: Liquid;
  // if null, do nothing and halt
  from: string;
  // if null program use the same as from
  to: string | null;
  detector: Detector;
  scraper: Scraper;
  hang: boolean;
  locale: string;
};

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

async function scraperFromConfig(conf: Config) {
  if (conf.scraper.proxy) {
    return {
      proxy: conf.scraper.proxy,
      proxiedBrowser: await generateBrowser(conf, true),
      unproxiedBrowser: await generateBrowser(conf, false),
      pathFormatter: conf.scraper.pathFormatter,
    } as Scraper;
  } else {
    return {
      proxy: conf.scraper.proxy,
      proxiedBrowser: null,
      unproxiedBrowser: await generateBrowser(conf, false),
      pathFormatter: conf.scraper.pathFormatter,
    } as Scraper;
  }
}

function detectorFromConfig(conf: Config) {
  return {
    extensions: conf.detector.extensions,
    ignoreKeywordRegex: RegExp(conf.detector.ignoreKeywordRegex, 'i'),
    matchRules: conf.detector.matchRules.map(
      ([regex_detect, template, tag]: MatchRuleConfig) => {
        return [RegExp(regex_detect, 'i'), template, tag] as MatchRule;
      }
    ),
  } as Detector;
}

export async function environmentFromConfig(conf: Config) {
  const logger = createConsola({level: conf.logLevel});

  return {
    logger: logger,
    templater: new Liquid(),
    from: conf.from,
    to: conf.to,
    locale: conf.locale,
    detector: detectorFromConfig(conf),
    scraper: await scraperFromConfig(conf),
    hang: conf.hang,
  } as Environment;
}

export async function destroyEnvironment(env: Environment) {
  if (env.scraper.proxiedBrowser) {
    await env.scraper.proxiedBrowser.close();
  }
  await env.scraper.unproxiedBrowser.close();
}
