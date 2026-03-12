const STORAGE_KEYS = {
  PHONE: "phone",
  GENERATED_OTP: "generatedOtp",
  OTP_SENT_AT: "otpSentAt",
  CLINIC_CODE: "clinicCode",
  NAME: "name",
  DOB: "dob",
  GENDER: "gender",
  BLOOD_GROUP: "bloodGroup",
  STATE: "state",
  CITY: "city",
  PINCODE: "pincode",
  ADDRESS: "address",
  EMERGENCY_CONTACT: "emergencyContact",
  CURRENT_REPORT: "currentReport",
  REPORTS: "reports",
  DRAFT_REPORT: "draftReport"
};

let generatedOtp = null;
let recognition = null;
let fullTranscript = "";
let cameraStream = null;
let breathInterval = null;
let pulseInterval = null;
let monitoringActive = false;
let otpCooldownInterval = null;

function byId(id) {
  return document.getElementById(id);
}

function safeText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseJSON(value, fallback) {
  try {
    if (!value) {
      return fallback;
    }
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function getStoredJSON(key, fallback) {
  return parseJSON(localStorage.getItem(key), fallback);
}

function setStoredJSON(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function showMessage(elementId, message, type = "success") {
  const el = byId(elementId);
  if (!el) {
    if (message) {
      alert(message);
    }
    return;
  }

  el.textContent = message || "";
  el.className = "inline-message";
  if (message) {
    el.classList.add(type === "error" ? "error-message" : "success-message");
  }
}

function getReportField(report, keys, fallback = "N/A") {
  for (let i = 0; i < keys.length; i += 1) {
    const value = report[keys[i]];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return fallback;
}

function normalizePhoneInput(event) {
  const input = event.target;
  input.value = input.value.replace(/\D/g, "").slice(0, 10);
}

function normalizeTextInput(event) {
  const input = event.target;
  input.value = input.value.replace(/[^\w\s-]/g, "").toUpperCase();
}

function calculateAgeFromDOB(dobValue) {
  if (!dobValue) {
    return "";
  }

  const dobDate = new Date(dobValue);
  if (Number.isNaN(dobDate.getTime())) {
    return "";
  }

  const today = new Date();
  let age = today.getFullYear() - dobDate.getFullYear();
  const monthDiff = today.getMonth() - dobDate.getMonth();
  const dayDiff = today.getDate() - dobDate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age >= 0 ? String(age) : "";
}

function calculateBMI(weightKg, heightCm) {
  const weight = Number(weightKg);
  const height = Number(heightCm);

  if (!weight || !height || weight <= 0 || height <= 0) {
    return "";
  }

  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  if (!Number.isFinite(bmi)) {
    return "";
  }

  return bmi.toFixed(1);
}

function updateBMIField() {
  const weightInput = byId("weight");
  const heightInput = byId("height");
  const bmiInput = byId("bmi");

  if (!weightInput || !heightInput || !bmiInput) {
    return;
  }

  bmiInput.value = calculateBMI(weightInput.value, heightInput.value);
}

function recommendTriageLevel(data) {
  const risk = Number(data.risk) || 0;
  const spo2 = Number(data.spo2) || 0;
  const pulseRate = Number(data.pulseRate) || 0;
  const respRate = Number(data.respRate) || 0;
  const bpSystolic = Number(data.bpSystolic) || 0;
  const temperature = Number(data.temperature) || 0;
  const bloodSugar = Number(data.bloodSugar) || 0;

  if (
    risk >= 80 ||
    (spo2 > 0 && spo2 < 92) ||
    bpSystolic >= 180 ||
    (pulseRate > 0 && (pulseRate >= 130 || pulseRate < 40)) ||
    (respRate > 0 && (respRate >= 30 || respRate < 8))
  ) {
    return "Emergency";
  }

  if (
    risk >= 60 ||
    (temperature > 0 && temperature >= 101) ||
    (spo2 > 0 && spo2 < 95) ||
    bpSystolic >= 160 ||
    (bloodSugar > 0 && (bloodSugar >= 250 || bloodSugar < 70)) ||
    (pulseRate > 0 && pulseRate > 110) ||
    (respRate > 0 && respRate > 24)
  ) {
    return "Urgent";
  }

  return "Routine";
}

function updateTriageRecommendationField() {
  const triageInput = byId("triageRecommendation");
  if (!triageInput) {
    return;
  }

  const risk = byId("risk");
  const temperature = byId("temperature");
  const spo2 = byId("spo2");
  const pulseRate = byId("pulseRate");
  const respRate = byId("respRate");
  const bpSystolic = byId("bpSystolic");
  const bloodSugar = byId("bloodSugar");

  triageInput.value = recommendTriageLevel({
    risk: risk ? risk.innerText : 0,
    temperature: temperature ? temperature.value : "",
    spo2: spo2 ? spo2.value : "",
    pulseRate: pulseRate ? pulseRate.value : "",
    respRate: respRate ? respRate.value : "",
    bpSystolic: bpSystolic ? bpSystolic.value : "",
    bloodSugar: bloodSugar ? bloodSugar.value : ""
  });
}

function applyDateLimits() {
  const today = new Date().toISOString().split("T")[0];

  const dob = byId("dob");
  if (dob) {
    dob.max = today;
  }

  const visitDate = byId("visitDate");
  if (visitDate) {
    visitDate.max = today;
    if (!visitDate.value) {
      visitDate.value = today;
    }
  }

  const followUpDate = byId("followUpDate");
  if (followUpDate) {
    followUpDate.min = visitDate && visitDate.value ? visitDate.value : today;
  }
}

function setupFormHandlers() {
  const loginForm = byId("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const otpBox = byId("otpBox");
      const otpVisible = otpBox && !otpBox.hidden;
      if (otpVisible) {
        verify();
      } else {
        sendOTP();
      }
    });
  }

  const detailsForm = byId("detailsForm");
  if (detailsForm) {
    detailsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      submitData();
    });
  }

  const phoneInput = byId("phone");
  if (phoneInput && phoneInput.tagName === "INPUT") {
    phoneInput.addEventListener("input", normalizePhoneInput);
  }

  const emergencyContact = byId("emergencyContact");
  if (emergencyContact && emergencyContact.tagName === "INPUT") {
    emergencyContact.addEventListener("input", normalizePhoneInput);
  }

  const pincodeInput = byId("pincode");
  if (pincodeInput && pincodeInput.tagName === "INPUT") {
    pincodeInput.addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
    });
  }

  const otpInput = byId("otp");
  if (otpInput) {
    otpInput.addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4);
    });
  }

  const clinicCode = byId("clinicCode");
  if (clinicCode && clinicCode.tagName === "INPUT") {
    clinicCode.addEventListener("input", normalizeTextInput);
  }

  const visitDate = byId("visitDate");
  const followUpDate = byId("followUpDate");
  if (visitDate && followUpDate) {
    visitDate.addEventListener("change", () => {
      const minDate = visitDate.value || new Date().toISOString().split("T")[0];
      followUpDate.min = minDate;
      if (followUpDate.value && followUpDate.value < minDate) {
        followUpDate.value = minDate;
      }
    });
  }

  const dobInput = byId("dob");
  if (dobInput && dobInput.tagName === "INPUT") {
    dobInput.addEventListener("change", () => {
      const patientAge = byId("patientAge");
      if (patientAge) {
        patientAge.value = calculateAgeFromDOB(dobInput.value);
      }
    });
  }

  const weightInput = byId("weight");
  const heightInput = byId("height");
  if (weightInput && heightInput) {
    weightInput.addEventListener("input", updateBMIField);
    heightInput.addEventListener("input", updateBMIField);
  }

  [
    "temperature",
    "spo2",
    "pulseRate",
    "respRate",
    "bpSystolic",
    "bpDiastolic",
    "bloodSugar"
  ].forEach((id) => {
    const input = byId(id);
    if (input) {
      input.addEventListener("input", updateTriageRecommendationField);
    }
  });
}

