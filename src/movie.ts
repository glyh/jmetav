import {Duration} from 'ts-duration';
export type Movie = {
  ruleTag: string;
  ID: string;
  url: URL[]; // May have multiple source for a single movie.
  plot: string;
  cover: URL;
  // bigCover: URL; // what is big cover?
  genre: string[]; // TODO: genreID to deduplicate, genreNorm to normalize
  score: number;
  title: string; // TODO: unsanitized title at origTitle
  magnet: URL;
  series: string;
  actresses: string[];
  director: string;
  duration: Duration;
  producer: string;
  publisher: string;
  uncensored: boolean;
  publishDate: Date;
  thumbs: URL[];
  trailer: URL;
};

export type MovieScraped = Partial<Movie>;

export type ScrapeRule = readonly [string, string | {}, 'single' | 'multi'];
export type ScrapeRuleSingle = readonly [string, string | {}, 'single'];
export type ScrapeRuleMulti = readonly [string, string | {}, 'multi'];

export type MovieInfoRules = {
  ID: ScrapeRuleSingle;
  plot: ScrapeRuleSingle;
  cover: ScrapeRuleSingle;
  genre: ScrapeRuleMulti;
  score: ScrapeRuleSingle;
  title: ScrapeRuleSingle;
  series: ScrapeRuleSingle;
  actress: ScrapeRuleMulti;
  director: ScrapeRuleSingle;
  duration: ScrapeRuleSingle;
  producer: ScrapeRuleSingle;
  publisher: ScrapeRuleSingle;
  uncensored: ScrapeRuleSingle;
  publishDate: ScrapeRuleSingle;
  thumbs: ScrapeRuleMulti;
  trailer: ScrapeRuleMulti;
};

export type MovieInfoSource = {
  meta: {
    prefersProxy: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cookies: {[Name: string]: any};
    urlTemplate: string;
  };

  rules: Partial<MovieInfoRules>;
};
