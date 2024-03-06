import {ConsolaInstance, createConsola, LogLevel} from 'consola';
import {Liquid, Template} from 'liquidjs';
import {Browser, launch} from 'puppeteer';

export type MatchRuleConfig = readonly [string, string, string];

export type Config = {
  scraper: {
    proxy: string | undefined;
    headless: boolean;
    implementation: string;
  };
  detector: {
    extensions: string[];
    ignoreKeywordRegex: string;
    matchRules: MatchRuleConfig[];
  };
  from: string | undefined;
  logLevel: LogLevel;
  hang: boolean;
};

export const defaultConfig = {
  scraper: {
    proxy: 'socks5://127.0.0.1:20170',
    headless: true,
    implementation: 'chrome',
  },
  detector: {
    extensions: ['.mp4', '.avi', '.wmv'],
    ignoreKeywordRegex: '144P|240P|360P|480P|720P|1080P|2K|4K',
    matchRules: [
      ['259LUXU-(?<ID>\\d+)', '259LUXU-{{ID}}', '259LUXU'],
      [
        'FC2[^A-Z\\d]{0,5}(ppv[^A-Z\\d]{0,5})?(?<ID>\\d{5,7})',
        'FC2-PPV-{{ID}}',
        'FC2',
      ],
      [
        '(?<PREFIX>[A-Z]{2-10})[-_]?(?<ID>\\d{2-5})',
        '{{PREFIX}}-{{ID}}',
        'REGULAR',
      ],
      ['(?<CODE>\\d{6}[-_]\\d{2,3})', '{{CODE}}', 'REGULAR-UNCENSORED'],
    ] as MatchRuleConfig[],
  },
  // logLevel is set by arg parser
  hang: false,
} as Config;

export type MatchRule = readonly [RegExp, Template[], string];

export type Detector = {
  extensions: string[];
  ignoreKeywordRegex: RegExp;
  matchRules: MatchRule[];
};

export type Scraper = {
  proxy: string | undefined;
  proxiedBrowser: Browser | undefined;
  unproxiedBrowser: Browser;
};

export type Environment = {
  logger: ConsolaInstance;
  templater: Liquid;

  from: string | undefined;
  detector: Detector;
  scraper: Scraper;
  hang: boolean;
};

async function generateBrowser(conf: Config, proxied: boolean) {
  const args = [] as string[];
  if (conf.scraper.proxy && proxied) {
    args.push(`--proxy-server=${conf.scraper.proxy}`);
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
    } as Scraper;
  } else {
    return {
      proxy: conf.scraper.proxy,
      proxiedBrowser: undefined,
      unproxiedBrowser: await generateBrowser(conf, false),
    } as Scraper;
  }
}

function detectorFromConfig(templater: Liquid, conf: Config) {
  return {
    extensions: conf.detector.extensions,
    ignoreKeywordRegex: RegExp(conf.detector.ignoreKeywordRegex, 'gi'),
    matchRules: conf.detector.matchRules.map(
      ([regex_detect, template, tag]: MatchRuleConfig) => {
        return [
          RegExp(regex_detect, 'gi'),
          templater.parse(template),
          tag,
        ] as MatchRule;
      }
    ),
  } as Detector;
}

export async function environmentFromConfig(conf: Config) {
  const logger = createConsola({level: conf.logLevel});
  const templater = new Liquid();

  return {
    logger: logger,
    templater: templater,
    from: conf.from,
    detector: detectorFromConfig(templater, conf),
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
