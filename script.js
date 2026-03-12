let generatedOtp = null;

let recognition = null;
let fullTranscript = "";
let cameraStream = null;
let breathInterval = null;
let pulseInterval = null;
let breathCount = 0;
let pulse = 60;

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

function getReportField(report, keys, fallback = "N/A") {
  for (let i = 0; i < keys.length; i += 1) {
    const value = report[keys[i]];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return fallback;
}

function initPage() {
  const phoneInput = byId("phone");
  if (phoneInput && !phoneInput.value) {
    phoneInput.value = localStorage.getItem("phone") || "";
  }

  const username = byId("username");
  if (username) {
    username.innerText = localStorage.getItem("name") || "User";
  }

  const dob = byId("dob");
  if (dob && dob.tagName !== "INPUT") {
    dob.innerText = localStorage.getItem("dob") || "-";
  }

  const state = byId("state");
  if (state && state.tagName !== "SELECT") {
    state.innerText = localStorage.getItem("state") || "-";
  }

  const phone = byId("phone");
  if (phone && phone.tagName !== "INPUT") {
    phone.innerText = localStorage.getItem("phone") || "-";
  }

  if (byId("reportContainer")) {
    loadReports();
  }
}

document.addEventListener("DOMContentLoaded", initPage);

function sendOTP() {
  const phoneInput = byId("phone");
  if (!phoneInput) {
    return;
  }

  const phone = phoneInput.value.trim();
  if (phone.length !== 10 || /\D/.test(phone)) {
    alert("Enter valid number");
    return;
  }

  generatedOtp = String(Math.floor(1000 + Math.random() * 9000));
  localStorage.setItem("generatedOtp", generatedOtp);
  localStorage.setItem("phone", phone);

  alert(`OTP: ${generatedOtp}`);

  const otpBox = byId("otpBox");
  if (otpBox) {
    otpBox.style.display = "block";
  }
}

function verify() {
  const otpInput = byId("otp");
  if (!otpInput) {
    return;
  }

  const entered = otpInput.value.trim();
  const expectedOtp = generatedOtp || localStorage.getItem("generatedOtp");

  if (entered === expectedOtp) {
    localStorage.removeItem("generatedOtp");
    window.location.href = "details.html";
  } else {
    alert("Wrong OTP");
  }
}

function submitData() {
  const name = byId("name");
  const dob = byId("dob");
  const state = byId("state");

  if (!name || !dob || !state) {
    return;
  }

  localStorage.setItem("name", name.value.trim());
  localStorage.setItem("dob", dob.value);
  localStorage.setItem("state", state.value);

  window.location.href = "dashboard.html";
}

function toggle() {
  const side = byId("side");
  if (!side) {
    return;
  }

  side.style.left = side.style.left === "0px" ? "-250px" : "0px";
}

function startConversation() {
  startCamera();
  startVoice();
  startBreathing();
  startPulse();
}

function stopConversation() {
  if (recognition) {
    recognition.stop();
    recognition = null;
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  clearInterval(breathInterval);
  clearInterval(pulseInterval);

  const breathing = byId("breathing");
  const heart = byId("heart");

  if (breathing) {
    breathing.innerText = "Idle";
  }

  if (heart) {
    heart.innerText = "Idle";
  }
}

async function startCamera() {
  const video = byId("video");
  if (!video) {
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    video.srcObject = cameraStream;
  } catch (error) {
    alert("Camera or microphone permission denied");
  }
}

function startVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const conversation = byId("conversation");

  if (!SpeechRecognition || !conversation) {
    alert("Use Google Chrome");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-IN";

  fullTranscript = conversation.value || "";

  recognition.start();

  recognition.onresult = function onresult(event) {
    let newText = "";

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      if (event.results[i].isFinal) {
        newText += `${event.results[i][0].transcript} `;
      }
    }

    fullTranscript += newText;
    conversation.value = fullTranscript;
    runAI();
  };

  recognition.onend = function onend() {
    if (recognition) {
      try {
        recognition.start();
      } catch (error) {
        // Ignore repeated start race while stopping.
      }
    }
  };
}

function startBreathing() {
  const breathing = byId("breathing");
  if (!breathing) {
    return;
  }

  breathCount = 0;
  clearInterval(breathInterval);

  breathInterval = setInterval(() => {
    breathCount += 1;
    const bpm = breathCount * 2;

    if (bpm < 10) {
      breathing.innerText = `${bpm} BPM (Bad)`;
    } else if (bpm < 16) {
      breathing.innerText = `${bpm} BPM (Normal)`;
    } else if (bpm < 20) {
      breathing.innerText = `${bpm} BPM (Good)`;
    } else {
      breathing.innerText = `${bpm} BPM (Emergency)`;
    }
  }, 3000);
}

function startPulse() {
  const heart = byId("heart");
  if (!heart) {
    return;
  }

  clearInterval(pulseInterval);

  pulseInterval = setInterval(() => {
    pulse = 60 + Math.floor(Math.random() * 40);

    if (pulse < 60) {
      heart.innerText = `${pulse} BPM (Bad)`;
    } else if (pulse < 80) {
      heart.innerText = `${pulse} BPM (Normal)`;
    } else if (pulse < 100) {
      heart.innerText = `${pulse} BPM (Good)`;
    } else {
      heart.innerText = `${pulse} BPM (Emergency)`;
    }
  }, 2000);
}

function analyze(text) {
  const db = {
    fever: { w: 20, m: "Paracetamol", t: "Blood Test" },
    cough: { w: 15, m: "Cough Syrup", t: "Chest X-ray" },
    cold: { w: 10, m: "Antihistamine", t: "CBC" },
    headache: { w: 10, m: "Ibuprofen", t: "CT Scan" },
    vomiting: { w: 15, m: "ORS", t: "Stool Test" },
    breathing: { w: 25, m: "Inhaler", t: "Spirometry" },
    chest: { w: 30, m: "Aspirin", t: "ECG" },
    weakness: { w: 10, m: "Multivitamin", t: "Vitamin Test" }
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

function runAI() {
  const conversation = byId("conversation");
  const symptoms = byId("symptoms");
  const medicines = byId("medicines");
  const tests = byId("tests");
  const risk = byId("risk");

  if (!conversation || !symptoms || !medicines || !tests || !risk) {
    return;
  }

  const result = analyze(conversation.value);

  symptoms.value = result.symptoms;
  medicines.value = result.medicines;
  tests.value = result.tests;
  risk.innerText = result.risk;
}

function generateReport() {
  const patientName = byId("patientName");
  const visitDate = byId("visitDate");
  const symptoms = byId("symptoms");
  const medicines = byId("medicines");
  const tests = byId("tests");
  const risk = byId("risk");
  const doctor = byId("doctor");
  const preview = byId("preview");
  const after = byId("after");

  if (!patientName || !visitDate || !symptoms || !medicines || !tests || !risk || !doctor || !preview || !after) {
    return;
  }

  const report = {
    name: patientName.value.trim(),
    patientName: patientName.value.trim(),
    date: visitDate.value,
    visitDate: visitDate.value,
    symptoms: symptoms.value.trim(),
    medicines: medicines.value.trim(),
    tests: tests.value.trim(),
    risk: Number(risk.innerText) || 0,
    doctor: doctor.value.trim(),
    status: "Generated"
  };

  localStorage.setItem("currentReport", JSON.stringify(report));

  preview.innerHTML = `
    <h3>Report Preview</h3>
    <p><b>Patient:</b> ${safeText(report.patientName)}</p>
    <p><b>Symptoms:</b> ${safeText(report.symptoms)}</p>
    <p><b>Medicines:</b> ${safeText(report.medicines)}</p>
    <p><b>Tests:</b> ${safeText(report.tests)}</p>
    <p><b>Risk:</b> ${safeText(report.risk)}%</p>
  `;

  after.style.display = "block";
}

function sendPharmacy() {
  alert("Patient report sent to Pharmacy");
}

function sendLab() {
  alert("Patient report sent to Laboratory");
}

function storeReport() {
  const reports = JSON.parse(localStorage.getItem("reports")) || [];
  const current = JSON.parse(localStorage.getItem("currentReport"));

  if (!current) {
    alert("Generate report first");
    return;
  }

  reports.push(current);
  localStorage.setItem("reports", JSON.stringify(reports));

  alert("Report Stored Successfully");
}

function downloadPDF(index) {
  let data = null;

  if (typeof index === "number") {
    const reports = JSON.parse(localStorage.getItem("reports")) || [];
    data = reports[index] || null;
  } else {
    data = JSON.parse(localStorage.getItem("currentReport"));
  }

  if (!data) {
    alert("Report not found!");
    return;
  }

  const patientName = getReportField(data, ["patientName", "name"], "Medical_Report");
  const visitDate = getReportField(data, ["visitDate", "date"]);
  const status = getReportField(data, ["status"], "N/A");
  const symptoms = getReportField(data, ["symptoms"]);
  const medicines = getReportField(data, ["medicines"]);
  const tests = getReportField(data, ["tests", "exercise"]);
  const risk = getReportField(data, ["risk"], "0");
  const doctor = getReportField(data, ["doctor"]);

  let text = "CAREJR AI MEDICAL REPORT\n\n";
  text += `Patient: ${patientName}\n`;
  text += `Date: ${visitDate}\n`;
  text += `Status: ${status}\n`;
  text += `Symptoms: ${symptoms}\n`;
  text += `Medicines: ${medicines}\n`;
  text += `Tests: ${tests}\n`;
  text += `Risk: ${risk}%\n`;
  text += `Doctor: ${doctor}`;

  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${patientName}_report.txt`;
  link.click();

  URL.revokeObjectURL(url);
}

function loadReports() {
  const container = byId("reportContainer");
  if (!container) {
    return;
  }

  const reports = JSON.parse(localStorage.getItem("reports")) || [];
  container.innerHTML = "";

  if (reports.length === 0) {
    container.innerHTML = '<div class="no-report">No Reports Available</div>';
    return;
  }

  reports.forEach((report, index) => {
    const patient = getReportField(report, ["patientName", "name"]);
    const date = getReportField(report, ["visitDate", "date"]);
    const status = getReportField(report, ["status"]);
    const symptoms = getReportField(report, ["symptoms"]);
    const medicines = getReportField(report, ["medicines"]);
    const tests = getReportField(report, ["tests", "exercise"]);
    const risk = getReportField(report, ["risk"], "0");
    const doctor = getReportField(report, ["doctor"]);

    const div = document.createElement("div");
    div.className = "report";

    div.innerHTML = `
      <h3>Report ${index + 1}</h3>
      <p><strong>Patient:</strong> ${safeText(patient)}</p>
      <p><strong>Date:</strong> ${safeText(date)}</p>
      <p><strong>Status:</strong> ${safeText(status)}</p>
      <p><strong>Symptoms:</strong> ${safeText(symptoms)}</p>
      <p><strong>Medicines:</strong> ${safeText(medicines)}</p>
      <p><strong>Tests:</strong> ${safeText(tests)}</p>
      <p><strong>Risk:</strong> ${safeText(risk)}%</p>
      <p><strong>Doctor:</strong> ${safeText(doctor)}</p>
      <br>
      <button class="pdf-btn" onclick="downloadPDF(${index})">Download PDF</button>
      <button class="delete-btn" onclick="deleteReport(${index})">Delete</button>
    `;

    container.appendChild(div);
  });
}

function deleteReport(index) {
  const reports = JSON.parse(localStorage.getItem("reports")) || [];

  if (!reports[index]) {
    return;
  }

  if (confirm("Are you sure you want to delete this report?")) {
    reports.splice(index, 1);
    localStorage.setItem("reports", JSON.stringify(reports));
    loadReports();
  }
}
