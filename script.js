const STORAGE_KEYS = {
  PHONE: "phone",
  GENERATED_OTP: "generatedOtp",
  OTP_SENT_AT: "otpSentAt",
  NAME: "name",
  DOB: "dob",
  STATE: "state",
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

  const otpInput = byId("otp");
  if (otpInput) {
    otpInput.addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4);
    });
  }
}

function hydrateSharedData() {
  const phoneInput = byId("phone");
  if (phoneInput && phoneInput.tagName === "INPUT" && !phoneInput.value) {
    phoneInput.value = localStorage.getItem(STORAGE_KEYS.PHONE) || "";
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

  const phone = byId("phone");
  if (phone && phone.tagName !== "INPUT") {
    phone.innerText = localStorage.getItem(STORAGE_KEYS.PHONE) || "-";
  }
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
    ["visitDate", "visitDate"],
    ["conversation", "conversation"],
    ["symptoms", "symptoms"],
    ["medicines", "medicines"],
    ["tests", "tests"],
    ["clinicalNotes", "clinicalNotes"],
    ["doctor", "doctor"]
  ];

  fields.forEach(([id, key]) => {
    const input = byId(id);
    if (input && !input.value && draft[key]) {
      input.value = draft[key];
    }
  });

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

function sendOTP() {
  const phoneInput = byId("phone");
  if (!phoneInput) {
    return;
  }

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

  const otpBox = byId("otpBox");
  if (otpBox) {
    otpBox.hidden = false;
  }

  const otpInput = byId("otp");
  if (otpInput) {
    otpInput.focus();
  }

  showMessage("authMessage", `OTP sent successfully. Demo OTP: ${generatedOtp}`);
}

function resendOTP() {
  const sentAt = Number(localStorage.getItem(STORAGE_KEYS.OTP_SENT_AT) || "0");
  const waitMs = 20_000;
  const remaining = waitMs - (Date.now() - sentAt);

  if (remaining > 0) {
    const seconds = Math.ceil(remaining / 1000);
    showMessage("authMessage", `Please wait ${seconds}s before requesting a new OTP.`, "error");
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
  const state = byId("state");

  if (!name || !dob || !state) {
    return;
  }

  const fullName = name.value.trim();
  const dobValue = dob.value;
  const stateValue = state.value;

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

  localStorage.setItem(STORAGE_KEYS.NAME, fullName);
  localStorage.setItem(STORAGE_KEYS.DOB, dobValue);
  localStorage.setItem(STORAGE_KEYS.STATE, stateValue);

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
  localStorage.removeItem(STORAGE_KEYS.NAME);
  localStorage.removeItem(STORAGE_KEYS.DOB);
  localStorage.removeItem(STORAGE_KEYS.STATE);
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
    vomiting: { w: 15, m: "ORS", t: "Stool Test" },
    breath: { w: 25, m: "Inhaler", t: "Spirometry" },
    chest: { w: 30, m: "Aspirin", t: "ECG" },
    weakness: { w: 10, m: "Multivitamin", t: "Vitamin Test" },
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
  const conversation = byId("conversation");
  const symptoms = byId("symptoms");
  const medicines = byId("medicines");
  const tests = byId("tests");
  const risk = byId("risk");
  const riskLevel = byId("riskLevel");

  if (!conversation || !symptoms || !medicines || !tests || !risk) {
    return;
  }

  const result = analyze(conversation.value);

  symptoms.value = result.symptoms || "No clear symptoms detected";
  medicines.value = result.medicines || "Observation / hydration advised";
  tests.value = result.tests || "No immediate test suggested";
  risk.innerText = String(result.risk);

  if (riskLevel) {
    riskLevel.innerText = getRiskLevel(result.risk);
  }
}

function buildCurrentReport() {
  const patientName = byId("patientName");
  const visitDate = byId("visitDate");
  const conversation = byId("conversation");
  const symptoms = byId("symptoms");
  const medicines = byId("medicines");
  const tests = byId("tests");
  const clinicalNotes = byId("clinicalNotes");
  const doctor = byId("doctor");
  const risk = byId("risk");
  const breathing = byId("breathing");
  const heart = byId("heart");

  if (!patientName || !visitDate || !symptoms || !medicines || !tests || !doctor || !risk) {
    return null;
  }

  return {
    id: `report-${Date.now()}`,
    createdAt: new Date().toISOString(),
    patientName: patientName.value.trim(),
    visitDate: visitDate.value,
    conversation: (conversation && conversation.value.trim()) || "",
    symptoms: symptoms.value.trim(),
    medicines: medicines.value.trim(),
    tests: tests.value.trim(),
    clinicalNotes: (clinicalNotes && clinicalNotes.value.trim()) || "",
    risk: Number(risk.innerText) || 0,
    riskLevel: getRiskLevel(Number(risk.innerText) || 0),
    doctor: doctor.value.trim(),
    breathing: breathing ? breathing.innerText : "Idle",
    pulse: heart ? heart.innerText : "Idle",
    status: "Generated"
  };
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

  if (!report.doctor) {
    showMessage("newDataMessage", "Please enter doctor name/signature.", "error");
    byId("doctor").focus();
    return;
  }

  localStorage.setItem(STORAGE_KEYS.CURRENT_REPORT, JSON.stringify(report));

  preview.innerHTML = `
    <h3>Report Preview</h3>
    <p><strong>Patient:</strong> ${safeText(report.patientName)}</p>
    <p><strong>Date:</strong> ${safeText(report.visitDate)}</p>
    <p><strong>Symptoms:</strong> ${safeText(report.symptoms)}</p>
    <p><strong>Medicines:</strong> ${safeText(report.medicines)}</p>
    <p><strong>Tests:</strong> ${safeText(report.tests)}</p>
    <p><strong>Risk:</strong> ${safeText(report.risk)}% (${safeText(report.riskLevel)})</p>
    <p><strong>Doctor:</strong> ${safeText(report.doctor)}</p>
    <p><strong>Additional Notes:</strong> ${safeText(report.clinicalNotes || "-")}</p>
  `;

  after.hidden = false;
  showMessage("newDataMessage", "Report generated. You can now download or store it.");
}

function saveDraft() {
  const draft = {
    patientName: (byId("patientName") && byId("patientName").value.trim()) || "",
    visitDate: (byId("visitDate") && byId("visitDate").value) || "",
    conversation: (byId("conversation") && byId("conversation").value.trim()) || "",
    symptoms: (byId("symptoms") && byId("symptoms").value.trim()) || "",
    medicines: (byId("medicines") && byId("medicines").value.trim()) || "",
    tests: (byId("tests") && byId("tests").value.trim()) || "",
    clinicalNotes: (byId("clinicalNotes") && byId("clinicalNotes").value.trim()) || "",
    doctor: (byId("doctor") && byId("doctor").value.trim()) || "",
    risk: Number((byId("risk") && byId("risk").innerText) || 0)
  };

  setStoredJSON(STORAGE_KEYS.DRAFT_REPORT, draft);
  showMessage("newDataMessage", "Draft saved locally.");
}

function resetNewDataForm() {
  [
    "patientName",
    "conversation",
    "symptoms",
    "medicines",
    "tests",
    "clinicalNotes",
    "doctor"
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

  localStorage.removeItem(STORAGE_KEYS.CURRENT_REPORT);
  showMessage("newDataMessage", "Form reset complete.");
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
  const visitDate = getReportField(data, ["visitDate", "date"]);
  const status = getReportField(data, ["status"], "N/A");
  const symptoms = getReportField(data, ["symptoms"]);
  const medicines = getReportField(data, ["medicines"]);
  const tests = getReportField(data, ["tests", "exercise"]);
  const risk = getReportField(data, ["risk"], "0");
  const riskLevel = getReportField(data, ["riskLevel"], getRiskLevel(Number(risk) || 0));
  const doctor = getReportField(data, ["doctor"]);
  const notes = getReportField(data, ["clinicalNotes"], "-");

  let text = "CAREJR AI MEDICAL REPORT\n\n";
  text += `Patient: ${patientName}\n`;
  text += `Date: ${visitDate}\n`;
  text += `Status: ${status}\n`;
  text += `Symptoms: ${symptoms}\n`;
  text += `Medicines: ${medicines}\n`;
  text += `Tests: ${tests}\n`;
  text += `Risk: ${risk}% (${riskLevel})\n`;
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

  const search = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const highRisk = highRiskOnly ? highRiskOnly.checked : false;

  const patient = String(getReportField(report, ["patientName", "name"], "")).toLowerCase();
  const symptoms = String(getReportField(report, ["symptoms"], "")).toLowerCase();
  const doctor = String(getReportField(report, ["doctor"], "")).toLowerCase();
  const tests = String(getReportField(report, ["tests"], "")).toLowerCase();
  const risk = Number(getReportField(report, ["risk"], 0)) || 0;

  if (highRisk && risk < 70) {
    return false;
  }

  if (search) {
    const haystack = `${patient} ${symptoms} ${doctor} ${tests}`;
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

function loadReports() {
  const container = byId("reportContainer");
  if (!container) {
    return;
  }

  const reports = getStoredJSON(STORAGE_KEYS.REPORTS, []);
  container.innerHTML = "";

  if (reports.length === 0) {
    container.innerHTML = '<div class="no-report">No Reports Available</div>';
    showMessage("reportsMessage", "No report data found yet.", "error");
    return;
  }

  let visibleCount = 0;

  reports
    .map((report, index) => ({ report, index }))
    .reverse()
    .forEach(({ report, index }) => {
      if (!matchesFilters(report)) {
        return;
      }

      visibleCount += 1;

      const patient = getReportField(report, ["patientName", "name"]);
      const date = getReportField(report, ["visitDate", "date"]);
      const status = getReportField(report, ["status"]);
      const symptoms = getReportField(report, ["symptoms"]);
      const medicines = getReportField(report, ["medicines"]);
      const tests = getReportField(report, ["tests", "exercise"]);
      const risk = Number(getReportField(report, ["risk"], 0)) || 0;
      const riskLevel = getReportField(report, ["riskLevel"], getRiskLevel(risk));
      const doctor = getReportField(report, ["doctor"]);
      const notes = getReportField(report, ["clinicalNotes"], "-");
      const reportId = getReportField(report, ["id"], "");

      const div = document.createElement("div");
      div.className = "report";

      div.innerHTML = `
        <h3>${safeText(patient)}</h3>
        <p><strong>Date:</strong> ${safeText(date)}</p>
        <p><strong>Status:</strong> ${safeText(status)}</p>
        <p><strong>Symptoms:</strong> ${safeText(symptoms)}</p>
        <p><strong>Medicines:</strong> ${safeText(medicines)}</p>
        <p><strong>Tests:</strong> ${safeText(tests)}</p>
        <p><strong>Risk:</strong> <span class="risk-badge ${riskBadgeClass(risk)}">${safeText(risk)}% (${safeText(riskLevel)})</span></p>
        <p><strong>Doctor:</strong> ${safeText(doctor)}</p>
        <p><strong>Notes:</strong> ${safeText(notes)}</p>
        <div class="report-actions">
          <button class="pdf-btn" onclick="downloadPDF(${index})">Download Report</button>
          <button class="delete-btn" onclick="deleteReport(${index}, '${safeText(reportId)}')">Delete</button>
        </div>
      `;

      container.appendChild(div);
    });

  if (visibleCount === 0) {
    container.innerHTML = '<div class="no-report">No reports match current filters.</div>';
    showMessage("reportsMessage", "No matching reports.", "error");
  } else {
    showMessage("reportsMessage", `${visibleCount} report(s) shown.`);
  }
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
  const highRisk = reports.filter((report) => (Number(getReportField(report, ["risk"], 0)) || 0) >= 70).length;

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
  const statLastVisit = byId("statLastVisit");

  if (statTotal) {
    statTotal.innerText = String(total);
  }

  if (statHighRisk) {
    statHighRisk.innerText = String(highRisk);
  }

  if (statLastVisit) {
    statLastVisit.innerText = lastVisit;
  }
}
