import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../../test/db-helpers.js';
import './index.js';
import type { RecordingPage } from './index.js';

describe('recording-page', () => {
  let el: RecordingPage | undefined;

  beforeEach(async () => {
    await resetDatabase();
    el = document.createElement('recording-page') as RecordingPage;
    el.routeContext = {
      route: 'recording',
      params: { id: 'media-42' },
      query: {},
      data: {},
    };
    document.body.appendChild(el);
  });

  afterEach(() => {
    el?.remove();
    el = undefined;
  });

  it('renders record-list child', async () => {
    await el!.updateComplete;
    expect(el!.shadowRoot?.querySelector('record-list')).not.toBeNull();
  });
});
