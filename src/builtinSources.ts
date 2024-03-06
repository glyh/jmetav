import {MovieInfoSource} from './movie';
export const builtinSources = {
  JAVLibrary: {
    meta: {
      prefersProxy: true,
      cookies: {over18: '18'},
      urlTemplate:
        'https://www.javlibrary.com/{{locale}}/vl_searchbyid.php?keyword={{ID}}',
    },

    rules: {
      ID: ['div#video_id >>> td.text', {}, 'single'],
      title: ['div#video_title > h3', {}, 'single'],
      publishDate: ['div#video_date >>> td[class="text"]', {}, 'single'],
      director: ['span.director > a', {}, 'single'],
      producer: ['span.maker > a', {}, 'single'],
      publisher: ['span.label > a', {}, 'single'],
      score: ['span.score', {}, 'single'],
      genre: ['div#video_genres >>> span.genre > a', {}, 'multi'],
      cover: ['img#video_jacket_img', 'src', 'single'],
      thumbs: ['div.previewthumbs > a:not(.btn_videoplayer)', 'href', 'multi'],
    },
  } as MovieInfoSource,
};
