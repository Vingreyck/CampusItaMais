/**
 * Troca dados pessoais por marcadores ([EMAIL_1], [CPF_1]…) ANTES de enviar o texto a uma IA externa
 * e recoloca os valores originais nos campos que a IA devolver.
 */

const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: 'EMAIL', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g },
  { kind: 'CNPJ', re: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g },
  { kind: 'CPF', re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g },
  // Telefones brasileiros: (79) 99999-9999, 79 99999-9999, +55 79 9999-9999, 99999-9999
  { kind: 'TELEFONE', re: /(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?)?\d{4}[-\s]\d{4}\b/g },
];

export interface Masked {
  text: string;
  counts: Record<string, number>;
  total: number;
  /** Troca os marcadores pelos valores originais. */
  restore: (s: string) => string;
}

export function maskPii(input: string): Masked {
  const originals = new Map<string, string>();
  const counts: Record<string, number> = {};
  let text = input;
  for (const { kind, re } of PATTERNS) {
    text = text.replace(re, (match) => {
      // Reaproveita o marcador quando o mesmo valor aparece de novo.
      for (const [marker, value] of originals) if (value === match && marker.startsWith(`[${kind}_`)) return marker;
      const n = (counts[kind] = (counts[kind] ?? 0) + 1);
      const marker = `[${kind}_${n}]`;
      originals.set(marker, match);
      return marker;
    });
  }
  const restore = (s: string) => {
    let out = s;
    for (const [marker, value] of originals) out = out.split(marker).join(value);
    return out;
  };
  return { text, counts, total: originals.size, restore };
}
