export const ComplaintDomain = [
  "CLINICAL",
  "MANAGEMENT",
  "RELATIONSHIP",
] as const;

export type ComplaintDomain = typeof ComplaintDomain[number];

export const ComplaintSubcategory = {
  MANAGEMENT: [
    "WAIT_TIME",
    "BILLING",
    "APPOINTMENT",
    "FACILITIES",
    "ADMIN_PROCESS",
  ],
  RELATIONSHIP: [
    "COMMUNICATION",
    "ATTITUDE",
    "RESPECT",
    "PROFESSIONALISM",
  ],
  CLINICAL: [
    "MEDICATION",
    "DIAGNOSIS",
    "PROCEDURE",
    "SAFETY",
    "FOLLOW_UP",
  ],
} as const;

export type ComplaintSubcategory =
  typeof ComplaintSubcategory[keyof typeof ComplaintSubcategory][number];

export const TypeOfCare = [
  "OUTPATIENT",
  "INPATIENT",
  "EMERGENCY",
  "DAY_SURGERY",
] as const;

export type TypeOfCare = typeof TypeOfCare[number];

export const UrgencyLevel = [
  "LOW",
  "MEDIUM",
  "HIGH",
] as const;

export type UrgencyLevel = typeof UrgencyLevel[number];

export const ImpactFlags = [
  "EMOTIONAL",
  "PHYSICAL",
  "FINANCIAL",
  "DELAY_IN_CARE",
] as const;

export type ImpactFlag = typeof ImpactFlags[number];

// Complaint interface for LangGraph state
export interface Complaint {
  domain?: ComplaintDomain;
  subcategory?: ComplaintSubcategory;
  description?: string;
  
  // Event details
  event?: {
    date?: string;
    location?: string;
  };
  
  // Type of care
  typeOfCare?: TypeOfCare;
  
  // Billing details
  billing?: {
    amount?: string;
    insuranceStatus?: string;
  };
  
  // Medication details
  medication?: {
    name?: string;
  };
  
  // People involved
  people?: {
    role?: string;
  };
  
  // Impact assessment
  impact?: ImpactFlag[];
  urgencyLevel?: UrgencyLevel;
  
  // Complainant contact details (from SGH feedback form)
  contactDetails?: {
    name?: string;
    email?: string;
    contactNo?: string;
    isPatient?: boolean;
    wantsContact?: boolean;
  };
  
  // Processing flags
  needsHumanInvestigation?: boolean;
}
