// ─────────────────────────────────────────────────────────────────────────────
// Bizpole — Payment Partnership Proposal: EDITABLE CONTENT
//
// Edit text here, then run:  node proposals/build.mjs
// Anything written as [[like this]] is a placeholder. It renders highlighted so
// it cannot be missed. Replace every placeholder before sending.
// Provider-specific text lives in PROVIDERS at the bottom of this file.
// ─────────────────────────────────────────────────────────────────────────────

export const META = {
  date: 'November 2026',
  year: '2026',
  version: 'Version 1.0',
};

export const PRODUCT = {
  intro: [
    'Bizpole Pay is a proposed multi-merchant platform that enables businesses to manage customer payments and, over time, their broader financial operations through one branded interface.',
    'The initial release focuses on merchant onboarding, payment collection, payment links, transaction tracking, refunds and reporting, using supported payment partner integrations.',
  ],
  vision:
    'Help businesses manage incoming and outgoing money with less manual work, better visibility and stronger financial controls.',
  initial: [
    ['Merchant onboarding', 'Bring businesses onto the platform.'],
    ['Payment collection', 'Accept customer payments online.'],
    ['Payment links', 'Collect payments through shareable links.'],
    ['Transaction tracking', 'Successful, failed and pending payments.'],
    ['Refunds', 'Initiate and track refunds.'],
    ['Reporting', 'Transaction and settlement reporting.'],
  ],
  future: [
    'Payout workflows', 'Vendor payments', 'Invoice management', 'Expenses',
    'Reimbursements', 'Approval workflows', 'Accounting integrations',
  ],
  why: [
    ['Authorised processing', 'Collecting and settling payments for merchants must be handled by an RBI-authorised payment provider.'],
    ['Payment network access', 'Connectivity to UPI, cards, net banking and wallets.'],
    ['Secure settlement', 'Funds settle directly to each merchant’s bank account.'],
    ['Security & compliance', 'PCI DSS-compliant processing, tokenisation and merchant KYC.'],
  ],
  intent:
    'We are looking for a long-term technology and business partner, not only API credentials. We want to build Bizpole Pay with a provider whose platform, people and commercial approach can grow with us.',
};

export const MODELS = [
  ['Direct merchant', 'Bizpole Pay is onboarded as a single merchant account.'],
  ['Technology partner', 'Bizpole Pay integrates the partner’s payment stack as an integration partner.'],
  ['Platform partner', 'Bizpole Pay onboards and manages its merchants as sub-merchants through the partner’s onboarding APIs.'],
  ['Aggregator arrangement', 'Payments for several merchants are handled through Bizpole Pay. We recognise this carries regulatory requirements and would value guidance.'],
];

export const REQUIREMENTS = [
  {
    key: 'A', title: 'Business & Partner Onboarding',
    lead: 'A clear, well-supported path from registration to live credentials.',
    items: [
      'Register Bizpole Pay as a business or technology partner',
      'Understand the applicable partner onboarding process',
      'Complete company KYC and documentation',
      'Obtain the appropriate merchant or partner account',
      'Receive sandbox & production API credentials',
    ],
  },
  {
    key: 'B', title: 'Payment Partner Integration',
    lead: 'Full API coverage of the payment lifecycle.',
    items: [
      'Payment API access',
      'Payment order creation',
      'Payment status verification',
      'Authorisation and capture, where supported',
      'Refund API integration',
      'Webhook notifications',
      'Transaction reporting',
      'Merchant-wise transaction visibility',
      'Secure API authentication',
    ],
  },
  {
    key: 'C', title: 'Payment Methods',
    lead: 'Support and commercial details for each applicable method.',
    items: [
      'UPI',
      'Credit cards',
      'Debit cards',
      'Net banking',
      'Wallets',
      'Other supported payment methods',
    ],
  },
  {
    key: 'D', title: 'Settlement & Reconciliation',
    lead: 'Clear visibility of money movement, end to end.',
    items: [
      'Settlement cycle and timelines',
      'Merchant-wise settlement tracking',
      'Settlement reports',
      'Transaction-level reconciliation',
      'Refund settlement handling',
      'Failed and disputed transaction management',
      'Settlement status APIs or reports',
    ],
  },
  {
    key: 'E', title: 'Technical Support',
    lead: 'Dependable support through integration and after launch.',
    items: [
      'Technical integration documentation',
      'Dedicated integration support',
      'Sandbox testing assistance',
      'Production activation support',
      'Technical escalation contact',
      'Defined support and issue-resolution SLAs',
    ],
  },
];

