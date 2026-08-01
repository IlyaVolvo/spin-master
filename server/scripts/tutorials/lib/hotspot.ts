import type { Page } from 'puppeteer-core';
import { VIEWPORT } from './constants';

export type HotspotPct = { x: number; y: number; w: number; h: number };

/** Bounding box of a selector as % of the capture viewport. */
export async function hotspotForSelector(page: Page, selector: string): Promise<HotspotPct> {
  const handle = await page.$(selector);
  if (!handle) {
    throw new Error(`Hotspot selector not found: ${selector}`);
  }
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error(`No bounding box for: ${selector}`);
  }
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

/** Find a button by substring and return hotspot %. */
export async function hotspotForButtonText(page: Page, text: string): Promise<HotspotPct> {
  const box = await page.evaluate((t) => {
    const buttons = [...document.querySelectorAll('button')] as HTMLButtonElement[];
    const b = buttons.find((x) => (x.textContent || '').includes(t));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, text);
  if (!box) {
    throw new Error(`Button containing "${text}" not found for hotspot`);
  }
  return boxToPct(box, VIEWPORT.width, VIEWPORT.height);
}

export function boxToPct(
  box: { x: number; y: number; width: number; height: number },
  vw: number,
  vh: number,
): HotspotPct {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    x: round1((box.x / vw) * 100),
    y: round1((box.y / vh) * 100),
    w: round1((box.width / vw) * 100),
    h: round1((box.height / vh) * 100),
  };
}