function hydrateSharedData() {
  const clinicInput = byId("clinicCode");
  if (clinicInput && clinicInput.tagName === "INPUT" && !clinicInput.value) {
    clinicInput.value = localStorage.getItem(STORAGE_KEYS.CLINIC_CODE) || "";
  }

  const phoneInput = byId("phone");
  if (phoneInput && phoneInput.tagName === "INPUT" && !phoneInput.value) {
    phoneInput.value = localStorage.getItem(STORAGE_KEYS.PHONE) || "";
  }

  const nameInput = byId("name");
  if (nameInput && nameInput.tagName === "INPUT" && !nameInput.value) {
    nameInput.value = localStorage.getItem(STORAGE_KEYS.NAME) || "";
  }

  const dobInput = byId("dob");
  if (dobInput && dobInput.tagName === "INPUT" && !dobInput.value) {
    dobInput.value = localStorage.getItem(STORAGE_KEYS.DOB) || "";
  }

  const genderInput = byId("gender");
  if (genderInput && genderInput.tagName === "SELECT" && !genderInput.value) {
    genderInput.value = localStorage.getItem(STORAGE_KEYS.GENDER) || "";
  }

  const stateInput = byId("state");
  if (stateInput && stateInput.tagName === "SELECT" && !stateInput.value) {
    stateInput.value = localStorage.getItem(STORAGE_KEYS.STATE) || "";
  }

  const cityInput = byId("city");
  if (cityInput && cityInput.tagName === "INPUT" && !cityInput.value) {
    cityInput.value = localStorage.getItem(STORAGE_KEYS.CITY) || "";
  }

  const pincodeInput = byId("pincode");
  if (pincodeInput && pincodeInput.tagName === "INPUT" && !pincodeInput.value) {
    pincodeInput.value = localStorage.getItem(STORAGE_KEYS.PINCODE) || "";
  }

  const addressInput = byId("address");
  if (addressInput && addressInput.tagName === "INPUT" && !addressInput.value) {
    addressInput.value = localStorage.getItem(STORAGE_KEYS.ADDRESS) || "";
  }

  const bloodGroupInput = byId("bloodGroup");
  if (bloodGroupInput && bloodGroupInput.tagName === "SELECT" && !bloodGroupInput.value) {
    bloodGroupInput.value = localStorage.getItem(STORAGE_KEYS.BLOOD_GROUP) || "";
  }

  const emergencyInput = byId("emergencyContact");
  if (emergencyInput && emergencyInput.tagName === "INPUT" && !emergencyInput.value) {
    emergencyInput.value = localStorage.getItem(STORAGE_KEYS.EMERGENCY_CONTACT) || "";
  }

  const username = byId("username");
  if (username) {
    username.innerText = localStorage.getItem(STORAGE_KEYS.NAME) || "User";
  }

  const dob = byId("dob");
  if (dob && dob.tagName !== "INPUT") {
    dob.innerText = localStorage.getItem(STORAGE_KEYS.DOB) || "-";
  }

  const state = byId("state");
  if (state && state.tagName !== "SELECT") {
    state.innerText = localStorage.getItem(STORAGE_KEYS.STATE) || "-";
  }

  const gender = byId("gender");
  if (gender && gender.tagName !== "SELECT") {
    gender.innerText = localStorage.getItem(STORAGE_KEYS.GENDER) || "-";
  }

  const bloodGroup = byId("bloodGroup");
  if (bloodGroup && bloodGroup.tagName !== "SELECT") {
    bloodGroup.innerText = localStorage.getItem(STORAGE_KEYS.BLOOD_GROUP) || "-";
  }

  const city = byId("city");
  if (city && city.tagName !== "INPUT") {
    city.innerText = localStorage.getItem(STORAGE_KEYS.CITY) || "-";
  }

  const pincode = byId("pincode");
  if (pincode && pincode.tagName !== "INPUT") {
    pincode.innerText = localStorage.getItem(STORAGE_KEYS.PINCODE) || "-";
  }

  const address = byId("address");
  if (address && address.tagName !== "INPUT") {
    address.innerText = localStorage.getItem(STORAGE_KEYS.ADDRESS) || "-";
  }

  const emergency = byId("emergencyContact");
  if (emergency && emergency.tagName !== "INPUT") {
    emergency.innerText = localStorage.getItem(STORAGE_KEYS.EMERGENCY_CONTACT) || "-";
  }

  const clinic = byId("clinicCode");
  if (clinic && clinic.tagName !== "INPUT") {
    clinic.innerText = localStorage.getItem(STORAGE_KEYS.CLINIC_CODE) || "-";
  }

  const phone = byId("phone");
  if (phone && phone.tagName !== "INPUT") {
    phone.innerText = localStorage.getItem(STORAGE_KEYS.PHONE) || "-";
  }

  const patientName = byId("patientName");
  if (patientName && patientName.tagName === "INPUT" && !patientName.value) {
    patientName.value = localStorage.getItem(STORAGE_KEYS.NAME) || "";
  }

  const patientAge = byId("patientAge");
  if (patientAge && patientAge.tagName === "INPUT" && !patientAge.value) {
    patientAge.value = calculateAgeFromDOB(localStorage.getItem(STORAGE_KEYS.DOB) || "");
  }

  updateTriageRecommendationField();
}

function restoreDraftIfAvailable() {
  const patientName = byId("patientName");
  if (!patientName) {
    return;
  }

  const draft = getStoredJSON(STORAGE_KEYS.DRAFT_REPORT, null);
  if (!draft) {
    return;
  }

  const fields = [
    ["patientName", "patientName"],
    ["patientAge", "patientAge"],
    ["visitDate", "visitDate"],
    ["followUpDate", "followUpDate"],
    ["priority", "priority"],
    ["consultationType", "consultationType"],
    ["chiefComplaint", "chiefComplaint"],
    ["conversation", "conversation"],
    ["knownAllergies", "knownAllergies"],
    ["temperature", "temperature"],
    ["spo2", "spo2"],
    ["weight", "weight"],
    ["height", "height"],
    ["bmi", "bmi"],
    ["pulseRate", "pulseRate"],
    ["respRate", "respRate"],
    ["bloodSugar", "bloodSugar"],
    ["bpSystolic", "bpSystolic"],
    ["bpDiastolic", "bpDiastolic"],
    ["symptoms", "symptoms"],
    ["diagnosis", "diagnosis"],
    ["medicines", "medicines"],
    ["tests", "tests"],
    ["carePlan", "carePlan"],
    ["clinicalNotes", "clinicalNotes"],
    ["doctor", "doctor"],
    ["triageRecommendation", "triageRecommendation"]
  ];

  fields.forEach(([id, key]) => {
    const input = byId(id);
    if (input && !input.value && draft[key]) {
      input.value = draft[key];
    }
  });

  const visitDate = byId("visitDate");
  const followUpDate = byId("followUpDate");
  if (visitDate && followUpDate && visitDate.value) {
    followUpDate.min = visitDate.value;
  }

  if (draft.risk !== undefined && draft.risk !== null) {
    const risk = byId("risk");
    const riskLevel = byId("riskLevel");
    if (risk) {
      risk.innerText = String(draft.risk);
    }
    if (riskLevel) {
      riskLevel.innerText = getRiskLevel(Number(draft.risk));
    }
  }

  updateBMIField();
  updateTriageRecommendationField();

  showMessage("newDataMessage", "Draft restored successfully.");
}

function isLoginPage() {
  return document.body && document.body.classList.contains("login-page");
}

function ensureSession() {
  if (isLoginPage()) {
    return;
  }

  const phone = localStorage.getItem(STORAGE_KEYS.PHONE);
  if (!phone) {
    window.location.href = "login.html";
  }
}

function initPage() {
  ensureSession();
  applyDateLimits();
  setupFormHandlers();
  setupSidebarBehavior();
  hydrateSharedData();
  restoreDraftIfAvailable();

  if (byId("reportContainer")) {
    loadReports();
  }

  if (byId("statTotal")) {
    updateDashboardStats();
  }
}

document.addEventListener("DOMContentLoaded", initPage);

function setupSidebarBehavior() {
  const side = byId("side");
  const menuButton = document.querySelector(".menu");

  if (!side || !menuButton) {
    return;
  }

  side.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      side.classList.remove("open");
    });
  });

  document.addEventListener("click", (event) => {
    if (!side.classList.contains("open")) {
      return;
    }

    if (side.contains(event.target) || menuButton.contains(event.target)) {
      return;
    }

    side.classList.remove("open");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      side.classList.remove("open");
    }
  });
}

