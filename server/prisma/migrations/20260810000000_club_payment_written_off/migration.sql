-- Terminal ledger state for admin write-off of PENDING payments (not revivable).
ALTER TYPE "ClubPaymentStatus" ADD VALUE IF NOT EXISTS 'WRITTEN_OFF';
