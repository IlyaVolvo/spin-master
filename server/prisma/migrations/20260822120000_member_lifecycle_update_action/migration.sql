-- Add UPDATE action for member profile / credential changes in Membership Log.
ALTER TYPE "MemberLifecycleAction" ADD VALUE IF NOT EXISTS 'UPDATE';
