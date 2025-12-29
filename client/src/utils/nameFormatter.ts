/**
 * Utility functions for formatting player names
 */

export type NameDisplayOrder = 'firstLast' | 'lastFirst';

/**
 * Formats a player's name based on display order preference
 * @param firstName - Player's first name
 * @param lastName - Player's last name
 * @param order - Display order preference ('firstLast' or 'lastFirst')
 * @returns Formatted name string
 */
export function formatPlayerName(
  firstName: string,
  lastName: string,
  order: NameDisplayOrder = 'firstLast'
): string {
  if (order === 'lastFirst') {
    return `${lastName} ${firstName}`;
  }
  return `${firstName} ${lastName}`;
}

/**
 * Gets the default name display order from localStorage or returns default
 */
export function getNameDisplayOrder(): NameDisplayOrder {
  const stored = localStorage.getItem('nameDisplayOrder');
  if (stored === 'lastFirst' || stored === 'firstLast') {
    return stored;
  }
  return 'firstLast'; // Default
}

/**
 * Saves the name display order preference to localStorage
 */
export function setNameDisplayOrder(order: NameDisplayOrder): void {
  localStorage.setItem('nameDisplayOrder', order);
}

