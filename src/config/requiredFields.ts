export const RequiredFieldsBySubcategory: Record<string, string[]> = {
  // MANAGEMENT domain
  WAIT_TIME: ["event.date", "event.location", "typeOfCare"],
  BILLING: ["billing.amount", "billing.insuranceStatus"],
  APPOINTMENT: ["event.date", "typeOfCare"],
  FACILITIES: ["event.location", "description"],
  ADMIN_PROCESS: ["description"],
  
  // RELATIONSHIP domain
  COMMUNICATION: ["people.role", "description"],
  ATTITUDE: ["people.role", "description"],
  RESPECT: ["people.role", "description"],
  PROFESSIONALISM: ["people.role", "description"],
  
  // CLINICAL domain
  MEDICATION: ["event.date", "medication.name", "impact"],
  DIAGNOSIS: ["event.date", "typeOfCare", "impact"],
  PROCEDURE: ["event.date", "typeOfCare", "description"],
  SAFETY: ["event.date", "event.location", "description", "impact"],
  FOLLOW_UP: ["event.date", "typeOfCare", "description"],
};
