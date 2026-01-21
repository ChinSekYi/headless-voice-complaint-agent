export const RequiredFieldsBySubcategory: Record<string, string[]> = {
  WAIT_TIME: ["event.date", "event.location", "typeOfCare"],
  BILLING: ["billing.amount", "billing.insuranceStatus"],
  COMMUNICATION: ["people.role", "description"],
  MEDICATION: ["event.date", "medication.name", "impact"],
};
