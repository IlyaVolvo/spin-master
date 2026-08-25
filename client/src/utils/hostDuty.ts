export type HostDutySlot = {
  label: string;
  startTime: string;
  endTime: string;
  status: 'no_assignment' | 'not_arrived' | 'arrived';
  hostName: string | null;
};

export function hostDutyLabel(slot: HostDutySlot): string {
  if (slot.status === 'no_assignment') return 'No assignment';
  if (slot.status === 'not_arrived') return 'Not arrived';
  return slot.hostName?.trim() || 'Host';
}

/** Compact label for footer-style host-on-duty display. */
export function hostOnDutyFooterText(hosts: HostDutySlot[]): string | null {
  if (hosts.length === 0) return null;
  if (hosts.length === 1) return hostDutyLabel(hosts[0]);
  return hosts.map((slot) => `${slot.label}: ${hostDutyLabel(slot)}`).join(' · ');
}
