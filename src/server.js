import "dotenv/config";
import express from "express";

import { getPrecheckById, listPrechecks } from "./store/prechecks.js";
import {
  buildCitizenReport,
  buildWhatsAppLaunchConfig,
  normalizeReferenceId,
  sendCitizenReportPdf
} from "./integration/cscCopilot.js";
import { handleIncomingText, startNewSession } from "./whatsapp/flow.js";
import { sendTextMessage } from "./whatsapp/send.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;
const PROVIDER = (process.env.WHATSAPP_PROVIDER || "meta").toLowerCase();
const BOT_DISPLAY_NAME = (process.env.BOT_DISPLAY_NAME || "CSC Sahayak AI").trim();
const twilioDebugState = {
  hitCount: 0,
  lastHit: null
};

function escapeXml(input = "") {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function addBranding(text = "") {
  const content = String(text || "").trim();
  if (!BOT_DISPLAY_NAME) return content;
  if (!content) return BOT_DISPLAY_NAME;
  if (content.startsWith(BOT_DISPLAY_NAME)) return content;
  return `${BOT_DISPLAY_NAME}\n\n${content}`;
}

function getRequestBaseUrl(req) {
  const forwardedProtoRaw = req.headers["x-forwarded-proto"];
  const forwardedHostRaw = req.headers["x-forwarded-host"];

  const forwardedProto = Array.isArray(forwardedProtoRaw)
    ? forwardedProtoRaw[0]
    : String(forwardedProtoRaw || "").split(",")[0].trim();

  const forwardedHost = Array.isArray(forwardedHostRaw)
    ? forwardedHostRaw[0]
    : String(forwardedHostRaw || "").split(",")[0].trim();

  const protocol = forwardedProto || req.protocol || "http";
  const host = forwardedHost || req.get("host");

  if (!host) {
    return (process.env.APP_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
  }

  return `${protocol}://${host}`.replace(/\/+$/, "");
}

function requireCscBearer(req, res, next) {
  const expectedToken = (process.env.CSC_API_BEARER_TOKEN || "").trim();

  if (!expectedToken) {
    return next();
  }

  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (token !== expectedToken) {
    return res.status(401).json({
      ok: false,
      message: "Unauthorized"
    });
  }

  return next();
}

function escapeHtml(input = "") {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(dateText) {
  try {
    return new Date(dateText).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return dateText;
  }
}

function formatProfileLabel(key) {
  const labelMap = {
    applicantType: "Applicant Type",
    annualIncome: "Annual Family Income",
    category: "Category",
    certificatePurpose: "Certificate Purpose",
    correctionType: "Correction Requested",
    districtName: "District",
    hasFamilyCertificateHistory: "Family SC/ST Certificate History",
    hasRecentMutation: "Recent Mutation or Transfer",
    isGeneralCategory: "Belongs to General Category",
    isPermanentResident: "Permanent Resident of State",
    landApplicantRole: "Relation to Land",
    landVillage: "Land Village or Locality",
    stateName: "State",
    yearsAtAddress: "Years at Current Address"
  };

  if (labelMap[key]) {
    return labelMap[key];
  }

  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (value) => value.toUpperCase())
    .trim();
}

function formatProfileValue(key, value) {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (key === "annualIncome") {
    return `Rs ${Number(value).toLocaleString("en-IN")}`;
  }

  const valueMap = {
    applicantType: {
      adult: "Adult applicant",
      minor: "Minor child"
    },
    category: {
      sc: "SC",
      st: "ST",
      obc: "OBC",
      general: "General",
      ews: "EWS"
    },
    certificatePurpose: {
      scholarship: "Scholarship",
      admission: "Admission",
      "government-scheme": "Government scheme",
      other: "Other"
    },
    correctionType: {
      name: "Name correction",
      "date-of-birth": "Date of birth correction",
      gender: "Gender correction",
      "parent-name": "Parent name correction",
      address: "Address correction"
    },
    landApplicantRole: {
      owner: "Land owner",
      authorized: "Authorized applicant",
      other: "Other / unsure"
    }
  };

  return valueMap[key]?.[value] || String(value);
}

function getStatusBadge(record) {
  const status = record?.result?.status || "UNKNOWN";
  if (status === "READY") return { label: "Ready", color: "#1f7a4d", bg: "#e8fff2" };
  if (status === "PARTIALLY_READY") return { label: "Partially Ready", color: "#8a5b00", bg: "#fff7e6" };
  return { label: "Not Ready", color: "#9c2f2f", bg: "#ffecec" };
}

function renderPrecheckView(record) {
  const badge = getStatusBadge(record);
  const requiredDocs = record.result.requiredDocuments || [];
  const missingDocs = record.result.missingMandatoryDocuments || [];
  const providedDocs = requiredDocs.filter((doc) => !missingDocs.some((missing) => missing.id === doc.id));
  const eligibilityFailures = record.result.eligibilityFailures || [];
  const profileEntries = Object.entries(record.profile || {}).filter(([, value]) => value !== undefined && value !== null && value !== "");
  const allDocs = requiredDocs.map((doc) => {
    const isMissing = missingDocs.some((missing) => missing.id === doc.id);
    return {
      name: doc.name,
      status: isMissing ? "Missing" : "Available",
      tone: isMissing ? "missing" : "available",
      mandatory: doc.mandatory
    };
  });

  const listItems = (items, emptyText) =>
    items.length
      ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : `<p class="empty">${escapeHtml(emptyText)}</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(BOT_DISPLAY_NAME)} - ${escapeHtml(record.id)}</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #1d2d44;
        --muted: #5d6b7a;
        --line: #cfd8e3;
        --paper: #f5f7fa;
        --card: #ffffff;
        --accent: #0d5c7a;
        --accent-deep: #133b5c;
        --gov-saffron: #e28c28;
        --gov-green: #3c8d51;
        --seal: #e8eff6;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Noto Serif", Georgia, "Segoe UI", serif;
        background: linear-gradient(180deg, #eef4f8 0%, #f8fafc 100%);
        color: var(--ink);
      }
      .wrap {
        max-width: 1040px;
        margin: 24px auto;
        padding: 0 16px 40px;
      }
      .sheet {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 18px;
        box-shadow: 0 20px 60px rgba(14, 32, 54, 0.08);
        overflow: hidden;
        position: relative;
      }
      .sheet::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background-image: radial-gradient(circle at center, rgba(19,59,92,.035) 0, rgba(19,59,92,.035) 120px, transparent 121px);
        background-repeat: no-repeat;
        background-position: center 210px;
      }
      .tricolor {
        height: 10px;
        background: linear-gradient(90deg, var(--gov-saffron) 0 33.33%, #f4f4f4 33.33% 66.66%, var(--gov-green) 66.66% 100%);
      }
      .hero {
        padding: 24px 28px 20px;
        background: linear-gradient(180deg, #f7fbff 0%, #ffffff 100%);
        border-bottom: 1px solid var(--line);
        position: relative;
      }
      .hero-grid {
        display: grid;
        grid-template-columns: 90px 1fr auto;
        gap: 16px;
        align-items: center;
      }
      .seal {
        width: 76px;
        height: 76px;
        border-radius: 50%;
        background: linear-gradient(180deg, #f7fbff, var(--seal));
        border: 1px solid #bdd0df;
        display: grid;
        place-items: center;
        color: var(--accent-deep);
        font-size: 11px;
        text-align: center;
        line-height: 1.2;
        font-weight: 700;
      }
      .eyebrow {
        margin: 0 0 8px;
        color: var(--accent-deep);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 31px;
        line-height: 1.15;
      }
      .subhead {
        margin: 0;
        color: var(--muted);
        font-size: 15px;
      }
      .refbox {
        min-width: 220px;
        border: 1px solid var(--line);
        background: #fbfdff;
        border-radius: 14px;
        padding: 14px 16px;
      }
      .refbox strong {
        display: block;
        font-size: 18px;
        margin-top: 4px;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        color: var(--muted);
        font-size: 14px;
      }
      .badge {
        display: inline-flex;
        padding: 8px 12px;
        border-radius: 999px;
        font-weight: 700;
        background: ${badge.bg};
        color: ${badge.color};
      }
      .grid {
        display: grid;
        grid-template-columns: 1.15fr .85fr;
        gap: 18px;
        padding: 24px 28px 28px;
      }
      .stack {
        display: grid;
        gap: 18px;
      }
      .card {
        background: var(--paper);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 18px;
      }
      .card h2 {
        margin: 0 0 12px;
        font-size: 18px;
        color: var(--accent-deep);
      }
      .card-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }
      .section-note {
        color: var(--muted);
        font-size: 13px;
      }
      ul { margin: 0; padding-left: 20px; }
      li { margin: 7px 0; }
      .empty {
        margin: 0;
        color: var(--muted);
      }
      .kv {
        display: grid;
        grid-template-columns: 170px 1fr;
        gap: 8px 12px;
        font-size: 15px;
      }
      .kv dt {
        font-weight: 700;
      }
      .doc-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      .doc-table th,
      .doc-table td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--line);
        vertical-align: top;
      }
      .doc-table th {
        text-align: left;
        color: var(--muted);
        font-weight: 700;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: .08em;
      }
      .status-chip {
        display: inline-flex;
        border-radius: 999px;
        padding: 5px 10px;
        font-size: 12px;
        font-weight: 700;
      }
      .status-chip.available {
        background: #eaf7ef;
        color: #23633a;
      }
      .status-chip.missing {
        background: #fff0f0;
        color: #9c2f2f;
      }
      .official-note {
        margin: 0 28px 24px;
        padding: 14px 16px;
        border: 1px dashed #b9c9d8;
        border-radius: 14px;
        background: #fcfdff;
        color: var(--muted);
        font-size: 13px;
      }
      .toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 0 28px 24px;
      }
      .link {
        color: var(--accent);
        text-decoration: none;
        font-weight: 700;
      }
      button {
        border: 0;
        background: var(--accent);
        color: white;
        border-radius: 999px;
        padding: 10px 16px;
        font: inherit;
        cursor: pointer;
      }
      @media (max-width: 820px) {
        .hero-grid,
        .grid {
          grid-template-columns: 1fr;
        }
        .refbox {
          min-width: 0;
        }
      }
      @media print {
        body { background: white; }
        .wrap { margin: 0; max-width: none; padding: 0; }
        .sheet { box-shadow: none; border-radius: 0; }
        .toolbar { display: none; }
        .official-note { border-style: solid; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="sheet">
        <div class="tricolor"></div>
        <div class="hero">
          <div class="hero-grid">
            <div class="seal">Citizen<br/>Service<br/>Assist</div>
            <div>
              <p class="eyebrow">Digitally Assisted Service Readiness Summary</p>
              <h1>${escapeHtml(record.serviceName || record.serviceId || "Precheck Summary")}</h1>
              <p class="subhead">Generated by ${escapeHtml(BOT_DISPLAY_NAME)} for citizen-facing document preparedness before service submission.</p>
              <div class="meta">
                <span class="badge">${escapeHtml(badge.label)}</span>
                <span>Created: ${escapeHtml(formatDate(record.createdAt))}</span>
              </div>
            </div>
            <div class="refbox">
              <div class="section-note">Reference ID</div>
              <strong>${escapeHtml(record.id)}</strong>
              <div class="section-note" style="margin-top:10px;">Use this ID at CSC/operator desk for instant lookup.</div>
            </div>
          </div>
        </div>
        <div class="grid">
          <div class="stack">
            <section class="card">
              <div class="card-head">
                <h2>Applicant Profile</h2>
                <span class="section-note">Captured from WhatsApp intake</span>
              </div>
              ${profileEntries.length ? `<dl class="kv">${profileEntries.map(([key, value]) => `<dt>${escapeHtml(formatProfileLabel(key))}</dt><dd>${escapeHtml(formatProfileValue(key, value))}</dd>`).join("")}</dl>` : `<p class="empty">No profile details saved.</p>`}
            </section>
            <section class="card">
              <div class="card-head">
                <h2>Document Checklist</h2>
                <span class="section-note">Mandatory and selected document review</span>
              </div>
              <table class="doc-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Requirement</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${allDocs.map((doc) => `<tr><td>${escapeHtml(doc.name)}</td><td>${doc.mandatory ? "Mandatory" : "Optional"}</td><td><span class="status-chip ${doc.tone}">${doc.status}</span></td></tr>`).join("")}
                </tbody>
              </table>
            </section>
          </div>
          <div class="stack">
            <section class="card">
              <div class="card-head">
                <h2>Available Documents</h2>
                <span class="section-note">Ready for submission support</span>
              </div>
              ${listItems(providedDocs.map((doc) => doc.name), "No provided documents were selected.")}
            </section>
            <section class="card">
              <div class="card-head">
                <h2>Missing Mandatory Documents</h2>
                <span class="section-note">These should be brought before visiting CSC</span>
              </div>
              ${listItems(missingDocs.map((doc) => doc.name), "No mandatory documents are missing.")}
            </section>
            <section class="card">
              <div class="card-head">
                <h2>Eligibility Notes</h2>
                <span class="section-note">Rule-based precheck observations</span>
              </div>
              ${listItems(eligibilityFailures, "No eligibility issue was detected.")}
            </section>
          </div>
        </div>
        <div class="official-note">
          This document is a pre-submission readiness summary generated for service facilitation. Final verification remains subject to operator review and department rules at the time of official application filing.
        </div>
        <div class="toolbar">
          <a class="link" href="/prechecks/view">View all generated summaries</a>
          <button onclick="window.print()">Print / Save PDF</button>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function renderPrecheckList(records) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(BOT_DISPLAY_NAME)} - Generated Documents</title>
    <style>
      body { font-family: "Segoe UI", sans-serif; margin: 0; background: linear-gradient(180deg, #eef4f8, #f9fbfc); color: #17324d; }
      .wrap { max-width: 980px; margin: 28px auto; padding: 0 16px 40px; }
      .head { margin-bottom: 20px; background: white; border: 1px solid #d7e1ea; border-radius: 18px; padding: 22px; box-shadow: 0 12px 30px rgba(17,35,56,.06); }
      h1 { margin: 0 0 8px; }
      .list { display: grid; gap: 14px; }
      .card { background: white; border: 1px solid #d7e1ea; border-radius: 16px; padding: 18px; box-shadow: 0 12px 30px rgba(17,35,56,.06); }
      .row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; align-items: center; }
      .muted { color: #5d6b7a; }
      .link { color: #0e7490; text-decoration: none; font-weight: 700; }
      .strip { height: 8px; border-radius: 999px; background: linear-gradient(90deg, #e28c28 0 33.33%, #f4f4f4 33.33% 66.66%, #3c8d51 66.66% 100%); margin-bottom: 14px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="head">
        <div class="strip"></div>
        <h1>${escapeHtml(BOT_DISPLAY_NAME)} Generated Documents</h1>
        <p class="muted">Each completed WhatsApp intake generates a separate document-style summary with its own Reference ID for operator lookup and citizen readiness review.</p>
      </div>
      <div class="list">
        ${records.length ? records.map((record) => `<div class="card"><div class="row"><div><strong>${escapeHtml(record.serviceName || record.serviceId)}</strong><div class="muted">Reference ID: ${escapeHtml(record.id)} · ${escapeHtml(formatDate(record.createdAt))}</div></div><a class="link" href="/precheck/${encodeURIComponent(record.id)}/view">Open document</a></div></div>`).join("") : `<div class="card"><p class="muted">No completed prechecks yet.</p></div>`}
      </div>
    </div>
  </body>
</html>`;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "whatsapp-precheck-bot" });
});

