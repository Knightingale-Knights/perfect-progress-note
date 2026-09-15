// api/progress-note-pdf.js
//
// Generates a PDF that visually matches progress-note-email.html
// (navy/cream Knightingale template) and returns it as base64 for
// Bubble to attach to the Postmark send.
//
// Assumes this file lives in the existing `progress-notes` Vercel
// repo, alongside a `fonts/AnticDidone-Regular.ttf` file (the same
// Didot substitute already used in the invoice/roster PDFs — copy
// it over from that repo, or grab "Antic Didone" from Google Fonts).
//
// Adjust the require/export syntax below if this repo uses ESM
// (import/export) rather than CommonJS — the invoice and roster
// endpoints will show which style to match.

const PdfPrinter = require('pdfmake');
const path = require('path');

const fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
  AnticDidone: {
    normal: path.join(__dirname, 'fonts', 'AnticDidone-Regular.ttf'),
  },
};

const NAVY = '#0f1b3d';
const TAUPE = '#8a8778';
const BORDER = '#e3e1db';
const DARK = '#1c1c1c';
const BODY_GREY = '#4a4a45';
const FOOTER_GREY = '#6b6b64';
const FOOTER_LIGHT = '#9a978c';

const CONTENT_WIDTH = 483; // A4 (595pt) minus 56pt margins each side

function buildDocDefinition({ participant, carer, date, summary }) {
  // Accepts the raw stored summary (real line breaks), independent
  // of whatever <br><br> substitution Bubble does for the HTML email.
  const paragraphs = String(summary || '')
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return {
    pageSize: 'A4',
    pageMargins: [56, 64, 56, 64],
    defaultStyle: { font: 'Helvetica', fontSize: 11, color: BODY_GREY },
    content: [
      // Masthead
      {
        columns: [
          { text: 'knightingale', font: 'AnticDidone', fontSize: 30, color: NAVY },
          { text: 'PROGRESS NOTE', fontSize: 9, color: TAUPE, alignment: 'right', margin: [0, 10, 0, 0] },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 16, x2: CONTENT_WIDTH, y2: 16, lineWidth: 1, lineColor: NAVY }] },

      // Details block
      {
        margin: [0, 28, 0, 0],
        layout: 'noBorders',
        table: {
          widths: [110, '*'],
          body: [
            [
              { text: 'PARTICIPANT', fontSize: 9, color: TAUPE, margin: [0, 0, 0, 10] },
              { text: participant || '', fontSize: 13, color: DARK, margin: [0, 0, 0, 10] },
            ],
            [
              { text: 'CARER', fontSize: 9, color: TAUPE, margin: [0, 0, 0, 10] },
              { text: carer || '', fontSize: 13, color: DARK, margin: [0, 0, 0, 10] },
            ],
            [
              { text: 'DATE', fontSize: 9, color: TAUPE },
              { text: date || '', fontSize: 13, color: DARK },
            ],
          ],
        },
      },

      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 1, lineColor: BORDER }], margin: [0, 24, 0, 0] },

      // Summary
      { text: 'SHIFT SUMMARY', fontSize: 9, color: TAUPE, margin: [0, 24, 0, 12] },
      ...paragraphs.map((p) => ({ text: p, fontSize: 11, color: BODY_GREY, lineHeight: 1.4, margin: [0, 0, 0, 14] })),

      // Footer
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 1, lineColor: NAVY }], margin: [0, 20, 0, 0] },
      { text: 'UPGRADING THE WORLD FOR OLDER ADULTS', font: 'AnticDidone', fontSize: 10, color: NAVY, alignment: 'center', margin: [0, 18, 0, 0] },
      { text: 'knightingale.com.au   \u00b7   care@knightingale.com.au   \u00b7   +61 426 512 584', fontSize: 9, color: FOOTER_GREY, alignment: 'center', margin: [0, 10, 0, 0] },
      { text: 'Melbourne VIC 3006', fontSize: 8, color: FOOTER_LIGHT, alignment: 'center', margin: [0, 6, 0, 0] },
    ],
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }

  try {
    const { participant, carer, date, summary } = req.body || {};

    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument(buildDocDefinition({ participant, carer, date, summary }));

    const chunks = [];
    pdfDoc.on('data', (chunk) => chunks.push(chunk));
    pdfDoc.on('end', () => {
      const base64 = Buffer.concat(chunks).toString('base64');
      const safeName = (participant || 'progress-note').toString().replace(/\s+/g, '-').toLowerCase();
      res.status(200).json({ pdfBase64: base64, filename: `progress-note-${safeName}.pdf` });
    });
    pdfDoc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
};
