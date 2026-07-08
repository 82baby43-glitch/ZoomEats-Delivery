/** Agreement definitions for driver and restaurant legal onboarding. */

export const AGREEMENT_VERSION = "2.0";

export type AgreementKind = "signature" | "checkbox";

export type AgreementDef = {
  type: string;
  title: string;
  kind: AgreementKind;
  required: boolean;
  role: "delivery" | "vendor";
  body: string;
  fullText?: string;
};

const DRIVER_LEGAL_BODY = {
  independent_contractor: `INDEPENDENT CONTRACTOR AGREEMENT

This Independent Contractor Agreement ("Agreement") is entered into between you ("Contractor") and ZoomEats, Inc. ("Company").

1. RELATIONSHIP. Contractor is an independent contractor, not an employee, agent, or partner of Company. Contractor has no authority to bind Company and is not entitled to employee benefits.

2. SERVICES. Contractor agrees to provide food delivery services through the ZoomEats platform in a professional, timely, and safe manner.

3. COMPENSATION. Contractor receives payment per completed delivery as displayed in the app. Contractor is responsible for all taxes, insurance, vehicle costs, and business expenses.

4. SCHEDULE. Contractor controls when and whether to accept delivery assignments. Company does not guarantee any minimum number of deliveries or earnings.

5. TERMINATION. Either party may terminate this Agreement at any time. Company may deactivate Contractor's account for violations of platform policies.

6. INDEMNIFICATION. Contractor agrees to indemnify Company against claims arising from Contractor's delivery activities or negligence.

By signing below, you acknowledge that you have read, understand, and agree to all terms of this Independent Contractor Agreement.`,

  terms: `DRIVER TERMS OF SERVICE

These Driver Terms of Service govern your use of the ZoomEats delivery platform.

1. ELIGIBILITY. You must be at least 18 years old, hold a valid driver's license, maintain required insurance, and pass background checks.

2. ACCOUNT SECURITY. You are responsible for maintaining the confidentiality of your account credentials and all activity under your account.

3. PLATFORM USE. You agree to use the platform only for authorized delivery services, comply with all applicable laws, and follow Company policies.

4. PROHIBITED CONDUCT. You may not: engage in fraud or misrepresentation; harass customers or restaurant staff; tamper with orders; use the platform while impaired; share customer data; or subcontract deliveries without authorization.

5. ORDER FULFILLMENT. You agree to pick up and deliver orders promptly, maintain food safety during transport, and communicate professionally with customers.

6. DEACTIVATION. Company may suspend or deactivate your account for policy violations, safety concerns, or low performance ratings.

7. MODIFICATIONS. Company may update these Terms with notice. Continued use constitutes acceptance of updated Terms.`,

  safety: `SAFETY AGREEMENT

Your safety and the safety of others is paramount. By signing this Safety Agreement, you commit to:

1. TRAFFIC LAWS. Obey all traffic laws, speed limits, and road signage at all times while on delivery.

2. VEHICLE CONDITION. Maintain a safe, clean, and properly insured vehicle suitable for food delivery.

3. FOOD HANDLING. Use insulated delivery bags, keep hot and cold items separated, and deliver food within safe time limits.

4. INCIDENT REPORTING. Report any accident, injury, or safety incident to ZoomEats within 24 hours of occurrence.

5. IMPAIRMENT. Never operate a vehicle while under the influence of alcohol, drugs, or any substance that impairs driving ability.

6. PERSONAL PROTECTIVE EQUIPMENT. Use required safety equipment including reflective gear when delivering at night.

7. WEATHER CONDITIONS. Exercise extra caution in adverse weather and suspend deliveries when conditions are unsafe.

8. CUSTOMER INTERACTION. Maintain professional boundaries and follow safe delivery practices at customer locations.`,

  background: `BACKGROUND CHECK AUTHORIZATION

By signing this Authorization, you provide consent for ZoomEats and its designated third-party background check provider to:

1. CRIMINAL BACKGROUND CHECK. Conduct a criminal background check including county, state, and federal records as permitted by law.

2. MOTOR VEHICLE RECORD (MVR). Review your driving record including violations, accidents, and license status.

3. IDENTITY VERIFICATION. Verify your identity using government-issued identification documents you provide.

4. ONGOING CHECKS. Conduct periodic re-checks during your tenure as a driver, as permitted by applicable law.

5. ADVERSE ACTION. Understand that unfavorable results may result in denial or deactivation of your driver account. You will receive required notices before adverse action is taken.

6. FCRA RIGHTS. If you are a U.S. resident, you have rights under the Fair Credit Reporting Act including the right to dispute inaccurate information.

7. RELEASE. You release background check providers from liability for information reported in good faith.

This authorization remains valid for the duration of your relationship with ZoomEats unless revoked in writing.`,

  privacy: `DATA PRIVACY AGREEMENT

This Data Privacy Agreement supplements the ZoomEats Privacy Policy for drivers.

1. DATA COLLECTED. ZoomEats collects personal information, location data during active deliveries, device information, and delivery activity records.

2. LOCATION TRACKING. Your location is tracked while you are online and accepting deliveries to enable dispatch, customer tracking, and safety features.

3. CUSTOMER DATA. You may access limited customer information (name, address, order details) solely to complete deliveries. You must not retain, share, or misuse customer data.

4. DATA RETENTION. Delivery records and compliance documents are retained as required by law and Company policy.

5. DATA SECURITY. You agree to protect any customer or platform data you access and report suspected data breaches immediately.

6. THIRD PARTIES. Data may be shared with payment processors, background check providers, and insurance partners as described in the Privacy Policy.

7. YOUR RIGHTS. You may request access to or deletion of your personal data subject to legal and operational requirements.

By signing, you acknowledge the Privacy Policy and agree to handle all data in accordance with applicable privacy laws.`,
};

