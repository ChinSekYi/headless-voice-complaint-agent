/**
 * Field Configuration: Data-driven definitions for all fields
 * This replaces hardcoded if-else chains and makes the system flexible
 */

export interface FieldDefinition {
  name: string;
  dataPath: string; // Path in complaint object: "billing.amount", "event.date", etc.
  explanation: string; // User-friendly explanation if they ask for clarification
  unknownValue: string | string[] | boolean; // Default value if user skips
  category: 'event' | 'care' | 'billing' | 'medical' | 'people' | 'impact' | 'contact';
  examples?: string; // Examples to give user if confused
}

/**
 * All field definitions - easily extensible without changing code
 */
export const FIELD_DEFINITIONS: Record<string, FieldDefinition> = {
  'event.date': {
    name: 'event.date',
    dataPath: 'event.date',
    explanation: `I'm asking when this happened - the date of your appointment or when the issue occurred. You can say it however is easiest for you, like "yesterday", "June 24", or "last Tuesday".`,
    unknownValue: 'unknown',
    category: 'event',
    examples: 'yesterday, June 24, 2 weeks ago, last Tuesday',
  },
  'event.location': {
    name: 'event.location',
    dataPath: 'event.location',
    explanation: `I'm asking where this happened. You can say the department, ward, clinic, or area of the hospital.`,
    unknownValue: 'unknown',
    category: 'event',
    examples: 'Emergency Department, Ward A, Cardiology Clinic, Waiting Area',
  },
  'typeOfCare': {
    name: 'typeOfCare',
    dataPath: 'typeOfCare',
    explanation: `I understand you need clarification. I'm asking which service or department you visited at SGH. You can reply with the number or the name of the service. If you're not sure, that's completely fine - just give your best guess or we can move on.`,
    unknownValue: 'unknown',
    category: 'care',
    examples: 'Emergency Department, Specialist Clinic, Surgery, Endoscopy, Laboratory, Pharmacy, Ward',
  },
  'billing.amount': {
    name: 'billing.amount',
    dataPath: 'billing.amount',
    explanation: `Of course. I'm asking about the dollar amount on your bill or charge. If you don't have the bill handy or don't remember the exact amount, no worries - we can skip this.`,
    unknownValue: 'unknown',
    category: 'billing',
    examples: '$50, $1200, approx $300-400',
  },
  'billing.insuranceStatus': {
    name: 'billing.insuranceStatus',
    dataPath: 'billing.insuranceStatus',
    explanation: `I'm happy to explain. Health insurance is the coverage that helps pay for medical costs. This could be:\n- Employer insurance\n- Government programs (Medicare, Medicaid)\n- Private insurance\n- Or no insurance\n\nIf you don't have this information or prefer not to answer, that's perfectly okay.`,
    unknownValue: 'unknown',
    category: 'billing',
    examples: 'employer insurance, government coverage, private insurance, no insurance',
  },
  'medication.name': {
    name: 'medication.name',
    dataPath: 'medication.name',
    explanation: `I'm asking for the name of the medication involved. If you don't remember the exact name, you can describe it (like "the blood pressure pill" or "the painkiller") or we can skip this.`,
    unknownValue: 'unknown',
    category: 'medical',
    examples: 'Aspirin, the heart medication, the painkiller I was prescribed',
  },
  'people.role': {
    name: 'people.role',
    dataPath: 'people.role',
    explanation: `I'm asking who you were dealing with - for example: doctor, nurse, receptionist, billing staff, etc. Just describe them in your own words.`,
    unknownValue: 'unknown',
    category: 'people',
    examples: 'doctor, nurse, receptionist, nurse at front desk, cardiologist',
  },
  'impact': {
    name: 'impact',
    dataPath: 'impact',
    explanation: `I'm asking how this situation affected you. For example: did it cause pain, stress, financial burden, delayed treatment, or other consequences? Share what feels relevant to you.`,
    unknownValue: ['unknown'],
    category: 'impact',
    examples: 'stress, physical pain, missed work, extra cost, emotional distress',
  },
  'contactDetails.wantsContact': {
    name: 'contactDetails.wantsContact',
    dataPath: 'contactDetails.wantsContact',
    explanation: `I'm asking if you'd like our team to follow up with you about this complaint. No worries if you prefer not to be contacted.`,
    unknownValue: false,
    category: 'contact',
    examples: 'yes, no, maybe later',
  },
  'contactDetails.name': {
    name: 'contactDetails.name',
    dataPath: 'contactDetails.name',
    explanation: `What name should we have on file? Just your first and last name is fine.`,
    unknownValue: 'unknown',
    category: 'contact',
    examples: 'John Smith, Mary Johnson',
  },
  'contactDetails.email': {
    name: 'contactDetails.email',
    dataPath: 'contactDetails.email',
    explanation: `What email address can we reach you at? We'll use this to follow up.`,
    unknownValue: 'unknown',
    category: 'contact',
    examples: 'john@email.com, mary.j@example.org',
  },
  'contactDetails.contactNo': {
    name: 'contactDetails.contactNo',
    dataPath: 'contactDetails.contactNo',
    explanation: `What's the best phone number to reach you?`,
    unknownValue: 'unknown',
    category: 'contact',
    examples: '65123456, +6581234567, 6512-3456',
  },
  'contactDetails.isPatient': {
    name: 'contactDetails.isPatient',
    dataPath: 'contactDetails.isPatient',
    explanation: `Are you the patient, or are you submitting this on behalf of someone else?`,
    unknownValue: false,
    category: 'contact',
    examples: 'yes, no, I\'m submitting for my mother',
  },
};

/**
 * Utility function to get a field definition by name
 */
export function getFieldDefinition(fieldName: string): FieldDefinition | undefined {
  return FIELD_DEFINITIONS[fieldName];
}

/**
 * Utility function to set an unknown value for a field in complaint object
 * Handles nested paths like "billing.amount" or "event.date"
 */
export function setUnknownValue(complaint: any, fieldName: string): any {
  const fieldDef = getFieldDefinition(fieldName);
  if (!fieldDef) return complaint;

  const path = fieldDef.dataPath.split('.');
  const updated = { ...complaint };

  if (path.length === 1) {
    // Top-level field like "typeOfCare"
    const key = path[0];
    if (key) {
      updated[key] = fieldDef.unknownValue;
    }
  } else if (path.length === 2) {
    // Nested field like "billing.amount"
    const parentKey = path[0];
    const childKey = path[1];
    if (parentKey && childKey) {
      updated[parentKey] = updated[parentKey] || {};
      updated[parentKey] = { ...updated[parentKey], [childKey]: fieldDef.unknownValue };
    }
  }

  return updated;
}

/**
 * Get all field names for a specific category
 */
export function getFieldsByCategory(category: string): string[] {
  return Object.entries(FIELD_DEFINITIONS)
    .filter(([_, def]) => def.category === category)
    .map(([name]) => name);
}
