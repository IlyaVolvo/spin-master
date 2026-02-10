import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import bcrypt from 'bcryptjs';
import { emitToAll } from '../services/socketService';

const router = express.Router();

// Calculate Levenshtein distance between two strings
function levenshteinDistance(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];

  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

// Calculate similarity percentage (0-100)
function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 100;
  return ((maxLength - distance) / maxLength) * 100;
}

// All routes require authentication
router.use(authenticate);

// Helper function to check if current user is an admin
async function isAdmin(req: AuthRequest): Promise<boolean> {
  // Check if session has member with ADMIN role
  if (req.member && req.member.roles.includes('ADMIN')) {
    return true;
  }
  
  // Check if JWT token has memberId and member is admin
  if (req.memberId) {
    const member = await prisma.member.findUnique({
      where: { id: req.memberId },
      select: { roles: true },
    });
    return member?.roles.includes('ADMIN') || false;
  }
  
  return false;
}

async function isOrganizer(req: AuthRequest): Promise<boolean> {
  // Check if session has member with ORGANIZER role
  if (req.member && req.member.roles.includes('ORGANIZER')) {
    return true;
  }
  
  // Check if JWT token has memberId and member is organizer
  if (req.memberId) {
    const member = await prisma.member.findUnique({
      where: { id: req.memberId },
      select: { roles: true },
    });
    return member?.roles.includes('ORGANIZER') || false;
  }
  
  return false;
}

// Legacy function for backward compatibility
async function isAdminMember(memberId: number): Promise<boolean> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { roles: true },
  });
  return member?.roles.includes('ADMIN') || false;
}

// Helper function to get member ID from JWT token (for member authentication)
async function getMemberIdFromToken(req: AuthRequest): Promise<number | null> {
  // This will be used when we add member authentication
  // For now, we'll use the User system
  return null;
}

