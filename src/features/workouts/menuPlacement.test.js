import { describe, expect, it } from 'vitest';
import { calculateActionMenuLayout } from './menuPlacement.js';

describe('calculateActionMenuLayout', () => {
  it('opens down when the complete menu fits below the trigger', () => {
    expect(calculateActionMenuLayout({
      triggerTop: 100,
      triggerBottom: 144,
      menuHeight: 240,
      viewportTop: 8,
      viewportBottom: 800,
    })).toEqual({ placement: 'down', maxHeight: 649 });
  });

  it('opens up when mobile navigation leaves too little room below', () => {
    expect(calculateActionMenuLayout({
      triggerTop: 590,
      triggerBottom: 634,
      menuHeight: 240,
      viewportTop: 8,
      viewportBottom: 690,
    })).toEqual({ placement: 'up', maxHeight: 575 });
  });

  it('uses the larger side and constrains the menu on a short viewport', () => {
    expect(calculateActionMenuLayout({
      triggerTop: 205,
      triggerBottom: 249,
      menuHeight: 320,
      viewportTop: 8,
      viewportBottom: 360,
    })).toEqual({ placement: 'up', maxHeight: 190 });
  });
});
