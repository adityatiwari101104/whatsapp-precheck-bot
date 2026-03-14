import "dotenv/config";
import axios from "axios";

const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
const authToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();
const from = (process.env.TWILIO_WHATSAPP_FROM || "").trim();
const to = process.argv[2];

console.log("DEBUG: SID Length:", accountSid.length);
console.log("DEBUG: Token Length:", authToken.length);

if (!accountSid || !authToken || !from) {
    console.error("❌ Missing required environment variables.");
    process.exit(1);
}

const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
const payload = new URLSearchParams({
    To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
    From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
    Body: "Hello! This is a test message."
});

async function runTest() {
    try {
        const response = await axios.post(url, payload, {
            auth: { username: accountSid, password: authToken },
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });
        console.log("✅ Success! SID:", response.data.sid);
    } catch (error) {
        console.error("❌ Failed.");
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("Error:", error.message);
        }
    }
}

runTest();
