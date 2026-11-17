/* Montalban Home Manager — Phase 4: accountability, coaching, training, handbook (Word import/export), reports.
   Pure logic; the Word helpers use only browser built-ins (Blob, TextEncoder, DecompressionStream). */
(function (root) {
  'use strict';
  const E = root.MHM.Engine, U = E.util, P = root.MHM.Payroll;

  // ---------- accountability (spec §5.11) ----------
  const INCIDENT_TYPES = { broken: 'Broken / damaged item', missed: 'Missed task', quality: 'Poor-quality task', safety: 'Safety issue (Handbook §11)', pest: 'Pest sighting', leak: 'Leak / electrical', other: 'Other' };
  /** Who was assigned on a date, from the permanent schedule record when there is one.
      target: { categoryId?, templateId?, applianceId? }. Returns the lead (custodian), the matching task occurrences
      with main / assistant, and the marks recorded for them. */
  function whoWasAssigned(state, date, target, opts) {
    opts = opts || {};
    const appl = target.applianceId ? (state.appliances || []).find(a => a.id === target.applianceId) : null;
    const tpl = target.templateId ? state.tasks.find(t => t.id === target.templateId) : null;
    const categoryId = target.categoryId || (appl && appl.categoryId) || (tpl && tpl.categoryId) || '';
    const week = opts.week || E.generateWeek(state, date, { today: opts.today || '9999-12-31', history: state.history || {} });
    const day = week.occurrences.filter(o => o.date === date);
    const fromRecord = !!(state.history && state.history[date]);
    let leadId = null;
    if (categoryId === 'driver') leadId = (state.staff.find(s => s.role === 'driver' && week.status[date][s.id] && week.status[date][s.id].working) || {}).id || null;
    else if (categoryId) {
      const rec = day.find(o => o.categoryId === categoryId && o.leadId);
      leadId = rec ? rec.leadId : (week.leadsByDay[date] || { leads: {} }).leads[categoryId] || null;
    }
    const occ = day.filter(o => tpl ? o.templateId === tpl.id : categoryId ? o.categoryId === categoryId : false).map(o => ({
      key: o.key, name: o.name, start: o.start, end: o.end, mainId: o.mainId, assistId: o.assistId, skipped: !!o.skipped, skipReason: o.skipReason || '',
      mark: (state.marks || {})[o.key] || null,
    }));
    const working = state.staff.filter(s => week.status[date][s.id] && week.status[date][s.id].working).map(s => s.id);
    return { date, categoryId, leadId, occurrences: occ, working, fromRecord, appliance: appl, task: tpl };
  }

  // ---------- training (spec §5.13) ----------
  const LEVELS = ['Not trained', 'Learning', 'Can do with supervision', 'Competent', 'Can train others'];
  const EXTRA_SKILLS = [['cooking', 'Cooking'], ['childsafety', 'Child safety'], ['firstaid', 'First aid'], ['chemical', 'Chemical safety'], ['driving', 'Driving safety']];
  const skillsOf = state => [...state.categories.filter(c => c.id !== 'driver').map(c => ({ id: 'cat:' + c.id, name: c.name + ' (lead area)' })), ...EXTRA_SKILLS.filter(([id]) => !state.categories.some(c => c.id === id)).map(([id, name]) => ({ id, name }))]; // "Cooking" is a lead area now
  /** New-hire onboarding plan (spec §5.13), dated from the hire date. */
  function onboardingPlan(st, S) {
    const h = st.hireDate, sd = Number((S || {}).shadowDays) || 14;
    return [
      ['d1a', 'Day 1', 'Read and explain the handbook together', 0], ['d1b', 'Day 1', 'House tour: rooms, areas, equipment, where things are kept', 0],
      ['d1c', 'Day 1', 'Safety rules: children and wet floors (§4.1), chemicals, fire, first aid (§11)', 0], ['d1d', 'Day 1', 'Sign the handbook acknowledgment', 0],
      ['w1', 'Week 1–2', 'Assist-only shadow mode, rotating through all lead areas', sd - 1], ['w3', 'Week 3–4', 'Lead one light area under supervision', 27],
      ['m2', 'Month 2+', 'Full rotation as a lead', 30],
    ].map(([id, when, item, off]) => ({ id, when, item, due: U.addDays(h, off), done: '' }));
  }
  const COURSE_REFS = [
    ['TESDA', 'Housekeeping NC II'], ['TESDA', 'Cookery NC II'], ['TESDA', 'Driving NC II'], ['TESDA', 'Bread and Pastry Production NC II'],
    ['Philippine Red Cross', 'Standard First Aid'], ['Philippine Red Cross', 'Basic Life Support (CPR)'], ['Barangay / LGU', 'Fire safety or disaster preparedness seminar'],
  ];

  // ---------- handbook (spec §5.14) ----------
  /** Starter outline: section numbers the task library already cites. Titles are inferred; text is to be pasted from the current handbook. */
  const HANDBOOK_OUTLINE = [
    ['1', 'Introduction and household'], ['1.2', 'The household (family, schedules, pets)'],
    ['2', 'Daily schedule and routines'], ['2.1', 'Morning routine and early prep'], ['2.2', 'Staff meals'], ['2.4', 'Rest day and day-off agreements'],
    ['4', 'Cleaning standards'], ['4.1', 'Child safety while cleaning'], ['4.2', 'Children\'s school preparation'], ['4.3', 'Floors: sweeping, mopping, waxing'],
    ['4.4', 'Kitchen cleaning and dishes'], ['4.5', 'Bathrooms (CRs)'], ['4.6', 'Outside service areas'], ['4.6.1', 'Daily'], ['4.6.2', 'Deep cleaning — outside service areas'],
    ['4.6.3', 'Walls and vertical surfaces'], ['4.7', 'Beds and tidying'],
    ['5', 'Waste'], ['5.2', 'Food waste and compost'], ['5.3', 'Trash bins'], ['5.7', 'Packed lunches (baon) and snacks'],
    ['6', 'Toys'], ['6.1', 'Daily toy pick-up and safety'], ['6.2', 'Toy sorting and cleaning'], ['6.3', 'Monthly toy deep clean'],
    ['7', 'Laundry and closets'], ['7.1', 'Drying, folding and storing'], ['7.2', 'Regular clothes: soaking and washing'], ['7.3', 'Towels and bathroom textiles'],
    ['7.4', 'Bed linens'], ['7.5', 'Special items, delicates and the washing machine'], ['7.6', 'Closets and shoes'],
    ['8', 'Periodic cleaning schedule'], ['8.1', 'Weekly'], ['8.2', 'Every 2 weeks'], ['8.3', 'Monthly'], ['8.4', 'Every 3–6 months'], ['8.5', 'Yearly'],
    ['9', 'Cooking and food'], ['9.1', 'Kitchen safety and cookware (stainless steel only)'], ['9.2', 'Food hygiene and leftovers'],
    ['10', 'Cleaning supplies'], ['10.4', 'Rag and cleaning cloth rules'],
    ['11', 'Safety'], ['11.5', 'Drinking water'],
    ['12', 'Special situations'], ['12.2', 'Guests, parties, travel and sickness (Event mode)'],
    ['13', 'Addendum: employment details'],
  ];
  const SUGGESTED = {
    '4.6': 'Suggested clean-up (spec §5.14): number the sub-parts 4.6.1 Daily, 4.6.2 Deep cleaning – outside service areas, 4.6.3 Walls and vertical surfaces.',
    '10.4': 'Suggested clean-up: number "Rag and Cleaning Cloth Rules" as 10.4.',
    '11.5': 'Suggested wording to finish the incomplete line: "Keep drinking water containers clean, covered and away from chemicals."',
    '13': 'This section is filled from each staff member\'s contract and payroll data when the handbook is exported.',
  };
  const DRAFT_SECTIONS = [
    ['14', 'Pet care (fish and turtles) — DRAFT, please review', 'Feed the fish a small pinch once a day and remove uneaten food after 5 minutes. Feed the turtles as instructed on the feeding card. Check filters, heater and basking lamp, and the water level every morning. Change part of the water weekly. Turtles can carry Salmonella: wash hands with soap after touching them or their water, use separate buckets and brushes, and never clean tanks or turtle items in the kitchen sink.'],
    ['15', 'Driver — DRAFT, please review', 'Daily vehicle check before the school run: tires, oil, water, lights and fuel. Children ride in the back seat with seatbelts on; never leave a child alone in the vehicle. Keep to safe speeds and no phone use while driving. Keep the vehicles clean (weekly) and report any warning light, damage or upcoming registration, insurance or PMS date to the employer.'],
  ];
  function seedHandbook() {
    const T = root.MHM.HandbookText; // the household's own handbook text (js/handbook-text.js)
    if (T && T.sections && T.sections.length) return { title: T.title, versions: [], draft: { sections: JSON.parse(JSON.stringify(T.sections)), basedOn: '', note: T.source || '' }, outline: false };
    const sections = HANDBOOK_OUTLINE.map(([num, title]) => ({ num, title, body: SUGGESTED[num] ? '[' + SUGGESTED[num] + ']' : '' }));
    DRAFT_SECTIONS.forEach(([num, title, body]) => sections.push({ num, title, body }));
    return { title: 'Housekeeping Policy and House Helper Handbook', versions: [], draft: { sections, basedOn: '', note: 'Starter outline: paste or import the current handbook text.' }, outline: true };
  }
  const nextVersion = v => { if (!v) return '1.0'; const [a, b] = v.split('.').map(Number); return a + '.' + (b + 1); };
  const sortSections = list => list.slice().sort((x, y) => { const a = x.num.split('.').map(Number), b = y.num.split('.').map(Number); for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; });
  const level = num => num.split('.').length;

  // ---------- Word (.docx) export: a minimal, valid WordprocessingML package, stored (uncompressed) zip ----------
  const xmlEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zipStore(files) {
    const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
    files.forEach(f => {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    });
    const csize = central.reduce((a, x) => a + x.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  /** Build the handbook .docx: cover page, table of contents, numbered sections, Section 13 addendum per staff member, acknowledgment page. */
  function handbookDocx(hb, version, opts) {
    opts = opts || {};
    const p = (text, style, extra) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/>${extra || ''}</w:pPr>` : extra ? `<w:pPr>${extra}</w:pPr>` : ''}${String(text).split('\n').map((line, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r><w:t xml:space="preserve">${xmlEsc(line)}</w:t></w:r>`).join('')}</w:p>`;
    const br = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    const secs = sortSections(version.sections);
    let body = p(opts.household || '', 'Title', '<w:jc w:val="center"/>') + p(hb.title, 'Subtitle', '<w:jc w:val="center"/>') + p('Version ' + version.version + (version.publishedOn ? ' · ' + version.publishedOn : ''), null, '<w:jc w:val="center"/>') + br;
    body += p('Contents', 'Heading1') + secs.filter(s => level(s.num) <= 2).map(s => p((level(s.num) === 2 ? '    ' : '') + s.num + '  ' + s.title, 'TOC')).join('') + br;
    secs.forEach(s => {
      body += p(s.num + '  ' + s.title, 'Heading' + Math.min(3, level(s.num)));
      if (s.num === '13' && (opts.addenda || []).length) opts.addenda.forEach(a => { body += p(a.name, 'Heading3') + a.rows.map(([k, v]) => p(k + ': ' + (v || '______________________'))).join(''); });
      else String(s.body || '').split(/\n\s*\n/).filter(x => x.trim()).forEach(par => { body += p(par.trim()); });
    });
    body += br + p('Acknowledgment', 'Heading1') + p(`I have read (or had read and explained to me) the ${hb.title}, version ${version.version}. I understand it and agree to follow it.`) +
      (opts.signers && opts.signers.length ? opts.signers : ['']).map(n => p('\n\nName: ' + (n || '______________________________') + '\n\nSignature: ______________________________        Date: ______________')).join('') +
      p('\n\nEmployer: ______________________________        Date: ______________');
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="${opts.letter ? 12240 : 11906}" w:h="${opts.letter ? 15840 : 16838}"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    // pPr children must follow the schema order: keepNext, spacing, outlineLvl
    const style = (id, name, sz, bold, o) => { o = o || {}; return `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr>${o.keep ? '<w:keepNext/>' : ''}<w:spacing w:before="${o.before != null ? o.before : bold ? 240 : 0}" w:after="${o.after || 120}"/>${o.lvl != null ? `<w:outlineLvl w:val="${o.lvl}"/>` : ''}</w:pPr><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${sz}"/></w:rPr></w:style>`; };
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
      <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
      ${style('Title', 'Title', 48, true, { before: 2400, after: 240 })}${style('Subtitle', 'Subtitle', 32, false)}${style('Heading1', 'heading 1', 30, true, { keep: true, lvl: 0 })}
      ${style('Heading2', 'heading 2', 26, true, { keep: true, lvl: 1 })}${style('Heading3', 'heading 3', 23, true, { keep: true, lvl: 2 })}${style('TOC', 'toc 1', 22, false)}</w:styles>`;
    return zipStore([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'word/document.xml', data: doc }, { name: 'word/styles.xml', data: styles },
    ]);
  }

  // ---------- Word (.docx) import: paragraphs → numbered sections ----------
  async function unzipEntry(buf, wanted) {
    const v = new DataView(buf), u8 = new Uint8Array(buf);
    let e = buf.byteLength - 22; while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Not a .docx (zip) file');
    let off = v.getUint32(e + 16, true); const n = v.getUint16(e + 10, true), dec = new TextDecoder();
    for (let i = 0; i < n; i++) {
      const method = v.getUint16(off + 10, true), csize = v.getUint32(off + 20, true), nl = v.getUint16(off + 28, true), xl = v.getUint16(off + 30, true), cl = v.getUint16(off + 32, true), lo = v.getUint32(off + 42, true);
      const name = dec.decode(u8.subarray(off + 46, off + 46 + nl));
      if (name === wanted) {
        const start = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true), data = u8.subarray(start, start + csize);
        if (method === 0) return dec.decode(data);
        const ds = new DecompressionStream('deflate-raw');
        return await new Response(new Blob([data]).stream().pipeThrough(ds)).text();
      }
      off += 46 + nl + xl + cl;
    }
    throw new Error(wanted + ' not found');
  }
  /** Paragraphs that start with a section number ("4.3", "4.6.1", "SECTION 4") start a section; other text goes into the current one. */
  function sectionsFromParagraphs(paras) {
    const out = []; let cur = null;
    paras.forEach(({ text, heading, toc }) => {
      if (toc) return; // table-of-contents entries are not sections
      const t = text.trim(); if (!t) { if (cur) cur.body += '\n\n'; return; }
      const m = t.match(/^(?:section\s+|§\s*)?(\d{1,2}(?:\.\d{1,2}){0,3})[.)]?\s+(.{2,120})$/i);
      if (m && (heading || t.length < 90)) { cur = { num: m[1], title: m[2].replace(/[:.]\s*$/, ''), body: '' }; out.push(cur); return; }
      if (!cur) { cur = { num: '0', title: 'Front matter', body: '' }; out.push(cur); }
      cur.body += (cur.body && !cur.body.endsWith('\n\n') ? '\n' : '') + t;
    });
    out.forEach(s => { s.body = s.body.replace(/\n{3,}/g, '\n\n').trim(); });
    // a number listed twice (e.g. a typed contents page): keep the copy with text, in its first position
    const best = {}; out.forEach(s => { if (!best[s.num] || s.body.length > best[s.num].body.length) best[s.num] = s; });
    const seen = new Set();
    return out.filter(s => { if (seen.has(s.num)) return false; seen.add(s.num); return true; }).map(s => best[s.num]);
  }
  async function importDocx(arrayBuffer) {
    const xml = await unzipEntry(arrayBuffer, 'word/document.xml');
    const paras = (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(px => ({
      heading: /<w:pStyle w:val="(Heading|Title)/i.test(px), toc: /<w:pStyle w:val="TOC/i.test(px),
      text: (px.match(/<w:t[^>]*>[^<]*<\/w:t>|<w:tab\/>|<w:br\/>/g) || []).map(t => t === '<w:tab/>' ? '\t' : t === '<w:br/>' ? '\n' : t.replace(/<[^>]+>/g, '')).join('')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'),
    }));
    return sectionsFromParagraphs(paras);
  }

  // ---------- reports (spec §5.15) ----------
  function eachDay(from, to, fn) { for (let d = from; d <= to; d = U.addDays(d, 1)) fn(d); }
  /** Collect the schedule for a range (week by week; past days come from the permanent record). */
  function occurrencesIn(state, from, to, today) {
    const out = [], status = {};
    for (let m = U.mondayOf(from); m <= to; m = U.addDays(m, 7)) {
      const w = E.generateWeek(state, m, { today: today || '9999-12-31', history: state.history || {} });
      w.occurrences.forEach(o => { if (o.date >= from && o.date <= to) out.push(o); });
      w.days.forEach(d => { if (d >= from && d <= to) status[d] = w.status[d]; });
    }
    return { occ: out, status };
  }
  function workload(state, from, to, today) {
    const { occ, status } = occurrencesIn(state, from, to, today), S = state.settings;
    return state.staff.map(s => {
      let pts = 0, min = 0, heavy = 0, tasks = 0, delegated = 0, days = 0;
      occ.forEach(o => {
        if (o.skipped) return; const f = E.factorOf(S, o.difficulty);
        if (o.mainId === s.id) { pts += o.minutes * f; min += o.minutes; tasks++; if (o.difficulty === 'H') heavy++; if (o.delegated || (o.flags || []).includes('delegated')) delegated++; }
        if (o.assistId === s.id && o.assistMinutes) { pts += o.assistMinutes * f; min += o.assistMinutes; }
      });
      eachDay(from, to, d => { const st = status[d] && status[d][s.id]; if (st && st.working) days += st.half ? 0.5 : 1; });
      return { staffId: s.id, pts: Math.round(pts), min, heavy, tasks, delegated, days, perDay: days ? Math.round(pts / days) : 0 };
    }).filter(x => x.tasks || x.days);
  }
  function completion(state, from, to, by, today) {
    const { occ } = occurrencesIn(state, from, [to, today || to].sort()[0], today), groups = {};
    occ.filter(o => !o.skipped && o.mainId).forEach(o => {
      const k = by === 'category' ? o.categoryId : by === 'task' ? o.name.replace(/ — .*$/, '') : o.mainId;
      const g = groups[k] = groups[k] || { key: k, total: 0, done: 0, redo: 0, partial: 0, not: 0, unmarked: 0, good: 0, ok: 0, poor: 0 };
      const m = (state.marks || {})[o.key]; g.total++;
      if (!m) g.unmarked++; else { if (g[m.status] != null) g[m.status]++; if (m.quality) g[m.quality]++; }
    });
    return Object.values(groups).map(g => Object.assign(g, { pctDone: g.total ? Math.round(g.done / g.total * 100) : 0, pctRedo: g.total ? Math.round(g.redo / g.total * 100) : 0, pctNot: g.total ? Math.round(g.not / g.total * 100) : 0 }));
  }
  function payrollSummary(state, from, to) {
    const rows = {};
    (state.payRuns || []).filter(r => r.status === 'paid' && r.payday >= from && r.payday <= to).forEach(r => {
      const k = r.staffId + '|' + r.payday.slice(0, 7), t = P.totals(r.lines), x = rows[k] = rows[k] || { staffId: r.staffId, month: r.payday.slice(0, 7), runs: 0, basic: 0, add: 0, ded: 0, net: 0, modes: new Set() };
      x.runs++; x.basic += t.basic; x.add += t.add; x.ded += t.ded; x.net += t.net; x.modes.add(r.payment.mode);
    });
    return Object.values(rows).map(x => Object.assign(x, { gross: x.basic + x.add, modes: [...x.modes].join(', ') })).sort((a, b) => a.month.localeCompare(b.month) || a.staffId.localeCompare(b.staffId));
  }
  function valeSummary(state, from, to) {
    return state.staff.map(s => {
      const vs = (state.vales || []).filter(v => v.staffId === s.id);
      const given = vs.filter(v => v.date >= from && v.date <= to).reduce((a, v) => a + Number(v.amount), 0);
      const repaid = vs.reduce((a, v) => a + (v.entries || []).filter(e => e.date >= from && e.date <= to).reduce((b, e) => b + Number(e.amount), 0), 0);
      return { staffId: s.id, given, repaid, outstanding: P.valeBalanceOf(state, s.id), count: vs.length };
    }).filter(x => x.count);
  }
  function contributionSummary(state, from, to, today) {
    const rows = [];
    for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = U.addMonths(m + '-01', 1).slice(0, 7))
      Object.keys(P.AGENCIES).forEach(ag => {
        let ee = 0, er = 0, paid = 0, due = 0, late = 0;
        state.staff.forEach(s => { const c = P.contribStatus(state, s, ag, m, today); if (!c) return; ee += c.ee; er += c.er; if (/Paid/.test(c.status)) paid++; else if (c.status === 'Late') late++; else due++; });
        if (ee + er) rows.push({ month: m, agency: ag, ee, er, total: ee + er, paid, due, late });
      });
    return rows;
  }
  function absenceSummary(state, from, to) {
    return state.staff.map(s => {
      const ex = (state.exceptions || []).filter(e => e.staffId === s.id && e.date >= from && e.date <= to), c = t => ex.filter(e => t.includes(e.type)).length;
      return { staffId: s.id, half: c(['half_am', 'half_pm']), dayoff: c(['dayoff_unpaid']), unauthorized: c(['absent_unauthorized']), sick: c(['sick']), paidLeave: c(['paid_leave']), restWorked: c(['rest_worked']) };
    }).filter(x => x.half + x.dayoff + x.unauthorized + x.sick + x.paidLeave + x.restWorked);
  }
  function incidentSummary(state, from, to) {
    const list = (state.incidents || []).filter(i => (i.happenedOn || i.foundOn) >= from && (i.happenedOn || i.foundOn) <= to);
    const count = f => { const m = {}; list.forEach(i => { const k = f(i); if (k) m[k] = (m[k] || 0) + 1; }); return m; };
    return { total: list.length, byType: count(i => i.type), byCategory: count(i => i.categoryId), byPerson: count(i => i.snapshot && (i.snapshot.mainIds || [])[0] || (i.snapshot && i.snapshot.leadId)), cost: list.reduce((a, i) => a + (Number(i.cost) || 0), 0) };
  }
  const toCSV = rows => rows.map(r => r.map(c => { const s = String(c == null ? '' : c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');

  root.MHM.Phase4 = {
    INCIDENT_TYPES, whoWasAssigned, LEVELS, skillsOf, onboardingPlan, COURSE_REFS,
    seedHandbook, nextVersion, sortSections, level, handbookDocx, importDocx, sectionsFromParagraphs, zipStore, crc32, unzipEntry,
    occurrencesIn, workload, completion, payrollSummary, valeSummary, contributionSummary, absenceSummary, incidentSummary, toCSV,
  };
})(typeof window !== 'undefined' ? window : globalThis);
