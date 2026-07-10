import { describe, expect, it } from 'vitest';

import * as media from './media.js';
import * as record from './record.js';
import * as subtitle from './subtitle.js';
import * as service from './service.js';

describe('db service re-exports', () => {
  it('re-exports media helpers', () => {
    expect(service.addMedia).toBe(media.addMedia);
    expect(service.getMedia).toBe(media.getMedia);
    expect(service.getMediaList).toBe(media.getMediaList);
  });

  it('re-exports record helpers', () => {
    expect(service.saveRecording).toBe(record.saveRecording);
    expect(service.getRecordingList).toBe(record.getRecordingList);
    expect(service.deleteRecording).toBe(record.deleteRecording);
  });

  it('re-exports subtitle helpers', () => {
    expect(service.addSubtitle).toBe(subtitle.addSubtitle);
    expect(service.getSubtitle).toBe(subtitle.getSubtitle);
    expect(service.deleteSubtitle).toBe(subtitle.deleteSubtitle);
  });
});
