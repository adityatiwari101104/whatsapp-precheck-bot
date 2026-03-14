import axios from "axios";

const GRAPH_API_VERSION = "v21.0";

function getProvider() {
  return (process.env.WHATSAPP_PROVIDER || "meta").toLowerCase();
}

function normalizeTwilioAddress(to) {
  const cleaned = String(to || "").trim();
  if (cleaned.startsWith("whatsapp:")) {
    return cleaned;
  }
  return `whatsapp:${cleaned}`;
}

async function sendViaMeta(to, body) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error("Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID.");
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body
      }
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    }
  );
}

async function sendViaTwilio(to, body) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !from) {
    throw new Error("Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_WHATSAPP_FROM.");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const payload = new URLSearchParams({
    To: normalizeTwilioAddress(to),
    From: normalizeTwilioAddress(from),
    Body: body
  });

  await axios.post(url, payload, {
    auth: {
      username: accountSid,
      password: authToken
    },
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });
}

export async function sendTextMessage(to, body) {
  const provider = getProvider();

  if (provider === "twilio") {
    return sendViaTwilio(to, body);
  }

  return sendViaMeta(to, body);
}
