import {Page} from 'puppeteer';
import AsyncLock = require('async-lock');

import {Movie} from '../movie';
import {conf, env} from '../environment';
import {RulesEntried, RulesBuilder, Source, cookify} from './source';

export const sourceTag = 'JavLibrary';

const rules = {
  ID: ['div#video_id >>> td.text', 'text', 'single'],
  title: ['div#video_title > h3', 'text', 'single'],
  publishDate: ['div#video_date >>> td[class="text"]', 'text', 'single'],
  director: ['span.director > a', 'text', 'single'],
  producer: ['span.maker > a', 'text', 'single'],
  publisher: ['span.label > a', 'text', 'single'],
  score: ['span.score', 'text', 'single'],
  genres: ['span.genre > a', 'text', 'multi'],
  genreIDs: ['span.genre', ['attr', 'id'], 'multi'],
  actresses: ['span.star > a', 'text', 'multi'],
  actressIDs: ['span.cast', ['attr', 'id'], 'multi'],
  cover: ['img#video_jacket_img', ['attr', 'src'], 'single'],
  thumbs: [
    'div.previewthumbs > a:not(.btn_videoplayer)',
    ['attr', 'href'],
    'multi',
  ],
} as Partial<RulesBuilder<Movie>>;

async function collectOne(
  page: Page,
  jobId: number
): Promise<Partial<Movie> | null> {
  try {
    const keys = [] as (keyof Movie)[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const running = [] as Promise<any>[];
    for (const [key, rule] of Object.entries(rules) as RulesEntried) {
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
      output[keys[i]] = resolved[i];
    }

    // Deal with some meta info
    output.srcProxied = true;
    output.urls = [page.url()];

    // Sanitize the date
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
      const matched = /\((\d\.\d\d)\)/.exec(output.score);
      if (matched) output.score = matched[1];
    }

    return output as Partial<Movie>;
  } catch (e) {
    env.logger.error(`#${jobId} ${e}`);
    return null;
  }
}

const javLibSpeedLimit: AsyncLock = new AsyncLock();

export class JavLibrary extends Source {
  async scrapeMovieFromSource(ID: string, jobId: number) {
    let browser = env.browser;

    if (env.browserProxied) {
      browser = env.browserProxied;
    } else {
      env.logger.warn(
        `#${jobId} Source JavLibrary prefers proxy but proxy is not set, using unproxied browser...`
      );
    }

    const urlString = `https://www.javlibrary.com/${conf.locale}/vl_searchbyid.php?keyword=${ID}`;
    const url = new URL(urlString);
    env.logger.info(`#${jobId} Scraping from ${url}`);

    await javLibSpeedLimit.acquire(
      'javlib',
      // @ts-ignore
      async () => await Bun.sleep(conf.sources.javLib.interval)
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

          const targetUrl = `https://www.javlibrary.com/${conf.locale}/${relativeUrl}`;

          env.logger.info(
            `#${jobId} Going to candidate "${title}" at ${targetUrl}`
          );
          await page.goto(targetUrl);
          const cur = await collectOne(page, jobId);
          if (cur !== null) {
            result.push(cur);
          }
        }
        return result;
      } else {
        const result = await collectOne(page, jobId);
        if (result === null) {
          return [];
        } else {
          return [result];
        }
      }
    } catch (e) {
      env.logger.error(`#${jobId} ${e}`);
      return [];
    } finally {
      await page.close();
    }
  }
}
