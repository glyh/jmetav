export type Movie = {
  srcProxied: boolean;
  ruleTag: string;
  ID: string;
  urls: string[]; // May have multiple source for a single movie.
  plot: string;
  cover: string;
  // bigCover: URL; // what is big cover?
  genres: string[]; // TODO: genreID to deduplicate, genreNorm to normalize
  score: string;
  title: string; // TODO: unsanitized title at origTitle
  magnet: string;
  series: string;
  actresses: string[];
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
