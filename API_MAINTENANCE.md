# API Documentation Maintenance

This file describes how to keep API docs aligned with server behavior.

## Source of truth
- Route handlers: `server/src/routes/*.ts`
- Plugin behavior for tournaments: `server/src/plugins/*`
- Shared validation: `server/src/utils/memberValidation.ts`

Main human-facing API document:
- `API.md` (and any companion endpoint docs used in your workflow)

## Required update triggers
Update API docs whenever you:
1. Add/remove route paths or methods
2. Change request body/query/path contract
3. Change status code behavior
4. Move behavior behind plugin logic that affects response shape or side effects
5. Change validation rules that alter acceptance/rejection criteria

## Validation workflow

Run:
```bash
cd server
npm run validate-api-docs
```

This script catches missing route documentation for standard route definitions.

## Documentation checklist per endpoint
- Method + path
- Auth requirement and allowed roles
- Path/query/body schema
- Validation rules
- Success response shape
- Error status codes + representative messages
- Notes on side effects (rating recalculation, event emission, etc.)

## Special attention: tournament APIs

Because tournaments use plugin delegation:
- Document the generic entrypoint behavior clearly
- Document type-specific variations as notes/tables

Example critical endpoint:
- `PATCH /api/tournaments/:tournamentId/matches/:matchId`

Include notes for:
- matchId semantics
- score normalization/validation
- completion propagation behavior
- rating recalculation effects

## Validation rule sync policy

If you update shared validators (email/birth date/phone/rating):
1. Update API docs for affected endpoints
2. Update client docs if UX behavior changes
3. Update CSV import docs if parser behavior changes

## Suggested PR checklist
- [ ] Route changes documented
- [ ] Validation rules documented
- [ ] Role/permission changes documented
- [ ] `npm run validate-api-docs` passes
- [ ] Examples updated for changed payloads

## Troubleshooting

### Validator says endpoint missing but it is documented
- Confirm exact path (including params)
- Confirm method matches
- Confirm document uses canonical `/api/...` path

### Endpoint documented but behavior differs
- Check plugin-specific code paths
- Check shared validation updates
- Check middleware (auth/role) changes

## Related files
- `API.md`
- `API_MAINTENANCE.md` (this file)
- `server/scripts/validate-api-docs.ts`
- `server/src/routes/`
- `server/src/plugins/`



