// Finding the card's place in HA's nested shadow trees.

import { describe, it, expect } from 'vitest';
import { hasAncestor } from '../src/dom-ancestry';

describe('hasAncestor', () => {
  it('looks through shadow roots to their hosts', () => {
    const dialog = document.createElement('hui-dialog-edit-card');
    const inner = document.createElement('ha-dialog');
    dialog.attachShadow({ mode: 'open' }).appendChild(inner);
    const card = document.createElement('weather-radar-card');
    inner.attachShadow({ mode: 'open' }).appendChild(card);
    document.body.appendChild(dialog);
    expect(hasAncestor(card, 'hui-dialog-edit-card')).toBe(true);
    expect(hasAncestor(card, 'hui-card-picker')).toBe(false);
  });

  it("doesn't count the node itself", () => {
    const el = document.createElement('hui-dialog-edit-card');
    document.body.appendChild(el);
    expect(hasAncestor(el, 'hui-dialog-edit-card')).toBe(false);
  });
});