function startOtpCooldown(totalSeconds = 20) {
  const resendBtn = byId("resendBtn");
  if (!resendBtn) {
    return;
  }

  clearInterval(otpCooldownInterval);

  let seconds = totalSeconds;
  resendBtn.disabled = true;
  resendBtn.textContent = `Resend OTP (${seconds}s)`;

  otpCooldownInterval = setInterval(() => {
    seconds -= 1;
    if (seconds <= 0) {
      clearInterval(otpCooldownInterval);
      otpCooldownInterval = null;
      resendBtn.disabled = false;
      resendBtn.textContent = "Resend OTP";
      return;
    }
    resendBtn.textContent = `Resend OTP (${seconds}s)`;
  }, 1000);
}

function sendOTP() {
  const phoneInput = byId("phone");
  if (!phoneInput) {
    return;
  }

  const clinicCodeInput = byId("clinicCode");

  const phone = phoneInput.value.trim();
  if (!/^\d{10}$/.test(phone)) {
    showMessage("authMessage", "Enter a valid 10-digit phone number.", "error");
    phoneInput.focus();
    return;
  }

  generatedOtp = String(Math.floor(1000 + Math.random() * 9000));
  localStorage.setItem(STORAGE_KEYS.GENERATED_OTP, generatedOtp);
  localStorage.setItem(STORAGE_KEYS.PHONE, phone);
  localStorage.setItem(STORAGE_KEYS.OTP_SENT_AT, String(Date.now()));
  if (clinicCodeInput) {
    localStorage.setItem(STORAGE_KEYS.CLINIC_CODE, clinicCodeInput.value.trim().toUpperCase());
  }

  const otpBox = byId("otpBox");
  if (otpBox) {
    otpBox.hidden = false;
  }

  const otpInput = byId("otp");
  if (otpInput) {
    otpInput.focus();
  }

  startOtpCooldown(20);
  showMessage("authMessage", `OTP sent successfully. Demo OTP: ${generatedOtp}`);
}

function resendOTP() {
  const resendBtn = byId("resendBtn");
  if (resendBtn && resendBtn.disabled) {
    return;
  }

  const sentAt = Number(localStorage.getItem(STORAGE_KEYS.OTP_SENT_AT) || "0");
  const waitMs = 20_000;
  const remaining = waitMs - (Date.now() - sentAt);

  if (remaining > 0) {
    const seconds = Math.ceil(remaining / 1000);
    showMessage("authMessage", `Please wait ${seconds}s before requesting a new OTP.`, "error");
    startOtpCooldown(seconds);
    return;
  }

  sendOTP();
}

function verify() {
  const otpInput = byId("otp");
  if (!otpInput) {
    return;
  }

  const entered = otpInput.value.trim();
  const expectedOtp = generatedOtp || localStorage.getItem(STORAGE_KEYS.GENERATED_OTP);

  if (!/^\d{4}$/.test(entered)) {
    showMessage("authMessage", "OTP must be a 4-digit number.", "error");
    otpInput.focus();
    return;
  }

  if (!expectedOtp) {
    showMessage("authMessage", "No active OTP found. Please request OTP again.", "error");
    return;
  }

  if (entered === expectedOtp) {
    localStorage.removeItem(STORAGE_KEYS.GENERATED_OTP);
    localStorage.removeItem(STORAGE_KEYS.OTP_SENT_AT);
    window.location.href = "details.html";
  } else {
    showMessage("authMessage", "Invalid OTP. Please try again.", "error");
  }
}

