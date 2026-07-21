# UI Documentation

## Overview
The client is a React + TypeScript SPA focused on operational workflows:
- member management
- tournament creation/execution
- match entry
- statistics/history

The UI is role-aware and strongly validation-driven.

## Main routes
- `/login`
- `/players`
- `/tournaments`
- `/statistics`
- `/history`

## Key screens

### Players page (`client/src/components/Players.tsx`)
Primary operations hub:
- Member list/filter/sort
- Add/Edit member modal flows
- CSV import/export
- Tournament creation entry point
- Match recording entry point

### Tournaments page
- Active/completed tournament lists
- Tournament details by plugin type
- Match result updates
- Completion/cancellation actions

### Statistics and History pages
- Rating trend charts (Recharts)
- Match/rating timeline exploration
- Filtering by players/opponents/date ranges

## UI architecture direction
Tournament post-selection UX has moved toward plugin-owned rendering:
- type selection and player selection happen in shared flow
- type-specific post-selection steps are delegated to plugin flows

This reduces type-specific branching in parent UI and localizes complex behavior.

## Validation UX patterns

### Birth date
- Inline error shown beneath field when out of allowed range.
- Value is not silently coerced to min/max.

### Phone
- Optional field, but if provided must be valid US format.

### Rating
- Must be integer `0..9999` (or empty).
- Values outside `800..2100` trigger a custom confirmation modal.
- Cancel restores prior confirmed value.

### CSV import feedback
- Row-level errors for invalid email/birth date/phone/rating.

## Modal patterns
- Member add/edit forms are modal-driven.
- Confirmations (e.g., suspicious rating) use in-app overlays, not browser dialogs.
- Tournament flows use multi-step progressive disclosure.

## Role-based UI behavior
- **Admin**: full member management + tournament operations.
- **Organizer**: tournament/match operations, limited member admin controls.
- **Player/Coach**: own-profile and view-focused operations.

Controls are conditionally rendered/disabled by role and target entity.

## Realtime behavior
Socket-driven updates refresh tournament/match related state so multi-user sessions converge quickly.

## Styling and maintainability status
- Current codebase uses a mix of component-local styles and shared CSS.
- `Players.tsx` remains large and a refactor hotspot.

## Near-term UI refactor priorities
1. Continue splitting `Players.tsx` into focused sub-components/hooks.
2. Normalize field validation rendering patterns across forms.
3. Standardize modal and error presentation primitives.
4. Improve mobile ergonomics for dense table workflows.
