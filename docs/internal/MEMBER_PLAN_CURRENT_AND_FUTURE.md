# Club plans: current and future

A member can hold at most **one current plan** and **one future plan**. Member Plan shows a purchase action in whichever slot is open. When both slots are filled, no further purchase is offered.

Trial is treated like a current plan for buying: during trial you can only buy the **next** plan, which starts when the trial ends.

## The two slots

| Slot | Meaning |
|------|---------|
| **Current** | The plan in effect now (or, during trial, trial access itself). |
| **Future** | The next plan, already paid, waiting to start when current (or trial) ends. |

Visit packs use the same two slots. A future visit pack waits until there is no current plan, then becomes current.

## When you can buy

| Situation | What you can buy |
|-----------|------------------|
| No current plan, not in trial | **Current** plan |
| Current plan, no future plan, auto-renew off | **Future** plan (Extend for Future) |
| In trial, no future plan | **Future** plan only (Purchase for after trial). It starts the day after trial ends. Pay per visit is not available during trial. |
| Current and future both exist | **Nothing** |
| Auto-renew is on for the current plan | **Nothing** — the next period is already set to renew |
| A payment is already pending | **Nothing** until that payment is paid, written off, or otherwise finished |

Cash at the desk and pay online use the same slot rules. Pending cash still occupies the purchase path until an administrator **Clears** it (collects money and grants the plan) or **Writes it off** (drops the obligation; no plan).

## When current ends

At **club midnight**:

1. An expired or exhausted current plan is ended.
2. A waiting future plan becomes current, if its start has arrived (time plans) or there is no current plan (visit packs).
3. If auto-renew is on and there is no current and no future, the club starts a renewal checkout.

Until midnight runs, an expired current plan may already be gone from the screen while the next plan still shows as **future**. You cannot buy another plan in that window because the future slot is still taken.

## Trial

- Trial access is a member date (`trial ends on`), not a paid current entitlement.
- Check-in during trial works without a paid current plan.
- A plan bought during trial is stored as **future** and starts the day after the trial end date.
- When that start day is reached and midnight promotion runs, the future plan becomes **current**.
- Ending trial does not by itself create a current plan. If nothing was purchased, the member has no plan after trial.
- A one-time trial-ended email is separate from plan promotion.

## Auto-renew

Auto-renew is treated as occupying the future slot: the next period is already spoken for. Turning auto-renew off (when no future plan is queued) opens **Extend for Future**. Queuing a future plan turns auto-renew off.

## Time plans vs visit packs

- **Time plan** as current: you may choose a start date on or after today.
- **Time plan** as future after a current plan: starts when the current plan’s end date is reached.
- **Time plan** as future after trial: starts the day after trial ends.
- **Visit pack** as future: becomes current once there is no current plan, rather than on a calendar chain from the previous pack.

## For developers

Slot UI: `idlePurchaseSlot` in `client/src/components/players/MemberPlanScreen.tsx`.

Purchase allowed unless future exists, a pending payment exists, or current + auto-renew: `planAllowsMemberPurchase` in `server/src/payments/planPurchaseRules.ts`.

Checkout forces future during trial (`forceFuture`, start = `trialPlanStartYmd`) in `server/src/payments/runCheckout.ts`. Confirm grants `FUTURE` if `forceFuture` or a current entitlement exists: `server/src/payments/confirmPayment.ts`.

End current and promote future: `runClubMidnightJobs` in `server/src/payments/midnightJobs.ts`. Opening Member Plan may end an expired current immediately (`refreshCurrentEntitlement`) but does not promote future until midnight.
