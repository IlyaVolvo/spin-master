// Pure utility functions for player CSV export and import parsing.
// These have no React dependencies and can be tested independently.

import {
  getBirthDateBounds,
  isValidBirthDate,
  isValidEmailFormat,
  isValidPhoneNumber,
  isValidRatingInput,
} from '../../../../server/src/utils/memberValidation';

interface ExportablePlayer {
  firstName: string;
  lastName: string;
  email: string;
  birthDate: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  roles: string[];
  phone?: string | null;
  address?: string | null;
  rating: number | null;
}

// ─── CSV Export ──────────────────────────────────────────────────────────────

export function generatePlayersCsv(players: ExportablePlayer[]): string {
  const headers = ['firstname', 'lastname', 'email', 'date of birth', 'gender', 'roles', 'phone', 'address', 'rating'];
  const csvRows = [
    headers.join(','),
    ...players.map((player) => {
      return headers.map(header => {
        let value: any;
        switch (header) {
          case 'firstname':
            value = player.firstName;
            break;
          case 'lastname':
            value = player.lastName;
            break;
          case 'email':
            value = player.email;
            break;
          case 'date of birth':
            value = player.birthDate;
            // Format birthDate if it's a date string
            if (value) {
              const date = new Date(value);
              if (!isNaN(date.getTime())) {
                value = date.toISOString().split('T')[0];
              }
            }
            break;
          case 'gender':
            value = player.gender;
            break;
          case 'roles':
            // Convert roles to comma-separated first letters
            if (player.roles && player.roles.length > 0) {
              value = player.roles.map(role => role.charAt(0)).join(', ');
            } else {
              value = '';
            }
            break;
          case 'phone':
            value = player.phone || '';
            break;
          case 'address':
            value = player.address || '';
            break;
          case 'rating':
            value = player.rating || '';
            break;
          default:
            value = '';
        }
        
        if (value === null || value === undefined) return '';
        
        // Escape commas and quotes in CSV
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',');
    }),
  ];

  return csvRows.join('\n');
}

export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ─── CSV Import Parsing ─────────────────────────────────────────────────────

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export interface ParsedImportResult {
  players: any[];
  errors: string[];
}

export function parsePlayersCsv(text: string): ParsedImportResult {
  const { minDate, maxDate } = getBirthDateBounds();
  const minDateString = minDate.toISOString().split('T')[0];
  const maxDateString = maxDate.toISOString().split('T')[0];

  // Filter out empty lines and lines starting with #
  const lines = text.split('\n').filter(line => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('#');
  });
  
  if (lines.length < 2) {
    return { players: [], errors: ['CSV file must have at least a header row and one data row'] };
  }

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const requiredHeaders = ['firstname', 'lastname', 'email'];
  const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
  
  // Check for birthdate (can be 'birthdate' or 'date of birth')
  const hasBirthdate = headers.includes('birthdate') || headers.includes('date of birth');
  if (!hasBirthdate) {
    missingHeaders.push('birthdate (or "date of birth")');
  }
  
  if (missingHeaders.length > 0) {
    return { players: [], errors: [`Missing required columns: ${missingHeaders.join(', ')}`] };
  }

  // Map headers to player fields
  const players: any[] = [];
  const errors: string[] = [];
  
  lines.slice(1).forEach((line, index) => {
    const values = parseCSVLine(line);
    const player: any = {};
    const rowNumber = index + 2; // Row number (accounting for header row)
    let rowRatingError = '';
    
    headers.forEach((header, i) => {
      const value = values[i]?.trim() || '';
      if (value === '') return;
      
      switch (header) {
        case 'firstname':
          player.firstName = value;
          break;
        case 'lastname':
          player.lastName = value;
          break;
        case 'email':
          player.email = value;
          break;
        case 'date of birth':
        case 'birthdate':
          // Try to parse date
          const date = new Date(value);
          if (isValidBirthDate(date)) {
            player.birthDate = date.toISOString().split('T')[0];
          } else {
            errors.push(`Row ${rowNumber}: Birth date must be between ${minDateString} and ${maxDateString}`);
          }
          break;
        case 'gender':
          const genderUpper = value.toUpperCase();
          if (['MALE', 'FEMALE', 'OTHER'].includes(genderUpper)) {
            player.gender = genderUpper;
          }
          break;
        case 'roles':
          // Parse comma-separated first letters back to full role names
          const roleLetters = value.split(',').map(r => r.trim().toUpperCase());
          const roleMap: { [key: string]: string } = {
            'P': 'PLAYER',
            'C': 'COACH',
            'A': 'ADMIN',
            'O': 'ORGANIZER'
          };
          const roles = roleLetters
            .map(letter => roleMap[letter])
            .filter(role => role !== undefined);
          if (roles.length > 0) {
            player.roles = roles;
          }
          break;
        case 'phone':
          player.phone = value;
          break;
        case 'address':
          player.address = value;
          break;
        case 'rating':
          if (isValidRatingInput(value)) {
            player.rating = parseInt(value, 10);
          } else {
            rowRatingError = `Row ${rowNumber}: Rating must be an integer between 0 and 9999`;
          }
          break;
      }
    });
    
    // Validate required fields
    const rowErrors: string[] = [];
    
    if (!player.firstName || !player.lastName) {
      rowErrors.push(`Row ${rowNumber}: Missing required fields (firstName, lastName)`);
    }
    
    // Validate email (required)
    if (!player.email || !player.email.trim()) {
      rowErrors.push(`Row ${rowNumber}: Email is required`);
    } else {
      if (!isValidEmailFormat(player.email.trim())) {
        rowErrors.push(`Row ${rowNumber}: Invalid email format`);
      }
    }
    
    // Validate birthdate (required)
    if (!player.birthDate) {
      rowErrors.push(`Row ${rowNumber}: Birth date is required`);
    }

    // Validate phone (optional)
    if (player.phone && !isValidPhoneNumber(player.phone.trim())) {
      rowErrors.push(`Row ${rowNumber}: Invalid phone number format. Please enter a valid US phone number`);
    }

    if (rowRatingError) {
      rowErrors.push(rowRatingError);
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return; // Skip this player
    }
    
    // Set mustResetPassword to true for all imported players
    player.mustResetPassword = true;
    
    players.push(player);
  });

  return { players, errors };
}
