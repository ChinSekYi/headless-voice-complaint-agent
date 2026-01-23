# SGH Research Findings

## Research Conducted: 21 January 2026

### Sources
- **Primary Source**: https://www.sgh.com.sg/
- **Patient Care**: https://www.sgh.com.sg/patient-care
- **Specialties & Services**: https://www.sgh.com.sg/patient-care/specialties-services

---

## Key Findings from SGH Website

### 1. Hospital Identity
- **Full Name**: Singapore General Hospital
- **Address**: Outram Road, Singapore 169608
- **Part of**: SingHealth Group
- **Co-located with**: 5 National Specialty Centres on SGH Campus
  - National Cancer Centre Singapore (NCCS)
  - National Dental Centre Singapore (NDCS)
  - National Heart Centre Singapore (NHCS)
  - National Neuroscience Institute (NNI)
  - Singapore National Eye Centre (SNEC)

### 2. Clinical Specialties (60+ departments found)

#### Major Medical Specialties:
- Anaesthesiology
- Cardiology (NHCS)
- Cardiothoracic Surgery (NHCS)
- Clinical Pathology
- Colorectal Surgery
- Dermatology
- **Emergency Medicine** ✓ (included in config)
- Endocrinology
- Family Medicine Continuing Care
- Gastroenterology & Hepatology
- General Surgery
- Geriatric Medicine
- Haematology
- Hand & Reconstructive Microsurgery
- Head & Neck Surgery
- Hepato-pancreato-biliary and Transplant Surgery
- Infectious Diseases
- Internal Medicine
- Medical Oncology (NCCS)
- Neonatal & Developmental Medicine
- Neurology
- Neurosurgery
- Nuclear Medicine and Molecular Imaging
- **Obstetrics and Gynaecology** ✓ (included in config)
- Occupational and Environmental Medicine
- Ophthalmology (SNEC)
- Oral & Maxillofacial
- **Orthopaedic Surgery** ✓ (included in config)
- **Otorhinolaryngology - Head & Neck Surgery (ENT)** ✓ (included in config)
- Pain Medicine
- Pathology
- Palliative Medicine (NCCS)
- Plastic, Reconstructive & Aesthetic Surgery
- Psychiatry
- Radiation Oncology (NCCS)
- Radiological Sciences (Diagnostic Radiology)
- Rehabilitation Medicine
- **Renal Medicine** ✓ (included in config)
- **Respiratory & Critical Care Medicine** ✓ (included in config)
- **Rheumatology & Immunology** ✓ (included in config)
- Surgical Intensive Care
- Upper Gastrointestinal & Bariatric Surgery
- **Urology** ✓ (included in config)
- Vascular and Interventional Radiology
- Vascular Surgery

### 3. Specialist Centres/Services (30+ centres found)

SGH provides one-stop, condition-focused services through specialized centres:

- 3D Printing Centre
- **Ambulatory Surgery Centre** ✓ (included in config)
- Ambulatory Endoscopy Centre
- Autoimmunity & Rheumatology Centre (ARC)
- **Burns Centre** ✓ (included in config)
- Centre for Assisted Reproduction (CARE)
- Centre for Digestive and Liver Diseases (CDLD)
- **Diabetes & Metabolism Centre (DMC)** ✓ (included in config)
- Eating Disorders Programme
- **ENT (Ear, Nose & Throat) Centre** ✓ (included in config)
- Gastrointestinal Function Unit
- Haematology Centre
- **Haemodialysis Centre** ✓ (included in config)
- **Health Assessment Centre** ✓ (included in config)
- Hearing and Ear Implants
- Hyperbaric & Diving Medicine Centre
- Immunology Hub
- Inflammatory Bowel Disease Centre
- Kidney Transplant Programme
- Liver Transplant Programme
- Neuroscience Clinic
- **Obesity Centre** ✓ (included in config)
- Obstetrics and Gynaecology (O&G) Centre
- Orthopaedic Sports and Joint Centre
- **Pain Management Centre** ✓ (included in config)
- Pelvic Floor Disorder
- **Peritoneal Dialysis Centre** ✓ (included in config)
- Rehabilitation Centre
- Skin Bank
- **Sleep Centre** ✓ (included in config)
- **Transplant Centre** ✓ (included in config)
- Travel Clinic
- **Urology Centre** ✓ (included in config)

### 4. Allied Health Services

SGH provides comprehensive allied health support:

- Allied Health Corporate Wellness Services
- Acupuncture Services
- Art Therapy & Music Therapy Unit
- **Dietetics** ✓ (included in config)
- Medical Social Services
- **Occupational Therapy** ✓ (included in config)
- **Pharmacy** ✓ (included in config)
- **Physiotherapy** ✓ (included in config)
- **Podiatry** ✓ (included in config)
- Prosthetics & Orthotics Unit
- Psychology
- **Speech Therapy** ✓ (included in config)

### 5. Patient Service Categories (from website)

Based on SGH's patient-facing content, patients commonly interact with:

1. **Clinical Services**:
   - Make/change appointments
   - Collect medicine
   - Specialist clinic visits
   - Emergency care

