import "dotenv/config";

const sid = (process.env.TWILIO_ACCOUNT_SID || "");
console.log("Raw SID:", sid);
console.log("Length:", sid.length);
for (let i = 0; i < sid.length; i++) {
    console.log(`Char ${i}: ${sid[i]} (code: ${sid.charCodeAt(i)})`);
}
