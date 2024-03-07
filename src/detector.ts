import {conf, env} from './environment';
import * as fs from 'fs';
import * as path from 'path';

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

export async function* detect() {
  if (typeof conf.from === 'string') {
    for await (const filePath of walk(conf.from, conf.detector.extensions)) {
      env.logger.info(`Detecting ${filePath}...`);
      const movieIdResult = await getMovieId(filePath);
      if (movieIdResult) {
        const [, movieId, tag] = movieIdResult;
        env.logger.info(`${path.basename(filePath)} -> ${movieId} (${tag})`);
        yield movieIdResult;
      }
    }
  }
}

async function getMovieId(fullPath: string): Promise<MovieIdResult | null> {
  const baseName = path.basename(fullPath);
  const baseNameSanitized = baseName.replace(
    new RegExp(conf.detector.ignoreKeywordRegex),
    ''
  );

  for (const [regex_detect, template, tag] of conf.detector.matchRules) {
    const matched = new RegExp(regex_detect).exec(baseNameSanitized);
    if (!matched) continue;
    const rendered = await env.templater.parseAndRender(
      template,
      matched.groups
    );
    return [fullPath, rendered, tag] as MovieIdResult;
  }
  return null;
}
