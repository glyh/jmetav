import {Environment} from '../environment';
import {ElementHandle} from 'puppeteer';

export async function work(env: Environment) {
  if (!env.scraper.proxiedBrowser) {
    return false;
  }
  const page = await env.scraper.proxiedBrowser.newPage();
  const cookies = [
    {
      name: 'over18',
      value: '18',
      domain: 'www.javlibrary.com',
    },
  ];

  await page.setCookie(...cookies);

  const number = 'MIDV-623';
  const preferred_locale = 'cn';
  // Navigate the page to a URL
  await page.goto(
    `https://javlibrary.com/${preferred_locale}/vl_searchbyid.php?keyword=${number}`
  );

  const element = await page.waitForSelector(
    'div[id="video_id"] > table > tbody > tr > td[class="text"]'
  );
  if (element instanceof ElementHandle) {
    const number_scraped = await element.evaluate(
      element => element.textContent
    );
    console.log(number_scraped);
  } else {
    console.log('Failed to get any info');
  }

  return true;
}
