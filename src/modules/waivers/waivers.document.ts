import { DateTime } from 'luxon';
import type { WaiverBlock, WaiverContent } from './content/index.js';
import type { WaiverDoc } from './waivers.model.js';
import { consentResults } from './waivers.serializer.js';

/** HTML-escape user or content text. */
export const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Escapes, then turns **bold** markup into <strong> and newlines into <br>. */
const rich = (value: string): string =>
  esc(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

function renderBlock(block: WaiverBlock): string {
  switch (block.type) {
    case 'paragraph':
      return `<p>${rich(block.text)}</p>`;
    case 'statement':
      return `<p class="statement">${rich(block.text)}</p>`;
    case 'card':
      return (
        `<div class="card">${block.title ? `<h4>${rich(block.title)}</h4>` : ''}<p>${rich(block.text)}</p>` +
        (block.items ? `<ul>${block.items.map((i) => `<li>${rich(i)}</li>`).join('')}</ul>` : '') +
        (block.note ? `<p class="note">${rich(block.note)}</p>` : '') +
        (block.extra ? `<p>${rich(block.extra)}</p>` : '') +
        `</div>`
      );
    case 'bullets':
      return (
        `<div class="list">${block.title ? `<p class="lead">${rich(block.title)}</p>` : ''}` +
        `<ul>${block.items.map((i) => `<li>${rich(i)}</li>`).join('')}</ul></div>`
      );
    case 'numbered':
      return (
        `<div class="list"><p class="lead">${rich(block.intro)}</p>` +
        `<ol>${block.items.map((i) => `<li>${rich(i)}</li>`).join('')}</ol></div>`
      );
    case 'rates':
      return (
        `<div class="card"><h4>${rich(block.title)}</h4><p>${rich(block.text)}</p><ul>` +
        block.items.map((r) => `<li><strong>${esc(r.price)}</strong> ${esc(r.label)}</li>`).join('') +
        `</ul></div>`
      );
    default:
      return '';
  }
}

function renderContent(content: WaiverContent): string {
  return (
    `<h1>${esc(content.title)}</h1>` +
    content.intro.map((p) => `<p>${rich(p)}</p>`).join('') +
    content.parts
      .map(
        (part) =>
          `<section><h2>${part.label ? `<span class="tag">${esc(part.label)}:</span> ` : ''}${esc(part.title)}</h2>` +
          part.blocks.map(renderBlock).join('') +
          `</section>`,
      )
      .join('')
  );
}

const STYLE = `
body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2d3d;max-width:780px;margin:24px auto;padding:0 20px;line-height:1.5;font-size:14px}
h1{font-size:24px;margin:0 0 12px}h2{font-size:18px;margin:28px 0 8px;page-break-after:avoid}h4{margin:0 0 4px;font-size:15px}
.tag{background:#f6d77b;border-radius:12px;padding:2px 8px;font-size:13px}
.card{border:1px solid #dfe5ec;border-radius:10px;padding:10px 14px;margin:10px 0;page-break-inside:avoid}
.note{font-style:italic;font-weight:600;background:#fdf3cf;border-radius:8px;padding:6px 10px}
.statement{font-weight:700;border:1px solid #dfe5ec;border-radius:10px;padding:10px 14px}
.lead{font-weight:600}ul,ol{padding-left:22px}li{margin:4px 0}
table{border-collapse:collapse;width:100%;margin:8px 0}td{border:1px solid #dfe5ec;padding:6px 10px;vertical-align:top}
td.k{width:34%;color:#52606d}.box{font-family:monospace;font-size:16px}.sig{border:1px solid #9aa5b1;border-radius:8px;padding:8px;max-width:100%}
.sig svg{max-width:100%;height:auto}.audit{font-size:12px;color:#52606d;word-break:break-all}
.print{background:#eef3f8;border-radius:8px;padding:6px 10px;font-size:12px}@media print{.print{display:none}body{margin:0}}
`;

/**
 * Self-contained printable record (no external assets): the exact content snapshot the signer saw,
 * their details, every checkbox with its stored label, the drawn signature and an audit block.
 * Admins print it or "Save as PDF" from the browser.
 */
export function renderWaiverDocument(w: WaiverDoc, timezone: string): string {
  const local = DateTime.fromJSDate(w.signedAt, { zone: timezone });
  const consentRows = consentResults(w)
    .map(
      (c) =>
        `<tr><td class="box">${c.value ? '&#9745;' : '&#9744;'}</td><td>${rich(c.label)}${c.required ? '' : ' <em>(optional)</em>'}</td></tr>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(w.snapshot.content.title)} - ${esc(w.dogName)} - ${esc(local.toFormat('d LLL yyyy'))}</title>
<style>${STYLE}</style></head><body>
<p class="print">To keep a copy, use your browser’s Print (Ctrl/Cmd + P) and choose “Save as PDF”.</p>
${renderContent(w.snapshot.content)}
<section><h2>Signed details</h2>
<table>
<tr><td class="k">Pet parent’s name</td><td>${esc(w.parentName)}</td></tr>
<tr><td class="k">Dog’s name</td><td>${esc(w.dogName)}</td></tr>
<tr><td class="k">Phone number</td><td>${esc(w.phone)}</td></tr>
<tr><td class="k">Date</td><td>${esc(local.toFormat('d LLLL yyyy'))}</td></tr>
</table>
<h2>Consents</h2><table>${consentRows}</table>
<h2>Signature</h2>
<p>Typed name: <strong>${esc(w.typedSignature)}</strong></p>
<div class="sig">${w.signatureSvg}</div>
</section>
<section class="audit"><h2>Audit</h2>
<p>Waiver ID: ${esc(w._id.toHexString())}<br>
Signed at: ${esc(local.toFormat('d LLL yyyy, HH:mm:ss'))} (${esc(timezone)}) · ${esc(w.signedAt.toISOString())} (UTC)<br>
Version: ${esc(w.version)}<br>
Content hash (SHA-256): ${esc(w.contentHash)}<br>
${w.userAgent ? `Device: ${esc(w.userAgent)}<br>` : ''}Status: ${esc(w.status)}</p>
</section>
</body></html>`;
}
