-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Mode" AS ENUM ('TEST', 'LIVE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'FINANCE', 'DEVELOPER', 'SUPPORT', 'VIEWER');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'SIGNUP_VERIFY', 'PASSWORD_RESET', 'MOBILE_VERIFY', 'REVEAL_SECRET');

-- CreateEnum
CREATE TYPE "BusinessEntityType" AS ENUM ('INDIVIDUAL', 'PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'TRUST', 'SOCIETY', 'NGO', 'GOVERNMENT');

-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('TEST_ONLY', 'ONBOARDING', 'SUBMITTED', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'LIVE', 'REJECTED', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "OnboardingStepKey" AS ENUM ('PAN_DETAILS', 'BUSINESS_DETAILS', 'BANK_ACCOUNT', 'WEBSITE_DETAILS', 'KYC_DOCUMENTS', 'SIGNATORY', 'AGREEMENT', 'VKYC');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('PAYU_HOSTED', 'MERCHANT_HOSTED', 'PLUGIN');

-- CreateEnum
CREATE TYPE "KycDocType" AS ENUM ('PAN', 'AADHAAR_MASKED', 'GSTIN', 'CIN_CERTIFICATE', 'PARTNERSHIP_DEED', 'TRUST_DEED', 'CANCELLED_CHEQUE', 'BANK_STATEMENT', 'ADDRESS_PROOF', 'BOARD_RESOLUTION', 'UDYAM', 'SHOP_ESTABLISHMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('UPLOADED', 'SUBMITTED_TO_PAYU', 'VERIFIED', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "SaltVersion" AS ENUM ('V1', 'V2');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'ROTATING', 'REVOKED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CREDIT_CARD', 'DEBIT_CARD', 'NET_BANKING', 'UPI', 'WALLET', 'EMI', 'CARDLESS_EMI', 'BNPL', 'QR', 'NEFT_RTGS', 'REWARDS', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CREATED', 'ATTEMPTED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('INITIATED', 'PENDING', 'AUTHORIZED', 'SUCCESS', 'FAILED', 'USER_CANCELLED', 'BOUNCED', 'DROPPED', 'AUTO_REFUNDED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'QUEUED', 'IN_PROGRESS', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "SettlementLineAction" AS ENUM ('CAPTURE', 'REFUND', 'CHARGEBACK', 'CHARGEBACK_REVERSAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ChargebackStatus" AS ENUM ('NEW', 'PENDING_RESPONSE', 'PENDING_DOC_REVIEW', 'SUBMITTED_TO_BANK', 'INSUFFICIENT_DOCUMENT', 'WON', 'LOST', 'FRAUD_LIABILITY', 'ACCEPTED', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentLinkStatus" AS ENUM ('ACTIVE', 'PAID', 'PARTIALLY_PAID', 'EXPIRED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MandateMethod" AS ENUM ('CARD', 'NET_BANKING', 'UPI');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('ONCE', 'ADHOC', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "MandateStatus" AS ENUM ('PENDING_REGISTRATION', 'ACTIVE', 'PAUSED', 'REVOKED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "SplitType" AS ENUM ('ABSOLUTE', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "SplitStatus" AS ENUM ('PENDING', 'CREATED', 'RELEASED', 'FAILED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('QUEUED', 'SCHEDULED', 'IN_PROGRESS', 'PENDING', 'WAITING_FOR_RETRY', 'SUCCESS', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "TransferMode" AS ENUM ('IMPS', 'NEFT', 'RTGS', 'UPI');

-- CreateEnum
CREATE TYPE "InboundSource" AS ENUM ('SURL', 'FURL', 'PAYMENT_WEBHOOK', 'REFUND_WEBHOOK', 'DISPUTE_WEBHOOK', 'ONBOARDING_WEBHOOK', 'PAYMENT_LINK_WEBHOOK', 'PAYOUT_WEBHOOK', 'POLL');

-- CreateEnum
CREATE TYPE "EventProcessing" AS ENUM ('RECEIVED', 'SIGNATURE_INVALID', 'PROCESSED', 'DUPLICATE', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerAccount" AS ENUM ('CUSTOMER_PAYMENTS', 'REFUNDS', 'CHARGEBACKS', 'GATEWAY_FEES', 'GATEWAY_TAX', 'PENDING_SETTLEMENT', 'SETTLED_TO_BANK', 'ADJUSTMENTS');

-- CreateEnum
CREATE TYPE "ReconKind" AS ENUM ('VERIFY_PAYMENTS', 'REFUND_STATUS', 'SETTLEMENT_SYNC', 'CHARGEBACK_SYNC', 'PAYOUT_STATUS', 'MANDATE_STATUS');

-- CreateEnum
CREATE TYPE "ReconRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "MismatchResolution" AS ENUM ('OPEN', 'AUTO_FIXED', 'MANUALLY_FIXED', 'IGNORED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "mobileVerifiedAt" TIMESTAMP(3),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "merchantId" TEXT,
    "mode" "Mode" NOT NULL DEFAULT 'TEST',
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "target" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoConnection" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "emailDomain" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "clientId" TEXT,
    "clientSecretEnc" TEXT,
    "metadataUrl" TEXT,
    "enforced" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SsoConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "invitedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "legalName" TEXT,
    "email" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "entityType" "BusinessEntityType",
    "category" TEXT,
    "subCategory" TEXT,
    "panEnc" TEXT,
    "panLast4" TEXT,
    "gstin" TEXT,
    "websiteUrl" TEXT,
    "appUrl" TEXT,
    "status" "MerchantStatus" NOT NULL DEFAULT 'TEST_ONLY',
    "integrationType" "IntegrationType",
    "activatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "payuMid" INTEGER,
    "payuMerchantUuid" TEXT,
    "payuProductAccountUuid" TEXT,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantAddress" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingStep" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "key" "OnboardingStepKey" NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "data" JSONB,
    "remarks" TEXT,
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayuOnboardingStatus" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "remarks" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayuOnboardingStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayuOnboardingEvent" (
    "id" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "previousStatus" TEXT,
    "currentStatus" TEXT NOT NULL,
    "error" TEXT,
    "remarks" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL,
    "inboundEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayuOnboardingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycDocument" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" "KycDocType" NOT NULL,
    "numberMasked" TEXT,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "payuDocumentId" TEXT,
    "status" "KycStatus" NOT NULL DEFAULT 'UPLOADED',
    "remarks" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "KycDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "accountNumberEnc" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "bankName" TEXT,
    "nameAtBank" TEXT,
    "pennyDropVerified" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayuCredential" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "payuMid" INTEGER NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "saltVersion" "SaltVersion" NOT NULL,
    "saltEnc" TEXT NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PayuCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildMerchant" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "name" TEXT NOT NULL,
    "childMid" INTEGER,
    "childMerchantKey" TEXT,
    "productAccountUuid" TEXT,
    "onboardingStatus" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildMerchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantPaymentMethod" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatewayDowntime" (
    "id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "bankCode" TEXT,
    "severity" TEXT NOT NULL,
    "message" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GatewayDowntime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutTheme" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "logoKey" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#4b3bdb',
    "displayName" TEXT,
    "methodOrder" "PaymentMethod"[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "url" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "responseCode" INTEGER,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "customerId" TEXT,
    "paymentLinkId" TEXT,
    "receipt" TEXT,
    "amountPaise" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "productInfo" VARCHAR(100) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'CREATED',
    "udf1" VARCHAR(255),
    "udf2" VARCHAR(255),
    "udf3" VARCHAR(255),
    "udf4" VARCHAR(255),
    "udf5" VARCHAR(255),
    "notes" JSONB,
    "returnUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "orderId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "txnid" VARCHAR(25) NOT NULL,
    "mihpayid" TEXT,
    "amountPaise" BIGINT NOT NULL,
    "payuAmount" TEXT NOT NULL,
    "additionalChargesPaise" BIGINT,
    "netAmountDebitPaise" BIGINT,
    "discountPaise" BIGINT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'INITIATED',
    "payuStatus" TEXT,
    "unmappedStatus" TEXT,
    "method" "PaymentMethod",
    "payuMode" TEXT,
    "bankcode" TEXT,
    "pgType" TEXT,
    "paymentSource" TEXT,
    "bankRefNum" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "cardMasked" TEXT,
    "vpaMasked" TEXT,
    "isMandateRegistration" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionEvent" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "fromStatus" "TransactionStatus",
    "toStatus" "TransactionStatus" NOT NULL,
    "payuStatus" TEXT,
    "unmappedStatus" TEXT,
    "inboundEventId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "transactionId" TEXT NOT NULL,
    "token" VARCHAR(23) NOT NULL,
    "payuRequestId" TEXT,
    "amountPaise" BIGINT NOT NULL,
    "reason" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "payuStatus" TEXT,
    "errorCode" TEXT,
    "bankArn" TEXT,
    "bankRefNum" TEXT,
    "refundMode" TEXT,
    "splitBreakdown" JSONB,
    "requestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "credentialId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "payuSettlementId" TEXT NOT NULL,
    "utr" TEXT,
    "transactionAmtPaise" BIGINT NOT NULL,
    "refundAmtPaise" BIGINT NOT NULL DEFAULT 0,
    "chargebackAmtPaise" BIGINT NOT NULL DEFAULT 0,
    "serviceFeePaise" BIGINT NOT NULL DEFAULT 0,
    "serviceTaxPaise" BIGINT NOT NULL DEFAULT 0,
    "netAmountPaise" BIGINT NOT NULL,
    "status" "SettlementStatus" NOT NULL,
    "completedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementLine" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "lineKey" TEXT NOT NULL,
    "action" "SettlementLineAction" NOT NULL,
    "payuId" TEXT NOT NULL,
    "payuRequestId" TEXT,
    "merchantTransactionId" TEXT,
    "transactionId" TEXT,
    "refundId" TEXT,
    "grossPaise" BIGINT NOT NULL,
    "feePaise" BIGINT NOT NULL DEFAULT 0,
    "taxPaise" BIGINT NOT NULL DEFAULT 0,
    "netPaise" BIGINT NOT NULL,
    "payuMode" TEXT,

    CONSTRAINT "SettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chargeback" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "transactionId" TEXT NOT NULL,
    "payuChargebackId" TEXT NOT NULL,
    "cbType" TEXT,
    "reasonCode" TEXT,
    "reason" TEXT,
    "amountPaise" BIGINT NOT NULL,
    "status" "ChargebackStatus" NOT NULL DEFAULT 'NEW',
    "payuStatus" TEXT NOT NULL,
    "bankCaseNo" TEXT,
    "debitStatus" TEXT,
    "replyBefore" TIMESTAMP(3),
    "evidenceKeys" TEXT[],
    "raisedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chargeback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentLink" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "credentialId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "url" TEXT,
    "description" TEXT NOT NULL,
    "amountPaise" BIGINT,
    "isAmountFilledByCustomer" BOOLEAN NOT NULL DEFAULT false,
    "isPartialPaymentAllowed" BOOLEAN NOT NULL DEFAULT false,
    "minAmountForCustomerPaise" BIGINT,
    "maxPaymentsAllowed" INTEGER,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "status" "PaymentLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "payuActive" BOOLEAN,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "name" TEXT NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "billingInterval" INTEGER NOT NULL DEFAULT 1,
    "totalCycles" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mandate" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "credentialId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "planId" TEXT,
    "registrationTxnId" TEXT NOT NULL,
    "authPayuId" TEXT,
    "method" "MandateMethod" NOT NULL,
    "maxAmountPaise" BIGINT NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "billingInterval" INTEGER NOT NULL DEFAULT 1,
    "billingRule" TEXT,
    "billingLimit" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "MandateStatus" NOT NULL DEFAULT 'PENDING_REGISTRATION',
    "payuStatus" TEXT,
    "nextDebitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mandate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreDebitNotification" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "debitDate" DATE NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "invoiceDisplayNumber" TEXT,
    "mandateSeqNo" INTEGER,
    "payuStatus" TEXT,
    "invoiceStatus" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreDebitNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringDebit" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "preDebitId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringDebit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitAllocation" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "transactionId" TEXT NOT NULL,
    "childMerchantId" TEXT NOT NULL,
    "splitType" "SplitType" NOT NULL,
    "aggregatorSubTxnId" TEXT NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "chargesPaise" BIGINT,
    "status" "SplitStatus" NOT NULL DEFAULT 'PENDING',
    "payuStatus" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releaseStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Beneficiary" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "mobile" TEXT,
    "accountNumberEnc" TEXT,
    "accountLast4" TEXT,
    "ifsc" TEXT,
    "vpa" TEXT,
    "payuBeneficiaryId" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Beneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "merchantRefId" VARCHAR(40) NOT NULL,
    "batchId" TEXT,
    "amountPaise" BIGINT NOT NULL,
    "transferMode" "TransferMode" NOT NULL,
    "purpose" TEXT,
    "status" "PayoutStatus" NOT NULL DEFAULT 'QUEUED',
    "payuStatus" TEXT,
    "payuRefId" TEXT,
    "bankRefNo" TEXT,
    "feePaise" BIGINT,
    "taxPaise" BIGINT,
    "failureReason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "journalId" TEXT NOT NULL,
    "account" "LedgerAccount" NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconRun" (
    "id" TEXT NOT NULL,
    "kind" "ReconKind" NOT NULL,
    "mode" "Mode" NOT NULL,
    "merchantId" TEXT,
    "windowFrom" TIMESTAMP(3) NOT NULL,
    "windowTo" TIMESTAMP(3) NOT NULL,
    "status" "ReconRunStatus" NOT NULL DEFAULT 'RUNNING',
    "checked" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "mismatches" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ReconRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconMismatch" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "payuRef" TEXT,
    "field" TEXT NOT NULL,
    "localValue" TEXT,
    "payuValue" TEXT,
    "resolution" "MismatchResolution" NOT NULL DEFAULT 'OPEN',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconMismatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundEvent" (
    "id" TEXT NOT NULL,
    "source" "InboundSource" NOT NULL,
    "mode" "Mode" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "merchantId" TEXT,
    "signatureValid" BOOLEAN,
    "payload" JSONB NOT NULL,
    "processing" "EventProcessing" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "InboundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "kind" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "filters" JSONB,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "storageKey" TEXT,
    "expiresAt" TIMESTAMP(3),
    "requestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT,
    "userId" TEXT,
    "mode" "Mode",
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "ip" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_mobile_key" ON "User"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshHash_key" ON "Session"("refreshHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "OtpCode_target_purpose_createdAt_idx" ON "OtpCode"("target", "purpose", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SsoConnection_merchantId_key" ON "SsoConnection"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "SsoConnection_emailDomain_key" ON "SsoConnection"("emailDomain");

-- CreateIndex
CREATE INDEX "Membership_merchantId_idx" ON "Membership"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_merchantId_key" ON "Membership"("userId", "merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_payuMid_key" ON "Merchant"("payuMid");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_payuMerchantUuid_key" ON "Merchant"("payuMerchantUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_payuProductAccountUuid_key" ON "Merchant"("payuProductAccountUuid");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantAddress_merchantId_kind_key" ON "MerchantAddress"("merchantId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingStep_merchantId_key_key" ON "OnboardingStep"("merchantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PayuOnboardingStatus_merchantId_area_key" ON "PayuOnboardingStatus"("merchantId", "area");

-- CreateIndex
CREATE UNIQUE INDEX "PayuOnboardingEvent_inboundEventId_key" ON "PayuOnboardingEvent"("inboundEventId");

-- CreateIndex
CREATE INDEX "PayuOnboardingEvent_statusId_changedAt_idx" ON "PayuOnboardingEvent"("statusId", "changedAt");

-- CreateIndex
CREATE INDEX "KycDocument_merchantId_type_idx" ON "KycDocument"("merchantId", "type");

-- CreateIndex
CREATE INDEX "BankAccount_merchantId_idx" ON "BankAccount"("merchantId");

-- CreateIndex
CREATE INDEX "PayuCredential_merchantId_mode_idx" ON "PayuCredential"("merchantId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "PayuCredential_mode_merchantKey_saltVersion_key" ON "PayuCredential"("mode", "merchantKey", "saltVersion");

-- CreateIndex
CREATE UNIQUE INDEX "PayuCredential_id_merchantId_mode_key" ON "PayuCredential"("id", "merchantId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "ChildMerchant_mode_childMerchantKey_key" ON "ChildMerchant"("mode", "childMerchantKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChildMerchant_id_merchantId_mode_key" ON "ChildMerchant"("id", "merchantId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantPaymentMethod_merchantId_mode_method_key" ON "MerchantPaymentMethod"("merchantId", "mode", "method");

-- CreateIndex
CREATE INDEX "GatewayDowntime_endedAt_idx" ON "GatewayDowntime"("endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutTheme_merchantId_mode_key" ON "CheckoutTheme"("merchantId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");

-- CreateIndex
CREATE INDEX "ApiKey_merchantId_mode_idx" ON "ApiKey"("merchantId", "mode");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextRetryAt_idx" ON "WebhookDelivery"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_endpointId_eventId_key" ON "WebhookDelivery"("endpointId", "eventId");

-- CreateIndex
CREATE INDEX "Customer_merchantId_mode_email_idx" ON "Customer"("merchantId", "mode", "email");

-- CreateIndex
CREATE INDEX "Customer_merchantId_mode_phone_idx" ON "Customer"("merchantId", "mode", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_id_merchantId_mode_key" ON "Customer"("id", "merchantId", "mode");

-- CreateIndex
CREATE INDEX "Order_merchantId_mode_createdAt_idx" ON "Order"("merchantId", "mode", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_merchantId_mode_receipt_key" ON "Order"("merchantId", "mode", "receipt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_id_merchantId_mode_key" ON "Order"("id", "merchantId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_txnid_key" ON "Transaction"("txnid");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_mode_status_createdAt_idx" ON "Transaction"("merchantId", "mode", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_status_updatedAt_idx" ON "Transaction"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_mode_mihpayid_key" ON "Transaction"("mode", "mihpayid");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_id_merchantId_mode_key" ON "Transaction"("id", "merchantId", "mode");

-- CreateIndex
CREATE INDEX "TransactionEvent_transactionId_createdAt_idx" ON "TransactionEvent"("transactionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_token_key" ON "Refund"("token");

-- CreateIndex
CREATE INDEX "Refund_merchantId_mode_status_idx" ON "Refund"("merchantId", "mode", "status");

-- CreateIndex
CREATE INDEX "Refund_transactionId_idx" ON "Refund"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_mode_payuRequestId_key" ON "Refund"("mode", "payuRequestId");

-- CreateIndex
CREATE INDEX "Settlement_merchantId_mode_completedAt_idx" ON "Settlement"("merchantId", "mode", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_credentialId_payuSettlementId_key" ON "Settlement"("credentialId", "payuSettlementId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_id_merchantId_mode_key" ON "Settlement"("id", "merchantId", "mode");

-- CreateIndex
CREATE INDEX "SettlementLine_transactionId_idx" ON "SettlementLine"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementLine_settlementId_lineKey_key" ON "SettlementLine"("settlementId", "lineKey");

-- CreateIndex
CREATE INDEX "Chargeback_merchantId_mode_status_idx" ON "Chargeback"("merchantId", "mode", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Chargeback_mode_payuChargebackId_key" ON "Chargeback"("mode", "payuChargebackId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_credentialId_invoiceNumber_key" ON "PaymentLink"("credentialId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_id_merchantId_mode_key" ON "PaymentLink"("id", "merchantId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_id_merchantId_mode_key" ON "SubscriptionPlan"("id", "merchantId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "Mandate_registrationTxnId_key" ON "Mandate"("registrationTxnId");

-- CreateIndex
CREATE INDEX "Mandate_status_nextDebitAt_idx" ON "Mandate"("status", "nextDebitAt");

-- CreateIndex
CREATE UNIQUE INDEX "Mandate_mode_authPayuId_key" ON "Mandate"("mode", "authPayuId");

-- CreateIndex
CREATE UNIQUE INDEX "Mandate_id_merchantId_mode_key" ON "Mandate"("id", "merchantId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "PreDebitNotification_requestId_key" ON "PreDebitNotification"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringDebit_preDebitId_key" ON "RecurringDebit"("preDebitId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringDebit_transactionId_key" ON "RecurringDebit"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringDebit_mandateId_cycleNumber_key" ON "RecurringDebit"("mandateId", "cycleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SplitAllocation_transactionId_childMerchantId_key" ON "SplitAllocation"("transactionId", "childMerchantId");

-- CreateIndex
CREATE UNIQUE INDEX "SplitAllocation_mode_aggregatorSubTxnId_key" ON "SplitAllocation"("mode", "aggregatorSubTxnId");

-- CreateIndex
CREATE UNIQUE INDEX "Beneficiary_mode_payuBeneficiaryId_key" ON "Beneficiary"("mode", "payuBeneficiaryId");

-- CreateIndex
CREATE UNIQUE INDEX "Beneficiary_id_merchantId_mode_key" ON "Beneficiary"("id", "merchantId", "mode");

-- CreateIndex
CREATE INDEX "Payout_merchantId_mode_status_idx" ON "Payout"("merchantId", "mode", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_merchantId_mode_merchantRefId_key" ON "Payout"("merchantId", "mode", "merchantRefId");

-- CreateIndex
CREATE INDEX "LedgerEntry_merchantId_mode_account_occurredAt_idx" ON "LedgerEntry"("merchantId", "mode", "account", "occurredAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_sourceType_sourceId_idx" ON "LedgerEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_journalId_account_sourceType_sourceId_key" ON "LedgerEntry"("journalId", "account", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ReconRun_kind_mode_startedAt_idx" ON "ReconRun"("kind", "mode", "startedAt");

-- CreateIndex
CREATE INDEX "ReconMismatch_merchantId_resolution_idx" ON "ReconMismatch"("merchantId", "resolution");

-- CreateIndex
CREATE UNIQUE INDEX "InboundEvent_dedupeKey_key" ON "InboundEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "InboundEvent_source_processing_receivedAt_idx" ON "InboundEvent"("source", "processing", "receivedAt");

-- CreateIndex
CREATE INDEX "Report_merchantId_mode_createdAt_idx" ON "Report"("merchantId", "mode", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_merchantId_createdAt_idx" ON "AuditLog"("merchantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoConnection" ADD CONSTRAINT "SsoConnection_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantAddress" ADD CONSTRAINT "MerchantAddress_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingStep" ADD CONSTRAINT "OnboardingStep_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayuOnboardingStatus" ADD CONSTRAINT "PayuOnboardingStatus_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayuOnboardingEvent" ADD CONSTRAINT "PayuOnboardingEvent_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "PayuOnboardingStatus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayuOnboardingEvent" ADD CONSTRAINT "PayuOnboardingEvent_inboundEventId_fkey" FOREIGN KEY ("inboundEventId") REFERENCES "InboundEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycDocument" ADD CONSTRAINT "KycDocument_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayuCredential" ADD CONSTRAINT "PayuCredential_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildMerchant" ADD CONSTRAINT "ChildMerchant_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantPaymentMethod" ADD CONSTRAINT "MerchantPaymentMethod_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutTheme" ADD CONSTRAINT "CheckoutTheme_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_merchantId_mode_fkey" FOREIGN KEY ("customerId", "merchantId", "mode") REFERENCES "Customer"("id", "merchantId", "mode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentLinkId_merchantId_mode_fkey" FOREIGN KEY ("paymentLinkId", "merchantId", "mode") REFERENCES "PaymentLink"("id", "merchantId", "mode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_orderId_merchantId_mode_fkey" FOREIGN KEY ("orderId", "merchantId", "mode") REFERENCES "Order"("id", "merchantId", "mode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_credentialId_merchantId_mode_fkey" FOREIGN KEY ("credentialId", "merchantId", "mode") REFERENCES "PayuCredential"("id", "merchantId", "mode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionEvent" ADD CONSTRAINT "TransactionEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionEvent" ADD CONSTRAINT "TransactionEvent_inboundEventId_fkey" FOREIGN KEY ("inboundEventId") REFERENCES "InboundEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_transactionId_merchantId_mode_fkey" FOREIGN KEY ("transactionId", "merchantId", "mode") REFERENCES "Transaction"("id", "merchantId", "mode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_credentialId_merchantId_mode_fkey" FOREIGN KEY ("credentialId", "merchantId", "mode") REFERENCES "PayuCredential"("id", "merchantId", "mode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_settlementId_merchantId_mode_fkey" FOREIGN KEY ("settlementId", "merchantId", "mode") REFERENCES "Settlement"("id", "merchantId", "mode") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chargeback" ADD CONSTRAINT "Chargeback_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chargeback" ADD CONSTRAINT "Chargeback_transactionId_merchantId_mode_fkey" FOREIGN KEY ("transactionId", "merchantId", "mode") REFERENCES "Transaction"("id", "merchantId", "mode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_credentialId_merchantId_mode_fkey" FOREIGN KEY ("credentialId", "merchantId", "mode") REFERENCES "PayuCredential"("id", "merchantId", "mode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_credentialId_merchantId_mode_fkey" FOREIGN KEY ("credentialId", "merchantId", "mode") REFERENCES "PayuCredential"("id", "merchantId", "mode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_customerId_merchantId_mode_fkey" FOREIGN KEY ("customerId", "merchantId", "mode") REFERENCES "Customer"("id", "merchantId", "mode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_planId_merchantId_mode_fkey" FOREIGN KEY ("planId", "merchantId", "mode") REFERENCES "SubscriptionPlan"("id", "merchantId", "mode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_registrationTxnId_fkey" FOREIGN KEY ("registrationTxnId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreDebitNotification" ADD CONSTRAINT "PreDebitNotification_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDebit" ADD CONSTRAINT "RecurringDebit_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDebit" ADD CONSTRAINT "RecurringDebit_preDebitId_fkey" FOREIGN KEY ("preDebitId") REFERENCES "PreDebitNotification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDebit" ADD CONSTRAINT "RecurringDebit_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitAllocation" ADD CONSTRAINT "SplitAllocation_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitAllocation" ADD CONSTRAINT "SplitAllocation_transactionId_merchantId_mode_fkey" FOREIGN KEY ("transactionId", "merchantId", "mode") REFERENCES "Transaction"("id", "merchantId", "mode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitAllocation" ADD CONSTRAINT "SplitAllocation_childMerchantId_merchantId_mode_fkey" FOREIGN KEY ("childMerchantId", "merchantId", "mode") REFERENCES "ChildMerchant"("id", "merchantId", "mode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_beneficiaryId_merchantId_mode_fkey" FOREIGN KEY ("beneficiaryId", "merchantId", "mode") REFERENCES "Beneficiary"("id", "merchantId", "mode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconMismatch" ADD CONSTRAINT "ReconMismatch_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReconRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

