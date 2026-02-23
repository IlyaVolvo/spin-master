export function isValidMemberName(name: string): boolean {
  if (typeof name !== 'string') return false;

  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 50) return false;

  // Allow letters with optional separators between name parts.
  return /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/.test(trimmed);
}

export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || phone.trim() === '') return true; // Optional field, empty is valid

  const cleaned = phone.replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(cleaned)) return false;

  const digitsOnly = cleaned.replace(/^\+/, '');

  // US phone numbers: 10 digits, optionally prefixed with country code "1".
  if (digitsOnly.length === 10) return true;
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) return true;

  return false;
}

export function isValidEmailFormat(email: string): boolean {
  if (!email || email.trim() === '') return false;

  const trimmed = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) return false;

  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;

  const domain = parts[1];
  if (!domain.includes('.')) return false;

  const domainParts = domain.split('.');
  if (domainParts.length < 2) return false;

  return domainParts[domainParts.length - 1].length >= 2;
}

export function getBirthDateBounds(): { minDate: Date; maxDate: Date } {
  const currentYear = new Date().getUTCFullYear();

  return {
    minDate: new Date(Date.UTC(currentYear - 105, 0, 1)),
    maxDate: new Date(Date.UTC(currentYear - 5, 0, 1)),
  };
}

export function isValidBirthDate(input: string | Date): boolean {
  const birthDate = input instanceof Date ? input : new Date(input);

  if (Number.isNaN(birthDate.getTime())) return false;

  const { minDate, maxDate } = getBirthDateBounds();

  return birthDate >= minDate && birthDate <= maxDate;
}

export function isValidRatingInput(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;

  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') return true;

  const num = Number(normalized);
  return Number.isInteger(num) && num >= 0 && num <= 9999;
}

export function isSuspiciousRating(value: unknown): boolean {
  if (!isValidRatingInput(value)) return false;
  if (value === null || value === undefined || value === '') return false;

  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') return false;

  const num = Number(normalized);
  return num < 800 || num > 2100;
}
