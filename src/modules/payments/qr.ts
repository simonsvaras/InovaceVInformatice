import QRCode from "qrcode";

type PaymentData = {
  accountNumber: string;
  amountHalere: number;
  variableSymbol: string;
  message: string;
};

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

export function buildCzechPaymentDescriptor(data: PaymentData): string {
  const amount = (data.amountHalere / 100).toFixed(2);
  const message = data.message.replace(/\*/g, " ").trim().slice(0, 60);
  return [
    "SPD*1.0",
    `ACC:${domesticAccountToIban(data.accountNumber)}`,
    `AM:${amount}`,
    "CC:CZK",
    `X-VS:${data.variableSymbol}`,
    `MSG:${message}`,
  ].join("*");
}

export async function paymentQrPng(data: PaymentData): Promise<Buffer> {
  return QRCode.toBuffer(buildCzechPaymentDescriptor(data), {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 420,
  });
}

export async function paymentQrDataUrl(data: PaymentData): Promise<string> {
  return QRCode.toDataURL(buildCzechPaymentDescriptor(data), {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 420,
  });
}