2. **Billing and Payment Services**:
   - Payment processing
   - Bill requests
   - Financial assistance

3. **Diagnostic Services**:
   - Laboratory tests
   - Imaging (X-ray, MRI, CT scan)
   - Endoscopy

4. **Community Care**:
   - SGH@Home
   - Population Health services
   - Community Health Centre

---

## How This Influenced Configuration Choices

### 1. **Type of Care Categories**
Based on patient journey patterns, we categorized services as:

- **Emergency & Acute**: Emergency Department, Ambulatory Surgery
- **Outpatient**: Specialist Clinics (by specialty)
- **Centres**: Disease-specific centres (Diabetes, ENT, Pain, etc.)
- **Diagnostic**: Lab, Radiology, Endoscopy, Nuclear Medicine
- **Dialysis**: Haemodialysis, Peritoneal (both explicitly mentioned)
- **Allied Health**: Pharmacy, Physio, OT, Dietetics, Speech, Podiatry
- **Inpatient**: Ward, Surgical ICU, Day Surgery

### 2. **Most Common Patient Touchpoints**
Priority given to high-volume services patients mention:
- Emergency Department (major entry point)
- Specialist Clinics (Cardiology, Ortho, ENT most prominent)
- Pharmacy (medication collection)
- Laboratory/Blood Tests (diagnostic)
- Radiology/Imaging (diagnostic)
- Dialysis (recurring visits)

### 3. **SGH-Specific Features**
Unique aspects incorporated:
- Co-location with 5 national centres (NCCS, NHCS, NNI, SNEC, NDCS)
- Advanced centres: Burns, Transplant, Assisted Reproduction
- Specialized services: Hyperbaric Medicine, 3D Printing
- Community care model: SGH@Home

### 4. **Service Names Used**
Matched SGH's exact terminology where possible:
- "Emergency Department" (not "A&E" or "ER")
- "Ambulatory Surgery Centre" (SGH's exact name)
- "Diabetes & Metabolism Centre" (full official name)
- "Haemodialysis" vs "Hemodialysis" (SGH's spelling)
- "Peritoneal Dialysis Centre" (separate facility)

---

## Configuration Implementation

### Fields Removed:
- ❌ `event.location` - Not needed (always SGH)
- ❌ Hospital name questions

### Fields Enhanced:
- ✅ `typeOfCare` - Now uses SGH's 60+ actual services
- ✅ Validation prompts reference SGH departments
- ✅ Examples use SGH terminology

### Validation Benefits:
1. **Accurate Service Matching**: When patient says "dialysis", system knows SGH offers both haemodialysis and peritoneal dialysis
2. **Smart Routing**: Can differentiate between Emergency Dept vs Specialist Clinic vs Centre
3. **Realistic Examples**: Prompts mention actual SGH services patients know

---

## Data Accuracy & Maintenance

### Data Collection Date: 21 January 2026

### Verification Methods:
1. ✅ Direct fetch from official SGH website
2. ✅ Cross-referenced patient services page
3. ✅ Verified specialties listing
4. ✅ Confirmed centre names

### Recommended Updates:
- **Frequency**: Quarterly review (every 3 months)
- **Trigger Events**: 
  - New centres opening
  - Service name changes
  - Department mergers/splits
  - New specialty clinics

### Update Checklist:
- [ ] Re-fetch https://www.sgh.com.sg/patient-care/specialties-services
- [ ] Compare against `src/config/hospitalContext.ts`
- [ ] Update `SGH_TYPES_OF_CARE` array
- [ ] Update prompt examples in `nodes.ts`
- [ ] Update this documentation with changes
- [ ] Test with real patient scenarios

---

## References

### Official SGH Links:
- Main: https://www.sgh.com.sg/
- Patient Services: https://www.sgh.com.sg/patient-care
- Specialties: https://www.sgh.com.sg/patient-care/specialties-services
- Contact: Outram Road, Singapore 169608

### Related SingHealth Institutions:
- SingHealth: https://www.singhealth.com.sg/
- NCCS: https://www.nccs.com.sg/
- NHCS: https://www.nhcs.com.sg/
- NNI: https://www.nni.com.sg/
- SNEC: https://www.snec.com.sg/
- NDCS: https://www.ndcs.com.sg/

---

## Notes for Future Development

### Potential Enhancements:
1. **Department-Specific Routing**: Route certain complaint types to specific departments automatically
2. **Operating Hours**: Add awareness of 24/7 services (Emergency) vs business hours (clinics)
3. **Location Details**: While all complaints are at SGH, could add building/block info if needed
4. **Appointment Types**: Distinguish first visit vs follow-up vs health screening
5. **Urgency Levels**: Emergency vs Urgent vs Routine based on service type

### Integration Opportunities:
- SGH Health Buddy app integration
- Direct feedback form submission
- Appointment system lookup
- Real-time wait times (Emergency Department)

---

**Last Updated**: 21 January 2026  
**Next Review Due**: April 2026  
**Maintained By**: Complaint Handler System Development Team