app.get("/", (req, res) => {
  const baseUrl = getRequestBaseUrl(req);
  return res.type("text/html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(BOT_DISPLAY_NAME)}</title>
    <style>
      body { margin: 0; font-family: "Segoe UI", sans-serif; background: #f7fafc; color: #1a202c; }
      .wrap { max-width: 760px; margin: 40px auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 24px; }
      h1 { margin: 0 0 8px; font-size: 1.4rem; }
      p { margin: 0 0 14px; color: #4a5568; }
      ul { margin: 0; padding-left: 20px; }
      li { margin: 8px 0; }
      a { color: #0b7285; text-decoration: none; font-weight: 600; }
    </style>
  </head>
  <body>
    <main class="wrap">
      <h1>${escapeHtml(BOT_DISPLAY_NAME)} API is running</h1>
      <p>This service is deployed successfully. Use these endpoints:</p>
      <ul>
        <li><a href="${escapeHtml(baseUrl)}/health">/health</a></li>
        <li><a href="${escapeHtml(baseUrl)}/prechecks/view">/prechecks/view</a></li>
        <li><a href="${escapeHtml(baseUrl)}/debug/twilio-last-hit">/debug/twilio-last-hit</a></li>
      </ul>
    </main>
  </body>
</html>`);
});

app.get("/public/whatsapp-launch-config", (req, res) => {
  return res.json(buildWhatsAppLaunchConfig(getRequestBaseUrl(req)));
});

app.get("/webhook", (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text?.body;

    if (!from) {
      return res.sendStatus(200);
    }

    let reply;
    if (!text) {
      reply = "Please send text to continue. Type START.";
    } else {
      reply = handleIncomingText(from, text, { baseUrl: getRequestBaseUrl(req) });
    }

    reply = addBranding(reply);

    await sendTextMessage(from, reply);
    return res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error?.response?.data || error.message);
    return res.sendStatus(200);
  }
});

app.all("/twilio/webhook", async (req, res) => {
  try {
    const payload = req.method === "GET" ? req.query : req.body;
    const from = payload?.From || payload?.from;
    const text = payload?.Body || payload?.body;

    twilioDebugState.hitCount += 1;
    twilioDebugState.lastHit = {
      at: new Date().toISOString(),
      method: req.method,
      from: from || null,
      body: text || null,
      userAgent: req.headers["user-agent"] || null
    };

    if (!from) {
      return res.type("text/xml").send("<Response></Response>");
    }

    let reply;
    if (!text) {
      reply = "Please send text to continue. Type START.";
    } else {
      reply = handleIncomingText(from, text, { baseUrl: getRequestBaseUrl(req) });
    }

    reply = addBranding(reply);

    const twiml = `<Response><Message>${escapeXml(reply)}</Message></Response>`;
    return res.type("text/xml").send(twiml);
  } catch (error) {
    console.error("Twilio webhook error:", error?.response?.data || error.message);
    return res.type("text/xml").send("<Response></Response>");
  }
});

app.get("/debug/twilio-last-hit", (_req, res) => {
  return res.json({
    ok: true,
    ...twilioDebugState
  });
});

app.get("/start/:phone", async (req, res) => {
  try {
    const phone = req.params.phone;
    const intro = addBranding(startNewSession(phone));
    await sendTextMessage(phone, intro);
    return res.json({ ok: true, phone, message: "Start message sent." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get("/citizen-report/:referenceId", requireCscBearer, (req, res) => {
  const referenceId = normalizeReferenceId(req.params.referenceId);
  const record = getPrecheckById(referenceId);

  if (!record) {
    return res.status(404).json({
      ok: false,
      message: "Reference ID not found"
    });
  }

  return res.json(buildCitizenReport(record, getRequestBaseUrl(req)));
});

app.post("/citizen-report/lookup", requireCscBearer, (req, res) => {
  const referenceId = normalizeReferenceId(req.body?.reference_id || "");

  if (!referenceId) {
    return res.status(400).json({
      ok: false,
      message: "reference_id is required"
    });
  }

  const record = getPrecheckById(referenceId);
  if (!record) {
    return res.status(404).json({
      ok: false,
      message: "Reference ID not found"
    });
  }

  return res.json(buildCitizenReport(record, getRequestBaseUrl(req)));
});

app.get("/precheck/:id", (req, res) => {
  const record = getPrecheckById(normalizeReferenceId(req.params.id));
  if (!record) {
    return res.status(404).json({ ok: false, message: "Precheck not found." });
  }
  return res.json({ ok: true, data: record });
});

app.get("/precheck/:id/pdf", (req, res) => {
  const record = getPrecheckById(normalizeReferenceId(req.params.id));

  if (!record) {
    return res.status(404).json({
      ok: false,
      message: "Reference ID not found"
    });
  }

  return sendCitizenReportPdf(record, res);
});

app.get("/precheck/:id/view", (req, res) => {
  const record = getPrecheckById(normalizeReferenceId(req.params.id));
  if (!record) {
    return res.status(404).type("text/html").send("<h1>Precheck not found</h1>");
  }
  return res.type("text/html").send(renderPrecheckView(record));
});

app.get("/prechecks", (_req, res) => {
  return res.json({ ok: true, data: listPrechecks() });
});

app.get("/prechecks/view", (_req, res) => {
  return res.type("text/html").send(renderPrecheckList(listPrechecks()));
});

app.listen(PORT, () => {
  console.log(`whatsapp-precheck-bot running on http://localhost:${PORT}`);
  console.log(`whatsapp provider mode: ${PROVIDER}`);
});
