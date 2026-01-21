/**
 * Field Value Mapping Configuration
 * Maps user input variations to canonical field values
 * Eliminates hardcoded synonyms throughout the code
 */

export interface FieldValueMapping {
  canonical: string;
  synonyms: string[];
  description?: string;
}

/**
 * Type of Care mappings - user input → canonical value
 * Flexible: supports multiple ways users describe the same service
 */
export const TYPE_OF_CARE_MAPPINGS: FieldValueMapping[] = [
  {
    canonical: 'Emergency Department',
    synonyms: ['emergency', 'er', 'accident and emergency', 'a&e', 'casualty', 'urgent care', 'emergency room'],
    description: 'For urgent/emergency situations',
  },
  {
    canonical: 'Specialist Clinic',
    synonyms: ['specialist', 'clinic', 'cardiology', 'orthopaedic', 'ent', 'endoscopy', 'specialist clinic', 'specialty'],
    description: 'Doctor specializing in specific area',
  },
  {
    canonical: 'Surgery or Day Surgery',
    synonyms: ['surgery', 'operation', 'surgical', 'operating room', 'or', 'day surgery', 'elective surgery', 'procedure'],
    description: 'Surgical procedures',
  },
  {
    canonical: 'Outpatient Appointment',
    synonyms: ['outpatient', 'appointment', 'clinic appointment', 'follow-up', 'follow up', 'consultation', 'office visit'],
    description: 'Non-urgent scheduled visit',
  },
  {
    canonical: 'Inpatient Ward',
    synonyms: ['inpatient', 'ward', 'admission', 'hospitalised', 'hospitalized', 'stay', 'admitted', 'hospital ward'],
    description: 'Overnight hospital stay',
  },
  {
    canonical: 'Laboratory/Blood Test',
    synonyms: ['lab', 'laboratory', 'blood test', 'lab test', 'blood draw', 'pathology', 'testing'],
    description: 'Lab or test services',
  },
  {
    canonical: 'Radiology/Imaging',
    synonyms: ['radiology', 'imaging', 'x-ray', 'mri', 'ct', 'scan', 'ultrasound', 'ct scan', 'mri scan'],
    description: 'Imaging services (X-ray, MRI, etc)',
  },
  {
    canonical: 'Pharmacy',
    synonyms: ['pharmacy', 'pharmacist', 'prescription', 'medication dispensing', 'drug', 'medicine'],
    description: 'Pharmacy services',
  },
  {
    canonical: 'Dialysis',
    synonyms: ['dialysis', 'haemodialysis', 'hemodialysis', 'peritoneal', 'kidney dialysis'],
    description: 'Dialysis treatment',
  },
];

/**
 * Impact mappings - user input → canonical impact description
 * Maps both numeric selection and free-text variations
 */
export const IMPACT_MAPPINGS: FieldValueMapping[] = [
  {
    canonical: 'Physical symptoms worsened or new symptoms',
    synonyms: ['physical', 'symptoms worsened', 'new symptoms', 'pain', 'hurt', 'injury', 'illness', 'sickness', 'got worse', 'worsened'],
    description: 'Physical health impact',
  },
  {
    canonical: 'Emotional stress or anxiety',
    synonyms: ['emotional', 'stress', 'anxiety', 'upset', 'worried', 'distressed', 'angry', 'sad', 'depressed', 'embarrassed', 'humiliated'],
    description: 'Emotional or mental health impact',
  },
  {
    canonical: 'Financial cost or unexpected charges',
    synonyms: ['financial', 'cost', 'charge', 'money', 'expensive', 'bill', 'payment', 'unexpected fee', 'extra cost', 'out of pocket'],
    description: 'Financial impact',
  },
  {
    canonical: 'Treatment delay or missed care',
    synonyms: ['delay', 'delayed', 'missed', 'postponed', 'cancelled', 'canceled', 'didn\'t get', 'didn\'t receive', 'treatment delay', 'care delayed'],
    description: 'Impact on care timeline',
  },
  {
    canonical: 'Daily life affected (work/school/family)',
    synonyms: ['daily life', 'work', 'school', 'family', 'missed work', 'absence', 'inconvenience', 'disrupted', 'affected routine', 'can\'t do activities'],
    description: 'Impact on daily activities',
  },
  {
    canonical: 'Safety risk or harm',
    synonyms: ['safety', 'risk', 'harm', 'danger', 'unsafe', 'dangerous', 'risk to health', 'potential harm', 'endangered'],
    description: 'Safety or harm concerns',
  },
  {
    canonical: 'Other (please describe)',
    synonyms: ['other', 'something else', 'different', 'not listed', 'miscellaneous'],
    description: 'Other impact not listed',
  },
];

