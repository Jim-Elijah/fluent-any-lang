import 'fake-indexeddb/auto';

const SAMPLE_SPRITE =
  "<svg><symbol id='icon-play' viewBox='0 0 24 24'><path d='M0 0'/></symbol><symbol id='icon-pause' viewBox='0 0 24 24'><path d='M0 0'/></symbol><symbol id='icon-delete' viewBox='0 0 24 24'><path d='M0 0'/></symbol><symbol id='icon-download' viewBox='0 0 24 24'><path d='M0 0'/></symbol><symbol id='icon-audio' viewBox='0 0 24 24'><path d='M0 0'/></symbol><symbol id='icon-video' viewBox='0 0 24 24'><path d='M0 0'/></symbol></svg>";

// @ts-expect-error iconfont test stub
globalThis._iconfont_svg_string_5204781 = SAMPLE_SPRITE;

if (!globalThis.fetch) {
  globalThis.fetch = async () =>
    new Response(SAMPLE_SPRITE, {
      status: 200,
      headers: { 'Content-Type': 'image/svg+xml' },
    });
}
