-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planId" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "balanceUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RecurringPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "intervalMonths" INTEGER NOT NULL DEFAULT 1,
    "startMonth" INTEGER NOT NULL DEFAULT 1,
    "category" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RecurringPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "transferGroup" TEXT,
    "affectsBalance" BOOLEAN NOT NULL DEFAULT true,
    "importHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SavingsGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetCents" INTEGER NOT NULL,
    "savedCents" INTEGER NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Settings" (
    "userId" TEXT NOT NULL,
    "minBufferCents" INTEGER NOT NULL DEFAULT 10000,
    "emergencyMonths" INTEGER NOT NULL DEFAULT 3,
    "savingsRatePct" INTEGER NOT NULL DEFAULT 10,
    "emergencyRatePct" INTEGER NOT NULL DEFAULT 10,
    "transferDay" INTEGER NOT NULL DEFAULT 1,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "accent" TEXT NOT NULL DEFAULT 'klee',
    "fontScale" TEXT NOT NULL DEFAULT 'normal',
    "hideAmounts" BOOLEAN NOT NULL DEFAULT false,
    "motion" TEXT NOT NULL DEFAULT 'system',
    "language" TEXT,
    "dashboardLayout" TEXT,
    "reserveMonthlyCents" INTEGER NOT NULL DEFAULT 0,
    "reserveTolerancePct" INTEGER NOT NULL DEFAULT 15,
    "reserveAccountKind" TEXT NOT NULL DEFAULT 'SPAREN',
    "confirmedOrders" TEXT,
    "ordersValidFrom" TIMESTAMP(3),
    "aiCategorization" BOOLEAN NOT NULL DEFAULT false,
    "aiMonthlyLimit" INTEGER NOT NULL DEFAULT 1000,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "public"."ImportRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProviderIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BankConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "bankName" TEXT NOT NULL DEFAULT 'Bank',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "externalId" TEXT,
    "pendingFormId" TEXT,
    "pendingTaskId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BankAccountLink" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ibanMasked" TEXT,
    "balanceCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "accountType" TEXT,
    "accountId" TEXT,
    "syncBalance" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),

    CONSTRAINT "BankAccountLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReserveItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "plannedIntervalMonths" INTEGER,
    "plannedAmountCents" INTEGER,
    "useEffective" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReserveItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReservePurchase" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "ReservePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AiUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "items" INTEGER NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PermissionSet" (
    "id" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermissionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PermissionSetPermission" (
    "setId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,

    CONSTRAINT "PermissionSetPermission_pkey" PRIMARY KEY ("setId","permissionKey")
);

-- CreateTable
CREATE TABLE "public"."UserPermissionSet" (
    "userId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermissionSet_pkey" PRIMARY KEY ("userId","setId")
);

-- CreateTable
CREATE TABLE "public"."Plan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "allAccess" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlanPermissionSet" (
    "planId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,

    CONSTRAINT "PlanPermissionSet_pkey" PRIMARY KEY ("planId","setId")
);

-- CreateTable
CREATE TABLE "public"."UserGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserGroupMember" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGroupMember_pkey" PRIMARY KEY ("groupId","userId")
);

-- CreateTable
CREATE TABLE "public"."GroupPermissionSet" (
    "groupId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,

    CONSTRAINT "GroupPermissionSet_pkey" PRIMARY KEY ("groupId","setId")
);

-- CreateTable
CREATE TABLE "public"."PermissionSetGroup" (
    "id" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermissionSetGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SetGroupItem" (
    "setGroupId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,

    CONSTRAINT "SetGroupItem_pkey" PRIMARY KEY ("setGroupId","setId")
);

-- CreateTable
CREATE TABLE "public"."PlanSetGroup" (
    "planId" TEXT NOT NULL,
    "setGroupId" TEXT NOT NULL,

    CONSTRAINT "PlanSetGroup_pkey" PRIMARY KEY ("planId","setGroupId")
);

-- CreateTable
CREATE TABLE "public"."UserGroupSetGroup" (
    "groupId" TEXT NOT NULL,
    "setGroupId" TEXT NOT NULL,

    CONSTRAINT "UserGroupSetGroup_pkey" PRIMARY KEY ("groupId","setGroupId")
);

-- CreateTable
CREATE TABLE "public"."UserSetGroup" (
    "userId" TEXT NOT NULL,
    "setGroupId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSetGroup_pkey" PRIMARY KEY ("userId","setGroupId")
);

-- CreateTable
CREATE TABLE "public"."AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "targetUserId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OAuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "public"."Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_kind_key" ON "public"."Account"("userId", "kind");

-- CreateIndex
CREATE INDEX "RecurringPayment_userId_idx" ON "public"."RecurringPayment"("userId");