function submitData() {
  const name = byId("name");
  const dob = byId("dob");
  const gender = byId("gender");
  const state = byId("state");
  const city = byId("city");
  const pincode = byId("pincode");
  const address = byId("address");
  const bloodGroup = byId("bloodGroup");
  const emergencyContact = byId("emergencyContact");
  const phone = byId("phone");

  if (!name || !dob || !gender || !state || !city || !pincode || !address || !bloodGroup || !emergencyContact) {
    return;
  }

  const fullName = name.value.trim();
  const dobValue = dob.value;
  const genderValue = gender.value;
  const stateValue = state.value;
  const cityValue = city.value.trim();
  const pincodeValue = pincode.value.trim();
  const addressValue = address.value.trim();
  const bloodGroupValue = bloodGroup.value;
  const emergencyValue = emergencyContact.value.trim();
  const phoneValue = phone ? phone.value.trim() : "";

  if (!/^[a-zA-Z\s.'-]{2,60}$/.test(fullName)) {
    showMessage("profileMessage", "Enter a valid full name.", "error");
    name.focus();
    return;
  }

  if (!dobValue) {
    showMessage("profileMessage", "Date of birth is required.", "error");
    dob.focus();
    return;
  }

  const dobDate = new Date(dobValue);
  const now = new Date();
  if (dobDate > now) {
    showMessage("profileMessage", "Date of birth cannot be in the future.", "error");
    dob.focus();
    return;
  }

  if (!stateValue) {
    showMessage("profileMessage", "Please select a state.", "error");
    state.focus();
    return;
  }

  if (!genderValue) {
    showMessage("profileMessage", "Please select gender.", "error");
    gender.focus();
    return;
  }

  if (cityValue.length < 2) {
    showMessage("profileMessage", "Please enter a valid city.", "error");
    city.focus();
    return;
  }

  if (!/^\d{6}$/.test(pincodeValue)) {
    showMessage("profileMessage", "Pincode must be a valid 6-digit number.", "error");
    pincode.focus();
    return;
  }

  if (addressValue.length < 5) {
    showMessage("profileMessage", "Please enter a valid address.", "error");
    address.focus();
    return;
  }

  if (!/^\d{10}$/.test(emergencyValue)) {
    showMessage("profileMessage", "Emergency contact must be a valid 10-digit number.", "error");
    emergencyContact.focus();
    return;
  }

  if (phoneValue && emergencyValue === phoneValue) {
    showMessage("profileMessage", "Emergency contact should be different from login phone.", "error");
    emergencyContact.focus();
    return;
  }

  localStorage.setItem(STORAGE_KEYS.NAME, fullName);
  localStorage.setItem(STORAGE_KEYS.DOB, dobValue);
  localStorage.setItem(STORAGE_KEYS.GENDER, genderValue);
  localStorage.setItem(STORAGE_KEYS.BLOOD_GROUP, bloodGroupValue);
  localStorage.setItem(STORAGE_KEYS.STATE, stateValue);
  localStorage.setItem(STORAGE_KEYS.CITY, cityValue);
  localStorage.setItem(STORAGE_KEYS.PINCODE, pincodeValue);
  localStorage.setItem(STORAGE_KEYS.ADDRESS, addressValue);
  localStorage.setItem(STORAGE_KEYS.EMERGENCY_CONTACT, emergencyValue);

  window.location.href = "dashboard.html";
}

function toggle() {
  const side = byId("side");
  if (!side) {
    return;
  }

  side.classList.toggle("open");
}

function logout() {
  localStorage.removeItem(STORAGE_KEYS.PHONE);
  localStorage.removeItem(STORAGE_KEYS.GENERATED_OTP);
  localStorage.removeItem(STORAGE_KEYS.OTP_SENT_AT);
  localStorage.removeItem(STORAGE_KEYS.CLINIC_CODE);
  localStorage.removeItem(STORAGE_KEYS.NAME);
  localStorage.removeItem(STORAGE_KEYS.DOB);
  localStorage.removeItem(STORAGE_KEYS.GENDER);
  localStorage.removeItem(STORAGE_KEYS.BLOOD_GROUP);
  localStorage.removeItem(STORAGE_KEYS.STATE);
  localStorage.removeItem(STORAGE_KEYS.CITY);
  localStorage.removeItem(STORAGE_KEYS.PINCODE);
  localStorage.removeItem(STORAGE_KEYS.ADDRESS);
  localStorage.removeItem(STORAGE_KEYS.EMERGENCY_CONTACT);
  localStorage.removeItem(STORAGE_KEYS.CURRENT_REPORT);
  localStorage.removeItem(STORAGE_KEYS.DRAFT_REPORT);
  window.location.href = "login.html";
}

function startConversation() {
  if (monitoringActive) {
    showMessage("newDataMessage", "Conversation capture is already running.", "error");
    return;
  }

  monitoringActive = true;
  startCamera();
  startVoice();
  startBreathing();
  startPulse();
  showMessage("newDataMessage", "Conversation capture started.");
}

function stopConversation() {
  monitoringActive = false;

  if (recognition) {
    recognition.onend = null;
    recognition.stop();
    recognition = null;
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  clearInterval(breathInterval);
  clearInterval(pulseInterval);
  breathInterval = null;
  pulseInterval = null;

  const breathing = byId("breathing");
  const heart = byId("heart");

  if (breathing) {
    breathing.innerText = "Idle";
  }

  if (heart) {
    heart.innerText = "Idle";
  }

  showMessage("newDataMessage", "Conversation capture stopped.");
}

async function startCamera() {
  const video = byId("video");
  if (!video || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = cameraStream;
  } catch (error) {
    showMessage("newDataMessage", "Camera access is blocked. Monitoring will continue without video.", "error");
  }
}

function startVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const conversation = byId("conversation");

  if (!SpeechRecognition || !conversation) {
    showMessage("newDataMessage", "Speech recognition is not available in this browser.", "error");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-IN";

  fullTranscript = conversation.value || "";

  recognition.onresult = (event) => {
    let newText = "";

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      if (event.results[i].isFinal) {
        newText += `${event.results[i][0].transcript} `;
      }
    }

    if (newText) {
      fullTranscript += newText;
      conversation.value = fullTranscript.trim();
      runAI();
    }
  };

  recognition.onerror = () => {
    showMessage("newDataMessage", "Speech recognition encountered an issue.", "error");
  };

  recognition.onend = () => {
    if (monitoringActive && recognition) {
      try {
        recognition.start();
      } catch (error) {
        // Ignore repeated start race while stopping.
      }
    }
  };

  try {
    recognition.start();
  } catch (error) {
    showMessage("newDataMessage", "Unable to start speech recognition.", "error");
  }
}

function classifyBreathing(rate) {
  if (rate < 10) {
    return "Low";
  }
  if (rate <= 20) {
    return "Normal";
  }
  return "High";
}

function classifyPulse(rate) {
  if (rate < 60) {
    return "Low";
  }
  if (rate <= 100) {
    return "Normal";
  }
  return "High";
}

function startBreathing() {
  const breathing = byId("breathing");
  if (!breathing) {
    return;
  }

  clearInterval(breathInterval);
  breathInterval = setInterval(() => {
    const bpm = 10 + Math.floor(Math.random() * 14);
    breathing.innerText = `${bpm} BPM (${classifyBreathing(bpm)})`;
  }, 3000);
}

function startPulse() {
  const heart = byId("heart");
  if (!heart) {
    return;
  }

  clearInterval(pulseInterval);
  pulseInterval = setInterval(() => {
    const bpm = 55 + Math.floor(Math.random() * 66);
    heart.innerText = `${bpm} BPM (${classifyPulse(bpm)})`;
  }, 2000);
}

function analyze(text) {
  const db = {
    fever: { w: 20, m: "Paracetamol", t: "Blood Test" },
    cough: { w: 15, m: "Cough Syrup", t: "Chest X-ray" },
    cold: { w: 10, m: "Antihistamine", t: "CBC" },
    headache: { w: 10, m: "Ibuprofen", t: "CT Scan" },
    pain: { w: 18, m: "Analgesic", t: "Pain Panel" },
    dizziness: { w: 20, m: "Hydration + Observation", t: "BP Monitoring" },
    vomiting: { w: 15, m: "ORS", t: "Stool Test" },
    breath: { w: 25, m: "Inhaler", t: "Spirometry" },
    chest: { w: 30, m: "Aspirin", t: "ECG" },
    weakness: { w: 10, m: "Multivitamin", t: "Vitamin Test" },
    fatigue: { w: 12, m: "Nutritional Support", t: "Thyroid Panel" },
    infection: { w: 22, m: "Antibiotic (per doctor)", t: "CRP Test" },
    diarrhea: { w: 18, m: "ORS", t: "Electrolyte Panel" },
    diabetes: { w: 25, m: "Metformin", t: "HbA1c" },
    hypertension: { w: 25, m: "Amlodipine", t: "Blood Pressure Panel" }
  };

  const normalizedText = String(text || "").toLowerCase();
  const symptoms = [];
  const medicines = [];
  const tests = [];
  let risk = 0;

  Object.keys(db).forEach((key) => {
    if (normalizedText.includes(key)) {
      symptoms.push(key);
      medicines.push(db[key].m);
      tests.push(db[key].t);
      risk += db[key].w;
    }
  });

  return {
    symptoms: symptoms.join(", "),
    medicines: [...new Set(medicines)].join(", "),
    tests: [...new Set(tests)].join(", "),
    risk: Math.min(risk, 100)
  };
}

function getRiskLevel(risk) {
  if (risk >= 80) {
    return "Critical";
  }
  if (risk >= 60) {
    return "High";
  }
  if (risk >= 30) {
    return "Moderate";
  }
  return "Low";
}

function runAI() {
  const chiefComplaint = byId("chiefComplaint");
  const conversation = byId("conversation");
  const knownAllergies = byId("knownAllergies");
  const symptoms = byId("symptoms");
  const diagnosis = byId("diagnosis");
  const medicines = byId("medicines");
  const tests = byId("tests");
  const risk = byId("risk");
  const riskLevel = byId("riskLevel");

  if (!conversation || !symptoms || !medicines || !tests || !risk || !diagnosis) {
    return;
  }

  const sourceText = [
    chiefComplaint ? chiefComplaint.value : "",
    conversation.value,
    knownAllergies ? knownAllergies.value : ""
  ].join(" ");
  const result = analyze(sourceText);

  symptoms.value = result.symptoms || "No clear symptoms detected";
  medicines.value = result.medicines || "Observation / hydration advised";
  tests.value = result.tests || "No immediate test suggested";
  if (!diagnosis.value.trim()) {
    diagnosis.value = result.symptoms
      ? `Likely related to ${result.symptoms}. Clinical confirmation needed.`
      : "Under observation. No strong indicator found from transcript.";
  }
  risk.innerText = String(result.risk);

  if (riskLevel) {
    riskLevel.innerText = getRiskLevel(result.risk);
  }

  updateTriageRecommendationField();
}

function buildCurrentReport() {
  const patientName = byId("patientName");
  const patientAge = byId("patientAge");
  const visitDate = byId("visitDate");
  const followUpDate = byId("followUpDate");
  const priority = byId("priority");
  const consultationType = byId("consultationType");
  const chiefComplaint = byId("chiefComplaint");
  const conversation = byId("conversation");
  const knownAllergies = byId("knownAllergies");
  const temperature = byId("temperature");
  const spo2 = byId("spo2");
  const weight = byId("weight");
  const height = byId("height");
  const bmi = byId("bmi");
  const pulseRate = byId("pulseRate");
  const respRate = byId("respRate");
  const bloodSugar = byId("bloodSugar");
  const bpSystolic = byId("bpSystolic");
  const bpDiastolic = byId("bpDiastolic");
  const symptoms = byId("symptoms");
  const diagnosis = byId("diagnosis");
  const medicines = byId("medicines");
  const tests = byId("tests");
  const carePlan = byId("carePlan");
  const clinicalNotes = byId("clinicalNotes");
  const doctor = byId("doctor");
  const risk = byId("risk");
  const triageRecommendation = byId("triageRecommendation");
  const breathing = byId("breathing");
  const heart = byId("heart");

  if (!patientName || !visitDate || !symptoms || !medicines || !tests || !doctor || !risk) {
    return null;
  }

  const report = {
    id: `report-${Date.now()}`,
    createdAt: new Date().toISOString(),
    patientName: patientName.value.trim(),
    patientAge: patientAge ? patientAge.value.trim() : "",
    visitDate: visitDate.value,
    followUpDate: followUpDate ? followUpDate.value : "",
    priority: priority ? priority.value : "Routine",
    consultationType: consultationType ? consultationType.value : "In-person",
    chiefComplaint: chiefComplaint ? chiefComplaint.value.trim() : "",
    conversation: (conversation && conversation.value.trim()) || "",
    knownAllergies: knownAllergies ? knownAllergies.value.trim() : "",
    temperature: temperature ? temperature.value : "",
    spo2: spo2 ? spo2.value : "",
    weight: weight ? weight.value : "",
    height: height ? height.value : "",
    bmi: bmi ? (bmi.value || calculateBMI(weight ? weight.value : "", height ? height.value : "")) : "",
    pulseRate: pulseRate ? pulseRate.value : "",
    respRate: respRate ? respRate.value : "",
    bloodSugar: bloodSugar ? bloodSugar.value : "",
    bpSystolic: bpSystolic ? bpSystolic.value : "",
    bpDiastolic: bpDiastolic ? bpDiastolic.value : "",
    symptoms: symptoms.value.trim(),
    diagnosis: diagnosis ? diagnosis.value.trim() : "",
    medicines: medicines.value.trim(),
    tests: tests.value.trim(),
    carePlan: carePlan ? carePlan.value.trim() : "",
    clinicalNotes: (clinicalNotes && clinicalNotes.value.trim()) || "",
    risk: Number(risk.innerText) || 0,
    riskLevel: getRiskLevel(Number(risk.innerText) || 0),
    triageRecommendation: triageRecommendation ? triageRecommendation.value : "",
    doctor: doctor.value.trim(),
    breathing: breathing ? breathing.innerText : "Idle",
    pulse: heart ? heart.innerText : "Idle",
    status: "Generated"
  };

  if (!report.triageRecommendation) {
    report.triageRecommendation = recommendTriageLevel(report);
  }

  return report;
}

function generateReport() {
  const report = buildCurrentReport();
  const preview = byId("preview");
  const after = byId("after");

  if (!report || !preview || !after) {
    showMessage("newDataMessage", "Form elements are missing. Refresh and try again.", "error");
    return;
  }

  if (!report.patientName) {
    showMessage("newDataMessage", "Please enter patient name.", "error");
    byId("patientName").focus();
    return;
  }

  if (!report.visitDate) {
    showMessage("newDataMessage", "Please select visit date.", "error");
    byId("visitDate").focus();
    return;
  }

  if (report.followUpDate && report.followUpDate < report.visitDate) {
    showMessage("newDataMessage", "Follow-up date cannot be before visit date.", "error");
    byId("followUpDate").focus();
    return;
  }

  if ((report.bpSystolic && !report.bpDiastolic) || (!report.bpSystolic && report.bpDiastolic)) {
    showMessage("newDataMessage", "Please enter both BP systolic and diastolic values.", "error");
    (byId("bpSystolic") || byId("bpDiastolic")).focus();
    return;
  }

  if ((report.weight && !report.height) || (!report.weight && report.height)) {
    showMessage("newDataMessage", "Please enter both weight and height for BMI.", "error");
    (byId("weight") || byId("height")).focus();
    return;
  }

  if (report.spo2 && (Number(report.spo2) < 50 || Number(report.spo2) > 100)) {
    showMessage("newDataMessage", "SpO2 value must be between 50 and 100.", "error");
    byId("spo2").focus();
    return;
  }

  if (report.pulseRate && (Number(report.pulseRate) < 30 || Number(report.pulseRate) > 220)) {
    showMessage("newDataMessage", "Pulse rate must be between 30 and 220 BPM.", "error");
    byId("pulseRate").focus();
    return;
  }

  if (report.respRate && (Number(report.respRate) < 5 || Number(report.respRate) > 60)) {
    showMessage("newDataMessage", "Respiratory rate must be between 5 and 60.", "error");
    byId("respRate").focus();
    return;
  }

  if (report.bloodSugar && (Number(report.bloodSugar) < 20 || Number(report.bloodSugar) > 600)) {
    showMessage("newDataMessage", "Blood sugar must be between 20 and 600 mg/dL.", "error");
    byId("bloodSugar").focus();
    return;
  }

  if (report.weight && report.height) {
    const computedBmi = calculateBMI(report.weight, report.height);
    report.bmi = computedBmi;
    const bmiInput = byId("bmi");
    if (bmiInput) {
      bmiInput.value = computedBmi;
    }
  }

  report.triageRecommendation = recommendTriageLevel(report);
  const triageInput = byId("triageRecommendation");
  if (triageInput) {
    triageInput.value = report.triageRecommendation;
  }

  const priorityWeight = { Routine: 1, Urgent: 2, Emergency: 3 };
  let priorityAutoAdjusted = false;
  if ((priorityWeight[report.priority] || 0) < (priorityWeight[report.triageRecommendation] || 0)) {
    report.priority = report.triageRecommendation;
    priorityAutoAdjusted = true;
    const priorityInput = byId("priority");
    if (priorityInput) {
      priorityInput.value = report.priority;
    }
  }

  if (!report.doctor) {
    showMessage("newDataMessage", "Please enter doctor name/signature.", "error");
    byId("doctor").focus();
    return;
  }

  localStorage.setItem(STORAGE_KEYS.CURRENT_REPORT, JSON.stringify(report));

  preview.innerHTML = `
    <h3>Report Preview</h3>
    <p><strong>Patient:</strong> ${safeText(report.patientName)}</p>
    <p><strong>Age:</strong> ${safeText(report.patientAge || "-")}</p>
    <p><strong>Date:</strong> ${safeText(report.visitDate)}</p>
    <p><strong>Follow-up:</strong> ${safeText(report.followUpDate || "-")}</p>
    <p><strong>Priority:</strong> ${safeText(report.priority)}</p>
    <p><strong>Consultation:</strong> ${safeText(report.consultationType || "-")}</p>
    <p><strong>Complaint:</strong> ${safeText(report.chiefComplaint || "-")}</p>
    <p><strong>Allergies:</strong> ${safeText(report.knownAllergies || "-")}</p>
    <p><strong>Vitals:</strong> Temp ${safeText(report.temperature || "-")}F, SpO2 ${safeText(report.spo2 || "-")}%, Weight ${safeText(report.weight || "-")}kg, Height ${safeText(report.height || "-")}cm, BMI ${safeText(report.bmi || "-")}, Pulse ${safeText(report.pulseRate || "-")} BPM, Resp ${safeText(report.respRate || "-")}/min, Sugar ${safeText(report.bloodSugar || "-")} mg/dL, BP ${safeText(report.bpSystolic || "-")}/${safeText(report.bpDiastolic || "-")}</p>
    <p><strong>Symptoms:</strong> ${safeText(report.symptoms)}</p>
    <p><strong>Diagnosis:</strong> ${safeText(report.diagnosis || "-")}</p>
    <p><strong>Medicines:</strong> ${safeText(report.medicines)}</p>
    <p><strong>Tests:</strong> ${safeText(report.tests)}</p>
    <p><strong>Care Plan:</strong> ${safeText(report.carePlan || "-")}</p>
    <p><strong>Risk:</strong> ${safeText(report.risk)}% (${safeText(report.riskLevel)})</p>
    <p><strong>AI Triage:</strong> ${safeText(report.triageRecommendation || "Routine")}</p>
    <p><strong>Doctor:</strong> ${safeText(report.doctor)}</p>
    <p><strong>Additional Notes:</strong> ${safeText(report.clinicalNotes || "-")}</p>
  `;

  after.hidden = false;
  if (priorityAutoAdjusted) {
    showMessage("newDataMessage", `Priority auto-updated to ${report.priority} based on AI triage.`);
    return;
  }
  showMessage("newDataMessage", "Report generated. You can now download or store it.");
}

function saveDraft() {
  const draft = {
    patientName: (byId("patientName") && byId("patientName").value.trim()) || "",
    patientAge: (byId("patientAge") && byId("patientAge").value.trim()) || "",
    visitDate: (byId("visitDate") && byId("visitDate").value) || "",
    followUpDate: (byId("followUpDate") && byId("followUpDate").value) || "",
    priority: (byId("priority") && byId("priority").value) || "Routine",
    consultationType: (byId("consultationType") && byId("consultationType").value) || "In-person",
    chiefComplaint: (byId("chiefComplaint") && byId("chiefComplaint").value.trim()) || "",
    conversation: (byId("conversation") && byId("conversation").value.trim()) || "",
    knownAllergies: (byId("knownAllergies") && byId("knownAllergies").value.trim()) || "",
    temperature: (byId("temperature") && byId("temperature").value) || "",
    spo2: (byId("spo2") && byId("spo2").value) || "",
    weight: (byId("weight") && byId("weight").value) || "",
    height: (byId("height") && byId("height").value) || "",
    bmi: (byId("bmi") && byId("bmi").value) || "",
    pulseRate: (byId("pulseRate") && byId("pulseRate").value) || "",
    respRate: (byId("respRate") && byId("respRate").value) || "",
    bloodSugar: (byId("bloodSugar") && byId("bloodSugar").value) || "",
    bpSystolic: (byId("bpSystolic") && byId("bpSystolic").value) || "",
    bpDiastolic: (byId("bpDiastolic") && byId("bpDiastolic").value) || "",
    symptoms: (byId("symptoms") && byId("symptoms").value.trim()) || "",
    diagnosis: (byId("diagnosis") && byId("diagnosis").value.trim()) || "",
    medicines: (byId("medicines") && byId("medicines").value.trim()) || "",
    tests: (byId("tests") && byId("tests").value.trim()) || "",
    carePlan: (byId("carePlan") && byId("carePlan").value.trim()) || "",
    clinicalNotes: (byId("clinicalNotes") && byId("clinicalNotes").value.trim()) || "",
    doctor: (byId("doctor") && byId("doctor").value.trim()) || "",
    risk: Number((byId("risk") && byId("risk").innerText) || 0),
    triageRecommendation: (byId("triageRecommendation") && byId("triageRecommendation").value) || "Routine"
  };

  setStoredJSON(STORAGE_KEYS.DRAFT_REPORT, draft);
  showMessage("newDataMessage", "Draft saved locally.");
}

function resetNewDataForm() {
  [
    "patientName",
    "chiefComplaint",
    "followUpDate",
    "conversation",
    "knownAllergies",
    "temperature",
    "spo2",
    "weight",
    "height",
    "bmi",
    "pulseRate",
    "respRate",
    "bloodSugar",
    "bpSystolic",
    "bpDiastolic",
    "symptoms",
    "diagnosis",
    "medicines",
    "tests",
    "carePlan",
    "clinicalNotes",
    "doctor",
    "triageRecommendation"
  ].forEach((id) => {
    const field = byId(id);
    if (field) {
      field.value = "";
    }
  });

  const risk = byId("risk");
  const riskLevel = byId("riskLevel");
  const preview = byId("preview");
  const after = byId("after");
  const priority = byId("priority");
  const consultationType = byId("consultationType");
  const patientAge = byId("patientAge");

  if (risk) {
    risk.innerText = "0";
  }

  if (riskLevel) {
    riskLevel.innerText = "Low";
  }

  if (preview) {
    preview.innerHTML = "";
  }

  if (after) {
    after.hidden = true;
  }

  if (priority) {
    priority.value = "Routine";
  }

  if (consultationType) {
    consultationType.value = "In-person";
  }

  if (patientAge) {
    patientAge.value = calculateAgeFromDOB(localStorage.getItem(STORAGE_KEYS.DOB) || "");
  }

  updateBMIField();
  updateTriageRecommendationField();

  localStorage.removeItem(STORAGE_KEYS.CURRENT_REPORT);
  showMessage("newDataMessage", "Form reset complete.");
  applyDateLimits();
}

function sendPharmacy() {
  showMessage("newDataMessage", "Patient report flagged for pharmacy follow-up.");
}

function sendLab() {
  showMessage("newDataMessage", "Patient report flagged for laboratory follow-up.");
}

function storeReport() {
  const current = getStoredJSON(STORAGE_KEYS.CURRENT_REPORT, null);
  if (!current) {
    showMessage("newDataMessage", "Please generate a report before storing.", "error");
    return;
  }

  const reports = getStoredJSON(STORAGE_KEYS.REPORTS, []);

  const duplicateIndex = reports.findIndex((item) => item.id === current.id);
  if (duplicateIndex >= 0) {
    reports[duplicateIndex] = current;
  } else {
    reports.push(current);
  }

  setStoredJSON(STORAGE_KEYS.REPORTS, reports);
  localStorage.removeItem(STORAGE_KEYS.CURRENT_REPORT);
  localStorage.removeItem(STORAGE_KEYS.DRAFT_REPORT);

  updateDashboardStats();
  showMessage("newDataMessage", "Report stored successfully.");
}

function formatFileName(name) {
  return String(name || "Medical_Report")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 40) || "Medical_Report";
}