// Get all members with Member role (for backward compatibility, this endpoint shows only members)
router.get('/', async (req, res) => {
  try {
    const members = await prisma.member.findMany({
      where: {
        roles: {
          has: 'PLAYER',
        },
      },
      orderBy: [
        { rating: 'desc' },
        { lastName: 'asc' },
        { firstName: 'asc' }
      ],
    });

    // Exclude sensitive fields (password) - rating is already included in the query
    const membersWithoutPassword = members.map((member: any) => {
      const { password, ...memberWithoutPassword } = member;
      return memberWithoutPassword;
    });

    res.json(membersWithoutPassword);
  } catch (error) {
    logger.error('Error fetching members', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all members (Admin only - includes all roles)
router.get('/all-members', async (req: AuthRequest, res) => {
  try {
    // Check if user is admin
    const hasAdminAccess = await isAdmin(req);
    if (!hasAdminAccess) {
      return res.status(403).json({ error: 'Only Admins can view all members' });
    }

    const members = await prisma.member.findMany({
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' }
      ],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        gender: true,
        birthDate: true,
        phone: true,
        address: true,
        picture: true,
        rating: true,
        roles: true,
        isActive: true,
      },
    });

    res.json(members);
  } catch (error) {
    logger.error('Error fetching all members', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get active members with Member role only
router.get('/active', async (req, res) => {
  try {
    const members = await prisma.member.findMany({
      where: { 
        isActive: true,
        roles: {
          has: 'PLAYER',
        },
      },
      orderBy: [
        { rating: 'desc' },
        { lastName: 'asc' },
        { firstName: 'asc' }
      ],
    });

    // Exclude sensitive fields (password) - rating is already included in the query
    const membersWithoutPassword = members.map((member: any) => {
      const { password, ...memberWithoutPassword } = member;
      return memberWithoutPassword;
    });

    res.json(membersWithoutPassword);
  } catch (error) {
    logger.error('Error fetching active members', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single member
router.get('/:id', async (req, res) => {
  try {
    const memberId = parseInt(req.params.id);
    if (isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }
    
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      include: {
        ratingHistory: {
          orderBy: { timestamp: 'desc' },
          take: 50, // Last 50 rating changes
        },
      } as any,
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Exclude password from response
    const { password, ...memberWithoutPassword } = member;
    res.json(memberWithoutPassword);
  } catch (error) {
    logger.error('Error fetching member', { error: error instanceof Error ? error.message : String(error), memberId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to determine gender from name
function determineGender(firstName: string): 'MALE' | 'FEMALE' | 'OTHER' {
  const name = firstName.toLowerCase();
  const femalePatterns = ['a', 'ia', 'ella', 'ette', 'ine', 'ina', 'elle', 'anna', 'ella'];
  const malePatterns = ['o', 'er', 'on', 'en', 'an', 'el', 'us', 'is'];
  
  for (const pattern of femalePatterns) {
    if (name.endsWith(pattern) && name.length > 3) {
      return 'FEMALE';
    }
  }
  
  for (const pattern of malePatterns) {
    if (name.endsWith(pattern) && name.length > 3) {
      return 'MALE';
    }
  }
  
  return 'OTHER';
}

// Generate email from first name and last name
function generateEmail(firstName: string, lastName: string): string {
  const firstLetter = firstName.charAt(0).toLowerCase();
  const lastNameLower = lastName.toLowerCase().replace(/\s+/g, '');
  return `${firstLetter}${lastNameLower}@example.com`;
}

// Validate phone number format
function isValidPhoneNumber(phone: string): boolean {
  if (!phone || phone.trim() === '') return true; // Optional field, empty is valid
  
  // Remove common formatting characters
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  
  // Check if it's all digits (with optional + prefix for international)
  if (!/^\+?\d+$/.test(cleaned)) return false;
  
  // Check length (minimum 10 digits, maximum 15 for international)
  const digitsOnly = cleaned.replace(/^\+/, '');
  if (digitsOnly.length < 10 || digitsOnly.length > 15) return false;
  
  return true;
}

// Validate roles array
function isValidRoles(roles: any): boolean {
  if (!roles) return true; // Optional field
  if (!Array.isArray(roles)) return false;
  
  const validRoles = ['PLAYER', 'COACH', 'ADMIN', 'ORGANIZER'];
  return roles.every(role => typeof role === 'string' && validRoles.includes(role));
}

// Validate email format (more strict than express-validator's isEmail)
function isValidEmailFormat(email: string): boolean {
  if (!email || email.trim() === '') return false;
  
  // Basic email regex pattern
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return false;
  
  // Check for valid domain (at least one dot after @)
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  
  const domain = parts[1];
  if (!domain.includes('.')) return false;
  
  // Check domain has valid TLD (at least 2 characters)
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return false;
  if (domainParts[domainParts.length - 1].length < 2) return false;
  
  return true;
}

// Add new member
router.post('/', [
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim(),
  body('email').notEmpty().trim().isEmail(),
  body('gender').optional().isIn(['MALE', 'FEMALE', 'OTHER']),
  body('birthDate').notEmpty().isISO8601().toDate(),
  body('rating').optional().isInt({ min: 0, max: 9999 }),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('picture').optional().trim(),
  body('roles').optional().isArray(),
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, lastName, email, gender, birthDate, rating, phone, address, picture, roles, skipSimilarityCheck } = req.body;
    
    // Additional validation for email, phone, and roles
    const validationErrors: string[] = [];
    
    // Validate email (required)
    if (!email || !email.trim()) {
      validationErrors.push('Email is required');
    } else if (!isValidEmailFormat(email.trim())) {
      validationErrors.push('Invalid email format');
    }
    
    // Validate phone if provided
    if (phone) {
      if (!isValidPhoneNumber(phone.trim())) {
        validationErrors.push('Invalid phone number format. Phone should be 10-15 digits and may include +, spaces, dashes, parentheses, or dots');
      }
    }
    
    // Validate roles if provided
    if (roles !== undefined) {
      if (!isValidRoles(roles)) {
        validationErrors.push('Invalid roles. Roles must be an array containing only: PLAYER, COACH, ADMIN, ORGANIZER');
      }
    }
    
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors.map(msg => ({ msg, param: 'validation' })) });
    }
    const fullName = `${firstName} ${lastName}`;

    // Get all existing members
    const allMembers = await prisma.member.findMany({
      select: { firstName: true, lastName: true },
    });

    // Check for exact duplicate (case-insensitive) - always block exact duplicates
    const exactMatch = allMembers.find(
      (p) => 
        p.firstName.toLowerCase() === firstName.toLowerCase() &&
        p.lastName.toLowerCase() === lastName.toLowerCase()
    );

    if (exactMatch) {
      return res.status(400).json({ error: 'A member with this name already exists' });
    }

    // Skip similarity check if user confirmed they want to proceed
    if (!skipSimilarityCheck) {
      // Check for similar names (similarity >= 80% or edit distance <= 2)
      const similarMembers = allMembers
        .map((p: { firstName: string; lastName: string }) => {
          const existingFullName = `${p.firstName} ${p.lastName}`;
          return {
            firstName: p.firstName,
            lastName: p.lastName,
            fullName: existingFullName,
            similarity: calculateSimilarity(fullName, existingFullName),
            distance: levenshteinDistance(fullName, existingFullName),
          };
        })
        .filter((p: { similarity: number; distance: number }) => p.similarity >= 80 || p.distance <= 2)
        .sort((a: { similarity: number }, b: { similarity: number }) => b.similarity - a.similarity);

      // If similar names found, return them for confirmation (don't block, just warn)
      const similarNames = similarMembers.map((p: { fullName: string; similarity: number }) => ({
        name: p.fullName,
        similarity: Math.round(p.similarity),
      }));

      if (similarNames.length > 0) {
        return res.status(200).json({
          requiresConfirmation: true,
          message: 'Similar member names found',
          similarNames: similarNames,
          proposedFirstName: firstName,
          proposedLastName: lastName,
          proposedBirthDate: birthDate || null,
          proposedRating: rating || null,
        });
      }
    }

    // Use provided email (required)
    const finalEmail = email.trim();
    
    // Check if email already exists
    const existing = await prisma.member.findUnique({
      where: { email: finalEmail },
    });
    if (existing) {
      return res.status(400).json({ error: 'A member with this email already exists' });
    }

    // Determine gender if not provided
    const finalGender = gender || determineGender(firstName);

    // Default password is 'changeme'
    const defaultPassword = await bcrypt.hash('changeme', 10);

    // Default roles is ['PLAYER']
    const finalRoles = roles && Array.isArray(roles) && roles.length > 0 ? roles : ['PLAYER'];

    // Validate birthDate is provided
    if (!birthDate) {
      return res.status(400).json({ error: 'Birth date is required' });
    }

    // Create member with all fields
    const member = await prisma.member.create({
      data: {
        firstName,
        lastName,
        email: finalEmail,
        gender: finalGender,
        password: defaultPassword,
        roles: finalRoles,
        birthDate: new Date(birthDate),
        rating: rating ? parseInt(rating) : null,
        phone: phone ? phone.trim() : null,
        address: address ? address.trim() : null,
        picture: picture ? picture.trim() : null,
        isActive: true,
      },
    });

    // Exclude password from response
    const { password, ...memberWithoutPassword } = member;
    
    // Emit socket notification for player creation
    emitToAll('player:created', {
      player: memberWithoutPassword,
      timestamp: Date.now(),
    });
    
    res.status(201).json(memberWithoutPassword);
  } catch (error) {
    logger.error('Error creating member', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Deactivate member
router.patch('/:id/deactivate', async (req: AuthRequest, res) => {
  try {
    const memberId = parseInt(req.params.id);
    if (isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }
    
    const member = await prisma.member.update({
      where: { id: memberId },
      data: { isActive: false },
    });

    const { password, ...memberWithoutPassword } = member;
    
    // Emit socket notification for player update
    emitToAll('player:updated', {
      player: memberWithoutPassword,
      timestamp: Date.now(),
    });
    
    res.json(memberWithoutPassword);
  } catch (error) {
    logger.error('Error deactivating member', { error: error instanceof Error ? error.message : String(error), memberId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete member (Admin only) - only if not referenced in any matches
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    // Check if user is admin
    const hasAdminAccess = await isAdmin(req);
    if (!hasAdminAccess) {
      return res.status(403).json({ error: 'Only Admins can delete members' });
    }

    const memberId = parseInt(req.params.id);
    if (isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }

    // Check if member exists
    const member = await prisma.member.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Check if member is referenced in any matches (excluding BYE matches)
    // BYE matches have member2Id === null or member2Id === 0, and shouldn't prevent deletion
    const matchCount = await prisma.match.count({
      where: {
        AND: [
          {
            OR: [
              { member1Id: memberId },
              { member2Id: memberId },
            ],
          },
          {
            // Exclude BYE matches - these are not real games
            member1Id: { not: 0 },
            member2Id: { not: null },
            NOT: { member2Id: 0 },
          },
        ],
      },
    });

    if (matchCount > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete member. Member is referenced in matches and cannot be deleted.',
        matchCount 
      });
    }

    // Check if member has tournament participations (these have onDelete: Restrict)
    const tournamentParticipantCount = await prisma.tournamentParticipant.count({
      where: { memberId },
    });

    if (tournamentParticipantCount > 0) {
      // Delete tournament participations first
      await prisma.tournamentParticipant.deleteMany({
        where: { memberId },
      });
    }

    // Delete the member (rating history will cascade automatically)
    await prisma.member.delete({
      where: { id: memberId },
    });

    logger.info('Member deleted', { memberId, email: member.email });

    // Emit socket notification for player deletion
    emitToAll('player:deleted', {
      playerId: memberId,
      timestamp: Date.now(),
    });

    res.json({ message: 'Member deleted successfully', memberId });
  } catch (error) {
    logger.error('Error deleting member', { error: error instanceof Error ? error.message : String(error), memberId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if member can be deleted (not referenced in matches)
router.get('/:id/can-delete', async (req: AuthRequest, res) => {
  try {
    // Check if user is admin
    const hasAdminAccess = await isAdmin(req);
    if (!hasAdminAccess) {
      return res.status(403).json({ error: 'Only Admins can check delete eligibility' });
    }

    const memberId = parseInt(req.params.id);
    if (isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }

    // Check if member exists
    const member = await prisma.member.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Check if member is referenced in any matches (excluding BYE matches)
    // BYE matches have member2Id === null or member2Id === 0, and shouldn't prevent deletion
    const matchCount = await prisma.match.count({
      where: {
        AND: [
          {
            OR: [
              { member1Id: memberId },
              { member2Id: memberId },
            ],
          },
          {
            // Exclude BYE matches - these are not real games
            member1Id: { not: 0 },
            member2Id: { not: null },
            NOT: { member2Id: 0 },
          },
        ],
      },
    });

    // Check if member is a participant in any tournaments
    // Note: Tournament participants can be deleted (they are deleted before the member),
    // but we still report this information
    const tournamentParticipantCount = await prisma.tournamentParticipant.count({
      where: { memberId },
    });

    // Member can be deleted if they have no matches
    // Tournament participants will be automatically deleted when the member is deleted
    res.json({ 
      canDelete: matchCount === 0,
      matchCount,
      tournamentParticipantCount,
    });
  } catch (error) {
    logger.error('Error checking delete eligibility', { error: error instanceof Error ? error.message : String(error), memberId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reactivate member
router.patch('/:id/activate', async (req: AuthRequest, res) => {
  try {
    const memberId = parseInt(req.params.id);
    if (isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }
    
    const member = await prisma.member.update({
      where: { id: memberId },
      data: { isActive: true },
    });

    const { password, ...memberWithoutPassword } = member;
    res.json(memberWithoutPassword);
  } catch (error) {
    logger.error('Error reactivating member', { error: error instanceof Error ? error.message : String(error), memberId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update member information
router.patch('/:id', [
  body('firstName').optional().trim().notEmpty(),
  body('lastName').optional().trim().notEmpty(),
  body('email').optional().isEmail(),
  body('birthDate').optional().isISO8601().toDate(),
  body('rating').optional().custom((value) => {
    if (value === null || value === undefined || value === '') {
      return true; // Allow null/empty values
    }
    const num = parseInt(value);
    return !isNaN(num) && num >= 0 && num <= 9999;
  }).withMessage('Rating must be an integer between 0 and 9999, or null'),
  body('isActive').optional().isBoolean(),
  body('gender').optional().isIn(['MALE', 'FEMALE', 'OTHER']),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('picture').optional().trim(),
  body('roles').optional().isArray(),
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const memberId = parseInt(req.params.id);
    if (isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }

    // Get the member being updated (including current rating for history tracking)
    const existingMember = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, email: true, firstName: true, lastName: true, roles: true, rating: true },
    });

    if (!existingMember) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Store old rating for history tracking
    const oldRating = existingMember.rating;

    // Authorization check: Only Admins can modify member profiles, or members can modify their own (with restrictions)
    const isCurrentMember = req.memberId === memberId;
    const hasAdminAccess = await isAdmin(req);
    
    // Only Admins can modify other members' profiles
    if (!isCurrentMember && !hasAdminAccess) {
      return res.status(403).json({ error: 'Only Administrators can modify other members\' profiles.' });
    }

    const { firstName, lastName, email, gender, birthDate, rating, isActive, phone, address, picture, roles, ...rest } = req.body;

    // Explicitly prevent password updates through this endpoint
    // Password can only be changed through /auth/member/change-password or reset through /auth/member/:id/reset-password
    if (rest.password !== undefined) {
      return res.status(403).json({ error: 'Password cannot be updated through this endpoint. Use the change password endpoint instead.' });
    }

    // Build update data object (only include provided fields)
    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName.trim();
    if (lastName !== undefined) updateData.lastName = lastName.trim();
    
    // Email can only be changed by the member themselves or Admins
    if (email !== undefined) {
      // Check if email is being changed
      if (email !== existingMember.email) {
        // Verify authorization for email change
        if (!isCurrentMember && !hasAdminAccess) {
          return res.status(403).json({ error: 'Only the member themselves or Admins can change email' });
        }
        
        // Check if email already exists
        const emailExists = await prisma.member.findUnique({
          where: { email },
        });
        if (emailExists) {
          return res.status(400).json({ error: 'Email already in use' });
        }
        updateData.email = email;
      }
    }
    
    if (birthDate !== undefined) {
      updateData.birthDate = birthDate ? new Date(birthDate) : null;
    }
    if (rating !== undefined) {
      // Only Admins can change rating
      if (!hasAdminAccess) {
        return res.status(403).json({ error: 'Only Administrators can change rating.' });
      }
      // Allow setting rating to null to remove rating
      if (rating === null || rating === '' || rating === undefined) {
        updateData.rating = null;
      } else {
        const ratingNum = parseInt(String(rating));
        if (!isNaN(ratingNum) && ratingNum >= 0 && ratingNum <= 9999) {
          updateData.rating = ratingNum;
        } else {
          return res.status(400).json({ error: 'Rating must be between 0 and 9999' });
        }
      }
    }
    if (isActive !== undefined) {
      // Only Admins can change isActive status
      if (!hasAdminAccess) {
        return res.status(403).json({ error: 'Only Administrators can change active status.' });
      }
      updateData.isActive = isActive;
    }
    if (gender !== undefined) updateData.gender = gender;
    if (phone !== undefined) updateData.phone = phone || null;
    if (address !== undefined) updateData.address = address || null;
    if (picture !== undefined) updateData.picture = picture || null;
    
    // Roles can only be changed by Admins
    if (roles !== undefined && Array.isArray(roles)) {
      if (!hasAdminAccess) {
        return res.status(403).json({ error: 'Only Admins can change roles' });
      }
      updateData.roles = roles;
    }

    // Check for duplicate name if name is being changed
    if (firstName !== undefined || lastName !== undefined) {
      const newFirstName = firstName !== undefined ? firstName.trim() : existingMember.firstName;
      const newLastName = lastName !== undefined ? lastName.trim() : existingMember.lastName;

      // Check for exact duplicate (excluding current member)
      const duplicate = await prisma.member.findFirst({
        where: {
          id: { not: memberId },
          firstName: { equals: newFirstName, mode: 'insensitive' },
          lastName: { equals: newLastName, mode: 'insensitive' },
        },
      });

      if (duplicate) {
        return res.status(400).json({ error: 'A member with this name already exists' });
      }
    }

    // Update member
    const updatedMember = await prisma.member.update({
      where: { id: memberId },
      data: updateData,
    });

    // If rating was changed by an admin, create a RatingHistory entry
    if (rating !== undefined && hasAdminAccess) {
      const newRating = updatedMember.rating;
      
      logger.debug('Checking if rating history entry should be created', {
        memberId,
        oldRating,
        newRating,
        ratingChanged: oldRating !== newRating,
        hasAdminAccess,
      });
      
      // Only create history entry if rating actually changed
      if (oldRating !== newRating) {
        // Calculate rating change
        let ratingChange: number;
        if (oldRating !== null && newRating !== null) {
          // Both ratings exist: simple difference
          ratingChange = newRating - oldRating;
        } else if (oldRating === null && newRating !== null) {
          // Rating was set (from null to a value): change is the new rating
          ratingChange = newRating;
        } else if (oldRating !== null && newRating === null) {
          // Rating was removed (from a value to null): change is negative of old rating
          ratingChange = -oldRating;
        } else {
          // Both are null: no change (shouldn't happen, but handle it)
          ratingChange = 0;
        }
        
        try {
          const historyEntry = await (prisma as any).ratingHistory.create({
            data: {
              memberId: memberId,
              rating: newRating,
              ratingChange: ratingChange,
              reason: 'MANUAL_ADJUSTMENT',
              tournamentId: null,
              matchId: null,
            },
          });
          logger.info('Successfully created rating history entry for manual adjustment', {
            historyEntryId: historyEntry.id,
            memberId,
            oldRating,
            newRating,
            ratingChange,
          });
        } catch (historyError) {
          // Log error but don't fail the update
          logger.error('Failed to create rating history entry', {
            error: historyError instanceof Error ? historyError.message : String(historyError),
            errorStack: historyError instanceof Error ? historyError.stack : undefined,
            memberId,
            oldRating,
            newRating,
            ratingChange,
          });
        }
      } else {
        logger.debug('Skipping rating history entry creation - rating did not change', {
          memberId,
          oldRating,
          newRating,
        });
      }
    } else {
      logger.debug('Skipping rating history entry creation', {
        memberId,
        ratingProvided: rating !== undefined,
        hasAdminAccess,
      });
    }

    const { password, ...memberWithoutPassword } = updatedMember;
    
    // Emit socket notification for player update
    emitToAll('player:updated', {
      player: memberWithoutPassword,
      timestamp: Date.now(),
    });
    
    res.json(memberWithoutPassword);
  } catch (error) {
    logger.error('Error updating member', { error: error instanceof Error ? error.message : String(error), memberId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get rating history for one or more members
router.post('/rating-history', [
  body('memberIds').isArray({ min: 1 }),
  body('memberIds.*').isInt({ min: 1 }),
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { memberIds } = req.body;

    // Get all members
    const members = await prisma.member.findMany({
      where: { id: { in: memberIds } },
    });

    // Get rating history from RatingHistory table
    const ratingHistoryRecords = await (prisma as any).ratingHistory.findMany({
      where: {
        memberId: { in: memberIds },
      },
      select: {
        id: true,
        memberId: true,
        rating: true,
        ratingChange: true,
        timestamp: true,
        reason: true,
        tournamentId: true,
        matchId: true,
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    // Get tournament names for display
    const tournamentIds = [...new Set(ratingHistoryRecords.map((r: any) => r.tournamentId).filter((id: any): id is number => id !== null))];
    const tournamentMap = new Map<number, string>();
    if (tournamentIds.length > 0) {
      const tournaments = await prisma.tournament.findMany({
        where: { id: { in: tournamentIds as number[] } },
        select: { id: true, name: true },
      });
      tournaments.forEach(t => tournamentMap.set(t.id, t.name || 'Unknown Tournament'));
    }

    // Build rating history for each member from RatingHistory records
    const ratingHistory: { [memberId: number]: Array<{ date: string; rating: number | null; tournamentId: number | null; tournamentName: string | null; matchId: number | null }> } = {};

    // Initialize empty history for all members
    members.forEach(member => {
      ratingHistory[member.id] = [];
    });

    // Process rating history records
    for (const record of ratingHistoryRecords) {
      const memberId = record.memberId;
      let tournamentName: string | null = null;
      
      if (record.tournamentId) {
        tournamentName = tournamentMap.get(record.tournamentId) || 'Unknown Tournament';
      } else if (record.reason === 'MANUAL_ADJUSTMENT') {
        // Set display name for manual adjustments
        tournamentName = 'Manual Adjustment';
      } else if (record.reason === 'MEMBER_DEACTIVATED') {
        tournamentName = 'Member Deactivated';
      } else {
        tournamentName = 'Initial Rating';
      }
      
      ratingHistory[memberId].push({
        date: record.timestamp.toISOString(),
        rating: record.rating,
        tournamentId: record.tournamentId,
        tournamentName: tournamentName,
        matchId: record.matchId,
      });
    }

    // Add current rating as final point if different from last recorded
    // Only add if member has some history (meaning they had a rating at some point)
    members.forEach(member => {
      const history = ratingHistory[member.id];
      if (history.length > 0 && member.rating !== null) {
        const lastEntry = history[history.length - 1];
        if (lastEntry.rating !== member.rating) {
          history.push({
            date: new Date().toISOString(),
            rating: member.rating,
            tournamentId: null,
            tournamentName: 'Current',
            matchId: null,
          });
        }
      }
    });

    // Format response
    const result = members.map(member => ({
      memberId: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      history: ratingHistory[member.id] || [],
    }));

    res.json(result);
  } catch (error) {
    logger.error('Error fetching rating history', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get match history between a member and selected opponents
router.post('/match-history', [
  body('memberId').isInt({ min: 1 }),
  body('opponentIds').isArray({ min: 1 }),
  body('opponentIds.*').isInt({ min: 1 }),
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { memberId, opponentIds } = req.body;

    // Get the member
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Get all matches where the member played against any of the opponents
    // Matches can have the member as member1 or member2
    const matches = await prisma.match.findMany({
      where: {
        OR: [
          {
            member1Id: memberId,
            member2Id: { in: opponentIds },
          },
          {
            member1Id: { in: opponentIds },
            member2Id: memberId,
          },
        ],
      },
      include: {
        tournament: {
          select: {
            id: true,
            name: true,
            status: true,
            type: true,
            createdAt: true,
            participants: {
              select: {
                memberId: true,
                playerRatingAtTime: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc', // Most recent first
      },
    });

    // Get opponent details
    const opponents = await prisma.member.findMany({
      where: { id: { in: opponentIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    // Get rating history for all matches to find rating before and change for each member
    const matchIds = matches.map(m => m.id);
    const allMemberIds = [memberId, ...opponentIds];
    
    // Create a map of matchId -> match createdAt for proper chronological ordering
    const matchCreatedAtMap = new Map<number, Date>();
    matches.forEach(m => {
      matchCreatedAtMap.set(m.id, m.createdAt);
    });
    
    // Query rating history - filter by MATCH_COMPLETED reason to ensure we get the correct rating at match time
    const ratingHistory = await prisma.ratingHistory.findMany({
      where: {
        matchId: { in: matchIds },
        memberId: { in: allMemberIds },
        reason: 'MATCH_COMPLETED', // Only get rating changes from matches, not tournaments
      },
      select: {
        matchId: true,
        memberId: true,
        rating: true,
        ratingChange: true,
        timestamp: true,
      },
    });
    
    // Sort rating history by match creation time (more reliable than timestamp for backfilled matches)
    ratingHistory.sort((a, b) => {
      const timeA = matchCreatedAtMap.get(a.matchId || 0)?.getTime() || a.timestamp.getTime();
      const timeB = matchCreatedAtMap.get(b.matchId || 0)?.getTime() || b.timestamp.getTime();
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      // If times are equal, use matchId as tiebreaker
      return (a.matchId || 0) - (b.matchId || 0);
    });

    // Create a map: matchId -> memberId -> { ratingBefore, ratingAfter, ratingChange }
    // We need to calculate the actual rating before each match by looking at previous matches
    const ratingMap = new Map<string, Map<number, { ratingBefore: number | null; ratingAfter: number | null; ratingChange: number | null }>>();
    
    // First, get all rating history for these members to track rating progression
    // We need ALL matches (not just the ones in our result set) to get correct progression
    const allMemberRatingHistory = await prisma.ratingHistory.findMany({
      where: {
        memberId: { in: allMemberIds },
        reason: 'MATCH_COMPLETED',
      },
      select: {
        matchId: true,
        memberId: true,
        rating: true,
        ratingChange: true,
        timestamp: true,
      },
    });
    
    // Get match creation times for all matches in the rating history
    const allMatchIds = [...new Set(allMemberRatingHistory.map(rh => rh.matchId).filter((id): id is number => id !== null))];
    const allMatches = await prisma.match.findMany({
      where: { id: { in: allMatchIds } },
      select: { id: true, createdAt: true },
    });
    const allMatchCreatedAtMap = new Map<number, Date>();
    allMatches.forEach(m => {
      allMatchCreatedAtMap.set(m.id, m.createdAt);
    });
    
    // Sort all rating history by match creation time (more reliable than timestamp)
    allMemberRatingHistory.sort((a, b) => {
      const timeA = allMatchCreatedAtMap.get(a.matchId || 0)?.getTime() || a.timestamp.getTime();
      const timeB = allMatchCreatedAtMap.get(b.matchId || 0)?.getTime() || b.timestamp.getTime();
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      // If times are equal, use matchId as tiebreaker
      return (a.matchId || 0) - (b.matchId || 0);
    });
    
    // Create a map of memberId -> chronological list of rating changes
    const memberRatingProgression = new Map<number, Array<{ matchId: number | null; rating: number | null; ratingChange: number | null; timestamp: Date }>>();
    allMemberRatingHistory.forEach((rh: any) => {
      if (!memberRatingProgression.has(rh.memberId)) {
        memberRatingProgression.set(rh.memberId, []);
      }
      memberRatingProgression.get(rh.memberId)!.push({
        matchId: rh.matchId,
        rating: rh.rating,
        ratingChange: rh.ratingChange,
        timestamp: rh.timestamp,
      });
    });
    
    // Now process each match and calculate the correct rating before
    ratingHistory.forEach((rh: any) => {
      const matchKey = rh.matchId?.toString();
      if (!matchKey) return;
      
      if (!ratingMap.has(matchKey)) {
        ratingMap.set(matchKey, new Map());
      }
      const memberMap = ratingMap.get(matchKey)!;
      
      // Only set if we haven't already set a value for this member/match (to handle duplicates)
      if (!memberMap.has(rh.memberId)) {
        // Find the actual rating before this match by looking at previous matches
        const progression = memberRatingProgression.get(rh.memberId) || [];
        const currentMatchIndex = progression.findIndex(p => p.matchId === rh.matchId);
        
        let ratingBefore: number | null = null;
        
        if (currentMatchIndex > 0) {
          // There's a previous match - use the rating after the previous match
          const previousMatch = progression[currentMatchIndex - 1];
          ratingBefore = previousMatch.rating;
        } else if (currentMatchIndex === 0) {
          // This is the first match - calculate from the current record
          // rating is the NEW rating after the match, so ratingBefore = rating - ratingChange
          ratingBefore = rh.rating !== null && rh.ratingChange !== null 
            ? rh.rating - rh.ratingChange 
            : null;
        } else {
          // Match not found in progression (shouldn't happen, but fallback to calculation)
          ratingBefore = rh.rating !== null && rh.ratingChange !== null 
            ? rh.rating - rh.ratingChange 
            : null;
        }
        
        memberMap.set(rh.memberId, {
          ratingBefore,
          ratingAfter: rh.rating, // Rating after the match
          ratingChange: rh.ratingChange,
        });
      }
    });

    // Format the response
    const result = {
      member: {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
      },
      opponents: opponents.map(o => ({
        id: o.id,
        firstName: o.firstName,
        lastName: o.lastName,
      })),
      matches: matches.map(match => {
        const isMember1 = match.member1Id === memberId;
        const opponentId = isMember1 ? match.member2Id : match.member1Id;
        const opponent = opponents.find(o => o.id === opponentId);
        const isRoundRobin = match.tournament?.type === 'ROUND_ROBIN';
        const isStandaloneMatch = !match.tournament;
        
        // For ROUND_ROBIN tournaments, ratings don't change per match, so get rating from participant data
        // For other tournament types and standalone matches, get rating from rating history
        let memberRatingAfter: number | null = null;
        let memberRatingChange: number | null = null;
        let opponentRatingAfter: number | null = null;
        let opponentRatingChange: number | null = null;
        
        if (isRoundRobin && match.tournament) {
          // Get rating from tournament participant data (rating at time of tournament)
          // For round robin, this is effectively the rating "after" since there's no per-match change
          const memberParticipant = match.tournament.participants.find(p => p.memberId === memberId);
          const opponentParticipant = match.tournament.participants.find(p => p.memberId === opponentId);
          memberRatingAfter = memberParticipant?.playerRatingAtTime ?? null;
          opponentRatingAfter = opponentParticipant?.playerRatingAtTime ?? null;
          // Round robin matches don't change ratings, so ratingChange is always null
          memberRatingChange = null;
          opponentRatingChange = null;
        } else {
          // Get rating information from rating history for non-round-robin tournaments and standalone matches
          const matchRatingMap = ratingMap.get(match.id.toString());
          const memberRatingInfo = matchRatingMap?.get(memberId);
          const opponentRatingInfo = matchRatingMap?.get(opponentId || 0);
          // Show rating AFTER the match (rating after = rating before + change, or use rating from history)
          memberRatingAfter = memberRatingInfo?.ratingAfter ?? null;
          memberRatingChange = memberRatingInfo?.ratingChange ?? null;
          opponentRatingAfter = opponentRatingInfo?.ratingAfter ?? null;
          opponentRatingChange = opponentRatingInfo?.ratingChange ?? null;
        }
        
        return {
          id: match.id,
          tournamentId: match.tournamentId,
          tournamentName: match.tournament?.name ?? null,
          tournamentStatus: match.tournament?.status ?? null,
          tournamentType: match.tournament?.type ?? null,
          tournamentDate: match.tournament?.createdAt?.toISOString() ?? match.createdAt.toISOString(),
          opponentId: opponentId,
          opponentName: opponent ? `${opponent.firstName} ${opponent.lastName}` : 'Unknown',
          memberSets: isMember1 ? match.player1Sets : match.player2Sets,
          opponentSets: isMember1 ? match.player2Sets : match.player1Sets,
          memberForfeit: isMember1 ? match.player1Forfeit : match.player2Forfeit,
          opponentForfeit: isMember1 ? match.player2Forfeit : match.player1Forfeit,
          matchDate: match.createdAt.toISOString(),
          // Rating information - show rating AFTER the match
          memberRatingAfter,
          memberRatingChange,
          opponentRatingAfter,
          opponentRatingChange,
        };
      }),
    };

    res.json(result);
  } catch (error) {
    logger.error('Error fetching match history', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export players (demographics and rating only)
router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const members = await prisma.member.findMany({
      where: {
        roles: {
          has: 'PLAYER',
        },
      },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        gender: true,
        birthDate: true,
        rating: true,
        phone: true,
        address: true,
      },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' }
      ],
    });

    res.json(members);
  } catch (error) {
    logger.error('Error exporting members', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk import players
router.post('/import', [
  body('players').isArray({ min: 1 }),
  body('players.*.firstName').notEmpty().trim(),
  body('players.*.lastName').notEmpty().trim(),
  body('players.*.email').notEmpty().trim().isEmail(),
  body('players.*.gender').optional().isIn(['MALE', 'FEMALE', 'OTHER']),
  body('players.*.birthDate').notEmpty().isISO8601().toDate(),
  body('players.*.phone').optional().trim(),
  body('players.*.address').optional().trim(),
  body('players.*.roles').optional().isArray(),
  body('players.*.mustResetPassword').optional().isBoolean(),
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { players } = req.body;
    
    // Validate that players array is properly formatted
    if (!Array.isArray(players)) {
      return res.status(400).json({ error: 'Players must be an array' });
    }
    const results = {
      successful: [] as Array<{ firstName: string; lastName: string; email: string }>,
      failed: [] as Array<{ firstName: string; lastName: string; email?: string; error: string }>,
    };

    // Get all existing members for duplicate checking
    const existingMembers = await prisma.member.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    // Create maps for quick lookup
    const emailMap = new Map<string, boolean>();
    const nameMap = new Map<string, boolean>();
    existingMembers.forEach(m => {
      emailMap.set(m.email.toLowerCase(), true);
      nameMap.set(`${m.firstName.toLowerCase()}|${m.lastName.toLowerCase()}`, true);
    });

    // Process each player
    for (const player of players) {
      try {
        // Validate and clean input fields - ensure proper separation
        if (!player.firstName || typeof player.firstName !== 'string') {
          results.failed.push({
            firstName: player.firstName || 'Unknown',
            lastName: player.lastName || 'Unknown',
            error: 'First name is required and must be a string',
          });
          continue;
        }
        
        if (!player.lastName || typeof player.lastName !== 'string') {
          results.failed.push({
            firstName: player.firstName || 'Unknown',
            lastName: player.lastName || 'Unknown',
            error: 'Last name is required and must be a string',
          });
          continue;
        }
        
        const firstName = player.firstName.trim();
        const lastName = player.lastName.trim();
        
        if (!firstName || !lastName) {
          results.failed.push({
            firstName,
            lastName,
            error: 'First name and last name cannot be empty after trimming',
          });
          continue;
        }
        
        // Validate email (required)
        if (!player.email || typeof player.email !== 'string' || !player.email.trim()) {
          results.failed.push({
            firstName,
            lastName,
            error: 'Email is required',
          });
          continue;
        }
        
        const email = player.email.trim();
        if (!isValidEmailFormat(email)) {
          results.failed.push({
            firstName,
            lastName,
            email,
            error: 'Invalid email format',
          });
          continue;
        }
        
        // Validate phone if provided
        if (player.phone) {
          const phone = typeof player.phone === 'string' ? player.phone.trim() : String(player.phone).trim();
          if (phone && !isValidPhoneNumber(phone)) {
            results.failed.push({
              firstName,
              lastName,
              email,
              error: 'Invalid phone number format. Phone should be 10-15 digits and may include +, spaces, dashes, parentheses, or dots',
            });
            continue;
          }
        }
        
        // Validate roles if provided
        if (player.roles !== undefined) {
          if (!isValidRoles(player.roles)) {
            results.failed.push({
              firstName,
              lastName,
              email,
              error: 'Invalid roles. Roles must be an array containing only: PLAYER, COACH, ADMIN, ORGANIZER',
            });
            continue;
          }
        }
        
        // Validate birthDate (required)
        if (!player.birthDate) {
          results.failed.push({
            firstName,
            lastName,
            email,
            error: 'Birth date is required',
          });
          continue;
        }
        
        // Validate birthDate is a valid date
        let birthDate: Date;
        try {
          birthDate = new Date(player.birthDate);
          if (isNaN(birthDate.getTime())) {
            results.failed.push({
              firstName,
              lastName,
              email,
              error: 'Invalid birth date format',
            });
            continue;
          }
        } catch (error) {
          results.failed.push({
            firstName,
            lastName,
            email,
            error: 'Invalid birth date format',
          });
          continue;
        }
        
        const nameKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
        const emailKey = email.toLowerCase();

        // Check for duplicate by email - reject if email already exists
        if (emailMap.has(emailKey)) {
          results.failed.push({
            firstName,
            lastName,
            email,
            error: 'Email already exists',
          });
          continue;
        }

        // Check for duplicate by name
        if (nameMap.has(nameKey)) {
          results.failed.push({
            firstName,
            lastName,
            email,
            error: 'Name already exists',
          });
          continue;
        }

        // Use the email as-is (no generation of unique emails - reject duplicates instead)
        const finalEmail = email;

        // Determine gender if not provided
        const finalGender = player.gender || determineGender(firstName);

        // Default password is 'changeme'
        const defaultPassword = await bcrypt.hash('changeme', 10);

        // Use provided roles or default to PLAYER (already validated above)
        const roles = (player.roles && Array.isArray(player.roles) && player.roles.length > 0) 
          ? player.roles 
          : ['PLAYER'];

        // Set mustResetPassword to true for imported players (or use provided value)
        const mustResetPassword = player.mustResetPassword !== undefined 
          ? player.mustResetPassword 
          : true;

        // Create member
        const member = await prisma.member.create({
          data: {
            firstName,
            lastName,
            email: finalEmail,
            gender: finalGender,
            password: defaultPassword,
            roles: roles,
            birthDate: birthDate,
            rating: player.rating ? parseInt(String(player.rating)) : null,
            phone: player.phone ? (typeof player.phone === 'string' ? player.phone.trim() : String(player.phone).trim()) : null,
            address: player.address ? (typeof player.address === 'string' ? player.address.trim() : String(player.address).trim()) : null,
            isActive: true,
            mustResetPassword: mustResetPassword,
          },
        });

        // Add to maps to prevent duplicates within the same import
        emailMap.set(finalEmail.toLowerCase(), true);
        nameMap.set(nameKey, true);

        results.successful.push({
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
        });
        
        // Emit socket notification for each imported player
        const { password: _, ...memberWithoutPassword } = member;
        emitToAll('player:created', {
          player: memberWithoutPassword,
          timestamp: Date.now(),
        });
      } catch (error: any) {
        results.failed.push({
          firstName: player.firstName || 'Unknown',
          lastName: player.lastName || 'Unknown',
          email: player.email,
          error: error.message || 'Unknown error',
        });
      }
    }

    // Emit cache invalidation for players list refresh
    emitToAll('players:imported', {
      total: players.length,
      successful: results.successful.length,
      failed: results.failed.length,
      timestamp: Date.now(),
    });

    res.json({
      total: players.length,
      successful: results.successful.length,
      failed: results.failed.length,
      successfulPlayers: results.successful,
      failedPlayers: results.failed,
    });
  } catch (error) {
    logger.error('Error importing members', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

