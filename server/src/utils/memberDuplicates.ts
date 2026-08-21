import type { PrismaClient } from '@prisma/client';
import { normalizeMemberEmail } from './memberValidation';

export type MemberDuplicateCheck = {
  duplicateName: boolean;
  duplicateEmail: boolean;
  similarNames: Array<{ name: string; similarity: number }>;
};

function levenshteinDistance(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];

  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 100;
  return ((maxLength - distance) / maxLength) * 100;
}

export async function checkMemberDuplicates(
  prisma: PrismaClient,
  params: {
    firstName?: string;
    lastName?: string;
    email?: string | null;
    excludeMemberId?: number;
  }
): Promise<MemberDuplicateCheck> {
  const firstName = typeof params.firstName === 'string' ? params.firstName.trim() : '';
  const lastName = typeof params.lastName === 'string' ? params.lastName.trim() : '';
  const email = typeof params.email === 'string' ? normalizeMemberEmail(params.email) : '';
  const fullName = `${firstName} ${lastName}`.trim();

  const members = await prisma.member.findMany({
    where: params.excludeMemberId ? { id: { not: params.excludeMemberId } } : undefined,
    select: { firstName: true, lastName: true, email: true },
  });

  const duplicateName = !!(
    firstName &&
    lastName &&
    members.find(
      (p) =>
        p.firstName.toLowerCase() === firstName.toLowerCase() &&
        p.lastName.toLowerCase() === lastName.toLowerCase()
    )
  );

  const duplicateEmail = !!(
    email &&
    members.find((p) => p.email && normalizeMemberEmail(p.email) === email)
  );

  const similarNames =
    firstName && lastName
      ? members
          .map((p: { firstName: string; lastName: string }) => {
            const existingFullName = `${p.firstName} ${p.lastName}`;
            return {
              name: existingFullName,
              similarity: calculateSimilarity(fullName, existingFullName),
              distance: levenshteinDistance(fullName, existingFullName),
            };
          })
          .filter((p: { name: string; similarity: number; distance: number }) => {
            if (p.name.toLowerCase() === fullName.toLowerCase()) return false;
            return p.similarity >= 80 || p.distance <= 2;
          })
          .sort((a: { similarity: number }, b: { similarity: number }) => b.similarity - a.similarity)
          .map((p: { name: string; similarity: number }) => ({
            name: p.name,
            similarity: Math.round(p.similarity),
          }))
      : [];

  return { duplicateName, duplicateEmail, similarNames };
}
