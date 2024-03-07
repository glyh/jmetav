import {Page} from 'puppeteer';
import AsyncLock = require('async-lock');

import {Movie} from '../movie';
import {Environment} from '../environment';
import {ScrapeRule, Source, cookify} from './source';

export const sourceTag = 'JavLibrary';

const rules = {
  ID: ['div#video_id >>> td.text', 'text', 'single'],
  title: ['div#video_title > h3', 'text', 'single'],
  publishDate: ['div#video_date >>> td[class="text"]', 'text', 'single'],
  director: ['span.director > a', 'text', 'single'],
  producer: ['span.maker > a', 'text', 'single'],
  publisher: ['span.label > a', 'text', 'single'],
  score: ['span.score', 'text', 'single'],
  genres: ['div#video_genres >>> span.genre > a', 'text', 'multi'],
  actresses: ['span.star > a', 'text', 'multi'],
  cover: ['img#video_jacket_img', ['attr', 'src'], 'single'],
  thumbs: [
    'div.previewthumbs > a:not(.btn_videoplayer)',
    ['attr', 'href'],
    'multi',
  ],
} as {[Name: string]: ScrapeRule};

async function collectOne(
  env: Environment,
  page: Page
): Promise<Partial<Movie> | null> {
  try {
    const keys = [] as string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const running = [] as Promise<any>[];
    for (const [key, rule] of Object.entries(rules)) {
      const [selector, attr, isSingle] = rule;
      const isAttribute = attr !== 'text';
      keys.push(key);
      /*
       * puppeteer turns out to be passing lambda to the browser,
       * so we'd better not do any kind of partial application,
       * but rather do it in a stupid way.
       */
      if (isSingle === 'single') {
        if (isAttribute) {
          running.push(
            page
              .$eval(selector, (e, attr) => e.getAttribute(attr), attr[1])
              .catch(() => null)
          );
        } else {
          running.push(
            page.$eval(selector, e => e.textContent).catch(() => null)
          );
        }
      } else {
        if (isAttribute) {
          running.push(
            page
              .$$eval(
                selector,
                (es, attr) => es.map(e => e.getAttribute(attr)),
                attr[1]
              )
              .catch(() => null)
          );
        } else {
          running.push(
            page
              .$$eval(selector, es => es.map(e => e.textContent))
              .catch(() => null)
          );
        }
      }
    }
    const resolved = await Promise.all(running);

    const output: Partial<Movie> = {};
    for (let i = 0; i < resolved.length; ++i) {
      // @ts-ignore
      output[keys[i]] = resolved[i];
    }

    // deal with some meta info
    output.srcProxied = true;

    if (output.title && output.ID && output.title.startsWith(output.ID)) {
      output.title = output.title.substring(output.ID.length);
    }
    if (output.title && output.actresses) {
      const lenTit = output.title.length;
      for (const actress of output.actresses) {
        if (output.title.endsWith(actress)) {
          const lenAct = actress.length;
          output.title = output.title.substring(0, lenTit - lenAct);
        }
      }
    }
    if (output.score) {
      // console.log(`|${output.score}|`);
      const matched = /\((\d\.\d\d)\)/.exec(output.score);
      // console.log(matched, matched?.groups);
      if (matched) {
        output.score = matched[1];
      }
      // console.log(output.score);
    }

    return output as Partial<Movie>;
  } catch (e) {
    env.logger.error(e);
    return null;
  }
}

const waitReleaseTime = 4000; // ms
const javLibSpeedLimit: AsyncLock = new AsyncLock();

export class JavLibrary extends Source {
  async scrapeMovieFromSource(env: Environment, ID: string) {
    let browser = env.scraper.unproxiedBrowser;

    if (env.scraper.proxiedBrowser) {
      browser = env.scraper.proxiedBrowser;
    } else {
      env.logger.warn(
        'Source JavLibrary prefers proxy but proxy is not set, using unproxied browser...'
      );
    }

    const urlString = `https://www.javlibrary.com/${env.locale}/vl_searchbyid.php?keyword=${ID}`;
    const url = new URL(urlString);
    env.logger.info(`Scraping from ${url}`);

    await javLibSpeedLimit.acquire(
      'javlib',
      async () => await Bun.sleep(waitReleaseTime)
    );
    const page = await browser.newPage();

    await page.setCookie(...cookify(url.host, {over18: '18'}));

    // No popups for me.
    await page.evaluateOnNewDocument(() => {
      window.open = () => null;
    });

    try {
      await page.goto(urlString);
      const url = page.url();
      env.logger.log(url);

      if (url.match(/.*vl_searchbyid.*/)) {
        // Either we have no match or we have too many match
        // Assume we have multiple result and try to scrape

        const candidates = await page.$$eval('div.video > a', items =>
          items.map(e => {
            const url = e.getAttribute('href');
            const ID = e.querySelector('div.id')?.textContent;
            const title = e.querySelector('div.title')?.textContent;
            if (ID && title && url) {
              return [ID, title, url] as const;
            } else {
              return null;
            }
          })
        );
        const result = [];
        for (const candidate of candidates) {
          if (candidate === null) continue;
          const [ID_got, title, relativeUrl] = candidate;
          if (ID_got !== ID) continue;

          const targetUrl = `https://www.javlibrary.com/${env.locale}/${relativeUrl}`;

          env.logger.info(`Going to candidate "${title}" at ${targetUrl}`);
          await page.goto(targetUrl);
          const cur = await collectOne(env, page);
          if (cur !== null) {
            result.push(cur);
          }
        }
        return result;
      } else {
        const result = await collectOne(env, page);
        if (result === null) {
          return [];
        } else {
          return [result];
        }
      }
    } catch (e) {
      env.logger.error(e);
      return [];
    } finally {
      await page.close();
    }
  }
}