/**
 * Insurance Status mappings
 */
export const INSURANCE_STATUS_MAPPINGS: FieldValueMapping[] = [
  {
    canonical: 'Employer insurance',
    synonyms: ['employer', 'work insurance', 'company insurance', 'employee', 'employment'],
    description: 'Insurance through employer',
  },
  {
    canonical: 'Government coverage',
    synonyms: ['government', 'medicare', 'medicaid', 'public', 'government program', 'state insurance'],
    description: 'Government health programs',
  },
  {
    canonical: 'Private insurance',
    synonyms: ['private', 'individual', 'private policy', 'personal insurance'],
    description: 'Individually purchased insurance',
  },
  {
    canonical: 'No insurance',
    synonyms: ['no', 'none', 'uninsured', 'without insurance', 'don\'t have insurance'],
    description: 'No insurance coverage',
  },
  {
    canonical: 'Unknown or unsure',
    synonyms: ['don\'t know', 'not sure', 'unsure', 'not applicable', 'prefer not to say'],
    description: 'User unsure about status',
  },
];

/**
 * Generic mapping function: given text and mappings, find canonical value
 * Handles variations, partial matches, numeric input, etc.
 */
export function mapInputToCanonical(
  input: string | undefined,
  mappings: FieldValueMapping[],
  allowNumeric: boolean = false
): string | null {
  if (!input || !input.trim()) return null;

  const normalized = input.trim().toLowerCase();

  // Try numeric match if allowed (for menu selections)
  if (allowNumeric) {
    const numMatch = normalized.match(/^(\d+)/);
    if (numMatch) {
      const indexStr = numMatch[1];
      if (indexStr) {
        const index = parseInt(indexStr, 10) - 1; // Convert 1-indexed to 0-indexed
        if (index >= 0 && index < mappings.length) {
          return mappings[index]?.canonical || null;
        }
      }
    }
  }

  // Try exact match
  for (const mapping of mappings) {
    if (mapping.synonyms.map(s => s.toLowerCase()).includes(normalized)) {
      return mapping.canonical;
    }
  }

  // Try substring/fuzzy match
  for (const mapping of mappings) {
    if (mapping.synonyms.some(syn => normalized.includes(syn.toLowerCase()) || syn.toLowerCase().includes(normalized))) {
      return mapping.canonical;
    }
  }

  return null;
}

/**
 * Get friendly list of options for a field (for displaying to user)
 */
export function getOptionsList(mappings: FieldValueMapping[], numbered: boolean = true): string {
  return mappings.map((m, idx) => {
    const prefix = numbered ? `${idx + 1}. ` : '• ';
    return `${prefix}${m.canonical}`;
  }).join('\n');
}

/**
 * Utility: Get all mappings for a field type
 */
export const FIELD_MAPPINGS = {
  typeOfCare: TYPE_OF_CARE_MAPPINGS,
  impact: IMPACT_MAPPINGS,
  insuranceStatus: INSURANCE_STATUS_MAPPINGS,
};

export function getFieldMappings(fieldName: string): FieldValueMapping[] | undefined {
  const key = fieldName.replace('billing.', '').replace('event.', '');
  return (FIELD_MAPPINGS as any)[key] || undefined;
}
