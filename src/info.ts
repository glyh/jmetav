import axios from 'axios';
import {createWriteStream} from 'fs';
import * as XmlBuilder from 'xmlbuilder2';

import {Movie} from './movie';
import {Environment} from './environment';

import {promises as fsp} from 'fs';
import * as path from 'path';

export function sanitizeMovie(m: Partial<Movie>): Partial<Movie> {
  return m;
}

// download with puppeteer now seems broken or at least VERY verbose now.
// https://stackoverflow.com/questions/41938718/how-to-download-files-using-axios
export async function downloadFile(
  fileUrl: string,
  outputLocationPath: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any
) {
  const writer = createWriteStream(outputLocationPath);

  return axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
    ...options,
  }).then(response => {
    //ensure that the user can call `then()` only when the file has
    //been downloaded entirely.
    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      let error: Error | null = null;
      writer.on('error', err => {
        error = err;
        writer.close();
        reject(err);
      });
      writer.on('close', () => {
        if (!error) {
          resolve(true);
        }
        //no need to call the reject here, as it will have been called in the
        //'error' stream;
      });
    });
  });
}

export async function saveNFO(env: Environment, movie: Partial<Movie>) {
  let builder = XmlBuilder.create({version: '1.0'});
  builder = builder.ele('movie'); // <movie>
  if (movie.plot) builder = builder.ele('plot').txt(movie.plot).up();
  if (movie.title) builder = builder.ele('title').txt(movie.title).up();
  if (movie.score) builder = builder.ele('rating').txt(movie.score).up();
  if (movie.publishDate)
    builder = builder.ele('releasedate').txt(movie.publishDate).up();
  if (movie.producer) builder = builder.ele('studio').txt(movie.producer).up();
  if (movie.ID) builder = builder.ele('numid').txt(movie.ID).up();
  const baseDir = env.to || env.from;
  let targetPath = path.join(
    baseDir,
    await env.templater.parseAndRender(env.scraper.pathFormatter, movie)
  );
  targetPath = path.resolve(targetPath);
  await fsp.mkdir(targetPath, {recursive: true});
  const pool = [] as Promise<any>[];
  const coverPath = path.join(targetPath, 'cover.jpg');
  if (movie.cover) {
    pool.push(
      downloadFile(movie.cover, coverPath, {
        proxy: movie.srcProxied ? env.scraper.proxy : {},
      })
    );
    builder.ele('art').ele('poster').txt('cover.jpg');
  }
  for (const genre of movie.genres || []) {
    builder = builder.ele('genre').txt(genre).up().ele('tag').txt(genre).up();
  }
  for (const actress of movie.actresses || []) {
    builder = builder.ele('actor').ele('name').txt(actress).up().up();
  }
  builder = builder.up(); // </movie>
  const xml = builder.end({prettyPrint: true});
  const nfoPath = path.join(targetPath, 'movie.nfo');
  pool.push(fsp.writeFile(nfoPath, xml));
  env.logger.info(`Writing nfo to ${nfoPath} with cover to ${coverPath}`);
  await Promise.all(pool);
  return true;
}
