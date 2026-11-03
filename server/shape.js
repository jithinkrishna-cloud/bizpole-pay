// Mapping between database enums and the labels the dashboard shows.
const METHOD_LABEL = {
  CREDIT_CARD: "Credit Card", DEBIT_CARD: "Debit Card", NET_BANKING: "Net Banking", UPI: "UPI", WALLET: "Wallet",
  EMI: "EMI", CARDLESS_EMI: "Cardless EMI", BNPL: "BNPL", QR: "QR", NEFT_RTGS: "NEFT/RTGS", REWARDS: "Rewards", OTHER: "Other",
};
const LABEL_METHOD = Object.fromEntries(Object.entries(METHOD_LABEL).map(([k, v]) => [v, k]));
const methodLabel = (m) => (m ? METHOD_LABEL[m] || m : "—");

// The UI says FAILURE where the schema says FAILED.
const txnStatus = (s) => (s === "FAILED" ? "FAILURE" : s);

const num = (v) => (v == null ? null : Number(v));

module.exports = { METHOD_LABEL, LABEL_METHOD, methodLabel, txnStatus, num };