function downloadPDF(index) {
  let data = null;

  if (typeof index === "number") {
    const reports = getStoredJSON(STORAGE_KEYS.REPORTS, []);
    data = reports[index] || null;
  } else {
    data = getStoredJSON(STORAGE_KEYS.CURRENT_REPORT, null);
  }

  if (!data) {
    showMessage("newDataMessage", "Report not found.", "error");
    return;
  }

  const patientName = getReportField(data, ["patientName", "name"], "Medical_Report");
  const patientAge = getReportField(data, ["patientAge"], "-");
  const visitDate = getReportField(data, ["visitDate", "date"]);
  const followUpDate = getReportField(data, ["followUpDate"], "-");
  const priority = getReportField(data, ["priority"], "Routine");
  const consultationType = getReportField(data, ["consultationType"], "In-person");
  const chiefComplaint = getReportField(data, ["chiefComplaint"], "-");
  const knownAllergies = getReportField(data, ["knownAllergies"], "-");
  const temperature = getReportField(data, ["temperature"], "-");
  const spo2 = getReportField(data, ["spo2"], "-");
  const weight = getReportField(data, ["weight"], "-");
  const height = getReportField(data, ["height"], "-");
  const bmi = getReportField(data, ["bmi"], calculateBMI(weight, height) || "-");
  const pulseRate = getReportField(data, ["pulseRate"], "-");
  const respRate = getReportField(data, ["respRate"], "-");
  const bloodSugar = getReportField(data, ["bloodSugar"], "-");
  const bpSystolic = getReportField(data, ["bpSystolic"], "-");
  const bpDiastolic = getReportField(data, ["bpDiastolic"], "-");
  const status = getReportField(data, ["status"], "N/A");
  const symptoms = getReportField(data, ["symptoms"]);
  const diagnosis = getReportField(data, ["diagnosis"], "-");
  const medicines = getReportField(data, ["medicines"]);
  const tests = getReportField(data, ["tests", "exercise"]);
  const carePlan = getReportField(data, ["carePlan"], "-");
  const risk = getReportField(data, ["risk"], "0");
  const riskLevel = getReportField(data, ["riskLevel"], getRiskLevel(Number(risk) || 0));
  const triageRecommendation = getReportField(data, ["triageRecommendation", "priority"], "Routine");
  const doctor = getReportField(data, ["doctor"]);
  const notes = getReportField(data, ["clinicalNotes"], "-");

  let text = "CAREJR AI MEDICAL REPORT\n\n";
  text += `Patient: ${patientName}\n`;
  text += `Age: ${patientAge}\n`;
  text += `Date: ${visitDate}\n`;
  text += `Follow-up Date: ${followUpDate}\n`;
  text += `Priority: ${priority}\n`;
  text += `Consultation Type: ${consultationType}\n`;
  text += `Chief Complaint: ${chiefComplaint}\n`;
  text += `Known Allergies: ${knownAllergies}\n`;
  text += `Vitals: Temp ${temperature}F, SpO2 ${spo2}%, Weight ${weight}kg, Height ${height}cm, BMI ${bmi}, Pulse ${pulseRate} BPM, Resp ${respRate}/min, Sugar ${bloodSugar} mg/dL, BP ${bpSystolic}/${bpDiastolic}\n`;
  text += `Status: ${status}\n`;
  text += `Symptoms: ${symptoms}\n`;
  text += `Diagnosis: ${diagnosis}\n`;
  text += `Medicines: ${medicines}\n`;
  text += `Tests: ${tests}\n`;
  text += `Care Plan: ${carePlan}\n`;
  text += `Risk: ${risk}% (${riskLevel})\n`;
  text += `AI Triage: ${triageRecommendation}\n`;
  text += `Doctor: ${doctor}\n`;
  text += `Additional Notes: ${notes}`;

  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${formatFileName(patientName)}_report.txt`;
  link.click();

  URL.revokeObjectURL(url);
}

function matchesFilters(report) {
  const searchInput = byId("searchReport");
  const highRiskOnly = byId("highRiskOnly");
  const priorityFilter = byId("priorityFilter");
  const triageFilter = byId("triageFilter");

  const search = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const highRisk = highRiskOnly ? highRiskOnly.checked : false;
  const prioritySelected = priorityFilter ? priorityFilter.value : "all";
  const triageSelected = triageFilter ? triageFilter.value : "all";

  const patient = String(getReportField(report, ["patientName", "name"], "")).toLowerCase();
  const complaint = String(getReportField(report, ["chiefComplaint"], "")).toLowerCase();
  const symptoms = String(getReportField(report, ["symptoms"], "")).toLowerCase();
  const diagnosis = String(getReportField(report, ["diagnosis"], "")).toLowerCase();
  const doctor = String(getReportField(report, ["doctor"], "")).toLowerCase();
  const tests = String(getReportField(report, ["tests"], "")).toLowerCase();
  const priority = String(getReportField(report, ["priority"], "")).toLowerCase();
  const triage = String(getReportField(report, ["triageRecommendation", "priority"], "")).toLowerCase();
  const notes = String(getReportField(report, ["clinicalNotes"], "")).toLowerCase();
  const risk = Number(getReportField(report, ["risk"], 0)) || 0;

  if (highRisk && risk < 70) {
    return false;
  }

  if (prioritySelected !== "all" && getReportField(report, ["priority"], "") !== prioritySelected) {
    return false;
  }

  if (triageSelected !== "all" && getReportField(report, ["triageRecommendation", "priority"], "") !== triageSelected) {
    return false;
  }

  if (search) {
    const haystack = `${patient} ${complaint} ${symptoms} ${diagnosis} ${doctor} ${tests} ${priority} ${triage} ${notes}`;
    if (!haystack.includes(search)) {
      return false;
    }
  }

  return true;
}

function riskBadgeClass(risk) {
  if (risk >= 80) {
    return "risk-critical";
  }
  if (risk >= 60) {
    return "risk-high";
  }
  if (risk >= 30) {
    return "risk-moderate";
  }
  return "risk-low";
}

function parseReportDate(report) {
  const rawDate = getReportField(report, ["createdAt", "visitDate", "date"], "");
  const parsed = Date.parse(rawDate);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseReportRisk(report) {
  return Number(getReportField(report, ["risk"], 0)) || 0;
}

function sortReportEntries(entries) {
  const sortSelect = byId("sortReports");
  const sortMode = sortSelect ? sortSelect.value : "newest";
  const list = entries.slice();
  const priorityWeight = {
    Emergency: 3,
    Urgent: 2,
    Routine: 1
  };

  if (sortMode === "oldest") {
    list.sort((a, b) => parseReportDate(a.report) - parseReportDate(b.report));
  } else if (sortMode === "risk-high") {
    list.sort((a, b) => parseReportRisk(b.report) - parseReportRisk(a.report));
  } else if (sortMode === "risk-low") {
    list.sort((a, b) => parseReportRisk(a.report) - parseReportRisk(b.report));
  } else if (sortMode === "priority") {
    list.sort((a, b) => {
      const aPriority = getReportField(a.report, ["priority"], "Routine");
      const bPriority = getReportField(b.report, ["priority"], "Routine");
      return (priorityWeight[bPriority] || 0) - (priorityWeight[aPriority] || 0);
    });
  } else {
    list.sort((a, b) => parseReportDate(b.report) - parseReportDate(a.report));
  }

  return list;
}

function updatePreviousSummary(filteredEntries, totalStored) {
  const visible = filteredEntries.length;
  const visibleRisks = filteredEntries.map((entry) => parseReportRisk(entry.report));
  const critical = visibleRisks.filter((risk) => risk >= 80).length;
  const emergencyPriority = filteredEntries.filter(
    (entry) => getReportField(entry.report, ["priority"], "Routine") === "Emergency"
  ).length;
  const today = new Date().toISOString().split("T")[0];
  const followUpDue = filteredEntries.filter((entry) => {
    const followUp = getReportField(entry.report, ["followUpDate"], "");
    return followUp && followUp <= today;
  }).length;
  const avgRisk = visible > 0
    ? Math.round(visibleRisks.reduce((sum, risk) => sum + risk, 0) / visible)
    : 0;

  const summaryVisible = byId("summaryVisible");
  const summaryStored = byId("summaryStored");
  const summaryCritical = byId("summaryCritical");
  const summaryEmergency = byId("summaryEmergency");
  const summaryFollowUpDue = byId("summaryFollowUpDue");
  const summaryAverage = byId("summaryAverage");

  if (summaryVisible) {
    summaryVisible.textContent = String(visible);
  }
  if (summaryStored) {
    summaryStored.textContent = String(totalStored);
  }
  if (summaryCritical) {
    summaryCritical.textContent = String(critical);
  }
  if (summaryEmergency) {
    summaryEmergency.textContent = String(emergencyPriority);
  }
  if (summaryFollowUpDue) {
    summaryFollowUpDue.textContent = String(followUpDue);
  }
  if (summaryAverage) {
    summaryAverage.textContent = `${avgRisk}%`;
  }
}

function loadReports() {
  const container = byId("reportContainer");
  if (!container) {
    return;
  }

  const reports = getStoredJSON(STORAGE_KEYS.REPORTS, []);
  container.innerHTML = "";
  updatePreviousSummary([], reports.length);

  if (reports.length === 0) {
    container.innerHTML = '<div class="no-report">No Reports Available</div>';
    showMessage("reportsMessage", "No report data found yet.", "error");
    return;
  }

  const filteredEntries = reports
    .map((report, index) => ({ report, index }))
    .filter(({ report }) => matchesFilters(report));

  const sortedEntries = sortReportEntries(filteredEntries);
  updatePreviousSummary(sortedEntries, reports.length);

  if (sortedEntries.length === 0) {
    container.innerHTML = '<div class="no-report">No reports match current filters.</div>';
    showMessage("reportsMessage", "No matching reports.", "error");
    return;
  }

  sortedEntries.forEach(({ report, index }) => {
    const patient = getReportField(report, ["patientName", "name"]);
    const patientAge = getReportField(report, ["patientAge"], "-");
    const date = getReportField(report, ["visitDate", "date"]);
    const followUpDate = getReportField(report, ["followUpDate"], "-");
    const priority = getReportField(report, ["priority"], "Routine");
    const consultationType = getReportField(report, ["consultationType"], "In-person");
    const complaint = getReportField(report, ["chiefComplaint"], "-");
    const allergies = getReportField(report, ["knownAllergies"], "-");
    const temperature = getReportField(report, ["temperature"], "-");
    const spo2 = getReportField(report, ["spo2"], "-");
    const weight = getReportField(report, ["weight"], "-");
    const height = getReportField(report, ["height"], "-");
    const bmi = getReportField(report, ["bmi"], calculateBMI(weight, height) || "-");
    const pulseRate = getReportField(report, ["pulseRate"], "-");
    const respRate = getReportField(report, ["respRate"], "-");
    const bloodSugar = getReportField(report, ["bloodSugar"], "-");
    const bpSystolic = getReportField(report, ["bpSystolic"], "-");
    const bpDiastolic = getReportField(report, ["bpDiastolic"], "-");
    const status = getReportField(report, ["status"]);
    const symptoms = getReportField(report, ["symptoms"]);
    const diagnosis = getReportField(report, ["diagnosis"], "-");
    const medicines = getReportField(report, ["medicines"]);
    const tests = getReportField(report, ["tests", "exercise"]);
    const carePlan = getReportField(report, ["carePlan"], "-");
    const risk = parseReportRisk(report);
    const riskLevel = getReportField(report, ["riskLevel"], getRiskLevel(risk));
    const triageRecommendation = getReportField(report, ["triageRecommendation", "priority"], "Routine");
    const doctor = getReportField(report, ["doctor"]);
    const notes = getReportField(report, ["clinicalNotes"], "-");
    const reportId = getReportField(report, ["id"], "");

    const div = document.createElement("div");
    div.className = "report";

    div.innerHTML = `
      <h3>${safeText(patient)}</h3>
      <p><strong>Age:</strong> ${safeText(patientAge)}</p>
      <p><strong>Date:</strong> ${safeText(date)}</p>
      <p><strong>Follow-up:</strong> ${safeText(followUpDate)}</p>
      <p><strong>Priority:</strong> ${safeText(priority)}</p>
      <p><strong>Consultation:</strong> ${safeText(consultationType)}</p>
      <p><strong>Complaint:</strong> ${safeText(complaint)}</p>
      <p><strong>Allergies:</strong> ${safeText(allergies)}</p>
      <p><strong>Vitals:</strong> Temp ${safeText(temperature)}F, SpO2 ${safeText(spo2)}%, Weight ${safeText(weight)}kg, Height ${safeText(height)}cm, BMI ${safeText(bmi)}, Pulse ${safeText(pulseRate)} BPM, Resp ${safeText(respRate)}/min, Sugar ${safeText(bloodSugar)} mg/dL, BP ${safeText(bpSystolic)}/${safeText(bpDiastolic)}</p>
      <p><strong>Status:</strong> ${safeText(status)}</p>
      <p><strong>Symptoms:</strong> ${safeText(symptoms)}</p>
      <p><strong>Diagnosis:</strong> ${safeText(diagnosis)}</p>
      <p><strong>Medicines:</strong> ${safeText(medicines)}</p>
      <p><strong>Tests:</strong> ${safeText(tests)}</p>
      <p><strong>Care Plan:</strong> ${safeText(carePlan)}</p>
      <p><strong>Risk:</strong> <span class="risk-badge ${riskBadgeClass(risk)}">${safeText(risk)}% (${safeText(riskLevel)})</span></p>
      <p><strong>AI Triage:</strong> ${safeText(triageRecommendation)}</p>
      <p><strong>Doctor:</strong> ${safeText(doctor)}</p>
      <p><strong>Notes:</strong> ${safeText(notes)}</p>
      <div class="report-actions">
        <button class="pdf-btn" onclick="downloadPDF(${index})">Download Report</button>
        <button class="delete-btn" onclick="deleteReport(${index}, '${safeText(reportId)}')">Delete</button>
      </div>
    `;

    container.appendChild(div);
  });

  showMessage("reportsMessage", `${sortedEntries.length} report(s) shown.`);
}

function filterReports() {
  loadReports();
}

function exportAllReports() {
  const reports = getStoredJSON(STORAGE_KEYS.REPORTS, []);
  if (reports.length === 0) {
    showMessage("reportsMessage", "No reports available to export.", "error");
    return;
  }

  const payload = JSON.stringify(reports, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `carejr_reports_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();

  URL.revokeObjectURL(url);
  showMessage("reportsMessage", "All reports exported.");
}

