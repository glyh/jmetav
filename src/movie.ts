export type Movie = {
  srcProxied: boolean;
  ruleTag: string;
  ID: string;
  urls: string[];
  plot: string;
  cover: string;
  genres: string[];
  genreIDs: string[];
  score: string;
  title: string;
  magnet: string;
  series: string;
  actresses: string[];
  actressIDs: string[];
  director: string;
  duration: string;
  producer: string;
  publisher: string;
  uncensored: boolean;
  publishDate: string;
  thumbs: string[];
  trailer: string;
};

export type MovieScraped = Partial<Movie>;
