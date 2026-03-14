# CSC WhatsApp Pre-Check Bot — Integration Guide

> **Audience:** Backend / Frontend developers working on the CSC AI Copilot platform (`GAURAV-1313/csc`)
> **Bot Base URL (demo):** `https://productions-suse-journal-terms.trycloudflare.com`
> **Bot Local URL:** `http://localhost:3000`

---

## Overview

Citizens complete a WhatsApp-based pre-check conversation with the bot before visiting a CSC centre.
At the end of the flow the bot stores a structured record and issues a **Reference ID** (`PC-XXXXXX`).

The CSC Operator UI uses that Reference ID to pull the citizen's data, pre-fill an application form, and optionally download a PDF summary.

```
Citizen → WhatsApp Bot → stores record → issues PC-XXXXXX
                                               ↓
Operator UI  →  CSC API  →  Bot /citizen-report/:id  →  JSON / PDF
```

---

## Environment Variables (Bot side — `.env`)

| Variable | Example | Description |
|---|---|---|
| `PORT` | `3000` | Express port |
| `APP_BASE_URL` | `https://xxx.trycloudflare.com` | Public URL (used in PDF links) |
| `TWILIO_ACCOUNT_SID` | `ACd5b3…` | Twilio credentials |
| `TWILIO_AUTH_TOKEN` | `e36ac4…` | Twilio credentials |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+19312978613` | Twilio sender number |
| `WHATSAPP_PROVIDER` | `twilio` | Provider switch |
| `WHATSAPP_LAUNCH_NUMBER` | `19312978613` | Number for deep-link (sans +) |
| `WHATSAPP_LAUNCH_TEXT` | `START` | Opening message text |
| `WHATSAPP_IS_SANDBOX` | `false` | `true` in dev/sandbox |
| `CSC_API_BEARER_TOKEN` | `secret123` | Shared secret for protected routes |

---

## Environment Variables (CSC API side — `apps/api/.env`)

```env
BOT_API_BASE_URL=https://productions-suse-journal-terms.trycloudflare.com
BOT_API_TOKEN=secret123
```

---

## Bot API Endpoints

### 1. `GET /public/whatsapp-launch-config`

**Auth:** None (public)

Returns the config the frontend needs to render the "Start on WhatsApp" button.

**Response:**
```json
{
  "whatsapp_number": "19312978613",
  "start_text": "START",
  "is_sandbox": false,
  "deep_link": "https://wa.me/19312978613?text=START",
  "fallback_link": "https://wa.me/19312978613?text=START"
}
```

**Frontend usage:**
```js
const cfg = await fetch(`${BOT_BASE_URL}/public/whatsapp-launch-config`).then(r => r.json());
document.getElementById('wa-btn').onclick = () => window.open(cfg.deep_link, '_blank');
```

---

### 2. `GET /citizen-report/:referenceId`

**Auth:** `Authorization: Bearer <CSC_API_BEARER_TOKEN>`

Fetch citizen pre-check data by Reference ID.

**Request:**
```
GET /citizen-report/PC-0VLTMA
Authorization: Bearer secret123
```

**Response (200):**
```json
{
  "reference_id": "PC-0VLTMA",
  "status": "completed",
  "service_type": "new_pan_card",
  "completed_at": "2025-01-15T10:23:00.000Z",
  "citizen_data": {
    "full_name": "Ramesh Kumar",
    "dob": "1990-01-15",
    "gender": "Male",
    "mobile": "9876543210",
    "email": "ramesh@example.com",
    "address": "123 Main St, Delhi",
    "aadhaar_number": "1234 5678 9012",
    "pan_number": null
  },
  "documents": [
    { "type": "aadhaar", "status": "available", "label": "Aadhaar Card" },
    { "type": "photo", "status": "available", "label": "Passport Photo" },
    { "type": "pan", "status": "missing", "label": "PAN Card" }
  ],
  "pdf_url": "https://xxx.trycloudflare.com/precheck/PC-0VLTMA/pdf",
  "view_url": "https://xxx.trycloudflare.com/precheck/PC-0VLTMA/view"
}
```

**Error responses:**

| Status | Body | Reason |
|---|---|---|
| 401 | `{"error":"Unauthorized"}` | Missing / wrong Bearer token |
| 404 | `{"error":"Not found"}` | Reference ID doesn't exist |

---

### 3. `POST /citizen-report/lookup`

**Auth:** `Authorization: Bearer <CSC_API_BEARER_TOKEN>`

Same as GET above but accepts Reference ID in the request body (useful when ID is in a form).

**Request:**
```json
{ "reference_id": "PC-0VLTMA" }
```

**Response:** identical to `GET /citizen-report/:referenceId`

---

### 4. `GET /precheck/:id/pdf`

**Auth:** None (public, shareable link)

Streams a PDF summary of the citizen's pre-check to the browser.

```
GET /precheck/PC-0VLTMA/pdf
```

**Response headers:**
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="precheck-PC-0VLTMA.pdf"
```

