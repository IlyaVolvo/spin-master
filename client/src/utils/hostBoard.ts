export type HostBoardMember = {
  id: number;
  firstName: string;
  lastName: string;
};

export type HostBoardGrant = {
  memberId: number;
  status: 'PENDING' | 'APPLIED';
  daysAdded: number;
  visitsAdded: number;
};

export type HostBoardSlot = {
  shiftId: number | null;
  templateId: number | null;
  custom: boolean;
  startTime: string;
  endTime: string;
  label: string | null;
  member: HostBoardMember | null;
  claimedAt: string | null;
  perkGrants: HostBoardGrant[];
  windowOpen: boolean;
  windowPast: boolean;
  claimable: boolean;
};

export function hostMemberName(member: HostBoardMember | null | undefined): string {
  if (!member) return '';
  return `${member.firstName} ${member.lastName}`.trim();
}

export function hostSlotCaption(slot: Pick<HostBoardSlot, 'startTime' | 'endTime' | 'label'>): string {
  const range = `${slot.startTime}–${slot.endTime}`;
  const extra = slot.label?.trim();
  return extra ? `${extra} ${range}` : range;
}
