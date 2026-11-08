/**
 * Jednostránkové PDF z textu bez externí závislosti. Používá základní písma PDF
 * (Helvetica) s vlastním kódováním, které obsahuje české znaky, takže se do
 * souboru nemusí vkládat font.
 */

const GLYPHS: Record<string, string> = {
  á: "aacute", é: "eacute", í: "iacute", ó: "oacute", ú: "uacute", ý: "yacute",
  č: "ccaron", ď: "dcaron", ě: "ecaron", ň: "ncaron", ř: "rcaron", š: "scaron",
  ť: "tcaron", ů: "uring", ž: "zcaron",
  Á: "Aacute", É: "Eacute", Í: "Iacute", Ó: "Oacute", Ú: "Uacute", Ý: "Yacute",
  Č: "Ccaron", Ď: "Dcaron", Ě: "Ecaron", Ň: "Ncaron", Ř: "Rcaron", Š: "Scaron",
  Ť: "Tcaron", Ů: "Uring", Ž: "Zcaron",
  ä: "adieresis", ö: "odieresis", ü: "udieresis", Ä: "Adieresis", Ö: "Odieresis", Ü: "Udieresis",
  "–": "endash", "—": "emdash", "·": "periodcentered", "„": "quotedblbase",
  "“": "quotedblleft", "”": "quotedblright", "…": "ellipsis", "×": "multiply",
};

const EXTRA_CHARS = Object.keys(GLYPHS);
const FIRST_CODE = 0x80;

function encode(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0)!;
    const extra = EXTRA_CHARS.indexOf(char);
    if (code === 0x0a || code === 0x09) out += " ";
    else if (code >= 0x20 && code < 0x7f) out += char;
    else if (extra >= 0) out += String.fromCharCode(FIRST_CODE + extra);
    else if (char === " ") out += " ";
    else out += "?";
  }
  return out;
}

function escapePdfString(text: string) {
  return encode(text).replace(/[\\()]/g, (match) => `\\${match}`);
}

function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > maxChars) {
      if (current) lines.push(current);
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
      current = "";
    } else if ((current ? `${current} ${word}` : word).length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export type PdfRow = [label: string, value: string];

export function buildPdf(input: {
  title: string;
  subtitle: string;
  warning: string;
  rows: PdfRow[];
  footer: string;
}): Buffer {
  const left = 50;
  const valueX = 235;
  const commands: string[] = [];
  const text = (font: "F1" | "F2", size: number, x: number, y: number, value: string, gray = 0.1) => {
    commands.push(`BT ${gray} g /${font} ${size} Tf ${x} ${y} Td (${escapePdfString(value)}) Tj ET`);
  };

  let y = 790;
  text("F2", 20, left, y, input.title);
  y -= 20;
  text("F1", 10, left, y, input.subtitle, 0.4);
  y -= 22;

  const warningLines = wrap(input.warning, 92);
  const boxHeight = 14 * warningLines.length + 12;
  commands.push(`1 0.97 0.9 rg 0.95 0.77 0.42 RG 0.8 w ${left} ${y - boxHeight} 495 ${boxHeight} re B`);
  warningLines.forEach((line, index) => {
    text("F1", 10, left + 10, y - 16 - index * 14, line);
  });
  y -= boxHeight + 22;

  for (const [label, value] of input.rows) {
    const lines = wrap(value, 50);
    const height = 12 + 14 * lines.length;
    text("F1", 10, left, y - 12, label, 0.4);
    lines.forEach((line, index) => text("F1", 11, valueX, y - 12 - index * 14, line));
    commands.push(`0.86 G 0.5 w ${left} ${y - height} m 545 ${y - height} l S`);
    y -= height + 6;
  }

  text("F1", 9, left, 40, input.footer, 0.5);

  const content = Buffer.from(commands.join("\n"), "latin1");
  const differences = EXTRA_CHARS.map((char) => `/${GLYPHS[char]}`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    null, // obsah, doplní se níže
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding 7 0 R >>",
    `<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [${FIRST_CODE} ${differences}] >>`,
    "<< /Title (Potvrzeni evidence) /Producer (Klubio) >>",
  ];

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%âãÏÓ\n", "latin1")];
  const offsets: number[] = [];
  let position = chunks[0].length;
  objects.forEach((body, index) => {
    offsets.push(position);
    const chunk = body === null
      ? Buffer.concat([
          Buffer.from(`${index + 1} 0 obj\n<< /Length ${content.length} >>\nstream\n`, "latin1"),
          content,
          Buffer.from("\nendstream\nendobj\n", "latin1"),
        ])
      : Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`, "latin1");
    chunks.push(chunk);
    position += chunk.length;
  });

  const xrefStart = position;
  const xref = [
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`,
    ...offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 8 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`,
  ].join("");
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}
