// netlify/functions/generateContractPdf.js
//
// Generates a PDF of the agent's filled-in TREC 20-19 contract draft,
// mirroring the exact paragraph structure shown in the Contract view
// tab of index.html. This is a DRAFT export for the agent's own use --
// not a substitute for the actual TREC form, and not e-signed.
//
// Expects POST body: { fields: { <fieldId>: value, ... } }
// Returns: raw PDF bytes (Content-Type: application/pdf)

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

function slot(fields, id, placeholder) {
  const v = fields[id];
  if (v === undefined || v === null || v === '') return placeholder;
  if (typeof v === 'object') return Object.entries(v).filter(([, val]) => val).map(([k]) => k).join(', ') || placeholder;
  return String(v);
}

function checkSlot(fields, id) {
  const v = fields[id];
  if (!v || typeof v !== 'object') return '[none selected]';
  const selected = Object.entries(v).filter(([, val]) => val).map(([k]) => k);
  return selected.length ? selected.join(', ') : '[none selected]';
}

function val(fields, id) {
  return fields[id] || '';
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const F = payload.fields || {};

  try {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 9;
    const fontSizeHeading = 12;
    const fontSizeTitle = 15;
    const textColor = rgb(0.07, 0.09, 0.13);
    const mutedColor = rgb(0.4, 0.4, 0.4);

    const margin = 50;
    const bottomMargin = 40;
    const contentWidth = 512;
    let page = pdfDoc.addPage([612, 792]);
    let y = 740;

    // Page-aware line drawing, checked before every single line --
    // learned from an earlier build where checking only at section
    // boundaries let long sections run text off the bottom of the page.
    const drawLine = (text, x, size, fontFace, color) => {
      if (y < bottomMargin + size) {
        page = pdfDoc.addPage([612, 792]);
        y = 740;
      }
      page.drawText(text, { x, y, size, font: fontFace, color });
      y -= size + 4;
    };

    const drawWrappedLine = (text, x, maxWidth, size, fontFace, color) => {
      const words = String(text).split(' ');
      let line = '';
      for (const word of words) {
        const testLine = line ? line + ' ' + word : word;
        const w = fontFace.widthOfTextAtSize(testLine, size);
        if (w > maxWidth && line) {
          drawLine(line, x, size, fontFace, color);
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line) drawLine(line, x, size, fontFace, color);
    };

    const sectionHeading = (text) => {
      y -= 6;
      drawLine(text, margin, fontSizeHeading, fontBold, textColor);
      y -= 2;
    };

    const addr = val(F, 'address') || '[Property Address]';

    // ── Title ──
    drawLine('ONE TO FOUR FAMILY RESIDENTIAL CONTRACT (RESALE)', margin, fontSizeTitle, fontBold, textColor);
    drawLine('Draft prepared with EzzOffer for review by broker before use.', margin, 8, font, mutedColor);
    y -= 4;
    page.drawRectangle({ x: margin, y: y - 36, width: contentWidth, height: 38, color: rgb(0.96, 0.97, 0.95), borderColor: rgb(0.7, 0.82, 0.74), borderWidth: 0.75 });
    y -= 6;
    drawWrappedLine('TREC NO. 20-19, mandatory July 1, 2026. ' + addr + '. This is a working draft only and has not been reviewed by a broker or signed by any party.', margin + 8, contentWidth - 16, 8, font, rgb(0.2, 0.35, 0.25));
    y -= 8;

    // ── 1. Parties ──
    sectionHeading('\u00b6 1 \u2014 Parties');
    drawWrappedLine(`${slot(F, 'seller', '[Seller name]')} agrees to sell and convey to ${slot(F, 'buyer', '[Buyer name]')} the Property defined below.`, margin + 12, contentWidth - 12, fontSize, font, textColor);

    // ── 2. Property ──
    sectionHeading('\u00b6 2 \u2014 Property');
    drawWrappedLine(`Lot ${slot(F, 'lot_num', '___')} Block ${slot(F, 'block_num', '___')}, ${slot(F, 'addition', '[Addition]')}, City of ${slot(F, 'city', '[City]')}, County of ${slot(F, 'county', '[County]')}, Texas, known as ${slot(F, 'address', '[Address]')}.`, margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Exclusions: ${slot(F, 'exclusions', 'none stated')}.`, margin + 12, contentWidth - 12, fontSize, font, textColor);

    // ── 3. Sales Price ──
    sectionHeading('\u00b6 3 \u2014 Sales Price');
    drawWrappedLine(`Cash portion: ${slot(F, 'cash_portion', '$___')}  \u00b7  Financing: ${slot(F, 'financing_sum', '$___')}  \u00b7  Total Sales Price: ${slot(F, 'sales_price', '$___')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Financing addenda: ${checkSlot(F, 'financing_type')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);

    // ── 4. Leases ──
    sectionHeading('\u00b6 4 \u2014 Leases');
    drawWrappedLine(`Residential leases: ${checkSlot(F, 'lease_residential')}  \u00b7  Fixture leases: ${checkSlot(F, 'lease_fixture')}  \u00b7  Natural resource leases: ${checkSlot(F, 'lease_natural')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Delivery status: ${slot(F, 'lease_delivery', '[not selected]')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);

    // ── 5. Earnest Money & Option ──
    sectionHeading('\u00b6 5 \u2014 Earnest Money & Option');
    drawWrappedLine(`Buyer shall deliver ${slot(F, 'earnest_money', '$___')} as earnest money and ${slot(F, 'option_fee', '$___')} as option fee to ${slot(F, 'escrow_agent', '[Escrow Agent]')} at ${slot(F, 'escrow_address', '[address]')} within 3 days of the Effective Date.`, margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Option Period: ${slot(F, 'option_days', '___')} days.` + (val(F, 'add_earnest') ? ` Additional earnest money: ${slot(F, 'add_earnest', '')} due within ${slot(F, 'add_earnest_days', '___')} days.` : ''), margin + 12, contentWidth - 12, fontSize, font, textColor);

    // ── 6. Title Policy & Survey ──
    sectionHeading('\u00b6 6 \u2014 Title Policy & Survey');
    drawWrappedLine(`Title policy at ${slot(F, 'title_expense', '[Seller/Buyer]')} expense  \u00b7  Title Company: ${slot(F, 'title_company', '[Company]')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Survey: ${slot(F, 'survey_method', '[method not selected]')} within ${slot(F, 'survey_days', '___')} days  \u00b7  Exception: ${slot(F, 'survey_exception', '[not selected]')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Title objection period: ${slot(F, 'title_obj_days', '___')} days  \u00b7  HOA: ${slot(F, 'hoa_status', '[not selected]')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);

    // ── 7. Property Condition ──
    sectionHeading('\u00b6 7 \u2014 Property Condition');
    drawWrappedLine(`Seller's Disclosure: ${slot(F, 'seller_disclosure', '[not selected]')}` + (val(F, 'seller_disc_days') ? ` \u2014 deliver within ${slot(F, 'seller_disc_days', '')} days` : ''), margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Acceptance: ${slot(F, 'asis', '[not selected]')}` + (val(F, 'repairs') ? `  \u00b7  Repairs: ${slot(F, 'repairs', '')}` : ''), margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Water Disclosure (\u00b6 7(I), new for 20-19): ${slot(F, 'water_disclosure', '[not selected]')}` + (val(F, 'water_disc_days') ? ` \u2014 deliver within ${slot(F, 'water_disc_days', '')} days` : '') + (val(F, 'water_supplier') ? `  \u00b7  Supplier: ${slot(F, 'water_supplier', '')}` : ''), margin + 12, contentWidth - 12, fontSize, font, textColor);
    if (val(F, 'home_warranty')) {
      drawWrappedLine(`Home warranty reimbursement cap: ${slot(F, 'home_warranty', '')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);
    }

    // ── 9. Closing ──
    sectionHeading('\u00b6 9 \u2014 Closing');
    drawWrappedLine(`Closing Date: on or before ${slot(F, 'closing_date', '[date]')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);

    // ── 10. Possession ──
    sectionHeading('\u00b6 10 \u2014 Possession');
    drawWrappedLine(`Seller shall deliver possession: ${slot(F, 'possession', '[not selected]')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);

    // ── 11. Special Provisions (only if present) ──
    if (val(F, 'special')) {
      sectionHeading('\u00b6 11 \u2014 Special Provisions');
      drawWrappedLine(slot(F, 'special', ''), margin + 12, contentWidth - 12, fontSize, font, textColor);
    }

    // ── 12. Settlement & Expenses ──
    sectionHeading('\u00b6 12 \u2014 Settlement & Expenses');
    drawWrappedLine(`Seller's contribution toward Buyer's closing expenses: ${slot(F, 'seller_contrib_buyer_exp', '$0')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Seller contribution toward Buyer's broker: ${slot(F, 'broker_comp_seller_to_buyer', '$0')}  \u00b7  Buyer contribution toward Seller's broker: ${slot(F, 'broker_comp_buyer_to_seller', '$0')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);

    // ── 21. Notices ──
    sectionHeading('\u00b6 21 \u2014 Notices');
    drawWrappedLine(`Buyer: ${slot(F, 'buyer', '[name]')}  \u00b7  ${slot(F, 'buyer_address', '[address]')}  \u00b7  ${slot(F, 'buyer_phone', '[phone]')}  \u00b7  ${slot(F, 'buyer_email', '[email]')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Seller: ${slot(F, 'seller', '[name]')}  \u00b7  ${slot(F, 'seller_address', '[address]')}  \u00b7  ${slot(F, 'seller_phone', '[phone]')}  \u00b7  ${slot(F, 'seller_email', '[email]')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Buyer's agent: ${slot(F, 'buyer_agent_name', '[name]')}  \u00b7  ${slot(F, 'buyer_agent_phone', '[phone]')}  \u00b7  ${slot(F, 'buyer_agent_email', '[email]')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Seller's agent: ${slot(F, 'seller_agent_name', '[name]')}  \u00b7  ${slot(F, 'seller_agent_phone', '[phone]')}  \u00b7  ${slot(F, 'seller_agent_email', '[email]')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);

    // ── 22. Addenda ──
    sectionHeading('\u00b6 22 \u2014 Addenda attached');
    drawWrappedLine(`Financial: ${checkSlot(F, 'addenda_financial')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Leases: ${checkSlot(F, 'addenda_leases')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Tests & Reports: ${checkSlot(F, 'addenda_tests')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Statutory: ${checkSlot(F, 'addenda_statutory')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Other: ${checkSlot(F, 'addenda_other')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);

    // ── Broker Information ──
    sectionHeading('Broker Information');
    drawWrappedLine(`Listing firm: ${slot(F, 'listing_broker_firm', '[firm]')}  \u00b7  License: ${slot(F, 'listing_broker_license', '[no.]')}  \u00b7  Associate: ${slot(F, 'listing_associate', '[name]')}  \u00b7  License: ${slot(F, 'listing_associate_license', '[no.]')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Buyer's firm: ${slot(F, 'buyer_broker_firm', '[firm]')}  \u00b7  License: ${slot(F, 'buyer_broker_license', '[no.]')}  \u00b7  Associate: ${slot(F, 'buyer_associate', '[name]')}  \u00b7  License: ${slot(F, 'buyer_associate_license', '[no.]')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);
    drawWrappedLine(`Representation: ${slot(F, 'representation', '[not selected]')}`, margin + 12, contentWidth - 12, fontSize, font, textColor);

    // ── Signature lines ──
    y -= 10;
    sectionHeading('SIGNATURES (not yet executed)');
    drawLine(`Buyer: ${slot(F, 'buyer', '[name]')}`, margin + 12, fontSize, fontBold, textColor);
    drawLine('________________________________', margin + 12, fontSize, font, mutedColor);
    y -= 6;
    drawLine(`Seller: ${slot(F, 'seller', '[name]')}`, margin + 12, fontSize, fontBold, textColor);
    drawLine('________________________________', margin + 12, fontSize, font, mutedColor);
    y -= 6;
    drawLine('Effective Date (broker fills in):', margin + 12, fontSize, fontBold, textColor);
    drawLine('________________________________', margin + 12, fontSize, font, mutedColor);

    // ── Footer (drawn directly, not via drawLine, so it never forces
    //    an extra page just for one line -- same fix learned from an
    //    earlier build today) ──
    page.drawText('Generated with EzzOffer \u2014 Attorney Broker Services, LLC \u2014 draft only, not executed', {
      x: margin, y: 22, size: 7, font, color: rgb(0.6, 0.6, 0.6),
    });

    const pdfBytes = await pdfDoc.save();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="trec-20-19-draft.pdf"',
      },
      body: Buffer.from(pdfBytes).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('PDF generation error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
