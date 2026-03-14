import { SERVICES, getServiceById } from "../config/services.js";
import { runPrecheck } from "../engine/precheck.js";
import {
  getSession,
  setSession,
  clearSession,
  savePrecheck
} from "../store/prechecks.js";

function normalize(text) {
  return (text || "").trim().toLowerCase();
}

function isHindiChoice(text) {
  const t = normalize(text);
  return t === "1" || t.includes("hindi") || t.includes("हिंदी");
}

function isEnglishChoice(text) {
  const t = normalize(text);
  return t === "2" || t.includes("english");
}

function parseNumber(text) {
  const n = Number((text || "").trim());
  return Number.isFinite(n) ? n : null;
}

function parseCommaSelections(text) {
  return (text || "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function resolveBaseUrl(baseUrl) {
  const chosen = (baseUrl || process.env.APP_BASE_URL || "http://localhost:3000").trim();
  return chosen.replace(/\/+$/, "");
}

function buildServiceList(lang) {
  return SERVICES.map((service, index) => {
    const label = lang === "hi" ? service.name.hi : service.name.en;
    return `${index + 1}. ${label}`;
  }).join("\n");
}

function getStatusText(status, lang) {
  if (lang === "hi") {
    if (status === "READY") return "तैयार";
    if (status === "PARTIALLY_READY") return "आंशिक रूप से तैयार";
    return "अभी तैयार नहीं";
  }
  if (status === "READY") return "Ready";
  if (status === "PARTIALLY_READY") return "Partially Ready";
  return "Not Ready";
}

function introMessage() {
  return "Welcome to CSC Home Pre-Check.\nSelect language:\n1. Hindi\n2. English";
}

function introMessageHi() {
  return "CSC Home Pre-Check में आपका स्वागत है।\nभाषा चुनें:\n1. हिंदी\n2. English";
}

function matchesCondition(profile, when) {
  if (!when) return true;
  return profile?.[when.field] === when.equals;
}

function hasAnswer(profile, field) {
  return Object.prototype.hasOwnProperty.call(profile || {}, field);
}

function getActiveQuestions(service, profile) {
  return (service?.precheckQuestions || []).filter((question) =>
    matchesCondition(profile, question.when)
  );
}

function getNextQuestion(service, profile) {
  return getActiveQuestions(service, profile).find((question) =>
    !hasAnswer(profile, question.field)
  ) || null;
}

function formatChoiceOptions(question, lang) {
  return (question.options || [])
    .map((option, index) => {
      const label = option.label?.[lang] || option.label?.en || option.value;
      return `${index + 1}. ${label}`;
    })
    .join("\n");
}

function formatQuestion(question, lang) {
  const prompt = question.prompt?.[lang] || question.prompt?.en || "Send your answer.";

  if (question.type === "choice") {
    return `${prompt}\n${formatChoiceOptions(question, lang)}`;
  }

  return prompt;
}

function parseYesNo(text) {
  const value = normalize(text);
  const yesValues = ["1", "yes", "y", "haan", "han", "ha", "हाँ", "हां"];
  const noValues = ["2", "no", "n", "nahi", "nahin", "नहीं", "नही"];

  if (yesValues.includes(value)) return true;
  if (noValues.includes(value)) return false;
  return null;
}

function parseChoiceAnswer(question, text) {
  const numericChoice = parseNumber(text);
  if (numericChoice && question.options?.[numericChoice - 1]) {
    return question.options[numericChoice - 1].value;
  }

  const value = normalize(text);
  const matched = (question.options || []).find((option) => {
    const labels = [
      option.value,
      option.label?.en,
      option.label?.hi,
      ...(option.aliases || [])
    ]
      .filter(Boolean)
      .map((item) => normalize(item));

    return labels.includes(value);
  });

  return matched?.value || null;
}

function parseQuestionAnswer(question, text, lang) {
  if (question.type === "text") {
    const value = (text || "").trim();
    if (!value) {
      return {
        ok: false,
        error: lang === "hi"
          ? "कृपया उत्तर टेक्स्ट में भेजें।"
          : "Please send your answer in text."
      };
    }

    return { ok: true, value };
  }

  if (question.type === "number") {
    const value = parseNumber(text);
    const min = question.min ?? Number.NEGATIVE_INFINITY;
    const max = question.max ?? Number.POSITIVE_INFINITY;

    if (value === null || value < min || value > max) {
      return {
        ok: false,
        error: lang === "hi"
          ? "कृपया सही संख्या भेजें।"
          : "Please send a valid number."
      };
    }

    return { ok: true, value };
  }

  if (question.type === "yesno") {
    const value = parseYesNo(text);
    if (value === null) {
      return {
        ok: false,
        error: lang === "hi"
          ? "कृपया 1 या 2 भेजें।"
          : "Please send 1 or 2."
      };
    }

    return { ok: true, value };
  }

  if (question.type === "choice") {
    const value = parseChoiceAnswer(question, text);
    if (!value) {
      return {
        ok: false,
        error: lang === "hi"
          ? "कृपया सूची में से सही विकल्प भेजें।"
          : "Please send a valid option from the list."
      };
    }

    return { ok: true, value };
  }

  return {
    ok: false,
    error: lang === "hi" ? "उत्तर समझ नहीं आया।" : "Could not understand the answer."
  };
}

function buildDocumentPrompt(service, session) {
  const docs = (service?.requiredDocuments || []).filter((doc) => {
    if (!doc.when) return true;
    return session.profile[doc.when.field] === doc.when.equals;
  });

  const docList = docs
    .map((doc, index) => {
      const name = session.lang === "hi" ? doc.name.hi : doc.name.en;
      const marker = doc.mandatory
        ? session.lang === "hi"
          ? "अनिवार्य"
          : "Mandatory"
        : session.lang === "hi"
          ? "वैकल्पिक"
          : "Optional";
      return `${index + 1}. ${name} (${marker})`;
    })
    .join("\n");

  return session.lang === "hi"
    ? `आपके उत्तरों के आधार पर आवश्यक दस्तावेज़:\n${docList}\n\nजो दस्तावेज़ आपके पास हैं उनके नंबर कॉमा से भेजें।\nउदाहरण: 1,2,4`
    : `Required documents based on your answers:\n${docList}\n\nSend document numbers you already have, separated by comma.\nExample: 1,2,4`;
}

export function startNewSession(phone) {
  const session = {
    step: "LANGUAGE",
    lang: "en",
    serviceId: null,
    profile: {},
    providedDocumentIds: []
  };
  setSession(phone, session);
  return introMessage();
}

export function handleIncomingText(phone, text, context = {}) {
  const userText = (text || "").trim();
  const lower = normalize(userText);

  if (["reset", "restart", "start", "hi", "hello", "नमस्ते"].includes(lower)) {
    return startNewSession(phone);
  }

  let session = getSession(phone);
  if (!session) {
    return startNewSession(phone);
  }

  if (session.step === "LANGUAGE") {
    if (isHindiChoice(userText)) {
      session.lang = "hi";
      session.step = "SERVICE";
      setSession(phone, session);
      return `सेवा चुनें:\n${buildServiceList("hi")}\n\nउदाहरण: 1`;
    }

    if (isEnglishChoice(userText)) {
      session.lang = "en";
      session.step = "SERVICE";
      setSession(phone, session);
      return `Choose a service:\n${buildServiceList("en")}\n\nExample: 1`;
    }

    return introMessageHi();
  }

  if (session.step === "SERVICE") {
    const idx = parseNumber(userText);
    if (!idx || idx < 1 || idx > SERVICES.length) {
      return session.lang === "hi"
        ? `कृपया सही सेवा संख्या भेजें।\n${buildServiceList("hi")}`
        : `Please send a valid service number.\n${buildServiceList("en")}`;
    }

    session.serviceId = SERVICES[idx - 1].id;
  session.profile = { stateName: "Chhattisgarh" };

    const service = getServiceById(session.serviceId);
    const nextQuestion = getNextQuestion(service, session.profile);

    if (nextQuestion) {
      session.step = "QUESTIONS";
      setSession(phone, session);
      return formatQuestion(nextQuestion, session.lang);
    }

    session.step = "DOCS";
    setSession(phone, session);
    return buildDocumentPrompt(service, session);
  }

  if (session.step === "QUESTIONS") {
    const service = getServiceById(session.serviceId);
    if (!service) {
      clearSession(phone);
      return session.lang === "hi"
        ? "सत्र समाप्त हो गया। कृपया START भेजें।"
        : "Session expired. Please send START again.";
    }

    const currentQuestion = getNextQuestion(service, session.profile);
    if (!currentQuestion) {
      session.step = "DOCS";
      setSession(phone, session);
      return buildDocumentPrompt(service, session);
    }

    const parsed = parseQuestionAnswer(currentQuestion, userText, session.lang);
    if (!parsed.ok) {
      return `${parsed.error}\n\n${formatQuestion(currentQuestion, session.lang)}`;
    }

    session.profile[currentQuestion.field] = parsed.value;

    const nextQuestion = getNextQuestion(service, session.profile);
    if (nextQuestion) {
      setSession(phone, session);
      return formatQuestion(nextQuestion, session.lang);
    }

    session.step = "DOCS";
    setSession(phone, session);
    return buildDocumentPrompt(service, session);
  }

  if (session.step === "DOCS") {
    const service = getServiceById(session.serviceId);
    if (!service) {
      clearSession(phone);
      return "Session expired. Please send START again.";
    }

    const docs = (service.requiredDocuments || []).filter((doc) => {
      if (!doc.when) return true;
      return session.profile[doc.when.field] === doc.when.equals;
    });

    const selections = parseCommaSelections(userText);
    if (!selections.length) {
      return session.lang === "hi"
        ? "कृपया दस्तावेज़ नंबर भेजें। उदाहरण: 1,2,4"
        : "Please send document numbers. Example: 1,2,4";
    }

    const picked = selections
      .map((n) => docs[n - 1])
      .filter(Boolean)
      .map((doc) => doc.id);

    session.providedDocumentIds = [...new Set(picked)];

    const result = runPrecheck(
      service,
      session.profile,
      session.providedDocumentIds,
      session.lang
    );

    const precheckRecord = savePrecheck({
      phone,
      lang: session.lang,
      serviceId: service.id,
      serviceName: session.lang === "hi" ? service.name.hi : service.name.en,
      profile: session.profile,
      providedDocumentIds: session.providedDocumentIds,
      result
    });

    const missing = result.missingMandatoryDocuments.length
      ? result.missingMandatoryDocuments.map((doc) => `- ${doc.name}`).join("\n")
      : session.lang === "hi"
        ? "- कोई अनिवार्य दस्तावेज़ बाकी नहीं"
        : "- No mandatory documents missing";

    const failures = result.eligibilityFailures.length
      ? result.eligibilityFailures.map((item) => `- ${item}`).join("\n")
      : session.lang === "hi"
        ? "- कोई पात्रता समस्या नहीं"
        : "- No eligibility issue";

    const baseUrl = resolveBaseUrl(context.baseUrl);
    const summaryUrl = `${baseUrl}/precheck/${precheckRecord.id}/view`;
    const allSummariesUrl = `${baseUrl}/prechecks/view`;

    clearSession(phone);

    if (session.lang === "hi") {
      return `Pre-Check पूरा हुआ।\nस्थिति: ${getStatusText(result.status, "hi")}\n\nपात्रता जांच:\n${failures}\n\nबचे हुए अनिवार्य दस्तावेज़:\n${missing}\n\nReference ID: ${precheckRecord.id}\nCSC पर यह ID दिखाएं।\nसारांश दस्तावेज़: ${summaryUrl}\nसभी दस्तावेज़: ${allSummariesUrl}`;
    }

    return `Pre-check completed.\nStatus: ${getStatusText(result.status, "en")}\n\nEligibility check:\n${failures}\n\nMissing mandatory documents:\n${missing}\n\nReference ID: ${precheckRecord.id}\nShow this ID at CSC.\nSummary document: ${summaryUrl}\nAll documents: ${allSummariesUrl}`;
  }

  clearSession(phone);
  return "Session reset. Send START to begin again.";
}