function clearReports() {
  const reports = getStoredJSON(STORAGE_KEYS.REPORTS, []);
  if (reports.length === 0) {
    showMessage("reportsMessage", "No reports to clear.", "error");
    return;
  }

  const shouldClear = window.confirm("Clear all stored reports?");
  if (!shouldClear) {
    return;
  }

  localStorage.removeItem(STORAGE_KEYS.REPORTS);
  loadReports();
  updateDashboardStats();
  showMessage("reportsMessage", "All reports cleared.");
}

function deleteReport(index, id) {
  const reports = getStoredJSON(STORAGE_KEYS.REPORTS, []);
  let targetIndex = Number.isInteger(index) ? index : -1;

  if (targetIndex < 0 && id) {
    targetIndex = reports.findIndex((report) => String(report.id) === String(id));
  }

  if (targetIndex < 0) {
    return;
  }

  const shouldDelete = window.confirm("Delete this report?");
  if (!shouldDelete) {
    return;
  }

  reports.splice(targetIndex, 1);
  setStoredJSON(STORAGE_KEYS.REPORTS, reports);
  loadReports();
  updateDashboardStats();
}

function updateDashboardStats() {
  const reports = getStoredJSON(STORAGE_KEYS.REPORTS, []);

  const total = reports.length;
  const highRisk = reports.filter((report) => parseReportRisk(report) >= 70).length;
  const critical = reports.filter((report) => parseReportRisk(report) >= 80).length;
  const high = reports.filter((report) => parseReportRisk(report) >= 60 && parseReportRisk(report) < 80).length;
  const moderate = reports.filter((report) => parseReportRisk(report) >= 30 && parseReportRisk(report) < 60).length;
  const low = reports.filter((report) => parseReportRisk(report) < 30).length;
  const average = total > 0
    ? Math.round(reports.reduce((sum, report) => sum + parseReportRisk(report), 0) / total)
    : 0;
  const today = new Date().toISOString().split("T")[0];
  const routineCount = reports.filter((report) => getReportField(report, ["priority"], "Routine") === "Routine").length;
  const urgentCount = reports.filter((report) => getReportField(report, ["priority"], "Routine") === "Urgent").length;
  const emergencyCount = reports.filter((report) => getReportField(report, ["priority"], "Routine") === "Emergency").length;
  const triageEmergencyCount = reports.filter(
    (report) => getReportField(report, ["triageRecommendation", "priority"], "Routine") === "Emergency"
  ).length;
  const reportsToday = reports.filter(
    (report) => getReportField(report, ["visitDate", "date"], "") === today
  ).length;
  const followUpDue = reports.filter((report) => {
    const followUp = getReportField(report, ["followUpDate"], "");
    return followUp && followUp <= today;
  }).length;

  let lastVisit = "-";
  if (reports.length > 0) {
    const sorted = reports
      .map((report) => getReportField(report, ["visitDate", "date"], ""))
      .filter(Boolean)
      .sort();
    const latest = sorted[sorted.length - 1];
    if (latest) {
      lastVisit = latest;
    }
  }

  const statTotal = byId("statTotal");
  const statHighRisk = byId("statHighRisk");
  const statCritical = byId("statCritical");
  const statModerate = byId("statModerate");
  const statLow = byId("statLow");
  const statAverage = byId("statAverage");
  const statRoutine = byId("statRoutine");
  const statUrgent = byId("statUrgent");
  const statEmergency = byId("statEmergency");
  const statToday = byId("statToday");
  const statFollowUpDue = byId("statFollowUpDue");
  const statTriageEmergency = byId("statTriageEmergency");
  const statLastVisit = byId("statLastVisit");

  if (statTotal) {
    statTotal.innerText = String(total);
  }

  if (statHighRisk) {
    statHighRisk.innerText = String(highRisk);
  }

  if (statCritical) {
    statCritical.innerText = String(critical);
  }

  if (statModerate) {
    statModerate.innerText = String(moderate);
  }

  if (statLow) {
    statLow.innerText = String(low);
  }

  if (statAverage) {
    statAverage.innerText = `${average}%`;
  }

  if (statRoutine) {
    statRoutine.innerText = String(routineCount);
  }

  if (statUrgent) {
    statUrgent.innerText = String(urgentCount);
  }

  if (statEmergency) {
    statEmergency.innerText = String(emergencyCount);
  }

  if (statToday) {
    statToday.innerText = String(reportsToday);
  }

  if (statFollowUpDue) {
    statFollowUpDue.innerText = String(followUpDue);
  }

  if (statTriageEmergency) {
    statTriageEmergency.innerText = String(triageEmergencyCount);
  }

  if (statLastVisit) {
    statLastVisit.innerText = lastVisit;
  }

  const ratio = (value) => (total > 0 ? Math.round((value / total) * 100) : 0);

  const meterMap = [
    ["meterLow", "meterLowLabel", ratio(low)],
    ["meterModerate", "meterModerateLabel", ratio(moderate)],
    ["meterHigh", "meterHighLabel", ratio(high)],
    ["meterCritical", "meterCriticalLabel", ratio(critical)]
  ];

  meterMap.forEach(([meterId, labelId, percent]) => {
    const meter = byId(meterId);
    const label = byId(labelId);
    if (meter) {
      meter.style.width = `${percent}%`;
    }
    if (label) {
      label.textContent = `${percent}%`;
    }
  });
}
