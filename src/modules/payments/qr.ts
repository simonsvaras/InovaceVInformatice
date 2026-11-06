import QRCode from "qrcode";

function mod97(value: string) {
  let remainder = 0;
  for (const digit of value) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
}

export function domesticAccountToIban(accountNumber: string): string {
  const match = accountNumber.match(/^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/);
  if (!match) {
    throw new Error("Bank account has an invalid domestic format.");
  }
  const [, prefix = "", number, bankCode] = match;
  const bban = `${bankCode}${prefix.padStart(6, "0")}${number.padStart(10, "0")}`;
  const checkDigits = String(98 - mod97(`${bban}123500`)).padStart(2, "0");
  return `CZ${checkDigits}${bban}`;
}

export function formatCzk(amountHalere: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    minimumFractionDigits: 2,
  }).format(amountHalere / 100);
}

export type CzkQrPayment = {
  accountNumber: string;
  amountHalere: number;
  variableSymbol: string;
  message: string;
};

function compactSpaydText(value: string, maxLength: number) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\*/g, "%2A")
    .replace(/[^0-9A-Z $%+\-./:%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function buildSpdPaymentString(payment: CzkQrPayment) {
  if (!Number.isSafeInteger(payment.amountHalere) || payment.amountHalere <= 0) {
    throw new Error("QR payment amount must be a positive integer in halere.");
  }
  if (!/^\d{1,10}$/.test(payment.variableSymbol)) {
    throw new Error("QR payment variable symbol is invalid.");
  }
  const amount = (payment.amountHalere / 100).toFixed(2);
  const message = compactSpaydText(payment.message, 60);
  const fields = [
    `ACC:${domesticAccountToIban(payment.accountNumber)}`,
    `AM:${amount}`,
    "CC:CZK",
    ...(message ? [`MSG:${message}`] : []),
    `X-VS:${payment.variableSymbol}`,
  ];
  return `SPD*1.0*${fields.join("*")}`;
}

export async function paymentQrPng(payment: CzkQrPayment): Promise<Buffer> {
  return QRCode.toBuffer(buildSpdPaymentString(payment), {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 420,
  });
}

export async function paymentQrDataUrl(payment: CzkQrPayment): Promise<string> {
  return QRCode.toDataURL(buildSpdPaymentString(payment), {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 420,
  });
}
