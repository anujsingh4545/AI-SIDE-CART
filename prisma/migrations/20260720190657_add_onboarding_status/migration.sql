-- AlterTable
ALTER TABLE "CartSpec" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft';

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;
