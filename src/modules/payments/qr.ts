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

function requirePublicHttpsUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname.toLowerCase() === "localhost") {
    throw new Error("Public payment QR must contain an absolute HTTPS URL.");
  }
  return url.toString();
}

export async function paymentQrPng(publicPaymentUrl: string): Promise<Buffer> {
  return QRCode.toBuffer(requirePublicHttpsUrl(publicPaymentUrl), {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 420,
  });
}

export async function paymentQrDataUrl(publicPaymentUrl: string): Promise<string> {
  return QRCode.toDataURL(requirePublicHttpsUrl(publicPaymentUrl), {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 420,
  });
}
