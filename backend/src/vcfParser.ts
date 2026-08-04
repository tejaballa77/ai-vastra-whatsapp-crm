export interface ParsedContact {
  name: string;
  phone: string;
}

export function parseVcfContent(vcfString: string): ParsedContact[] {
  const contacts: ParsedContact[] = [];
  const cards = vcfString.split('END:VCARD');

  for (const card of cards) {
    if (!card.includes('BEGIN:VCARD')) continue;

    let name = '';
    let phone = '';

    const lines = card.split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith('FN:')) {
        name = line.substring(3).trim();
      } else if (!name && line.startsWith('N:')) {
        const parts = line.substring(2).split(';');
        name = parts.filter(Boolean).join(' ').trim();
      } else if (line.includes('TEL')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx >= 0) {
          const rawTel = line.substring(colonIdx + 1).trim();
          phone = rawTel.replace(/\D/g, '');
        }
      }
    }

    if (phone) {
      contacts.push({
        name: name || `+${phone}`,
        phone,
      });
    }
  }

  return contacts;
}

export function parseCsvContent(csvString: string): ParsedContact[] {
  const contacts: ParsedContact[] = [];
  const lines = csvString.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(',');
    if (parts.length >= 2) {
      const name = parts[0].replace(/"/g, '').trim();
      const phone = parts[1].replace(/\D/g, '').trim();
      if (phone) {
        contacts.push({ name, phone });
      }
    }
  }

  return contacts;
}
