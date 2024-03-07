import {CookieParam} from 'puppeteer';
import {Movie} from '../movie';

type attrSelector = 'text' | ['attr', string];
export type ScrapeRule = readonly [string, attrSelector, 'single' | 'multi'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cookie = {[Name: string]: any};
export function cookify(domain: string, input: Cookie): CookieParam[] {
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

export abstract class Source {
  abstract scrapeMovieFromSource(ID: string): Promise<Partial<Movie>[]>;
}