---

## Service Type Mapping

The bot uses kebab-case service IDs internally. The `citizen-report` response maps them to snake_case keys:

| Bot internal ID | CSC `service_type` |
|---|---|
| `new-pan` | `new_pan_card` |
| `correction-pan` | `pan_correction` |
| `income-certificate` | `income_certificate` |
| `caste-certificate` | `caste_certificate` |
| `domicile-certificate` | `domicile_certificate` |
| `obc-certificate` | `obc_certificate` |
| `ews-certificate` | `ews_certificate` |
| `birth-certificate` | `birth_certificate` |
| `death-certificate` | `death_certificate` |
| `voter-id` | `voter_id` |
| `driving-license` | `driving_license` |
| `passport` | `passport` |
| `ration-card` | `ration_card` |
| `ayushman-bharat` | `ayushman_bharat` |
| `pm-kisan` | `pm_kisan` |

---

## CSC API Connector (Phase 4 — to implement)

Create `apps/api/src/modules/whatsapp/botClient.js` in the CSC repo:

```js
import axios from 'axios';

const botApi = axios.create({
  baseURL: process.env.BOT_API_BASE_URL,
  headers: { Authorization: `Bearer ${process.env.BOT_API_TOKEN}` },
  timeout: 10000,
});

export async function getCitizenReport(referenceId) {
  const { data } = await botApi.get(`/citizen-report/${referenceId.toUpperCase()}`);
  return data;
}
```

Then in `apps/api/src/routes/index.js` add:

```js
import { getCitizenReport } from '../modules/whatsapp/botClient.js';

router.get('/whatsapp-report/:referenceId', async (req, res) => {
  try {
    const report = await getCitizenReport(req.params.referenceId);
    res.json(report);
  } catch (err) {
    const status = err.response?.status ?? 500;
    res.status(status).json({ error: err.response?.data?.error ?? 'Bot API error' });
  }
});
```

---

## Frontend Integration (Operator UI)

In the operator dashboard's "Lookup by Reference ID" feature:

```js
async function fetchCitizenReport(referenceId) {
  const res = await fetch(`/api/whatsapp-report/${referenceId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Pre-fill form
const report = await fetchCitizenReport('PC-0VLTMA');
form.setValue('fullName', report.citizen_data.full_name);
form.setValue('dob',      report.citizen_data.dob);
form.setValue('mobile',   report.citizen_data.mobile);
// ... etc
```

---

## Quick Test Commands

```powershell
# Health check
Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing

# Launch config (public)
Invoke-WebRequest -Uri "http://localhost:3000/public/whatsapp-launch-config" -UseBasicParsing

# Citizen report (replace PC-XXXXXX with real ID)
Invoke-WebRequest -Uri "http://localhost:3000/citizen-report/PC-XXXXXX" `
  -Headers @{ Authorization = "Bearer secret123" } -UseBasicParsing

# PDF download
Invoke-WebRequest -Uri "http://localhost:3000/precheck/PC-XXXXXX/pdf" `
  -OutFile "report.pdf" -UseBasicParsing
```

---

## Webhook Configuration (Twilio)

Set the Twilio Sandbox / Phone Number webhook to:

```
https://<your-cloudflare-tunnel-url>/twilio/webhook
```

Method: **HTTP POST**

> The tunnel URL changes each time cloudflared restarts unless you configure a named tunnel.
> Update `APP_BASE_URL` in `.env` and the Twilio webhook URL whenever it changes.

---

## Notes for Demo Day

- Tunnel URL: update `APP_BASE_URL` in `.env` and Twilio webhook after each restart.
- The `CSC_API_BEARER_TOKEN` must match on both bot `.env` and CSC API `.env`.
- Reference IDs are permanent for the lifetime of `data/prechecks.json`.
- PDF links are publicly accessible (no auth) — shareable with citizens.
