function option(value, en, hi, aliases = []) {
  return {
    value,
    label: { en, hi },
    aliases
  };
}

function textQuestion(field, en, hi) {
  return {
    field,
    type: "text",
    prompt: { en, hi }
  };
}

function numberQuestion(field, en, hi, extra = {}) {
  return {
    field,
    type: "number",
    prompt: { en, hi },
    ...extra
  };
}

function choiceQuestion(field, en, hi, options, extra = {}) {
  return {
    field,
    type: "choice",
    prompt: { en, hi },
    options,
    ...extra
  };
}

function yesNoQuestion(field, en, hi, extra = {}) {
  return {
    field,
    type: "yesno",
    prompt: { en, hi },
    ...extra
  };
}

const COMMON_LOCATION_QUESTIONS = [
  textQuestion("districtName", "Send the district in Chhattisgarh where you are applying.", "छत्तीसगढ़ में जिस जिले में आवेदन कर रहे हैं उसका नाम भेजें।")
];

const APPLICANT_TYPE_OPTIONS = [
  option("adult", "Adult applicant", "वयस्क आवेदक"),
  option("minor", "Minor child", "नाबालिग बच्चा")
];

const GENERAL_CATEGORY_OPTIONS = [
  option("sc", "SC", "SC"),
  option("st", "ST", "ST"),
  option("obc", "OBC", "OBC"),
  option("general", "General", "General"),
  option("ews", "EWS", "EWS")
];

const INCOME_PURPOSE_OPTIONS = [
  option("scholarship", "Scholarship", "स्कॉलरशिप"),
  option("admission", "Admission", "प्रवेश"),
  option("government-scheme", "Government scheme", "सरकारी योजना"),
  option("other", "Other", "अन्य")
];

const SC_ST_OPTIONS = [
  option("sc", "SC", "SC"),
  option("st", "ST", "ST")
];

const OBC_EWS_OPTIONS = [
  option("obc", "OBC", "OBC"),
  option("ews", "EWS", "EWS")
];

const LAND_ROLE_OPTIONS = [
  option("owner", "Land owner", "भूमि स्वामी"),
  option("authorized", "Authorized applicant", "अधिकृत आवेदक"),
  option("other", "Other / unsure", "अन्य / निश्चित नहीं")
];

const CORRECTION_TYPE_OPTIONS = [
  option("name", "Name correction", "नाम सुधार"),
  option("date-of-birth", "Date of birth correction", "जन्मतिथि सुधार"),
  option("gender", "Gender correction", "लिंग सुधार"),
  option("parent-name", "Parent name correction", "माता-पिता का नाम सुधार"),
  option("address", "Address correction", "पता सुधार")
];

