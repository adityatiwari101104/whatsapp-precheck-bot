import PDFDocument from "pdfkit";

const SERVICE_TYPE_MAP = {
  "income-certificate": "income_certificate",
  "domicile-certificate": "domicile_certificate",
  "sc-st-certificate": "sc_st_certificate",
  "land-use-information": "land_use_information",
  "birth-certificate-correction": "birth_certificate_correction"
};

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

export function cleanPhoneNumber(value = "") {
  return String(value).replace(/[^\d]/g, "");
}

export function normalizeReferenceId(value = "") {
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function mapServiceType(record) {
  const serviceId = record?.serviceId || "";

  if (serviceId === "obc-ews-certificate") {
    if (record?.profile?.category === "ews") {
      return "ews_certificate";
    }
    return "obc_certificate";
  }

  return SERVICE_TYPE_MAP[serviceId] || String(serviceId).replace(/-/g, "_");
}

export function mapCitizenData(record) {
  const profile = record?.profile || {};

  return {
    applicant_type: profile.applicantType || null,
    annual_income: profile.annualIncome ?? null,
    category: profile.category || null,
    certificate_purpose: profile.certificatePurpose || null,
    correction_type: profile.correctionType || null,
    district: profile.districtName || null,
    family_certificate_history: profile.hasFamilyCertificateHistory ?? null,
    has_recent_mutation: profile.hasRecentMutation ?? null,
    is_general_category: profile.isGeneralCategory ?? null,
    is_permanent_resident: profile.isPermanentResident ?? null,
    land_applicant_role: profile.landApplicantRole || null,
    land_village: profile.landVillage || null,
    state: profile.stateName || null,
    years_at_address: profile.yearsAtAddress ?? null
  };
}

export function mapDocuments(record) {
  const result = record?.result || {};
  const required = result.requiredDocuments || [];
  const missingIds = new Set((result.missingMandatoryDocuments || []).map((doc) => doc.id));

  return required.map((doc) => ({
    document_type: String(doc.id || "").replace(/-/g, "_"),
    document_name: doc.name,
    mandatory: Boolean(doc.mandatory),
    status: missingIds.has(doc.id) ? "missing" : "available"
  }));
}

export function buildCitizenReport(record, baseUrl) {
  const normalizedBaseUrl = String(baseUrl || "").replace(/\/+$/, "");

  return {
    reference_id: record.id,
    service_type: mapServiceType(record),
    citizen_data: mapCitizenData(record),
    documents: mapDocuments(record),
    pdf_url: `${normalizedBaseUrl}/precheck/${encodeURIComponent(record.id)}/pdf`,
    created_at: record.createdAt
  };
}

export function buildWhatsAppLaunchConfig(baseUrl) {
  const fromNumber = cleanPhoneNumber(process.env.TWILIO_WHATSAPP_FROM || "");
  const launchNumber = cleanPhoneNumber(process.env.WHATSAPP_LAUNCH_NUMBER || fromNumber);
  const isSandbox = toBoolean(process.env.WHATSAPP_IS_SANDBOX, false);
  const startText = String(process.env.WHATSAPP_LAUNCH_TEXT || "START").trim() || "START";
  const encodedText = encodeURIComponent(startText);
  const normalizedBaseUrl = String(baseUrl || "").replace(/\/+$/, "");

  return {
    whatsapp_number: launchNumber,
    start_text: startText,
    is_sandbox: isSandbox,
    deep_link: `https://wa.me/${launchNumber}?text=${encodedText}`,
    fallback_link: `https://api.whatsapp.com/send?phone=${launchNumber}&text=${encodedText}`,
    source: normalizedBaseUrl
  };
}

function writeLabelValueLine(doc, label, value) {
  doc.font("Helvetica-Bold").text(label, { continued: true });
  doc.font("Helvetica").text(` ${value}`);
}

export function sendCitizenReportPdf(record, res) {
  const result = record?.result || {};
  const required = result.requiredDocuments || [];
  const missingMandatoryDocuments = result.missingMandatoryDocuments || [];
  const eligibilityFailures = result.eligibilityFailures || [];
  const missingIds = new Set(missingMandatoryDocuments.map((doc) => doc.id));

  const doc = new PDFDocument({ size: "A4", margin: 40 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=\"${record.id}.pdf\"`);
  doc.pipe(res);

  doc.fontSize(18).font("Helvetica-Bold").text("CSC Citizen Precheck Report");
  doc.moveDown(0.6);

  writeLabelValueLine(doc, "Reference ID:", record.id);
  writeLabelValueLine(doc, "Service Type:", mapServiceType(record));
  writeLabelValueLine(doc, "Status:", result.status || "UNKNOWN");
  writeLabelValueLine(doc, "Created At:", record.createdAt || "");

  doc.moveDown();
  doc.fontSize(14).font("Helvetica-Bold").text("Citizen Data");
  doc.moveDown(0.4);

  const citizenData = mapCitizenData(record);
  Object.entries(citizenData).forEach(([key, value]) => {
    writeLabelValueLine(doc, `${key}:`, value === null ? "-" : String(value));
  });

  doc.moveDown();
  doc.fontSize(14).font("Helvetica-Bold").text("Documents");
  doc.moveDown(0.4);

  if (!required.length) {
    doc.fontSize(11).font("Helvetica").text("No document list available.");
  } else {
    required.forEach((item) => {
      const status = missingIds.has(item.id) ? "missing" : "available";
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(`- ${item.name} | mandatory: ${item.mandatory ? "yes" : "no"} | status: ${status}`);
    });
  }

  doc.moveDown();
  doc.fontSize(14).font("Helvetica-Bold").text("Eligibility Notes");
  doc.moveDown(0.4);

  if (!eligibilityFailures.length) {
    doc.fontSize(11).font("Helvetica").text("- No eligibility issue");
  } else {
    eligibilityFailures.forEach((item) => {
      doc.fontSize(11).font("Helvetica").text(`- ${item}`);
    });
  }

  doc.moveDown();
  doc
    .fontSize(10)
    .font("Helvetica-Oblique")
    .text("This report is a pre-submission advisory output generated from WhatsApp intake.");

  doc.end();
}
