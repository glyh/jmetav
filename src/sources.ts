import {Movie, MovieInfoSource} from './movie';
import {Environment} from './environment';
import {CookieParam} from 'puppeteer';
import Mustache = require('mustache');
import {Duration} from 'ts-duration';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cookify(domain: string, input: {[Name: string]: any}): CookieParam[] {
  const result = [] as CookieParam[];
  for (const [key, value] of Object.entries(input)) {
    const param = {
      name: key,
      value: value,
      domain: domain,
    } as CookieParam;
    result.push(param);
  }
  return result;
}

function asURL(s: string): URL {
  return new URL(s);
}

function asURLs(s: string[]): URL[] {
  return s.map(asURL);
}

function asDate(s: string): Date {
  const ret = new Date();
  ret.setDate(Date.parse(s));
  return ret;
}

function asNumber(s: string): number {
  return Number(s);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const I = (x: any) => x;

function asDuration(s: string): Duration {
  throw 'unimplemented';
}

function checkUncensored(s: string): boolean {
  throw 'unimplemented';
}

// Make it indexable with any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const postScrape: any = {
  ID: I,
  plot: I,
  cover: asURL,
  genre: I,
  score: asNumber,
  title: I,
  series: I,
  actress: I,
  director: I,
  duration: I,
  producer: I,
  publisher: I,
  uncensored: checkUncensored,
  publishDate: asDate,
  thumbs: asURLs,
  trailer: asURL,
};

export async function scrapeMovieFromSource(
  ID: string,
  tag: string,
  env: Environment,
  source: MovieInfoSource
): Promise<Partial<Movie>> {
  let browser = env.scraper.unproxiedBrowser;
  if (source.meta.prefersProxy) {
    if (env.scraper.proxiedBrowser) {
      browser = env.scraper.proxiedBrowser;
    } else {
      env.logger.warn(
        `Source ${tag} prefers proxy but proxy is not set, using unproxied browser...`
      );
    }
  }

  const urlString = Mustache.render(source.meta.urlTemplate, {ID: ID, ...env});
  const url = new URL(urlString);
  env.logger.info(`Scraping from ${url}`);
  const page = await browser.newPage();
  await page.setCookie(...cookify(url.host, source.meta.cookies));
  await page.goto(urlString);

  const keys = [] as string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const running = [] as Promise<any>[];
  for (const [key, rule] of Object.entries(source.rules)) {
    const [selector, attr, isSingle] = rule;
    const isAttribute = typeof attr === 'string';
    keys.push(key);
    /*
     * puppeteer turns out to be passing lambda to the browser,
     * so we'd better not do any kind of partial application,
     * but rather do it in a stupid way.
     */
    if (isSingle === 'single') {
      if (isAttribute) {
        running.push(
          page.$eval(selector, (e, attr) => e.getAttribute(attr), attr)
        );
      } else {
        running.push(page.$eval(selector, e => e.textContent));
      }
    } else {
      if (isAttribute) {
        running.push(
          page.$$eval(
            selector,
            (es, attr) => es.map(e => e.getAttribute(attr)),
            attr
          )
        );
      } else {
        running.push(page.$$eval(selector, es => es.map(e => e.textContent)));
      }
    }
  }
  const resolved = await Promise.all(running);
  console.log(resolved);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const output: any = {};
  for (let i = 0; i < resolved.length; ++i) {
    output[keys[i]] = postScrape[keys[i]](resolved[i]);
  }
  return output as Partial<Movie>;
}
