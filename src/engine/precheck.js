function matchesCondition(profile, when) {
  if (!when) return true;
  return profile?.[when.field] === when.equals;
}

function evaluateRule(rule, profile, lang) {
  const message = rule.message?.[lang] || rule.message?.en || "Eligibility rule failed.";

  if (rule.type === "minAge") {
    if (Number(profile.age) < Number(rule.value)) return message;
    return null;
  }

  if (rule.type === "maxIncome") {
    if (Number(profile.annualIncome) > Number(rule.value)) return message;
    return null;
  }

  if (rule.type === "allowedCategories") {
    if (!rule.values?.includes(profile.category)) return message;
    return null;
  }

  if (rule.type === "requiredTrue") {
    if (profile?.[rule.field] !== true) return message;
    return null;
  }

  if (rule.type === "allowedValues") {
    if (!rule.values?.includes(profile?.[rule.field])) return message;
    return null;
  }

  return null;
}

export function runPrecheck(service, profile, providedDocumentIds, lang = "en") {
  const requiredDocuments = (service.requiredDocuments || []).filter((doc) =>
    matchesCondition(profile, doc.when)
  );

  const missingMandatoryDocuments = requiredDocuments
    .filter((doc) => doc.mandatory && !providedDocumentIds.includes(doc.id))
    .map((doc) => ({
      id: doc.id,
      name: doc.name?.[lang] || doc.name?.en || doc.id
    }));

  const eligibilityFailures = (service.eligibilityRules || [])
    .filter((rule) => matchesCondition(profile, rule.when))
    .map((rule) => evaluateRule(rule, profile, lang))
    .filter(Boolean);

  let status = "READY";
  if (eligibilityFailures.length > 0) {
    status = "NOT_READY";
  } else if (missingMandatoryDocuments.length > 0) {
    status = "PARTIALLY_READY";
  }

  return {
    status,
    requiredDocuments: requiredDocuments.map((doc) => ({
      id: doc.id,
      name: doc.name?.[lang] || doc.name?.en || doc.id,
      mandatory: Boolean(doc.mandatory)
    })),
    missingMandatoryDocuments,
    eligibilityFailures
  };
}
