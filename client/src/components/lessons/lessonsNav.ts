export type LessonsView = 'calendar' | 'classes' | 'find' | 'mine' | 'log';
export type LessonsViewGroup = 'coach' | 'player' | 'admin';

export type LessonsNavRoles = {
  coach: boolean;
  player: boolean;
  admin: boolean;
};

export const LESSONS_VIEWS: Array<{
  id: LessonsView;
  label: string;
  group: LessonsViewGroup;
}> = [
  { id: 'calendar', label: 'Calendar', group: 'coach' },
  { id: 'classes', label: 'Group classes', group: 'coach' },
  { id: 'find', label: 'Find a lesson', group: 'player' },
  { id: 'mine', label: 'My lessons', group: 'player' },
  { id: 'log', label: 'Log', group: 'admin' },
];

export type InstructionMenuEntry =
  | { type: 'item'; id: LessonsView; label: string }
  | { type: 'separator'; key: string };

export function allowedLessonsViews(roles: LessonsNavRoles): LessonsView[] {
  return LESSONS_VIEWS.filter((item) => {
    if (item.group === 'coach') return roles.coach;
    if (item.group === 'player') return roles.player;
    return roles.admin;
  }).map((item) => item.id);
}

export function resolveLessonsView(raw: string | null, roles: LessonsNavRoles): LessonsView | null {
  const allowed = allowedLessonsViews(roles);
  if (allowed.length === 0) return null;
  if (raw && allowed.includes(raw as LessonsView)) return raw as LessonsView;
  return allowed[0];
}

export function lessonsViewLabel(id: LessonsView): string {
  return LESSONS_VIEWS.find((item) => item.id === id)?.label ?? 'Instructions';
}

export function instructionMenuEntries(roles: LessonsNavRoles): InstructionMenuEntry[] {
  const items = LESSONS_VIEWS.filter((item) => {
    if (item.group === 'coach') return roles.coach;
    if (item.group === 'player') return roles.player;
    return roles.admin;
  });
  const entries: InstructionMenuEntry[] = [];
  let lastGroup: LessonsViewGroup | null = null;
  for (const item of items) {
    if (lastGroup && lastGroup !== item.group) {
      entries.push({ type: 'separator', key: `instr-sep-${lastGroup}-${item.group}` });
    }
    entries.push({ type: 'item', id: item.id, label: item.label });
    lastGroup = item.group;
  }
  return entries;
}