-- CreateIndex
CREATE INDEX "Transaction_userId_date_idx" ON "public"."Transaction"("userId", "date");

-- CreateIndex
CREATE INDEX "Transaction_userId_accountId_importHash_idx" ON "public"."Transaction"("userId", "accountId", "importHash");

-- CreateIndex
CREATE INDEX "SavingsGoal_userId_idx" ON "public"."SavingsGoal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRule_userId_pattern_key" ON "public"."ImportRule"("userId", "pattern");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderIdentity_userId_provider_key" ON "public"."ProviderIdentity"("userId", "provider");

-- CreateIndex
CREATE INDEX "BankConnection_userId_idx" ON "public"."BankConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccountLink_connectionId_externalId_key" ON "public"."BankAccountLink"("connectionId", "externalId");

-- CreateIndex
CREATE INDEX "ReserveItem_userId_idx" ON "public"."ReserveItem"("userId");

-- CreateIndex
CREATE INDEX "ReservePurchase_itemId_idx" ON "public"."ReservePurchase"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsage_userId_month_key" ON "public"."AiUsage"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionSet_key_key" ON "public"."PermissionSet"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionSet_name_key" ON "public"."PermissionSet"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_key_key" ON "public"."Plan"("key");

-- CreateIndex
CREATE UNIQUE INDEX "UserGroup_name_key" ON "public"."UserGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionSetGroup_key_key" ON "public"."PermissionSetGroup"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionSetGroup_name_key" ON "public"."PermissionSetGroup"("name");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "public"."AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetUserId_idx" ON "public"."AdminAuditLog"("targetUserId");

-- CreateIndex
CREATE INDEX "OAuthAccount_userId_idx" ON "public"."OAuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_provider_providerAccountId_key" ON "public"."OAuthAccount"("provider", "providerAccountId");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecurringPayment" ADD CONSTRAINT "RecurringPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecurringPayment" ADD CONSTRAINT "RecurringPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SavingsGoal" ADD CONSTRAINT "SavingsGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Settings" ADD CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ImportRule" ADD CONSTRAINT "ImportRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProviderIdentity" ADD CONSTRAINT "ProviderIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BankConnection" ADD CONSTRAINT "BankConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BankAccountLink" ADD CONSTRAINT "BankAccountLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "public"."BankConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BankAccountLink" ADD CONSTRAINT "BankAccountLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReserveItem" ADD CONSTRAINT "ReserveItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReservePurchase" ADD CONSTRAINT "ReservePurchase_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."ReserveItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PermissionSetPermission" ADD CONSTRAINT "PermissionSetPermission_setId_fkey" FOREIGN KEY ("setId") REFERENCES "public"."PermissionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserPermissionSet" ADD CONSTRAINT "UserPermissionSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserPermissionSet" ADD CONSTRAINT "UserPermissionSet_setId_fkey" FOREIGN KEY ("setId") REFERENCES "public"."PermissionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlanPermissionSet" ADD CONSTRAINT "PlanPermissionSet_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlanPermissionSet" ADD CONSTRAINT "PlanPermissionSet_setId_fkey" FOREIGN KEY ("setId") REFERENCES "public"."PermissionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserGroupMember" ADD CONSTRAINT "UserGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."UserGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserGroupMember" ADD CONSTRAINT "UserGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GroupPermissionSet" ADD CONSTRAINT "GroupPermissionSet_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."UserGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GroupPermissionSet" ADD CONSTRAINT "GroupPermissionSet_setId_fkey" FOREIGN KEY ("setId") REFERENCES "public"."PermissionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SetGroupItem" ADD CONSTRAINT "SetGroupItem_setGroupId_fkey" FOREIGN KEY ("setGroupId") REFERENCES "public"."PermissionSetGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SetGroupItem" ADD CONSTRAINT "SetGroupItem_setId_fkey" FOREIGN KEY ("setId") REFERENCES "public"."PermissionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlanSetGroup" ADD CONSTRAINT "PlanSetGroup_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlanSetGroup" ADD CONSTRAINT "PlanSetGroup_setGroupId_fkey" FOREIGN KEY ("setGroupId") REFERENCES "public"."PermissionSetGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserGroupSetGroup" ADD CONSTRAINT "UserGroupSetGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."UserGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserGroupSetGroup" ADD CONSTRAINT "UserGroupSetGroup_setGroupId_fkey" FOREIGN KEY ("setGroupId") REFERENCES "public"."PermissionSetGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserSetGroup" ADD CONSTRAINT "UserSetGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserSetGroup" ADD CONSTRAINT "UserSetGroup_setGroupId_fkey" FOREIGN KEY ("setGroupId") REFERENCES "public"."PermissionSetGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

