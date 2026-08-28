import { formatClubDay, type DayHours, type ReservedBlock } from './availabilityDraft';

export type PrintScheduleDay = {
  clubDate: string;
  hours: DayHours;
  windows: Array<{ startTime: string; endTime: string }>;
  reserved: ReservedBlock[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function studentLabel(block: ReservedBlock): string {
  const name = `${block.playerFirstName || ''} ${block.playerLastName || ''}`.trim();
  if (block.kind === 'group') return 'Class';
  return name || 'Student';
}

function dayHtml(day: PrintScheduleDay): string {
  const title = escapeHtml(formatClubDay(day.clubDate));
  if (day.hours.closed) {
    return `<section class="day"><h3>${title}</h3><p>Closed</p></section>`;
  }
  if (!day.windows.length) {
    return `<section class="day"><h3>${title}</h3><p>No open slots</p></section>`;
  }
  const slots = day.windows
    .map((w) => {
      const inside = day.reserved.filter(
        (r) => r.startTime < w.endTime && r.endTime > w.startTime,
      );
      const students = inside
        .map((r) => `<li>${escapeHtml(studentLabel(r))}</li>`)
        .join('');
      return `<div class="slot"><div class="range">${escapeHtml(w.startTime)}–${escapeHtml(w.endTime)}</div>${
        students ? `<ul>${students}</ul>` : ''
      }</div>`;
    })
    .join('');
  return `<section class="day"><h3>${title}</h3>${slots}</section>`;
}

export function printCoachSchedule(opts: {
  coachName: string;
  clubName: string;
  weekCount: number;
  days: PrintScheduleDay[];
}): void {
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
  if (!popup) return;
  const body = opts.days.map(dayHtml).join('');
  popup.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(opts.coachName)} · ${opts.weekCount}-week schedule</title>
  <style>
    body { font-family: sans-serif; color: #2c3e50; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { color: #546e7a; margin: 0 0 20px; font-size: 13px; }
    .day { break-inside: avoid; margin-bottom: 16px; }
    h3 { font-size: 14px; margin: 0 0 6px; }
    .slot { margin: 0 0 8px 12px; }
    .range { font-weight: 600; }
    ul { margin: 4px 0 0 18px; padding: 0; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>Coach ${escapeHtml(opts.coachName)}</h1>
  <p class="meta">${escapeHtml(opts.clubName)} · ${opts.weekCount} week${opts.weekCount === 1 ? '' : 's'}</p>
  ${body}
</body>
</html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}
