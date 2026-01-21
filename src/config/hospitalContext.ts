/**
 * Singapore General Hospital (SGH) Configuration
 * This file contains SGH-specific context for the complaint handling system
 */

export const HOSPITAL_CONFIG = {
  name: "Singapore General Hospital",
  shortName: "SGH",
  address: "Outram Road, Singapore 169608",
  defaultLocation: "Singapore General Hospital (SGH)",
};

/**
 * Types of Care/Services available at SGH
 * Based on SGH's actual clinical services and departments
 */
export const SGH_TYPES_OF_CARE = [
  // Emergency & Acute Care
  "Emergency Department",
  "Ambulatory Surgery Centre",
  
  // Specialist Clinics (Major Specialties)
  "Cardiology Clinic",
  "Orthopaedic Clinic",
  "ENT (Ear, Nose & Throat) Clinic",
  "Obstetrics & Gynaecology Clinic",
  "Gastroenterology Clinic",
  "Dermatology Clinic",
  "Endocrinology Clinic",
  "Neurology Clinic",
  "Urology Clinic",
  "Breast Surgery Clinic",
  "Colorectal Surgery Clinic",
  "General Surgery Clinic",
  "Respiratory Medicine Clinic",
  "Rheumatology & Immunology Clinic",
  "Renal Medicine Clinic",
  
  // Specialist Centres
  "Diabetes & Metabolism Centre",
  "ENT Centre",
  "Health Assessment Centre",
  "Pain Management Centre",
  "Obesity Centre",
  "Sleep Centre",
  "Burns Centre",
  "Transplant Centre",
  
  // Diagnostic & Treatment Services
  "Laboratory/Blood Test",
  "Radiology/Imaging (X-ray, MRI, CT scan)",
  "Endoscopy",
  "Nuclear Medicine",
  
  // Dialysis Services
  "Haemodialysis",
  "Peritoneal Dialysis",
  
  // Allied Health Services
  "Pharmacy",
  "Physiotherapy",
  "Occupational Therapy",
  "Dietetics",
  "Speech Therapy",
  "Podiatry",
  
  // Inpatient Services
  "Inpatient Ward",
  "Surgical Intensive Care",
  "Day Surgery",
  
  // Other Services
  "Ambulatory Endoscopy Centre",
  "Rehabilitation Centre",
  "Health Screening",
];

/**
 * Helper function to validate if a type of care is valid for SGH
 */
export function isValidTypeOfCare(typeOfCare: string): boolean {
  const normalized = typeOfCare.toLowerCase().trim();
  return SGH_TYPES_OF_CARE.some(service => 
    service.toLowerCase().includes(normalized) || 
    normalized.includes(service.toLowerCase())
  );
}

/**
 * Get formatted list of type of care examples for prompts
 */
export function getTypeOfCareExamples(): string {
  const examples = [
    "Emergency Department",
    "Specialist Clinic (e.g., Cardiology, Orthopaedic, ENT)",
    "Outpatient Appointment",
    "Surgery or Day Surgery",
    "Endoscopy",
    "Dialysis (Haemodialysis or Peritoneal)",
    "Laboratory/Blood Test",
    "Radiology/Imaging (X-ray, MRI, CT scan)",
    "Pharmacy",
    "Inpatient Ward",
  ];
  return examples.join(", ");
}
