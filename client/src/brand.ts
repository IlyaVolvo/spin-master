/** Product name shown in the UI. Club name still comes from system config when set. */
export const APP_NAME = 'SmashWhizz';
export const APP_NAME_TM = 'SmashWhizz™';

function trimLabel(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Optional Vite env labels around the product name in the browser tab.
 * Either may be set or omitted (default: title is just APP_NAME).
 * Examples:
 *   VITE_PAGE_TITLE_BEFORE=staging → "staging — SmashWhizz"
 *   VITE_PAGE_TITLE_AFTER=checkin → "SmashWhizz — checkin"
 *   both → "staging — SmashWhizz — checkin"
 */
export function resolveBrowserDocumentTitle(options?: {
  before?: string | null;
  after?: string | null;
}): string {
  const before = trimLabel(options?.before);
  const after = trimLabel(options?.after);
  return [before, APP_NAME, after].filter(Boolean).join(' — ');
}

export function applyBrowserDocumentTitle(): void {
  document.title = resolveBrowserDocumentTitle({
    before: import.meta.env.VITE_PAGE_TITLE_BEFORE,
    after: import.meta.env.VITE_PAGE_TITLE_AFTER,
  });
}