const RESTAURANT_LEGAL_BODY = {
  merchant: `RESTAURANT MERCHANT AGREEMENT

This Restaurant Merchant Agreement ("Agreement") is between your business ("Merchant") and ZoomEats, Inc. ("Company").

1. PARTNERSHIP. Merchant agrees to list its restaurant on the ZoomEats platform and fulfill customer orders placed through the platform.

2. ORDER FULFILLMENT. Merchant agrees to prepare orders accurately, maintain food quality, meet estimated preparation times, and package food safely for delivery.

3. MENU MANAGEMENT. Merchant is responsible for keeping menu items, descriptions, prices, and availability current and accurate.

4. FOOD SAFETY. Merchant certifies compliance with all applicable health codes, food safety regulations, and permit requirements.

5. CUSTOMER SERVICE. Merchant agrees to resolve order issues professionally and cooperate with Company on customer complaints.

6. TERM AND TERMINATION. This Agreement continues until terminated by either party with 30 days written notice.

7. INDEMNIFICATION. Merchant indemnifies Company against claims arising from Merchant's food preparation, food safety violations, or regulatory non-compliance.`,

  terms: `PLATFORM TERMS OF SERVICE

These Platform Terms of Service govern Merchant use of the ZoomEats platform.

1. ACCOUNT. Merchant must provide accurate business information and maintain account security.

2. PLATFORM ACCESS. Merchant receives a non-exclusive license to use the platform for order management and menu administration.

3. PROHIBITED USE. Merchant may not manipulate ratings, create fake orders, discriminate against customers, or misuse platform features.

4. INTELLECTUAL PROPERTY. Merchant grants Company a license to use restaurant name, logo, menu content, and photos for platform marketing.

5. SUPPORT. Company provides platform support during business hours. Merchant is responsible for in-restaurant operations.

6. MODIFICATIONS. Company may update platform features and these Terms with reasonable notice.`,

  commission: `COMMISSION AGREEMENT

This Commission Agreement defines fee structures for Merchant participation on ZoomEats.

1. COMMISSION RATE. Company charges a platform commission on each completed order as displayed in your merchant dashboard at onboarding.

2. PAYMENT PROCESSING. Additional payment processing fees may apply for card transactions processed through Stripe.

3. PROMOTIONS. Merchant may opt into promotional programs that adjust commission rates for qualifying orders.

4. FEE CHANGES. Company will provide at least 30 days notice before changing standard commission rates.

5. TAXES. Merchant is responsible for all applicable sales taxes, food taxes, and regulatory fees.

6. DISPUTES. Commission disputes must be reported within 30 days of the order date through the merchant dashboard.`,

  payment: `PAYMENT PROCESSING AGREEMENT

This Payment Processing Agreement governs payouts to Merchant through Stripe Connect.

1. STRIPE CONNECT. Merchant must complete Stripe Connect onboarding to receive payouts.

2. PAYOUT SCHEDULE. Payouts are processed according to Stripe's standard schedule after order completion and any hold periods.

3. BANK ACCOUNT. Merchant must provide accurate banking information. Company is not liable for payouts sent to incorrect accounts due to Merchant error.

4. CHARGEBACKS. Merchant is responsible for chargebacks and refunds resulting from order issues, subject to Company policies.

5. RESERVES. Company may hold reserves for new merchants or merchants with elevated dispute rates.

6. RECONCILIATION. Merchant may access payout reports through the merchant dashboard and Stripe Express dashboard.`,

  privacy: `PRIVACY AGREEMENT

This Privacy Agreement governs data handling for ZoomEats merchant partners.

1. MERCHANT DATA. Company collects business information, menu data, order records, and payment information.

2. CUSTOMER DATA. Merchant receives limited customer order information necessary for fulfillment. Merchant must not use customer data for marketing without consent.

3. DATA SHARING. Order and payment data is shared with Stripe for payment processing and with delivery partners for fulfillment.

4. RETENTION. Business and order records are retained as required by law and accounting standards.

5. SECURITY. Merchant agrees to protect any customer data accessed during order fulfillment.

6. COMPLIANCE. Both parties agree to comply with applicable data protection laws including state privacy regulations.`,
};