export const EXPECTATIONS = [
  ['Onboarding assistance', 'Guidance through business registration and onboarding.'],
  ['API access', 'Access to the relevant merchant or partner payment APIs.'],
  ['Competitive commercials', 'Fair transaction pricing and commercial terms.'],
  ['Integration support', 'A dedicated technical contact during integration.'],
  ['Sandbox & production', 'Timely access to both environments.'],
  ['Compliance guidance', 'Help with compliance requirements and documentation.'],
  ['Settlement support', 'Support for settlement and reconciliation operations.'],
  ['Strategic collaboration', 'A relationship built for the long term.'],
  ['Shared growth', 'Ongoing discussion of new opportunities and transaction growth.'],
];

// Commercial table, grouped. Each row is priced separately.
export const COMMERCIALS = [
  {
    group: 'Payment methods — transaction pricing (MDR)',
    rows: [
      ['UPI', 'Transaction pricing for UPI payments'],
      ['Debit cards', 'Domestic debit card pricing'],
      ['Credit cards', 'Domestic credit card pricing'],
      ['International cards', 'International card pricing, if applicable'],
      ['Net banking', 'Net banking pricing'],
      ['Wallets', 'Wallet pricing'],
      ['Other methods', 'Pricing for any other supported payment methods'],
    ],
  },
  {
    group: 'Services',
    rows: [
      ['Setup & onboarding', 'One-time setup, onboarding or integration charges'],
      ['Merchant onboarding', 'Charges per merchant onboarded, if any'],
      ['Payment links', 'Charges for payment links, if priced separately'],
      ['Refunds', 'Refund processing charges'],
      ['Settlement', 'Standard settlement and faster settlement charges'],
    ],
  },
  {
    group: 'Commercial terms',
    rows: [
      ['Minimum commitment', 'Minimum monthly commitments, if any'],
      ['Volume-based pricing', 'Pricing tiers linked to transaction volume'],
      ['Partner benefits', 'Any additional partner benefits or programmes'],
    ],
  },
];

// Security & compliance (page 5). Intended approach — confirm before sending.
export const SECURITY = {
  intro:
    'Bizpole Pay is being designed to keep sensitive payment data within our payment partner’s secure environment and to meet applicable RBI requirements. We would value our partner’s guidance on the obligations that apply to us.',
  approach: [
    'Card details are entered on the payment partner’s hosted checkout or secure SDK, not on Bizpole Pay systems.',
    'Bizpole Pay does not intend to store, process or transmit full card data, reducing our PCI DSS scope.',
    'Saved cards, if offered, rely on the partner’s RBI-compliant card tokenisation.',
    'Payment data is stored in India, in line with RBI’s payment data storage requirements.',
    'APIs secured with encrypted connections, secure credentials and webhook signature verification.',
  ],
  guidance: [
    'Our PCI DSS obligations under the recommended integration, and the documents required.',
    'Applicable RBI guidelines for a multi-merchant platform, including merchant due diligence.',
    'Data storage and data sharing requirements for transaction and merchant data.',
    'Security reviews, questionnaires or audits required before go-live.',
  ],
};

