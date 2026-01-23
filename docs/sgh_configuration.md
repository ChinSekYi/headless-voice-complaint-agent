# SGH Configuration Summary

## Hospital Context

The chatbot is now configured specifically for **Singapore General Hospital (SGH)**.

### Key Changes Made:

1. **Default Location**: All complaints automatically set to "Singapore General Hospital (SGH)"
   - No need to ask patients for location
   - `event.location` field is always set to SGH

2. **Types of Care at SGH**:
   Based on SGH's actual services, the chatbot recognizes these categories:

   **Emergency & Acute Care:**
   - Emergency Department
   - Ambulatory Surgery Centre

   **Specialist Clinics:**
   - Cardiology, Orthopaedic, ENT, Obstetrics & Gynaecology
   - Gastroenterology, Dermatology, Endocrinology
   - Neurology, Urology, Breast Surgery, Colorectal Surgery
   - General Surgery, Respiratory Medicine
   - Rheumatology & Immunology, Renal Medicine

   **Specialist Centres:**
   - Diabetes & Metabolism Centre
   - ENT Centre, Pain Management Centre
   - Obesity Centre, Sleep Centre, Burns Centre, Transplant Centre
   - Health Assessment Centre

   **Diagnostic & Treatment:**
   - Laboratory/Blood Tests
   - Radiology/Imaging (X-ray, MRI, CT scan)
   - Endoscopy, Nuclear Medicine

   **Dialysis Services:**
   - Haemodialysis
   - Peritoneal Dialysis

   **Allied Health:**
   - Pharmacy, Physiotherapy, Occupational Therapy
   - Dietetics, Speech Therapy, Podiatry

   **Inpatient:**
   - Inpatient Ward
   - Surgical Intensive Care
   - Day Surgery

3. **Updated Prompts**:
   - Initial greeting mentions SGH specifically
   - Type of care examples use SGH's actual services
   - Removed all references to asking for hospital location
   - Clarification responses reference SGH departments

4. **Configuration File**: 
   Created `/src/config/hospitalContext.ts` with:
   - Hospital name and address
   - Complete list of SGH services
   - Helper functions for validation
   - Type of care examples generator

## Usage

The chatbot now automatically:
- Sets location to "Singapore General Hospital (SGH)"
- Uses SGH-specific service names when asking for type of care
- Provides examples relevant to SGH's actual departments
- Never asks patients "which hospital?" or "what location?"

## Example Conversation

```
Patient: "hi"
Agent: "Hello! I'm here to help you with any concerns you have about your 
        experience at Singapore General Hospital (SGH)..."

Patient: "I waited 4 hours"
Agent: "I understand this was frustrating. What type of service was this at SGH? 
        For example: Emergency Department, Specialist Clinic, Laboratory, etc."

Patient: "emergency"
Agent: [Proceeds with follow-up questions, location already set to SGH]
```

## Technical Details

### Modified Files:
- `src/agent/nodes.ts`: Updated all prompts and logic
- `src/config/hospitalContext.ts`: New configuration file
- `docs/sgh_configuration.md`: This documentation

### Fields Always Collected:
- ✅ domain, subcategory, description
- ✅ event.location (always "Singapore General Hospital (SGH)")
- ⚠️  event.date (asked if relevant)
- ⚠️  typeOfCare (asked if relevant, uses SGH services)
- ⚠️  billing.amount (asked only for billing complaints if needed)
- ⚠️  medication.name (asked for medication errors)
- ⚠️  people.role (asked for interpersonal complaints)
- ⚠️  impact (asked when appropriate)

### Fields NEVER Asked:
- ❌ event.location (hardcoded to SGH)
- ❌ Hospital name (always SGH)
