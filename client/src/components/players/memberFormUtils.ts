/**
 * Date/age helpers for member add/edit forms (shared by Players and future settings flows).
 */

export function toDateOnlyString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseBirthDateToLocalDate(value: string): Date {
  const datePart = value.split('T')[0];
  const [yearRaw, monthRaw, dayRaw] = datePart.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 31
  ) {
    return new Date(year, month - 1, day);
  }

  return new Date(value);
}

export function getBirthDateYearRangeMessage(minDate: Date, maxDate: Date): string {
  const minYear = minDate.getUTCFullYear();
  const maxYear = maxDate.getUTCFullYear();
  return `Birth date must be between years ${minYear} and ${maxYear}`;
}

/** Age in full years from ISO or date-only birth string; null if unknown. */
export function calculateMemberAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = parseBirthDateToLocalDate(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