export const DRIVER_AGREEMENTS: AgreementDef[] = [
  {
    type: "independent_contractor_agreement",
    title: "Independent Contractor Agreement",
    kind: "signature",
    required: true,
    role: "delivery",
    body: "You acknowledge you are an independent contractor, not an employee of ZoomEats.",
    fullText: DRIVER_LEGAL_BODY.independent_contractor,
  },
  {
    type: "driver_terms_of_service",
    title: "Driver Terms of Service",
    kind: "signature",
    required: true,
    role: "delivery",
    body: "You agree to ZoomEats Driver Terms of Service governing platform use and delivery conduct.",
    fullText: DRIVER_LEGAL_BODY.terms,
  },
  {
    type: "safety_agreement",
    title: "Safety Agreement",
    kind: "signature",
    required: true,
    role: "delivery",
    body: "You agree to follow safe driving practices and report incidents promptly.",
    fullText: DRIVER_LEGAL_BODY.safety,
  },
  {
    type: "background_check_authorization",
    title: "Background Check Authorization",
    kind: "signature",
    required: true,
    role: "delivery",
    body: "You authorize background checks and motor vehicle record reviews.",
    fullText: DRIVER_LEGAL_BODY.background,
  },
  {
    type: "data_privacy_agreement",
    title: "Data Privacy Agreement",
    kind: "signature",
    required: true,
    role: "delivery",
    body: "You acknowledge ZoomEats data collection and privacy practices for drivers.",
    fullText: DRIVER_LEGAL_BODY.privacy,
  },
];

export const RESTAURANT_AGREEMENTS: AgreementDef[] = [
  {
    type: "restaurant_merchant_agreement",
    title: "Restaurant Merchant Agreement",
    kind: "signature",
    required: true,
    role: "vendor",
    body: "You agree to partner with ZoomEats as a merchant and fulfill orders accurately.",
    fullText: RESTAURANT_LEGAL_BODY.merchant,
  },
  {
    type: "platform_terms_of_service",
    title: "Platform Terms of Service",
    kind: "signature",
    required: true,
    role: "vendor",
    body: "You agree to ZoomEats Platform Terms of Service for merchants.",
    fullText: RESTAURANT_LEGAL_BODY.terms,
  },
  {
    type: "commission_agreement",
    title: "Commission Agreement",
    kind: "signature",
    required: true,
    role: "vendor",
    body: "You agree to platform commission rates and fee schedules.",
    fullText: RESTAURANT_LEGAL_BODY.commission,
  },
  {
    type: "payment_processing_agreement",
    title: "Payment Processing Agreement",
    kind: "signature",
    required: true,
    role: "vendor",
    body: "You agree to Stripe Connect payout terms and banking requirements.",
    fullText: RESTAURANT_LEGAL_BODY.payment,
  },
  {
    type: "privacy_agreement",
    title: "Privacy Agreement",
    kind: "signature",
    required: true,
    role: "vendor",
    body: "You acknowledge ZoomEats Privacy Policy for merchant data.",
    fullText: RESTAURANT_LEGAL_BODY.privacy,
  },
];

export function agreementsForRole(role: string): AgreementDef[] {
  if (role === "delivery" || role === "driver") return DRIVER_AGREEMENTS;
  if (role === "vendor" || role === "restaurant") return RESTAURANT_AGREEMENTS;
  return [];
}

export function requiredAgreementTypes(role: string): string[] {
  return agreementsForRole(role).filter((a) => a.required).map((a) => a.type);
}

export function agreementDocumentText(def: AgreementDef): string {
  return def.fullText || def.body;
}