export const SERVICES = [
  {
    id: "income-certificate",
    name: {
      en: "Income Certificate",
      hi: "आय प्रमाण पत्र"
    },
    precheckQuestions: [
      ...COMMON_LOCATION_QUESTIONS,
      numberQuestion(
        "annualIncome",
        "Send annual family income in rupees.",
        "वार्षिक पारिवारिक आय रुपये में भेजें।",
        { min: 0 }
      ),
      choiceQuestion(
        "certificatePurpose",
        "Why do you need this certificate?",
        "यह प्रमाण पत्र किस उद्देश्य से चाहिए?",
        INCOME_PURPOSE_OPTIONS
      ),
      choiceQuestion(
        "category",
        "Choose applicant category.",
        "आवेदक की श्रेणी चुनें।",
        GENERAL_CATEGORY_OPTIONS
      )
    ],
    requiredDocuments: [
      { id: "aadhaar", name: { en: "Aadhaar Card", hi: "आधार कार्ड" }, mandatory: true },
      { id: "ration-card", name: { en: "Ration Card", hi: "राशन कार्ड" }, mandatory: true },
      { id: "income-affidavit", name: { en: "Income Affidavit", hi: "आय शपथ पत्र" }, mandatory: true },
      { id: "residence-proof", name: { en: "Residence Proof", hi: "निवास प्रमाण" }, mandatory: true },
      { id: "photo", name: { en: "Passport Photo", hi: "पासपोर्ट फोटो" }, mandatory: true }
    ],
    eligibilityRules: []
  },
  {
    id: "domicile-certificate",
    name: {
      en: "Domicile Certificate",
      hi: "निवास प्रमाण पत्र"
    },
    precheckQuestions: [
      ...COMMON_LOCATION_QUESTIONS,
      yesNoQuestion(
        "isPermanentResident",
        "Are you a permanent resident of this state?\n1. Yes\n2. No",
        "क्या आप इस राज्य के स्थायी निवासी हैं?\n1. हाँ\n2. नहीं"
      ),
      numberQuestion(
        "yearsAtAddress",
        "How many years have you lived at the current address?",
        "आप वर्तमान पते पर कितने वर्षों से रह रहे हैं?",
        { min: 0, max: 100 }
      ),
      choiceQuestion(
        "applicantType",
        "Who is the application for?",
        "आवेदन किसके लिए है?",
        APPLICANT_TYPE_OPTIONS
      )
    ],
    requiredDocuments: [
      { id: "aadhaar", name: { en: "Aadhaar Card", hi: "आधार कार्ड" }, mandatory: true },
      { id: "residence-proof", name: { en: "Residence Proof (Electricity Bill / Water Bill)", hi: "निवास प्रमाण (बिजली बिल / पानी बिल)" }, mandatory: true },
      { id: "ration-or-voter", name: { en: "Ration Card / Voter ID", hi: "राशन कार्ड / वोटर आईडी" }, mandatory: true },
      { id: "school-record", name: { en: "School Record / Birth Proof", hi: "स्कूल रिकॉर्ड / जन्म प्रमाण" }, mandatory: false },
      { id: "photo", name: { en: "Passport Photo", hi: "पासपोर्ट फोटो" }, mandatory: true }
    ],
    eligibilityRules: [
      {
        id: "permanent-resident-required",
        type: "requiredTrue",
        field: "isPermanentResident",
        message: {
          en: "Applicant should be a permanent resident of the selected state for domicile pre-check.",
          hi: "निवास प्रमाण पत्र के प्री-चेक के लिए आवेदक का चयनित राज्य का स्थायी निवासी होना चाहिए।"
        }
      }
    ]
  },
  {
    id: "sc-st-certificate",
    name: {
      en: "SC/ST Certificate",
      hi: "SC/ST प्रमाण पत्र"
    },
    precheckQuestions: [
      ...COMMON_LOCATION_QUESTIONS,
      choiceQuestion(
        "category",
        "Choose applicant category.",
        "आवेदक की श्रेणी चुनें।",
        SC_ST_OPTIONS
      ),
      yesNoQuestion(
        "hasFamilyCertificateHistory",
        "Has any parent or close family member already received an SC/ST certificate?\n1. Yes\n2. No",
        "क्या माता-पिता या करीबी परिवार के किसी सदस्य के पास पहले से SC/ST प्रमाण पत्र है?\n1. हाँ\n2. नहीं"
      )
    ],
    requiredDocuments: [
      { id: "aadhaar", name: { en: "Aadhaar Card", hi: "आधार कार्ड" }, mandatory: true },
      { id: "residence-proof", name: { en: "Residence Proof", hi: "निवास प्रमाण" }, mandatory: true },
      { id: "affidavit", name: { en: "Notarized Affidavit", hi: "नोटरीकृत शपथ पत्र" }, mandatory: true },
      { id: "family-caste-proof", name: { en: "Family Caste Proof (if available)", hi: "परिवार जाति प्रमाण (यदि उपलब्ध)" }, mandatory: false },
      { id: "school-tc", name: { en: "School TC/Record (if available)", hi: "स्कूल टीसी/रिकॉर्ड (यदि उपलब्ध)" }, mandatory: false }
    ],
    eligibilityRules: [
      {
        id: "allowed-category-scst",
        type: "allowedCategories",
        values: ["sc", "st"],
        message: {
          en: "Category must be SC or ST for this certificate.",
          hi: "इस प्रमाण पत्र के लिए वर्ग SC या ST होना चाहिए।"
        }
      }
    ]
  },
  {
    id: "land-use-information",
    name: {
      en: "Land Use Information",
      hi: "भूमि उपयोग जानकारी"
    },
    precheckQuestions: [
      ...COMMON_LOCATION_QUESTIONS,
      textQuestion("landVillage", "Send the village or locality of the land.", "भूमि का गांव या स्थान भेजें।"),
      choiceQuestion(
        "landApplicantRole",
        "What is your relation to this land?",
        "इस भूमि से आपका क्या संबंध है?",
        LAND_ROLE_OPTIONS
      ),
      yesNoQuestion(
        "hasRecentMutation",
        "Was there any recent transfer or mutation in this land?\n1. Yes\n2. No",
        "क्या इस भूमि में हाल ही में कोई हस्तांतरण या नामांतरण हुआ है?\n1. हाँ\n2. नहीं"
      )
    ],
    requiredDocuments: [
      { id: "aadhaar", name: { en: "Aadhaar Card", hi: "आधार कार्ड" }, mandatory: true },
      { id: "land-record", name: { en: "Land Record (Khasra/Khatauni)", hi: "भूमि रिकॉर्ड (खसरा/खतौनी)" }, mandatory: true },
      { id: "ownership-proof", name: { en: "Ownership Proof / Sale Deed", hi: "स्वामित्व प्रमाण / विक्रय विलेख" }, mandatory: true },
      { id: "mutation-record", name: { en: "Mutation Record (if recent transfer)", hi: "नामांतरण रिकॉर्ड (हालिया हस्तांतरण हो तो)" }, mandatory: false },
      { id: "site-map", name: { en: "Site Map / Land Sketch", hi: "साइट मैप / भूमि स्केच" }, mandatory: false }
    ],
    eligibilityRules: [
      {
        id: "allowed-land-applicant-role",
        type: "allowedValues",
        field: "landApplicantRole",
        values: ["owner", "authorized"],
        message: {
          en: "Land use information pre-check should be done by the owner or an authorized applicant.",
          hi: "भूमि उपयोग जानकारी का प्री-चेक भूमि स्वामी या अधिकृत आवेदक द्वारा किया जाना चाहिए।"
        }
      }
    ]
  },
  {
    id: "obc-ews-certificate",
    name: {
      en: "OBC/EWS Certificate",
      hi: "OBC/EWS प्रमाण पत्र"
    },
    precheckQuestions: [
      ...COMMON_LOCATION_QUESTIONS,
      choiceQuestion(
        "category",
        "Choose applicant category.",
        "आवेदक की श्रेणी चुनें।",
        OBC_EWS_OPTIONS
      ),
      numberQuestion(
        "annualIncome",
        "Send annual family income in rupees.",
        "वार्षिक पारिवारिक आय रुपये में भेजें।",
        { min: 0 }
      ),
      yesNoQuestion(
        "isGeneralCategory",
        "For EWS, does the applicant belong to the General category?\n1. Yes\n2. No",
        "EWS के लिए क्या आवेदक General श्रेणी से है?\n1. हाँ\n2. नहीं",
        { when: { field: "category", equals: "ews" } }
      )
    ],
    requiredDocuments: [
      { id: "aadhaar", name: { en: "Aadhaar Card", hi: "आधार कार्ड" }, mandatory: true },
      { id: "residence-proof", name: { en: "Residence Proof", hi: "निवास प्रमाण" }, mandatory: true },
      { id: "income-certificate", name: { en: "Income Certificate", hi: "आय प्रमाण पत्र" }, mandatory: true },
      { id: "affidavit", name: { en: "Notarized Affidavit", hi: "नोटरीकृत शपथ पत्र" }, mandatory: true },
      {
        id: "obc-family-caste-proof",
        name: { en: "Family OBC Proof (for OBC)", hi: "परिवार OBC प्रमाण (OBC हेतु)" },
        mandatory: true,
        when: { field: "category", equals: "obc" }
      },
      {
        id: "ews-declaration",
        name: { en: "EWS Property/Asset Declaration (for EWS)", hi: "EWS संपत्ति/एसेट घोषणा (EWS हेतु)" },
        mandatory: true,
        when: { field: "category", equals: "ews" }
      }
    ],
    eligibilityRules: [
      {
        id: "allowed-category-obcews",
        type: "allowedCategories",
        values: ["obc", "ews"],
        message: {
          en: "Category must be OBC or EWS for this certificate.",
          hi: "इस प्रमाण पत्र के लिए वर्ग OBC या EWS होना चाहिए।"
        }
      },
      {
        id: "obc-max-income",
        type: "maxIncome",
        value: 800000,
        when: { field: "category", equals: "obc" },
        message: {
          en: "For OBC, family income should be less than or equal to Rs 8,00,000.",
          hi: "OBC के लिए पारिवारिक आय 8,00,000 रुपये या उससे कम होनी चाहिए।"
        }
      },
      {
        id: "ews-max-income",
        type: "maxIncome",
        value: 800000,
        when: { field: "category", equals: "ews" },
        message: {
          en: "For EWS, family income should be less than or equal to Rs 8,00,000.",
          hi: "EWS के लिए पारिवारिक आय 8,00,000 रुपये या उससे कम होनी चाहिए।"
        }
      },
      {
        id: "ews-general-category-required",
        type: "requiredTrue",
        field: "isGeneralCategory",
        when: { field: "category", equals: "ews" },
        message: {
          en: "For EWS pre-check, the applicant should belong to the General category.",
          hi: "EWS प्री-चेक के लिए आवेदक का General श्रेणी से होना चाहिए।"
        }
      }
    ]
  },
  {
    id: "birth-certificate-correction",
    name: {
      en: "Birth Certificate Correction",
      hi: "जन्म प्रमाण पत्र सुधार"
    },
    precheckQuestions: [
      ...COMMON_LOCATION_QUESTIONS,
      choiceQuestion(
        "correctionType",
        "What needs to be corrected?",
        "क्या सुधार करवाना है?",
        CORRECTION_TYPE_OPTIONS
      ),
      choiceQuestion(
        "applicantType",
        "Who is the application for?",
        "आवेदन किसके लिए है?",
        APPLICANT_TYPE_OPTIONS
      )
    ],
    requiredDocuments: [
      { id: "existing-birth-cert", name: { en: "Existing Birth Certificate", hi: "मौजूदा जन्म प्रमाण पत्र" }, mandatory: true },
      { id: "supporting-proof", name: { en: "Supporting Proof for Correction", hi: "सुधार हेतु सहायक प्रमाण" }, mandatory: true },
      { id: "parent-id", name: { en: "Parent/Guardian ID Proof", hi: "माता-पिता/अभिभावक पहचान प्रमाण" }, mandatory: true },
      { id: "affidavit", name: { en: "Affidavit for Correction", hi: "सुधार हेतु शपथ पत्र" }, mandatory: true },
      { id: "hospital-school-record", name: { en: "Hospital/School Record (if available)", hi: "अस्पताल/स्कूल रिकॉर्ड (यदि उपलब्ध)" }, mandatory: false }
    ],
    eligibilityRules: []
  }
];

export function getServiceById(serviceId) {
  return SERVICES.find((service) => service.id === serviceId) || null;
}
