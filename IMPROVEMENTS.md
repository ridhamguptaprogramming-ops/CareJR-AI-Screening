# CareJR AI Screening - UI and Feature Improvements (v9)

## Updated Files
- `app.py`
- `requirements.txt`
- `login.html`
- `details.html`
- `dashboard.html`
- `newdata.html`
- `previous.html`
- `script.js`
- `styles.css`

## 1. Login UI Improvements
### Added new field
- **Clinic / Facility Code** (`clinicCode`) in login.
- **Email Login** (`emailLogin`) in login.
- Phone input is optional when email is used.

### Logic updates
- Clinic code is sanitized and stored in localStorage.
- Clinic code is shown later on dashboard profile summary.
- OTP send/verify now supports **phone or email** through Python backend APIs.
- Login identifier type is tracked during OTP flow for safer verify/resend behavior.

## 2. Profile Page Improvements (`details.html`)
### Added new fields
- **Gender** (`gender`)
- **City** (`city`)
- **Pincode** (`pincode`)
- **Address** (`address`)
- **Email** (`email`)
- **Insurance ID** (`insuranceId`)
- **Blood Group** (`bloodGroup`)
- **Emergency Contact** (`emergencyContact`)

### Logic updates
- Added validation for all new required fields.
- Emergency contact is validated as a 10-digit number.
- Emergency contact cannot match login phone number.
- All new profile fields are persisted and restored.

## 3. Dashboard UI Enhancements (`dashboard.html`)
### Expanded profile section
- Added display values for:
  - Gender
  - Blood Group
  - City
  - Emergency Contact
  - Clinic Code

### Added additional counters
- Routine cases
- Urgent cases
- Emergency cases
- Reports Today
- Follow-up Due
- Follow-up Today
- AI Needs Attention
- AI Emergency Flag
- Existing risk counters retained and updated.

### Metric logic
- Dashboard counters now include risk + priority distribution.

## 4. New Data Form Enhancements (`newdata.html`)
### Added many new fields
- Patient Age (auto-filled from DOB)
- Consultation Type
- Chief Complaint
- Known Allergies
- Pain Score
- Oxygen Support
- Vitals:
  - Temperature
  - SpO2
  - Weight
  - Height
  - BMI (auto-calculated)
  - Pulse Rate
  - Respiratory Rate
  - Blood Sugar
  - BP Systolic
  - BP Diastolic
- Provisional Diagnosis
- Care Plan / Advice
- AI Triage Recommendation

### Validation and behavior updates
- Follow-up date must be on/after visit date.
- BP values require both systolic and diastolic together.
- SpO2 range validation (50-100).
- Auto-filled patient name and age from stored profile.

### Report updates
- New fields included in:
  - Draft save/restore
  - Report preview
  - Stored report data
  - Downloaded report text
  - Previous report cards

## 5. Previous Reports Enhancements (`previous.html`)
### Added new controls
- **Priority filter** (`priorityFilter`): All / Routine / Urgent / Emergency
- Additional sort option: **Sort by Priority**
- Added triage filter with routine/urgent/emergency options.

### Added new summary counters
- Emergency priority count (`summaryEmergency`)
- Urgent priority count (`summaryUrgent`)
- Follow-up due count (`summaryFollowUpDue`)
- AI needs-attention count (`summaryNeedsAttention`)
- Existing visible/stored/critical/average counters retained.

### Listing improvements
- Each report card now shows complaint, allergies, vitals, diagnosis, and care plan.

## 6. JavaScript Architecture Updates (`script.js`)
### New storage keys
- `CLINIC_CODE`
- `GENDER`
- `BLOOD_GROUP`
- `CITY`
- `EMERGENCY_CONTACT`

### Added/updated logic areas
- Input normalization for clinic code and emergency contact.
- Age calculation utility from DOB.
- Profile hydration extended for all new fields.
- AI analysis source now includes chief complaint and allergy text.
- AI triage engine added using risk + vitals.
- Filter/search/sort logic expanded for new fields and priority mode.
- Dashboard stats expanded with priority + triage counts.
- Local data now syncs with Python backend APIs.

## 7. Python Backend (`app.py`)
### Added backend APIs
- `POST /api/send-otp`
- `POST /api/verify-otp`
- `POST /api/logout`
- `GET /api/profile`
- `POST /api/profile`
- `GET /api/reports`
- `GET /api/stats`
- `POST /api/reports`
- `DELETE /api/reports`
- `DELETE /api/reports/<id>`

### Storage
- SQLite database (`carejr.db`) with tables for users, OTP, sessions, and reports.
- Users table now stores email, insurance id, and separate contact phone.
- OTP/session identity now supports either a phone account or an email account.
- Session-based authentication with bearer token.

### Run
1. `python3 -m pip install -r requirements.txt`
2. `python3 app.py`
3. Open `http://localhost:5000`

## 8. Styling Improvements (`styles.css`)
### Added layout support for new UI sections
- `.profile-grid`
- `.tri-grid`
- readonly input style improvements

### Responsive updates
- New grid sections collapse correctly on smaller screens.
- Dashboard profile grid and multi-field forms remain usable on mobile.

## Result
The application now has richer clinical data capture, improved profile completeness, expanded dashboard intelligence, and stronger report filtering/sorting with additional controls and counters.