// Merchant account ownership and fund flow (page 3). This is our proposed
// approach — confirm it matches your plan before sending.
export const ACCOUNTS = {
  ownership: [
    'Each merchant completes its own KYC and holds its own merchant or sub-merchant account with the payment partner.',
    'Each merchant settles to its own verified bank account.',
    'Bizpole Pay provides the platform and interface; it does not own merchants’ payment accounts.',
  ],
  funds: [
    'Customer payments are processed by the payment partner.',
    'Funds settle from the payment partner directly to each merchant’s bank account.',
    'Bizpole Pay does not hold, pool or route merchant funds.',
    'Refunds and adjustments are applied against the respective merchant.',
  ],
  clarify:
    'We would like our payment partner to confirm this structure, KYC responsibilities for each merchant, how refunds and chargebacks are adjusted per merchant, and how a Bizpole Pay platform fee could be collected, if applicable.',
};

export const PHASES = [
  {
    n: '01', title: 'Business Onboarding',
    desc: 'Company verification, documentation and partner registration.',
    points: ['Partnership model agreed', 'KYC & documentation', 'Account set-up'],
  },
  {
    n: '02', title: 'API & Technical Integration',
    desc: 'Sandbox access, API credentials, payment flows and webhooks.',
    points: ['Sandbox credentials', 'Payment & refund flows', 'Webhook handling'],
  },
  {
    n: '03', title: 'Testing & Certification',
    desc: 'End-to-end testing, verification and production approval.',
    points: ['Transaction & refund tests', 'Reconciliation checks', 'Go-live approval'],
  },
  {
    n: '04', title: 'Production Launch & Growth',
    desc: 'Live processing, monitoring and long-term partnership.',
    points: ['Live transactions', 'Settlement operations', 'Growth reviews'],
  },
];

// Roadmap summary (last page): [phase, title, Bizpole Pay, payment partner, outcome]
export const SUMMARY = [
  ['01', 'Business Onboarding', 'Company documentation and KYC', 'Model recommendation and onboarding guidance', 'Accounts set up'],
  ['02', 'API & Technical Integration', 'Payment, refund and webhook flows', 'Sandbox credentials and integration support', 'Integration complete in sandbox'],
  ['03', 'Testing & Certification', 'End-to-end and reconciliation testing', 'Testing support and production approval', 'Go-live approved'],
  ['04', 'Production Launch & Growth', 'Merchant onboarding and monitoring', 'Live credentials, settlement support and a relationship manager', 'Live payments and growth reviews'],
];

export const MEETING = [
  'The recommended model for onboarding multiple merchants',
  'Security and compliance requirements',
  'Business onboarding requirements and documentation',
  'API access and the integration process',
  'Commercial pricing',
  'Settlement cycle',
  'A dedicated relationship manager',
  'Expected integration and activation timeline',
];

export const CONTACT = [
  ['Name', '[[Contact name]]'],
  ['Designation', '[[Designation]]'],
  ['Email', '[[name@bizpole.in]]'],
  ['Phone', '[[+91 XXXXX XXXXX]]'],
];

// How Bizpole Pay and the payment partner split the work (page 3 table).
export const RESPONSIBILITIES = [
  ['Checkout & orders', 'Payment order creation from our platform', 'Payment API access and secure authentication'],
  ['Payment processing', 'The customer payment experience', 'Processing across UPI, cards, net banking and wallets'],
  ['Status tracking', 'Tracking successful, failed and pending payments', 'Status verification APIs and webhook notifications'],
  ['Refunds', 'Refund requests and status updates for merchants', 'Refund APIs and refund settlement'],
  ['Settlement', 'Settlement monitoring and reconciliation', 'Settlement cycle, reports and status APIs'],
  ['Merchant view', 'Merchant-wise transactions and settlements in one branded interface', 'Merchant-wise transaction and settlement data'],
];

// Output file.
export const PROVIDERS = {
  main: { file: 'Bizpole-Pay-Payment-Partnership-Proposal' },
};
