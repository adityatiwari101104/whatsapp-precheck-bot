import "dotenv/config";
import axios from "axios";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_WHATSAPP_FROM;
const to = process.argv[2]; // Get recipient phone from command line

if (!accountSid || !authToken || !from) {
  console.error("❌ Missing environment variables in .env:");
  if (!accountSid) console.error("   - TWILIO_ACCOUNT_SID");
  if (!authToken) console.error("   - TWILIO_AUTH_TOKEN");
  if (!from) console.error("   - TWILIO_WHATSAPP_FROM");
  process.exit(1);
}

if (!to) {
  console.error("❌ Usage: node test-twilio.js <your-phone-number-with-country-code>");
  console.log("Example: node test-twilio.js +919876543210");
  process.exit(1);
}

async function testTwilio() {
  console.log(`Testing Twilio account: [${accountSid}]`);
  console.log(`Using Auth Token: [${authToken ? authToken.substring(0, 4) + '...' : 'MISSING'}]`);
  
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const payload = new URLSearchParams({
    To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
    From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
    Body: "Hello! This is a test message from your CSC Sahayak bot verification script."
  });

  try {
    const response = await axios.post(url, payload, {
      auth: {
        username: accountSid,
        password: authToken
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    console.log("✅ Success! Message sent.");
    console.log("Response SID:", response.data.sid);
  } catch (error) {
    console.error("❌ Failed to send message.");
    if (error.response) {
      console.error(`Status: ${error.response.status} ${error.response.statusText}`);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 401) {
        console.error("\n💡 TIP: 401 Unauthorized usually means the Auth Token is incorrect or the Account SID doesn't match the Token.");
      }
    } else {
      console.error("Error:", error.message);
    }
    process.exit(1);
  }
}

testTwilio();
