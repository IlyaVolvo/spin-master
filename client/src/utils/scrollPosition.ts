// Utility to save and restore scroll positions and UI states for navigation

const SCROLL_POSITION_KEY_PREFIX = 'scroll_position_';
const UI_STATE_KEY_PREFIX = 'ui_state_';

/**
 * Save scroll position for a route
 */
export const saveScrollPosition = (route: string, scrollTop: number): void => {
  try {
    sessionStorage.setItem(`${SCROLL_POSITION_KEY_PREFIX}${route}`, scrollTop.toString());
  } catch (error) {
    // Silently fail if sessionStorage is unavailable
  }
};

/**
 * Get saved scroll position for a route
 */
export const getScrollPosition = (route: string): number | null => {
  try {
    const saved = sessionStorage.getItem(`${SCROLL_POSITION_KEY_PREFIX}${route}`);
    return saved ? parseInt(saved, 10) : null;
  } catch (error) {
    return null;
  }
};

/**
 * Clear scroll position for a route
 */
export const clearScrollPosition = (route: string): void => {
  try {
    sessionStorage.removeItem(`${SCROLL_POSITION_KEY_PREFIX}${route}`);
  } catch (error) {
    // Silently fail if sessionStorage is unavailable
  }
};

/**
 * Clear all scroll positions
 */
export const clearAllScrollPositions = (): void => {
  try {
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith(SCROLL_POSITION_KEY_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (error) {
    // Silently fail if sessionStorage is unavailable
  }
};

/**
 * Save UI state for a route
 */
export const saveUIState = (route: string, state: any): void => {
  try {
    sessionStorage.setItem(`${UI_STATE_KEY_PREFIX}${route}`, JSON.stringify(state));
  } catch (error) {
    // Silently fail if sessionStorage is unavailable
  }
};

/**
 * Get saved UI state for a route
 */
export const getUIState = (route: string): any | null => {
  try {
    const saved = sessionStorage.getItem(`${UI_STATE_KEY_PREFIX}${route}`);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    return null;
  }
};

/**
 * Clear UI state for a route
 */
export const clearUIState = (route: string): void => {
  try {
    sessionStorage.removeItem(`${UI_STATE_KEY_PREFIX}${route}`);
  } catch (error) {
    // Silently fail if sessionStorage is unavailable
  }
};

/**
 * Clear all UI states
 */
export const clearAllUIStates = (): void => {
  try {
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith(UI_STATE_KEY_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (error) {
    // Silently fail if sessionStorage is unavailable
  }
};

