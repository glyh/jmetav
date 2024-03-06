import {Environment} from './environment';
import * as fs from 'fs';
import * as path from 'path';
import Mustache = require('mustache');

// path, id, tag
type MovieIdResult = readonly [string, string, string];

async function* walk(
  dir: string,
  extensions: string[]
): AsyncGenerator<string> {
  for await (const d of await fs.promises.opendir(dir)) {
    const entry = path.join(dir, d.name);
    if (d.isDirectory()) {
      yield* walk(entry, extensions);
    } else if (d.isFile() && extensions.includes(path.extname(d.name))) {
      yield entry;
    }
  }
}

export async function* detect(env: Environment) {
  if (typeof env.from === 'string') {
    for await (const filePath of walk(env.from, env.detector.extensions)) {
      env.logger.info(`Detecting ${filePath}...`);
      const movieIdResult = await getMovieId(env, filePath);
      if (movieIdResult) {
        const [, movieId, tag] = movieIdResult;
        env.logger.info(`${path.basename(filePath)} -> ${movieId} (${tag})`);
        yield movieIdResult;
      }
    }
  }
}

async function getMovieId(
  env: Environment,
  fullPath: string
): Promise<MovieIdResult | null> {
  const baseName = path.basename(fullPath);
  const baseNameSanitized = baseName.replace(
    env.detector.ignoreKeywordRegex,
    ''
  );

  for (const [regex_detect, template, tag] of env.detector.matchRules) {
    const matched = regex_detect.exec(baseNameSanitized);
    if (!matched) continue;
    // console.log(Mustache.render);
    const rendered = Mustache.render(template, matched.groups);
    return [fullPath, rendered, tag] as MovieIdResult;
  }
  return null;
}
