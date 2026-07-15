---
name: tournament-base-layer
description: >-
  Enforces tournament layering: base/orchestrator code must not import, include,
  or use tournament-type-specific functionality; it may only distinguish basic
  vs compound tournaments. Use when editing tournament orchestrators, registries,
  shared tournament utils/routes/services, plugins, Tournaments.tsx,
  TournamentDetailPage, Players tournament creation, or when adding a tournament
  type / changing plugin boundaries.
---

# Tournament base layer boundaries

## Rule (verbatim)

None of the base tournaments should import/include/use any tournament specific functionality. It may differentiate between the basic and compound tournaments but this is the extent of this layer knowledge.

## What “base” means here

Base / orchestration layer (type-agnostic):

- Client: `Tournaments.tsx`, `TournamentDetailPage.tsx`, `TournamentRenderer.tsx`, `TournamentPluginRegistry.tsx`, shared panels/utils under `client/src/components/tournaments/` that are not type-owned
- Server: `routes/tournaments.ts`, `tournamentEventService`, `TournamentPluginRegistry`, shared non-type helpers
- Shared contracts: `TournamentPlugin` / registry APIs

Type-specific layer (forbidden imports *into* base):

- Client plugins and panels: `client/src/components/tournaments/plugins/*` (e.g. `Playoff*`, `RoundRobin*`, `Swiss*`, prelim/multi RR plugins and their utils)
- Server plugins: `PlayoffPlugin`, `RoundRobinPlugin`, `SwissPlugin`, compound type plugins, and type-owned helpers

## Allowed knowledge in base

- Call `tournamentPluginRegistry.get(type)` (or equivalent) and use plugin capabilities
- Branch only on **basic vs compound** (e.g. `plugin.isBasic` / `getBasic()` / `getCompound()`)
- Shared tournament concepts: participants, matches as opaque plugin-owned data, children for compounds via compound APIs — not type names like `PLAYOFF` / `ROUND_ROBIN` for behavior

## Forbidden in base

- Importing type-specific modules (`PlayoffBracket`, `roundRobinUtils`, `playoffMatchUpdater`, etc.)
- `switch` / `if` on concrete tournament type strings for behavior (except registering plugins inside the registry composition root)
- Duplicating type-specific schedule/results/bracket logic in orchestrators or “shared” utils

## Where type-specific code belongs

- Inside the matching `*Plugin` (client and/or server)
- Called only through registry-delegated methods / panel creators
- Compound plugins may know their child types; base orchestrators must not

## When changing code

1. If base needs new behavior for one type → add/extend a **plugin method or capability flag**, then call it via the registry.
2. If shared utils start importing a type module → move that logic into the plugin or a plugin-owned helper; keep shared code registry-only.
3. Prefer `plugin.isBasic` over lists of type string literals.

## Quick checklist

- [ ] No new imports from type-specific plugin files into base orchestrators/shared utils
- [ ] No new type-string behavior branches outside plugins/registry registration
- [ ] Basic vs compound is the only structural distinction in base
- [ ] New type behavior lands in a plugin, not in `Tournaments.tsx` / `TournamentDetailPage` / routes
