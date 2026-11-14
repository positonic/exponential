-- Instance-wide settings for one install (ADR-0081): sign-up mode and the
-- self-host setup token. Created empty; no row means open sign-up and no setup
-- token, which is exactly how exponential.im behaves today.

-- CreateTable
CREATE TABLE "InstanceSettings" (
    "id" TEXT NOT NULL DEFAULT 'instance',
    "signUpMode" TEXT,
    "setupTokenHash" TEXT,
    "setupTokenExpiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstanceSettings_pkey" PRIMARY KEY ("id")
);
