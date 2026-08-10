-- Terminal ledger state for admin write-off of PENDING payments (not revivable).
ALTER TYPE "ClubPaymentStatus" ADD VALUE 'WRITTEN_OFF';
