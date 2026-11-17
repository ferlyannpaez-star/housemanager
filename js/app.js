/* Montalban Home Manager — Phase 1 prototype UI (employer only). Local-only storage on this device. */
(function () {
  'use strict';
  const E = MHM.Engine, U = E.util;
  const KEY = 'mhm.v1';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const fmtD = d => d ? `${d.slice(8)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : '—';
  const fmtDL = d => `${DOWL[U.dow(d)]}, ${fmtD(d)}`;
  const fmtDS = d => `${DOWS[U.dow(d)]} ${+d.slice(8)} ${MON[+d.slice(5, 7) - 1]}`;
  const fmtT = m => m == null ? '—' : U.fmtMin(m);
  const num = n => Math.round(n).toLocaleString('en-PH');
  const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(label)}</option>`;

  const EXC_TYPES = {
    dayoff_home: ['Day-off: staying in the house, resting', 'No pay effect; no tasks'],
    dayoff_out: ['Day-off: going out (leaves 7 PM the evening before)', 'No pay effect; evening tasks before it go to the other helper'],
    rest_worked: ['Works on her day-off (no day-off this week)', 'Extra day\'s pay, replacement day, no extra pay (her choice) or paid outside the app'],
    two_day_off: ['Two-day off, going out (e.g. Fri 7 PM – Sun 7 PM)', 'Extra day swapped for a day-off she works, paid, or unpaid'],
    rest_moved: ['Day-off moved to another date', 'No pay effect; the day-off falls on the new date'],
    errand: ['Out for errands (part of a working day)', 'Paid, or unpaid as ½ or a whole day'],
    vacation: ['Vacation (days or weeks, e.g. to the province)', 'From service incentive leave, paid, or unpaid; essential daily tasks go first while she is away'],
    half_am: ['Half day — AM off', 'Deduct ½ day rate (if unpaid)'],
    half_pm: ['Half day — PM off', 'Deduct ½ day rate (if unpaid)'],
    dayoff_paid: ['Extra day-off with pay (approved)', 'No deduction'],
    dayoff_unpaid: ['Extra day-off without pay (approved)', 'Deduct 1 day rate'],
    paid_leave: ['Paid leave (e.g., service incentive leave)', 'No deduction; reduces leave balance'],
    sick: ['Sick — can\'t work (in the house or away)', 'Per policy setting'],
    absent_unauthorized: ['Unauthorized absence', 'Deduct 1 day rate; flagged in reports'],
  };
  /** One-line description of a recorded exception, with its details. */
  const excDetail = e => {
    const x = [];
    if (e.type === 'rest_worked') x.push(e.initiated === 'helper' ? 'her choice' : 'employer asked', e.portion === 'half' ? 'half day' : 'whole day',
      { pay: 'extra day\'s pay', replacement: 'replacement day' + (e.replDate ? ' ' + fmtD(e.replDate) : ''), none: 'no extra pay', outside: 'paid outside the app' }[e.comp || 'pay']);
    if (e.type === 'two_day_off') x.push(fmtD(e.date) + ' – ' + fmtD(e.to), e.swap === 'exchange' ? 'swapped: works her day-off ' + fmtD(e.exchangeDate) : e.swap === 'paid' ? 'extra day paid' : 'extra day unpaid');
    if (e.type === 'errand') x.push(e.from + '–' + e.to, e.paid === 'unpaid' ? 'unpaid (' + (e.portion === 'whole' ? 'whole day' : '½ day') + ')' : 'paid');
    if (e.type === 'sick') x.push(e.where === 'away' ? 'away' : 'resting in the house');
    if (e.type === 'vacation') x.push(fmtD(e.date) + ' – ' + fmtD(e.to), e.place || '', { sil: 'from service incentive leave', paid: 'paid', unpaid: 'unpaid' }[e.pay || 'sil']);
    if (e.type === 'rest_moved' && e.to) x.push('to ' + fmtD(e.to));
    return x.join(' · ');
  };
  const MARK_STATUS = { done: 'Done', redo: 'Done – needs redo', partial: 'Partly done', not: 'Not done', skipped: 'Skipped', moved: 'Moved' };
  const FLAG_TEXT = {
    conflict: 'Overlaps another task or does not fit its time window.', outsideWindow: 'Placed after its latest finish time.',
    unassigned: 'Nobody available to do this.', unplaced: 'Could not be placed in the day.', noAssistant: 'Needs two people — no assistant available.',
    reassigned: 'Re-assigned because the lead is off.', delegated: 'Delegated by lead to balance the load.', checkChildren: 'Weekend: check that children are out of the area.',
    slippery: 'Floors will be slippery — tell the household.', moved: 'Moved from its generated date.',
    fixedTask: 'Fixed assignment (Task Library).', manualTask: 'Manually assigned until a date (Task Library).',
    assigneeOff: 'The assigned person is off today, so the rotation decided who does it.',
    driverOff: 'The driver is off, away on the school run, or outside his hours, so a helper does it. Driving jobs are skipped instead.',
  };
  const CONS_ICON = { children: ['👶', 'Children must not be in the area'], noisy: ['🔇', 'Not during quiet hours'], lowTraffic: ['🚶', 'Low foot traffic day'], ladder: ['🪜', 'Needs ladder'] };

  // ---------- state (one device only: IndexedDB in this browser; falls back to localStorage) ----------
  const DB_NAME = 'mhm', STORE = 'kv';
  let dbp = null, useIdb = typeof indexedDB !== 'undefined';
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  async function idbGet(k) {
    const d = await db();
    return new Promise((res, rej) => { const q = d.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  }
  async function idbSet(k, v) {
    const d = await db();
    return new Promise((res, rej) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  }
  async function loadState() {
    let s = null;
    if (useIdb) {
      try {
        s = await idbGet('state');
        if (!s) { const raw = localStorage.getItem(KEY); if (raw) { s = JSON.parse(raw); await idbSet('state', s); localStorage.removeItem(KEY); } }
      } catch (e) { console.warn('IndexedDB unavailable, using localStorage', e); useIdb = false; }
    }
    if (!s && !useIdb) { try { const raw = localStorage.getItem(KEY); if (raw) s = JSON.parse(raw); } catch (e) { console.warn(e); } }
    if (s) return upgrade(s);
    s = MHM.Seed.create(); s.startedOn = todayStr(); return s;
  }
  /** Fill in settings added since the data was saved, and apply the owner's §9 decisions once. */
  function upgrade(s) {
    const done = s.decisions || 0; // read before merging: the seed already carries the latest number
    s = Object.assign(MHM.Seed.create(), s);
    s.settings = Object.assign(MHM.Seed.create().settings, s.settings);
    // decisions 2: rotation every 2 weeks + daily rate ÷26 (13 Nov 2026)
    if (done < 2) { s.settings.rotation = 'biweekly'; s.settings.dayRateDivisor = 26; s.decisions = 2; }
    // decisions 3: packed lunch on school days; Pets category (fish and turtles) (13 Nov 2026)
    if (done < 3) {
      const fresh = MHM.Seed.create();
      const baon = s.tasks.find(t => t.id === 't-kitchen-pack-children-s-baon-snacks');
      if (baon) baon.active = false; // replaced by the two packed-lunch tasks; kept (inactive) so past records still read
      if (!s.categories.some(c => c.id === 'pets')) {
        s.categories.push(Object.assign({}, fresh.categories.find(c => c.id === 'pets')));
        s.categories.forEach(c => { if (c.id === 'driver') c.sort = Math.max(c.sort, 8); });
      }
      if (!s.areas.includes('Fish & turtle tanks')) s.areas.push('Fish & turtle tanks');
      const have = new Set(s.tasks.map(t => t.id));
      fresh.tasks.filter(t => (t.categoryId === 'pets' || /packed lunch|lunch boxes/.test(t.name)) && !have.has(t.id)).forEach(t => s.tasks.push(t));
      s.decisions = 3;
    }
    // decisions 4: Phase 2 — cooking tasks take the dish from the menu (recipes, plan, events, vehicles come from the seed above)
    if (done < 4) {
      const fresh = MHM.Seed.create(), slots = {};
      fresh.tasks.forEach(t => { if (t.mealSlot) slots[t.id] = t.mealSlot; });
      s.tasks.forEach(t => { if (t.mealSlot == null || t.mealSlot === '') t.mealSlot = slots[t.id] || ''; });
      s.decisions = 4;
    }
    // decisions 5: Phase 3 — payroll data and forms come from the seed above; sample salaries only if none recorded
    if (done < 5) {
      if (!(s.salaryHistory || []).length) s.salaryHistory = MHM.Seed.create().salaryHistory.filter(h => s.staff.some(x => x.id === h.staffId));
      s.decisions = 5;
    }
    // decisions 6: Phase 4 — appliances, logs and the handbook outline come from the seed; onboarding plans for recent hires
    if (done < 6) {
      if (!s.handbook) s.handbook = MHM.Phase4.seedHandbook();
      s.onboarding = s.onboarding || {};
      s.staff.filter(x => x.role === 'helper' && x.hireDate && !s.onboarding[x.id] && U.daysBetween(x.hireDate, todayStr()) <= 30).forEach(x => { s.onboarding[x.id] = MHM.Phase4.onboardingPlan(x, s.settings); });
      s.decisions = 6;
    }
    // decisions 7: drop untouched onboarding plans auto-made for helpers already past their first month
    if (done < 7) {
      Object.keys(s.onboarding || {}).forEach(id => { const x = s.staff.find(y => y.id === id), plan = s.onboarding[id]; if (x && plan.every(p => !p.done) && U.daysBetween(x.hireDate, todayStr()) > 30) delete s.onboarding[id]; });
      s.decisions = 7;
    }
    // decisions 8: the household's handbook text replaces the starter outline (only if nothing was edited or published)
    if (done < 8) {
      if (s.handbook && s.handbook.outline && !(s.handbook.versions || []).length && MHM.HandbookText) s.handbook = MHM.Phase4.seedHandbook();
      s.decisions = 8;
    }
    // decisions 9: packed-lunch tasks point to §4.2 (Early Morning) — the household handbook has no §5.7
    if (done < 9) {
      s.tasks.forEach(t => { if (t.handbookRef && /§5\.7/.test(t.handbookRef)) t.handbookRef = t.handbookRef.replace(/§5\.7/g, '§4.2'); });
      s.decisions = 9;
    }
    // decisions 10: drafted additions to the household handbook (§11.5 line, §15 Pet Care, §16 Driver), added to the draft only
    if (done < 10) {
      const hb = s.handbook, T = MHM.HandbookText;
      if (hb && T && !hb.outline) {
        const d = hb.draft.sections, s115 = d.find(x => x.num === '11.5');
        if (s115) s115.body = s115.body.replace(/• Keep drinking water containers\s*\n/, '• Keep drinking water containers clean, covered, and away from chemicals.\n');
        T.sections.filter(x => /^1[56](\.|$)/.test(x.num) && !d.some(y => y.num === x.num)).forEach(x => d.push(JSON.parse(JSON.stringify(x))));
        hb.draft.sections = MHM.Phase4.sortSections(d);
      }
      s.tasks.forEach(t => { if (t.handbookRef === 'Pets') t.handbookRef = '§15'; else if (t.handbookRef === 'Driver') t.handbookRef = '§16'; });
      s.decisions = 10;
    }
    // decisions 11 (14 Nov 2026): the owner's requests, applied in the owner's own browser the next time the app opens
    if (done < 11) {
      const b = s.staff.find(x => x.id === 's_b');
      if (b && b.fullName === 'Helper B') { b.fullName = 'Helper B'; b.notes = (b.notes || '').replace('Sample record — rename to the real helper.', '').trim(); }
      if (b && !s.exceptions.some(e => e.staffId === 's_b' && e.date === '2026-11-14' && e.type === 'rest_worked'))
        s.exceptions.push({ id: 'x-hb-1114', staffId: 's_b', type: 'rest_worked', date: '2026-11-14', portion: 'whole', comp: 'outside', initiated: 'employer', replDate: '', to: '', notes: 'Visitors today — asked not to take her day-off' });
      if (s.handbook && !(s.handbook.versions || []).length && !s.handbook.outline && (s.handbook.draft.sections || []).length)
        s.handbook.versions.push({ version: '1.0', publishedOn: '2026-11-13', sections: JSON.parse(JSON.stringify(s.handbook.draft.sections)), note: 'First version: household handbook text, with §11.5 completed and §15 Pet Care and §16 Driver added' });
      s.audit = s.audit || [];
      s.audit.unshift({ at: new Date().toISOString(), user: 'Owner', action: 'Applied owner requests', detail: 'Helper B works her 14 Nov day-off (paid outside the app); handbook published v1.0' });
      s.decisions = 11;
    }
    // decisions 12 (16 Nov 2026): school run leaves 07:10; the driver never assists and isn't on rotation; driving jobs are driver-only
    if (done < 12) {
      const byName = n => s.tasks.find(t => t.name === n);
      const drop = byName('School drop-off');
      if (drop) { drop.startAt = '07:10'; drop.window = ['07:10', drop.window[1] > '08:10' ? drop.window[1] : '08:10']; }
      ['School drop-off', 'School pick-up', 'Family/employer trips', 'Vehicle daily check (tires, oil, water, lights, fuel)'].forEach(n => { const t = byName(n); if (t) t.driverOnly = true; });
      s.tasks.forEach(t => { t.driverMayAssist = false; });
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
      const isDriver = id => (s.staff.find(x => x.id === id) || {}).role === 'driver';
      s.tasks.forEach(t => { if (t.assign && t.assign.mode === 'manual' && isDriver(t.assign.staffId) && (!t.assign.until || t.assign.until >= today)) t.assign = null; }); // manual is for helpers
      s.leadOverrides = (s.leadOverrides || []).filter(o => !(isDriver(o.staffId) && (o.until || o.from) >= today));
      s.audit = s.audit || [];
      s.audit.unshift({ at: new Date().toISOString(), user: 'Owner', action: 'Applied owner requests', detail: 'School drop-off starts 07:10; the driver no longer assists or takes manual/rotation assignments; driving jobs are driver-only, his other tasks go to the helpers on his day off' });
      s.decisions = 12;
    }
    // decisions 13 (16 Nov 2026): the driver stays at school and brings the children home about 18:00 — one school run, no separate pick-up
    if (done < 13) {
      const run = s.tasks.find(t => t.name === 'School drop-off') || s.tasks.find(t => t.id === 't-driver-school-drop-off');
      if (run) Object.assign(run, { name: 'School run: drop-off, waits at school, brings the children home', startAt: '07:10', window: ['07:10', '18:00'], minutes: 650, driverOnly: true });
      const pick = s.tasks.find(t => t.name === 'School pick-up');
      if (pick) pick.active = false; // kept (inactive) so past records still read correctly
      s.audit = s.audit || [];
      s.audit.unshift({ at: new Date().toISOString(), user: 'Owner', action: 'Applied owner requests', detail: 'School run: driver leaves 07:10, stays at school and brings the children home about 18:00; separate pick-up task switched off; his tasks in those hours go to the helpers' });
      s.decisions = 13;
    }
    // decisions 14 (16 Nov 2026): Philippine public holidays (weekdays, from today) pre-filled in the school calendar
    if (done < 14) {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
      s.noSchool = s.noSchool || [];
      const add = MHM.Seed.holidayEntries(today).filter(h => !s.noSchool.some(n => n.from <= h.from && h.from <= (n.to || n.from)));
      s.noSchool.push(...add);
      s.audit = s.audit || [];
      if (add.length) s.audit.unshift({ at: new Date().toISOString(), user: 'Owner', action: 'Added public holidays', detail: add.length + ' weekday holidays (2026–2027) added to the school calendar' });
      s.decisions = 14;
    }
    // decisions 15 (16 Nov 2026): Cooking becomes its own lead area, separate from Kitchen (serving, clean-up, pantry)
    if (done < 15) {
      if (!s.categories.some(c => c.id === 'cooking')) s.categories.splice(Math.max(0, s.categories.findIndex(c => c.id === 'kitchen')), 0, { id: 'cooking', name: 'Cooking', color: '#b5452f', sort: 0 });
      const cookNames = /^(Early prep \+ cook breakfast|Cook children's packed lunch|Pack children's lunch boxes|Cook lunch|Cook dinner)/;
      let moved = 0;
      s.tasks.forEach(t => { if (t.categoryId === 'kitchen' && (cookNames.test(t.name) || ['breakfast', 'baon', 'lunch', 'dinner'].includes(t.mealSlot))) { t.categoryId = 'cooking'; moved++; } });
      // the old "Cooking" skill becomes the Cooking lead area's skill level
      Object.values(s.skillLevels || {}).forEach(lv => { if (lv && lv.cooking != null && lv['cat:cooking'] == null) lv['cat:cooking'] = lv.cooking; });
      s.audit = s.audit || [];
      s.audit.unshift({ at: new Date().toISOString(), user: 'Owner', action: 'Applied owner requests', detail: 'Cooking is now its own lead area (' + moved + ' cooking tasks moved from Kitchen)' });
      s.decisions = 15;
    }
    // decisions 16 (16 Nov 2026): a default 4-week menu on rotation (only if no cycle weeks were saved); recipes say which meals they suit
    if (done < 16) {
      const c = s.mealCycle, empty = !c || !(c.weeks || []).some(w => Object.keys(w || {}).length);
      if (empty) s.mealCycle = MHM.Seed.defaultMenuCycle();
      const ad = (s.recipes || []).find(r => r.id === 'r-adobo'); if (ad && !ad.mealTypes) ad.mealTypes = ['lunch', 'dinner'];
      s.audit = s.audit || [];
      s.audit.unshift({ at: new Date().toISOString(), user: 'Owner', action: 'Applied owner requests', detail: (empty ? 'Default 4-week menu rotation turned on; ' : '') + 'recipes can be marked for breakfast, lunch, dinner or snacks' });
      s.decisions = 16;
    }
    // decisions 17 (16 Nov 2026): starter recipe book — 50 quick household recipes (breakfast, appetizers, vegetables, soups, mains)
    if (done < 17) {
      s.recipes = s.recipes || [];
      const add = (MHM.RECIPE_BOOK || []).filter(r => !s.recipes.some(x => x.id === r.id || x.name.toLowerCase() === r.name.toLowerCase())).map(r => JSON.parse(JSON.stringify(r)));
      s.recipes.push(...add);
      s.audit = s.audit || [];
      if (add.length) s.audit.unshift({ at: new Date().toISOString(), user: 'Owner', action: 'Added recipes', detail: add.length + ' starter recipes (breakfast, appetizers, vegetable side dishes, soups, main courses)' });
      s.decisions = 17;
    }
    // decisions 18 (16 Nov 2026): meals have several dishes by course (no AM/PM snack slots); carbs recipes added
    if (done < 18) {
      s.recipes = s.recipes || [];
      const add = (MHM.RECIPE_BOOK || []).filter(r => !s.recipes.some(x => x.id === r.id || x.name.toLowerCase() === r.name.toLowerCase())).map(r => JSON.parse(JSON.stringify(r)));
      s.recipes.push(...add);
      if (s.mealCycle && s.mealCycle.source === 'default') { const on = s.mealCycle.on; s.mealCycle = MHM.Seed.defaultMenuCycle(); s.mealCycle.on = on; } // the default menu, now with courses
      Object.values(s.mealPlan || {}).forEach(day => { delete day.amSnack; delete day.pmSnack; }); // snack slots removed (recipes kept)
      const sg = s.recipes.find(r => r.id === 'rb-sinangag'); if (sg && sg.category === 'breakfast') { sg.category = 'carbs'; sg.mealTypes = ['breakfast', 'lunch', 'dinner']; }
      s.audit = s.audit || [];
      s.audit.unshift({ at: new Date().toISOString(), user: 'Owner', action: 'Applied owner requests', detail: 'Meals can have several dishes (appetizer, soup, main course, vegetable side, carbs); AM/PM snack slots removed; ' + add.length + ' carbs recipes added' });
      s.decisions = 18;
    }
    return s;
  }
  let state = MHM.Seed.create();
  const ui = { view: 'today', date: todayStr(), staffTab: 'overview', taskCat: '', taskQ: '', showInactive: false, showExited: false };
  let weekCache = {};
  const saveFailed = () => toast('Could not save — device storage is full. Download a backup and remove some photos.');
  const persist = () => {
    if (useIdb) { idbSet('state', state).catch(saveFailed); return true; }
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { saveFailed(); return false; }
  };

  // ---------- encrypted backup files (AES-GCM 256, key from password via PBKDF2-SHA256) ----------
  const b64 = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function deriveKey(pw, salt, iter) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encryptBackup(obj, pw) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 310000;
    const key = await deriveKey(pw, salt, iter);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return { format: 'mhm-backup', version: 1, encrypted: true, kdf: 'PBKDF2-SHA256', iter, salt: b64(salt), iv: b64(iv), createdAt: new Date().toISOString(), data: b64(ct) };
  }
  async function decryptBackup(f, pw) {
    const key = await deriveKey(pw, unb64(f.salt), f.iter);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv) }, key, unb64(f.data));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  let pendingImport = null;
  function restoreFrom(s, name) {
    if (!s || !s.staff || !s.tasks || !s.settings) { toast('That file is not a Home Manager backup.'); return; }
    if (!confirm('Replace ALL data on this device with this backup?')) return;
    state = upgrade(s); weekCache = {}; closeModal(); commit('Restored backup', name || '');
  }
  const backupDue = d => {
    if (state.lastBackupAt) return U.daysBetween(state.lastBackupAt.slice(0, 10), d) >= 30;
    return U.daysBetween(state.startedOn, d) >= 7;
  };
  function commit(action, detail) {
    state._rev = (state._rev || 0) + 1;
    state.audit.unshift({ at: new Date().toISOString(), user: 'Owner', action, detail: detail || '' });
    if (state.audit.length > 500) state.audit.length = 500;
    weekCache = {};
    persist(); render();
  }
  const strip = o => { const c = Object.assign({}, o); delete c.frozen; return c; };
  /** Generated week, with days before today stored permanently (accountability record, spec P10). */
  function getWeek(date) {
    const m = U.mondayOf(date);
    if (weekCache[m]) return weekCache[m];
    const today = todayStr();
    const r = E.generateWeek(state, m, { today, history: state.history });
    let changed = false;
    r.days.forEach(d => {
      if (d < today && d >= state.startedOn && !state.history[d]) { state.history[d] = r.occurrences.filter(o => o.date === d).map(strip); changed = true; }
    });
    if (changed) persist();
    weekCache[m] = r;
    return r;
  }
  const findOcc = (key, date) => getWeek(date).occurrences.find(o => o.key === key);
  const staffById = id => state.staff.find(s => s.id === id);
  const sName = id => { const s = staffById(id); return s ? (s.nickname || s.fullName) : '—'; };
  const cat = id => state.categories.find(c => c.id === id) || { id: '', name: 'One-off', color: '#9a948a' };
  const activeStaff = d => state.staff.filter(s => E.isActive(s, d || todayStr()));
  const helpersOn = d => activeStaff(d).filter(s => s.role === 'helper');
  const leadCatsOf = (seg, sid) => Object.entries(seg.leads).filter(([, id]) => id === sid).map(([c]) => cat(c).name);

  // ---------- shell ----------
  const NAV = [
    ['today', '🏠', 'Today'], ['day', '📅', 'Day schedule'], ['week', '🗓️', '7-day schedule'], ['leads', '🔁', 'Leads & Rotation'],
    ['month', '📆', 'Tasks — Month & Year'], ['planner', '🎂', 'Event planner'], ['meals', '🍲', 'Meals & Recipes'],
    ['tasks', '✅', 'Task Library'], ['staff', '👥', 'Staff'], ['attendance', '📌', 'Calendar'], ['settings', '⚙️', 'Settings'],
    null,
    ['payroll', '💰', 'Payroll & Vale'], ['contrib', '🏛', 'Contributions & Benefits'],
    null,
    ['account', '⚠️', 'Accountability'], ['coaching', '📝', 'Coaching Log'],
    ['training', '🎓', 'Training'], ['handbook', '📘', 'Handbook'], ['reports', '📊', 'Reports'],
  ];
  function renderNav() {
    document.getElementById('nav').innerHTML = `<div class="brand">${esc(state.settings.householdName)}<small>Home Manager · Phase 4 prototype</small></div>` +
      NAV.map(n => n ? `<a data-act="nav" data-v="${n[0]}" class="${ui.view === n[0] ? 'on' : ''}${n[3] ? ' later' : ''}"><span>${n[1]}</span>${esc(n[2])}${n[3] ? `<span class="tag">Phase ${n[3]}</span>` : ''}</a>` : '<div class="sep"></div>').join('');
  }
  function render() {
    renderNav();
    const v = VIEWS[ui.view] || vLater;
    document.getElementById('main').innerHTML = v();
    if (document.getElementById('exc-form')) excTypeUI();
    if (ui.view === 'settings' && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(e => {
        const el = document.getElementById('storage-est'); if (!el) return;
        el.textContent = `Storage: ${(e.usage / 1048576).toFixed(1)} MB used of about ${Math.round(e.quota / 1048576).toLocaleString()} MB available · ${useIdb ? 'IndexedDB' : 'localStorage (limited)'}${state._persisted ? ' · protected from automatic clearing' : ''}`;
      }).catch(() => {});
    }
  }
  function toast(msg) {
    const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function modal(title, body, foot, wide) {
    document.getElementById('modal-root').innerHTML = `<div class="modal-bg" data-act="modal-bg"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-label="${esc(title)}">
      <div class="modal-head"><h2>${title}</h2><button class="btn icon" data-act="close" aria-label="Close">✕</button></div>
      <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div></div>`;
  }
  const closeModal = () => { document.getElementById('modal-root').innerHTML = ''; };

  // ---------- small pieces ----------
  function tickBtn(o) {
    const m = state.marks[o.key];
    const cls = m ? ({ done: 'done', redo: 'redo', partial: 'redo', not: 'not', skipped: 'skip', moved: 'skip' }[m.status] || '') : '';
    const sym = m ? ({ done: '✓', redo: '↻', partial: '½', not: '✕', skipped: '–', moved: '→' }[m.status] || '') : '';
    return `<button class="tick ${cls}" title="${m ? esc(MARK_STATUS[m.status]) : 'Mark done'}" data-act="tick" data-k="${esc(o.key)}" data-d="${o.date}">${sym}</button>`;
  }
  function occLine(o, sid, opts) {
    const role = o.mainId === sid ? '<span class="tag main">MAIN</span>' : `<span class="tag assist">ASSIST</span>`;
    const end = o.mainId === sid ? o.end : (o.start != null ? o.start + o.assistMinutes : null);
    const warn = o.flags.some(f => ['conflict', 'unplaced', 'noAssistant'].includes(f)) ? ' <span class="chip warn">⚠</span>' : '';
    return `<div class="li">${opts && opts.noTick ? '' : tickBtn(o)}<span class="time">${fmtT(o.start)}–${fmtT(end)}</span>
      <span class="grow"><span class="clickable name" data-act="occ" data-k="${esc(o.key)}" data-d="${o.date}"><span class="dot" style="background:${cat(o.categoryId).color}"></span> ${o.recipeId ? '📖 ' : ''}${esc(o.name)}</span>${warn}</span>
      <span class="row nowrap">${role}<span class="tag ${o.difficulty}">${o.difficulty}</span><span class="tag badge">${o.badge}</span></span></div>`;
  }
  function staffTasks(r, d, sid) {
    return r.occurrences.filter(o => o.date === d && !o.skipped && (o.mainId === sid || o.assistId === sid)).sort((a, b) => (a.start ?? 9999) - (b.start ?? 9999));
  }
  function statusChip(st) {
    if (!st) return '';
    if (st.working) return `<span class="chip ${st.half ? 'warn' : 'ok'}">${esc(st.label)}</span>${st.shadow ? ' <span class="chip info">Shadow mode</span>' : ''}`;
    return `<span class="chip ${st.absence ? 'bad' : ''}">${esc(st.label)}</span>`;
  }
  function loadBars(r, ids) {
    const per = ids.map(id => r.perWorkingDay[id] || 0);
    const avg = per.reduce((a, b) => a + b, 0) / (per.length || 1);
    const max = Math.max(...per, 1);
    const tol = Number(state.settings.tolerance);
    return `<div class="bars">${ids.map((id, i) => {
      const dev = avg ? (per[i] - avg) / avg : 0; const bad = Math.abs(dev) > tol;
      return `<div class="bar"><span>${esc(sName(id))}</span><div class="meter${bad ? ' bad' : ''}"><i style="width:${(per[i] / max * 100).toFixed(1)}%"></i></div>
      <span class="small nowrap">${num(per[i])} pts/day <b style="color:${bad ? 'var(--bad)' : 'var(--ink-3)'}">${dev >= 0 ? '+' : ''}${Math.round(dev * 100)}%</b></span></div>`;
    }).join('')}</div>`;
  }

  // ---------- Today ----------
  function vToday() {
    const d = todayStr(), r = getWeek(d), seg = r.leadsByDay[d];
    const staff = activeStaff(d);
    const helpers = staff.filter(s => s.role === 'helper');
    const dayOcc = r.occurrences.filter(o => o.date === d && !o.skipped);
    const L = r.loads;
    const todayPts = helpers.map(h => (L[h.id] && L[h.id][d]) ? L[h.id][d] : { pts: 0, min: 0, heavy: 0 });
    const tAvg = todayPts.reduce((a, b) => a + b.pts, 0) / (todayPts.length || 1);
    const working = helpers.filter(h => r.status[d][h.id].working);
    const tol = Number(state.settings.tolerance);

    const whoCard = `<div class="card"><h2>Who's working today</h2><div class="list">${staff.map(s => `<div class="li"><span class="grow"><b class="clickable" data-act="staff" data-id="${s.id}">${esc(s.nickname || s.fullName)}</b> <span class="muted small">${s.role === 'driver' ? 'Driver' : 'Helper'}</span>
      ${s.role === 'helper' || leadCatsOf(seg, s.id).length ? `<div class="small muted">Leads: ${esc(leadCatsOf(seg, s.id).join(', ') || '—')}</div>` : ''}</span>
      ${r.status[d][s.id].rest && !/Two-day/.test(r.status[d][s.id].label) ? `<button class="btn sm" data-act="exc-new" data-id="${s.id}" data-t="rest_worked" title="Record that she works on her day-off today">Works today instead</button>` : ''}${statusChip(r.status[d][s.id])}</div>`).join('') || '<div class="empty">No active staff. Add staff first.</div>'}</div></div>`;

    const loadCard = `<div class="card"><h2>Load meter</h2>
      <div class="section-title" style="margin-top:0">Today</div>
      ${helpers.map((h, i) => { const x = todayPts[i]; const bad = working.length > 1 && r.status[d][h.id].working && tAvg && Math.abs(x.pts - tAvg) / tAvg > tol;
        return `<div class="bar" style="display:grid;grid-template-columns:90px 1fr auto;gap:8px;align-items:center;margin:5px 0;font-size:13.5px"><span>${esc(sName(h.id))}</span>
        <div class="meter${bad ? ' bad' : ''}"><i style="width:${Math.min(100, x.pts / Math.max(...todayPts.map(p => p.pts), 1) * 100)}%"></i></div><span class="small nowrap">${num(x.pts)} pts · ${x.min} min · ${x.heavy} heavy</span></div>`; }).join('')}
      <div class="section-title">This week, per working day</div>${loadBars(r, helpers.map(h => h.id))}
      <div class="small muted">Red = more than ±${Math.round(tol * 100)}% from the average.</div></div>`;

    const comingCard = `<div class="card"><h2>Coming up (14 days)</h2><div class="list">${comingUp(d).map(c => `<div class="li"><span class="time">${fmtDS(c.date)}</span><span class="grow">${c.html}</span></div>`).join('') || '<div class="empty">Nothing in the next 14 days.</div>'}</div></div>`;

    const staffCards = staff.filter(s => r.status[d][s.id].working).map(s => {
      const list = staffTasks(r, d, s.id);
      const unmarked = list.filter(o => o.mainId === s.id && !state.marks[o.key]).length;
      return `<div class="card"><div class="row" style="margin-bottom:6px"><h2 style="margin:0;flex:1">${esc(s.nickname || s.fullName)}</h2>
        <span class="muted small">${list.length} tasks</span>${unmarked ? `<button class="btn sm" data-act="bulk" data-id="${s.id}" data-d="${d}">Mark all done</button>` : ''}</div>
        <div class="list">${list.map(o => occLine(o, s.id)).join('') || '<div class="empty">No tasks.</div>'}</div></div>`;
    }).join('');

    return `<div class="head"><div><h1>Today</h1><div class="sub">${fmtDL(d)} · ${E.isSchoolDay(state, d) ? 'School day — children out 08:00–17:00' : 'No school — children may be home'}</div></div><span class="spacer"></span>
      <button class="btn" data-act="exc-new">Mark absence</button>${noSchoolBtn(d)}<button class="btn" data-act="event-new" data-d="${d}">🎉 Event mode</button><button class="btn" data-act="oneoff-new" data-d="${d}">+ One-off task</button>
      <button class="btn" data-act="print-manager" data-d="${d}">🖨 Manager's list</button><button class="btn primary" data-act="print-day" data-d="${d}">🖨 Staff checklists</button></div>
      ${birthdaysOn(d).map(b => `<div class="alert info">${esc(bdayText(b))} — today!</div>`).join('')}
      ${r.notes[d].map(n => `<div class="alert warn">⚠ ${esc(n)}</div>`).join('')}
      <div class="grid g3">${whoCard}${loadCard}${comingCard}</div>
      <div style="height:16px"></div>${needsAttention(d)}
      <div style="height:16px"></div><div class="grid g2">${staffCards || '<div class="card empty">Nobody is working today.</div>'}</div>
      <div style="height:16px"></div>${todayMenu(d)}`;
  }
  function needsAttention(d) {
    const items = [];
    const from = [U.addDays(d, -7), state.startedOn].sort()[1];
    for (let x = from; x < d; x = U.addDays(x, 1)) {
      const occ = getWeek(x).occurrences.filter(o => o.date === x && !o.skipped && o.mainId && !state.marks[o.key]);
      if (!occ.length) continue;
      const by = {}; occ.forEach(o => { by[o.mainId] = (by[o.mainId] || 0) + 1; });
      const overdue = U.daysBetween(x, d) >= 2;
      items.push(`<div class="li"><span class="chip ${overdue ? 'bad' : 'warn'}">${overdue ? 'Unmarked 2+ days' : 'Not marked yet'}</span><span class="grow">${fmtDL(x)} — ${Object.entries(by).map(([id, n]) => `${esc(sName(id))}: ${n}`).join(' · ')}</span>
        <button class="btn sm" data-act="goto-day" data-d="${x}">Open day</button></div>`);
    }
    Object.entries(state.marks).filter(([, m]) => m.status === 'redo' && m.date >= U.addDays(d, -14)).forEach(([k, m]) => {
      const o = findOcc(k, m.date);
      if (o) items.push(`<div class="li"><span class="chip warn">Needs redo</span><span class="grow clickable" data-act="occ" data-k="${esc(k)}" data-d="${m.date}">${esc(o.name)} — ${fmtDS(m.date)} (${esc((m.doneBy || []).map(sName).join(', '))})</span></div>`);
    });
    const nh = noHelperDays(d, 14);
    if (nh.length) items.unshift(`<div class="li"><span class="chip bad">No helper</span><span class="grow">No helper is available on ${nh.map(fmtDS).join(', ')}. That's allowed, but the family needs to adjust (cooking, the children, essentials).</span><button class="btn sm" data-act="nav" data-v="attendance">See who's off</button></div>`);
    if (backupDue(d)) items.unshift(`<div class="li"><span class="chip bad">Backup due</span><span class="grow">${state.lastBackupAt ? 'Last encrypted backup: ' + fmtD(state.lastBackupAt.slice(0, 10)) + '.' : 'No backup yet.'} Data lives only on this device.</span>
      <button class="btn sm primary" data-act="export">Download backup</button></div>`);
    // Phase 3 reminders: regularization (30/14/7 days), paydays, vale authorizations, contributions, annual raise
    state.staff.filter(s => E.isActive(s, d)).forEach(s => {
      const rr = P.regReminder(s, d);
      if (rr) items.unshift(`<div class="li"><span class="chip ${rr.stage === 7 ? 'bad' : 'warn'}">Regularization ${rr.left >= 0 ? 'in ' + rr.left + ' days' : 'overdue'}</span><span class="grow">${esc(s.fullName)} reaches 6 months on ${fmtD(rr.due)}. Decide: regularize (new contract, salary and benefits) or end the provisional contract.</span>
        <button class="btn sm primary" data-act="regularize" data-id="${s.id}">Regularize…</button></div>`);
      const n = P.nextDue(state, s, d);
      if (n.payday <= U.addDays(d, 1) && !(state.payRuns || []).some(r => r.staffId === s.id && r.periodStart === n.start && r.status === 'paid'))
        items.unshift(`<div class="li"><span class="chip ${n.payday < d ? 'bad' : 'warn'}">Payday ${n.payday === d ? 'today' : n.payday < d ? fmtDS(n.payday) : 'tomorrow'}</span><span class="grow">${esc(s.nickname || s.fullName)} — period ${fmtD(n.start)} – ${fmtD(n.end)}</span><button class="btn sm primary" data-act="run-new" data-id="${s.id}" data-p="${n.start}">Prepare pay run</button></div>`);
      const rd = P.raiseDue(state, s, d);
      if (rd && !rd.capped) items.push(`<div class="li"><span class="chip info">Annual increase</span><span class="grow">${esc(s.fullName)}: ${peso(rd.from)} → ${peso(rd.to)} due ${fmtD(rd.date)} (regular contract: ₱${state.settings.annualIncrease} a year up to ${peso(state.settings.salaryCap)}).</span><button class="btn sm" data-act="staff-tab" data-id="${s.id}" data-tab="pay">Salary</button></div>`);
      Object.keys(P.AGENCIES).forEach(ag => { const m = U.addMonths(d.slice(0, 7) + '-01', -1).slice(0, 7), c = P.contribStatus(state, s, ag, m, d);
        if (c && !/Paid/.test(c.status) && (c.status === 'Late' || U.daysBetween(d, c.due) <= 7)) items.push(`<div class="li"><span class="chip ${c.status === 'Late' ? 'bad' : 'warn'}">${P.AGENCIES[ag]} ${c.status === 'Late' ? 'late' : 'due ' + fmtDS(c.due)}</span><span class="grow">${esc(s.nickname || s.fullName)} — ${MON[+m.slice(5) - 1]} contribution ${peso(c.total)}</span><button class="btn sm" data-act="nav" data-v="contrib">Open</button></div>`); });
    });
    // Phase 4 reminders: coaching follow-ups, onboarding steps, handbook acknowledgments, open incidents
    (state.coaching || []).filter(c => c.outcome === 'ongoing' && c.followUp && c.followUp <= U.addDays(d, 2)).forEach(c => items.push(`<div class="li"><span class="chip ${c.followUp < d ? 'bad' : 'warn'}">Follow-up ${c.followUp === d ? 'today' : fmtDS(c.followUp)}</span><span class="grow">${esc(sName(c.staffId))} — ${esc(COACH_TYPES[c.type][1])}: ${esc((c.plan || c.what || '').slice(0, 80))}</span><button class="btn sm" data-act="coach" data-id="${c.id}">Open</button></div>`));
    Object.entries(state.onboarding || {}).forEach(([sid, plan]) => { const s = staffById(sid); if (!s || !E.isActive(s, d)) return; const due = plan.filter(x => !x.done && x.due <= d); if (due.length) items.push(`<div class="li"><span class="chip warn">Onboarding</span><span class="grow">${esc(s.fullName)}: ${due.map(x => esc(x.item)).slice(0, 2).join('; ')}${due.length > 2 ? ` +${due.length - 2} more` : ''}</span><button class="btn sm" data-act="nav" data-v="training">Open</button></div>`); });
    const hbCur = latestHb();
    if (hbCur) { const missing = state.staff.filter(s => E.isActive(s, d) && !(state.handbookAcks || []).some(a => a.staffId === s.id && a.version === hbCur.version)); if (missing.length) items.push(`<div class="li"><span class="chip info">Handbook v${esc(hbCur.version)}</span><span class="grow">Not yet acknowledged by ${missing.map(s => esc(s.nickname || s.fullName)).join(', ')}.</span><button class="btn sm" data-act="nav" data-v="handbook">Open</button></div>`); }
    const openInc = (state.incidents || []).filter(i => i.status !== 'closed').length;
    if (openInc) items.push(`<div class="li"><span class="chip warn">Incidents</span><span class="grow">${openInc} open incident(s) to review.</span><button class="btn sm" data-act="nav" data-v="account">Open</button></div>`);
    (state.vales || []).filter(v => v.status === 'active' && ['salary', 'mixed'].includes(v.method) && !v.authorization).forEach(v => items.push(`<div class="li"><span class="chip warn">Vale</span><span class="grow">${esc(sName(v.staffId))}'s vale of ${peso(v.amount)} (${fmtD(v.date)}) has no signed authorization for salary deduction.</span><button class="btn sm" data-act="vale" data-id="${v.id}">Upload</button></div>`));
    state.staff.forEach(s => E.restLedger(state, s.id, d).forEach(x => {
      if (x.warn) items.unshift(`<div class="li"><span class="chip bad">Replacement day</span><span class="grow">${esc(sName(s.id))}'s replacement day for working on ${fmtD(x.date)} expires ${x.daysLeft ? 'in ' + x.daysLeft + ' day' + (x.daysLeft === 1 ? '' : 's') : 'today'} (${fmtD(x.expires)}).</span>
        <button class="btn sm primary" data-act="nav" data-v="attendance">Set day off</button></div>`);
      else if (x.status === 'expired' && U.daysBetween(x.expires, d) <= 14) items.push(`<div class="li"><span class="chip bad">Expired</span><span class="grow">${esc(sName(s.id))}'s replacement day for ${fmtD(x.date)} was not used by ${fmtD(x.expires)}.</span></div>`);
    }));
    const r = getWeek(d);
    r.occurrences.filter(o => o.date === d && !o.skipped && o.flags.some(f => ['conflict', 'unassigned', 'noAssistant', 'unplaced'].includes(f))).forEach(o => {
      items.push(`<div class="li"><span class="chip warn">Schedule</span><span class="grow clickable" data-act="occ" data-k="${esc(o.key)}" data-d="${d}">${esc(o.name)} — ${esc(o.flags.filter(f => FLAG_TEXT[f] && ['conflict', 'unassigned', 'noAssistant', 'unplaced'].includes(f)).map(f => FLAG_TEXT[f]).join(' '))}</span></div>`);
    });
    return `<div class="card"><h2>Needs attention</h2><div class="list">${items.join('') || '<div class="empty">All clear.</div>'}</div></div>`;
  }
  /** Birthdays on a date: active staff (from their biodata) and family members (Settings). 29 Feb falls on 28 Feb in other years. */
  function birthdaysOn(d) {
    const y = +d.slice(0, 4), leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0, md = d.slice(5);
    const hit = b => b && (b.slice(5) === md || (!leap && b.slice(5) === '02-29' && md === '02-28'));
    const age = b => /^\d{4}/.test(b) ? y - +b.slice(0, 4) : null;
    return [
      ...state.staff.filter(s => s.birthDate && E.isActive(s, d) && hit(s.birthDate)).map(s => ({ name: s.nickname || s.fullName, who: s.role === 'driver' ? 'driver' : 'helper', age: age(s.birthDate) })),
      ...(state.members || []).filter(m => hit(m.birthday)).map(m => ({ name: m.name, who: 'family', age: age(m.birthday) })),
    ];
  }
  const bdayText = b => `🎂 ${b.name}'s birthday${b.age > 0 && b.age < 120 ? ' (' + b.age + ')' : ''}`;
  function comingUp(d) {
    const end = U.addDays(d, 14), out = [];
    for (let x = d; x <= end; x = U.addDays(x, 1)) birthdaysOn(x).forEach(b => out.push({ date: x, html: `<b>${esc(bdayText(b))}</b> <span class="muted small">${b.who === 'family' ? 'family' : b.who}</span>` }));
    const S = state.settings;
    const ps = E.periodStartOf(S, d), next = E.nextPeriodStart(S, ps);
    if (next <= end) {
      const seg = E.leadsOn(E.leadPlan(state, next), next);
      const by = {}; Object.entries(seg.leads).forEach(([c, id]) => { (by[id] = by[id] || []).push(cat(c).name); });
      out.push({ date: next, html: `<b>Lead rotation changes</b><div class="small muted">${Object.entries(by).map(([id, cs]) => `${esc(sName(id))}: ${esc(cs.join(', '))}`).join(' · ')}</div>` });
    }
    state.staff.filter(s => E.isActive(s, d)).forEach(s => {
      const reg = E.regularizationDue(s);
      if (s.status === 'provisional' && reg && reg >= d && reg <= U.addDays(d, 30))
        out.push({ date: reg, html: `<b>Regularization due — ${esc(s.nickname || s.fullName)}</b> <span class="chip warn">in ${U.daysBetween(d, reg)} days</span>` });
      if (s.role === 'helper' && s.hireDate && s.status === 'provisional' && s.shadow === 'auto' && S.shadowEnabled) {
        const se = U.addDays(s.hireDate, Number(S.shadowDays));
        if (se > d && se <= end) out.push({ date: se, html: `Shadow mode ends — ${esc(s.nickname || s.fullName)} can start leading` });
      }
      (s.ids || []).forEach(x => { if (x.expires && x.expires >= d && x.expires <= U.addDays(d, 30)) out.push({ date: x.expires, html: `ID expires — ${esc(s.nickname || s.fullName)}: ${esc(x.type)}` }); });
    });
    state.exceptions.filter(e => e.date > d && e.date <= end).forEach(e => out.push({ date: e.date, html: `${esc(sName(e.staffId))}: ${esc((EXC_TYPES[e.type] || [e.type])[0])}` }));
    state.exceptions.filter(e => e.type === 'rest_worked' && e.replDate && e.replDate > d && e.replDate <= end).forEach(e => out.push({ date: e.replDate, html: `${esc(sName(e.staffId))}: replacement day off` }));
    state.staff.forEach(s => E.restLedger(state, s.id, d).filter(x => x.status === 'earned' && x.expires <= end).forEach(x => out.push({ date: x.expires, html: `Replacement day expires — ${esc(sName(s.id))} <span class="chip warn">unused</span>` })));
    state.staff.filter(s => E.isActive(s, d)).forEach(s => {
      const n = P.nextDue(state, s, d); if (n.payday > d && n.payday <= end) out.push({ date: n.payday, html: `💰 Payday — ${esc(s.nickname || s.fullName)}` });
      const rd = P.raiseDue(state, s, d); if (rd && !rd.capped && rd.date > d && rd.date <= end) out.push({ date: rd.date, html: `Annual increase due — ${esc(s.nickname || s.fullName)} (${peso(rd.to)})` });
    });
    const t13 = d.slice(0, 4) + '-' + (state.settings.thirteenthDate || '12-15'); if (t13 > d && t13 <= end) out.push({ date: t13, html: '💰 13th month pay goes into this pay period' });
    (state.appliances || []).filter(a => a.warrantyUntil && a.warrantyUntil > d && a.warrantyUntil <= end).forEach(a => out.push({ date: a.warrantyUntil, html: `Warranty ends — ${esc(a.name)}` }));
    E.eventInstances(state, U.addDays(d, 1), end).filter(e => e.date > d).forEach(e => out.push({ date: e.date, html: `${E.EVENT_TYPES[e.type].icon} <b>${esc(e.title || E.EVENT_TYPES[e.type].label)}</b>${e.moved ? ' <span class="chip warn">moved</span>' : ''}${e.startTime ? ' · ' + e.startTime : ''}${e.notes ? ' — ' + esc(e.notes) : ''}` }));
    (state.vehicles || []).forEach(v => {
      const nm = esc(v.name + (v.plate ? ' · ' + v.plate : ''));
      if (v.regMonth) { for (const y of [+d.slice(0, 4), +d.slice(0, 4) + 1]) { const x = y + '-' + String(v.regMonth).padStart(2, '0') + '-01'; if (x >= d && x <= end) out.push({ date: x, html: `🚗 ${nm}: LTO registration month` }); } }
      if (v.insurance) { let x = v.insurance; while (x < d) x = U.addMonths(x, 12); if (x <= end) out.push({ date: x, html: `🚗 ${nm}: insurance renewal` }); }
      const p = nextPms(v, d); if (p && p <= end) out.push({ date: p, html: `🚗 ${nm}: PMS due` });
    });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  // ---------- Day view ----------
  const T0 = 300, T1 = 1200, PX = 1.15;
  function vDay() {
    const d = ui.date, r = getWeek(d), seg = r.leadsByDay[d];
    const cols = state.staff.filter(s => E.isActive(s, d)).sort((a, b) => (a.role === 'driver') - (b.role === 'driver'));
    const occ = r.occurrences.filter(o => o.date === d);
    const H = (T1 - T0) * PX;
    const hours = []; for (let m = T0; m <= T1; m += 60) hours.push(m);
    const blocks = (state.fixedBlocks || []).filter(b => b.show);
    const colHtml = cols.map(s => {
      const st = r.status[d][s.id];
      const cards = [];
      occ.filter(o => !o.skipped && o.start != null && (o.mainId === s.id || o.assistId === s.id)).forEach(o => {
        const isMain = o.mainId === s.id, end = isMain ? o.end : o.start + o.assistMinutes;
        cards.push({ o, isMain, s: o.start, e: end });
      });
      cards.sort((a, b) => a.s - b.s);
      let lastEnd = -1, indent = 0;
      const cardHtml = cards.map(c => {
        indent = c.s < lastEnd ? indent + 1 : 0; lastEnd = Math.max(lastEnd, c.e);
        const m = state.marks[c.o.key];
        const h = Math.max((c.e - c.s) * PX - 2, 16);
        const conflict = c.o.flags.includes('conflict');
        return `<div class="tl-card${c.isMain ? '' : ' assist'}${conflict ? ' conflict' : ''}${m && m.status === 'done' ? ' done' : ''}" style="--c:${cat(c.o.categoryId).color};top:${(c.s - T0) * PX}px;height:${h}px;left:${4 + indent * 14}px"
          data-act="occ" data-k="${esc(c.o.key)}" data-d="${d}" title="${esc(c.o.name)}">
          <b>${m ? (m.status === 'done' ? '✓ ' : '• ') : ''}${c.o.recipeId ? '📖 ' : ''}${esc(c.o.name)}</b><div class="meta">${fmtT(c.s)}–${fmtT(c.e)} · ${c.e - c.s}m · ${c.o.difficulty} · ${c.o.badge} · ${c.isMain ? 'MAIN' : 'ASSIST'}${c.isMain && c.o.assistId ? ' + ' + esc(sName(c.o.assistId)) : ''}${!c.isMain ? ' with ' + esc(sName(c.o.mainId)) : ''}${c.o.handbookRef ? ' · ' + esc(c.o.handbookRef) : ''}</div></div>`;
      }).join('');
      return `<div class="tl-col${st.working ? '' : ' off'}" style="height:${H}px">
        ${hours.map(m => `<div class="tl-hour" style="top:${(m - T0) * PX}px"></div>`).join('')}
        ${st.working ? blocks.map(b => `<div class="tl-block${b.protected ? ' protected' : ''}" style="top:${(U.toMin(b.start) - T0) * PX}px;height:${(U.toMin(b.end) - U.toMin(b.start)) * PX}px">${esc(b.name)}</div>`).join('') : ''}
        ${st.working && st.half ? `<div class="tl-block" style="background:repeating-linear-gradient(45deg,#f4f1ea,#f4f1ea 8px,#efebe2 8px,#efebe2 16px);top:${(st.start > T0 ? 0 : (st.end - T0) * PX)}px;height:${st.start > T0 ? (st.start - T0) * PX : (T1 - st.end) * PX}px">Off</div>` : ''}
        ${cardHtml}</div>`;
    }).join('');
    const heads = cols.map(s => {
      const st = r.status[d][s.id];
      const pts = r.loads[s.id] && r.loads[s.id][d] ? r.loads[s.id][d] : null;
      return `<div class="tl-colhead"><span class="clickable" data-act="staff" data-id="${s.id}">${esc(s.nickname || s.fullName)}</span> ${statusChip(st)}
        <div class="small muted">${s.role === 'helper' ? 'Leads: ' + esc(leadCatsOf(seg, s.id).join(', ') || '—') : 'Driver' + (leadCatsOf(seg, s.id).length ? ' · also leads ' + esc(leadCatsOf(seg, s.id).join(', ')) : '')}${pts ? ` · ${pts.min} min · ${num(pts.pts)} pts` : ''}</div></div>`;
    }).join('');
    const loose = occ.filter(o => !o.skipped && (o.start == null || !o.mainId));
    const skipped = occ.filter(o => o.skipped);
    return `<div class="head"><h1>Day schedule</h1>
      <div class="row"><button class="btn icon" data-act="day-shift" data-n="-1" aria-label="Previous day">◀</button>
      <input type="date" class="inp" style="width:auto" value="${d}" data-change="day-date"><button class="btn icon" data-act="day-shift" data-n="1" aria-label="Next day">▶</button>
      <button class="btn" data-act="day-today">Today</button></div><span class="sub">${fmtDL(d)}</span><span class="spacer"></span>
      ${noSchoolBtn(d)}<button class="btn" data-act="event-new" data-d="${d}">🎉 Event mode</button><button class="btn" data-act="oneoff-new" data-d="${d}">+ One-off task</button>
      <button class="btn" data-act="print-manager" data-d="${d}">🖨 Manager's list</button><button class="btn primary" data-act="print-day" data-d="${d}">🖨 Staff checklists</button></div>
      <div class="tabs">${[['timeline', 'Timeline'], ['list', 'Manager\'s list (all tasks)']].map(([k, l]) => `<button class="${(ui.dayMode || 'timeline') === k ? 'on' : ''}" data-act="day-mode" data-v="${k}">${l}</button>`).join('')}</div>
      ${d < todayStr() && state.history[d] ? '<div class="alert info">🔒 Past day — this schedule is a permanent record. Use "Done by" when marking to record who actually did a task.</div>' : ''}
      ${r.notes[d].map(n => `<div class="alert warn">⚠ ${esc(n)}</div>`).join('')}
      ${!E.isSchoolDay(state, d) && occ.some(o => o.flags.includes('checkChildren')) ? '<div class="alert warn">⚠ Weekend: before mopping or dusting, check that the children are out of the area.</div>' : ''}
      ${loose.length ? `<div class="alert bad"><div><b>Not placed:</b> ${loose.map(o => `<span class="clickable" data-act="occ" data-k="${esc(o.key)}" data-d="${d}">${esc(o.name)}</span>${o.whyNot ? ` <span class="small">— ${esc(o.whyNot)}</span>` : ''}`).join(' · ')}</div></div>` : ''}
      ${(() => { const moved = occ.filter(o => !o.skipped && o.start != null && o.whyNot); return moved.length ? `<div class="alert warn"><div><b>Placed outside their time window:</b> ${moved.map(o => `<span class="clickable" data-act="occ" data-k="${esc(o.key)}" data-d="${d}">${esc(o.name)}</span> <span class="small">— ${esc(o.whyNot)}</span>`).join('<br>')}</div></div>` : ''; })()}
      ${skipped.length ? `<div class="alert info"><div><b>Skipped:</b> ${skipped.map(o => `<span class="clickable" data-act="occ" data-k="${esc(o.key)}" data-d="${d}">${esc(o.name)}</span>${o.skipReason ? ' (' + esc(o.skipReason) + ')' : ''}`).join(' · ')}</div></div>` : ''}
      ${(ui.dayMode || 'timeline') === 'list' ? managerList(d, r) : `<div class="card flush"><div class="tl-wrap"><div class="timeline" style="grid-template-columns:52px repeat(${cols.length},minmax(190px,1fr))">
      <div class="tl-colhead"></div>${heads}
      <div class="tl-ruler" style="height:${H}px">${hours.map(m => `<span style="top:${(m - T0) * PX}px">${fmtT(m)}</span>`).join('')}</div>${colHtml}
      </div></div></div>
      <p class="small muted">Click a task to mark it, re-assign it, move it or skip it. Dashed cards are assist roles. Amber = conflict. Shaded bands are meals, breaks and the protected rest period.</p>`}`;
  }
  /** All of the day's tasks in one time-ordered list, with who is assigned (for the house manager / employer). */
  /** Daily routine (daily, school-day, every-other-day and menu cooking tasks) — left out of the 7-day schedule. */
  const isRoutine = o => ['D', 'EOD', 'Menu'].includes(o.badge);
  const dayTasksAll = (r, d) => r.occurrences.filter(o => o.date === d && !o.skipped).sort((a, b) => (a.start ?? 9999) - (b.start ?? 9999) || (a.mainId || '').localeCompare(b.mainId || ''));
  const whoLine = (r, d) => state.staff.filter(s => E.isActive(s, d)).map(s => { const st = r.status[d][s.id]; return `${s.nickname || s.fullName}: ${st.working ? st.label.replace(/^Working( · )?/, 'working$1') : st.label}`; });
  /** Manager's grid: one row per start time, one column per working person. A task with two people shows
      "MAIN:" in the main person's column and "ASSISTING:" in the assistant's column, before the task name. */
  function managerGrid(d, r) {
    const list = dayTasksAll(r, d), cols = state.staff.filter(s => E.isActive(s, d) && r.status[d][s.id] && r.status[d][s.id].working).sort((a, b) => (a.role === 'driver') - (b.role === 'driver'));
    const times = [...new Set(list.map(o => o.start == null ? 9999 : o.start))].sort((a, b) => a - b);
    const rows = times.map(t => ({ t, cells: cols.map(s => list.filter(o => (o.start == null ? 9999 : o.start) === t && (o.mainId === s.id || o.assistId === s.id)).map(o => {
      const isMain = o.mainId === s.id, two = !!(o.mainId && o.assistId);
      return { o, role: two ? (isMain ? 'MAIN' : 'ASSISTING') : '', end: isMain ? o.end : o.start + o.assistMinutes };
    })) })).filter(x => x.cells.some(c => c.length));
    // merge each person's cell down through the rows while their task is still running (so busy time doesn't look free)
    rows.forEach(x => { x.span = cols.map(() => 1); x.skip = cols.map(() => false); });
    cols.forEach((s, i) => {
      for (let k = 0; k < rows.length; k++) {
        const c = rows[k].cells[i]; if (!c.length || rows[k].skip[i] || rows[k].t === 9999) continue;
        const busyEnd = Math.max(...c.map(it => it.end || 0));
        for (let j = k + 1; j < rows.length && rows[j].t < busyEnd && rows[j].t !== 9999 && !rows[j].cells[i].length; j++) { rows[j].skip[i] = true; rows[k].span[i]++; }
      }
    });
    return { cols, rows, list };
  }
  function managerList(d, r) {
    const { cols, rows, list } = managerGrid(d, r), skipped = r.occurrences.filter(o => o.date === d && o.skipped);
    const off = state.staff.filter(s => E.isActive(s, d) && !cols.includes(s));
    const item = (x, s) => { const warn = x.o.flags.some(f => ['conflict', 'unplaced', 'noAssistant'].includes(f));
      return `<div class="mg-item${warn ? ' warn' : ''}">${x.role === 'MAIN' || !x.role ? tickBtn(x.o) : '<span class="tick-sp"></span>'}<span>${x.role ? `<b class="mg-role ${x.role === 'MAIN' ? 'main' : 'assist'}">${x.role}:</b> ` : ''}<span class="clickable" data-act="occ" data-k="${esc(x.o.key)}" data-d="${d}">${x.o.recipeId ? '📖 ' : ''}${esc(x.o.name)}</span>
        <span class="muted small">until ${fmtT(x.end)}${x.role === 'MAIN' ? ' · with ' + esc(sName(x.o.assistId)) : x.role === 'ASSISTING' ? ' · with ' + esc(sName(x.o.mainId)) : ''}</span>${warn ? ' <span class="chip warn">⚠</span>' : ''}</span></div>`; };
    return `<div class="card" style="margin-bottom:12px"><div class="row">${cols.map(s => `<span class="chip ok">${esc(s.nickname || s.fullName)} · ${esc(r.status[d][s.id].label)} · ${list.filter(o => o.mainId === s.id).length} tasks</span>`).join('')}
      ${off.map(s => `<span class="chip">${esc(s.nickname || s.fullName)} · ${esc(r.status[d][s.id].label)}</span>`).join('')}</div></div>
      <div class="card flush scroll-x"><table class="t mgr"><tr><th style="width:64px">Time</th>${cols.map(s => `<th>${esc(s.nickname || s.fullName)}<div class="small muted" style="font-weight:400">${s.role === 'driver' ? 'Driver' : 'Helper'}</div></th>`).join('')}</tr>
      ${rows.map(x => `<tr><td class="nowrap"><b>${x.t === 9999 ? '—' : fmtT(x.t)}</b></td>${x.cells.map((c, i) => x.skip[i] ? '' : `<td${x.span[i] > 1 ? ` rowspan="${x.span[i]}" class="mg-busy"` : c.length ? ' class="mg-busy"' : ' class="mg-free"'}>${c.map(it => item(it, cols[i])).join('')}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 1}" class="empty">No tasks.</td></tr>`}</table></div>
      ${skipped.length ? `<p class="small muted">Not scheduled today: ${skipped.map(o => esc(o.name) + (o.skipReason ? ' (' + esc(o.skipReason) + ')' : '')).join(' · ')}</p>` : ''}
      <p class="small muted">${list.length} tasks. Each row is a start time. MAIN / ASSISTING shows who leads a two-person task. Tick to mark done (on the main person's entry); click a task to change who does it.</p>`;
  }
  function printManager(d) {
    const r = getWeek(d), { cols, rows, list } = managerGrid(d, r), skipped = r.occurrences.filter(o => o.date === d && o.skipped);
    if (!list.length) { toast('Nothing scheduled for this day.'); return; }
    const html = `<div class="pg mgr"><h1><span>${esc(state.settings.householdName.toUpperCase())} — MANAGER'S DAILY TASK LIST</span><span>${fmtDL(d)}</span></h1>
      <div class="who">${whoLine(r, d).map(esc).join(' &nbsp;·&nbsp; ')}</div>
      ${r.notes[d].map(n => `<div class="note">⚠ ${esc(n)}</div>`).join('')}
      <table class="mgr"><thead><tr><th style="width:44px">Time</th>${cols.map(s => `<th>${esc((s.nickname || s.fullName).toUpperCase())}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(x => `<tr><td class="nowrap"><b>${x.t === 9999 ? '—' : fmtT(x.t)}</b></td>${x.cells.map((c, i) => x.skip[i] ? '' : `<td${x.span[i] > 1 ? ` rowspan="${x.span[i]}"` : ''} class="${c.length ? 'mg-busy' : 'mg-free'}">${c.map(it => `<div class="mg-p">☐ ${it.role ? `<b>${it.role}:</b> ` : ''}${esc(it.o.name)} <span class="mg-end">(until ${fmtT(it.end)})</span></div>`).join('')}</td>`).join('')}</tr>`).join('')}</tbody></table>
      ${skipped.length ? `<div class="who" style="margin-top:6px"><b>Not scheduled today:</b> ${skipped.map(o => esc(o.name) + (o.skipReason ? ' (' + esc(o.skipReason) + ')' : '')).join(' · ')}</div>` : ''}
      <div class="sig"><div>Checked by</div><div>Date / time</div></div></div>`;
    setPage('portrait', "Manager's daily task list · " + fmtDL(d)); document.getElementById('print-root').innerHTML = html; printPreview();
  }

  // ---------- Week view ----------
  function vWeek() {
    const r = getWeek(ui.date), today = todayStr();
    const staff = state.staff.filter(s => r.days.some(d => E.isActive(s, d))).sort((a, b) => (a.role === 'driver') - (b.role === 'driver'));
    const helpers = staff.filter(s => s.role === 'helper').map(s => s.id);
    let prevLeads = '';
    const leadRow = r.days.map(d => {
      const seg = r.leadsByDay[d], k = JSON.stringify(seg.leads);
      const html = k !== prevLeads ? helpers.map(id => `<div class="small"><b>${esc(sName(id))}:</b> ${esc(leadCatsOf(seg, id).join(', ') || '—')}</div>`).join('') : '<span class="small muted">same</span>';
      prevLeads = k; return `<td class="${d === today ? 'today' : ''}">${html}</td>`;
    }).join('');
    const rows = staff.map(s => `<tr><th style="position:static">${esc(s.nickname || s.fullName)}<div class="small muted" style="font-weight:400">${s.role === 'driver' ? 'Driver' : 'Helper'}</div></th>${r.days.map(d => {
      const st = r.status[d][s.id];
      if (!st.working) return `<td class="off ${d === today ? 'today' : ''}">${esc(st.label)}</td>`;
      const x = r.loads[s.id] && r.loads[s.id][d] ? r.loads[s.id][d] : { pts: 0, min: 0, heavy: 0, tasks: 0 };
      const periodic = r.occurrences.filter(o => o.date === d && !o.skipped && (o.mainId === s.id || o.assistId === s.id) && !isRoutine(o));
      const conflicts = r.occurrences.filter(o => o.date === d && o.mainId === s.id && o.flags.includes('conflict')).length;
      return `<td class="clickable ${d === today ? 'today' : ''}" data-act="goto-day" data-d="${d}">
        <div><b>${x.tasks}</b> tasks · ${x.min} min</div><div class="small muted">${num(x.pts)} pts · ${x.heavy} heavy</div>
        ${st.half ? `<span class="chip warn">${esc(st.label)}</span>` : ''}${conflicts ? `<span class="chip warn">⚠ ${conflicts}</span>` : ''}
        ${periodic.length ? `<ul class="wk-list">${periodic.map(o => `<li class="small"><span class="tag badge">${o.badge}</span> ${esc(o.name)}${o.assistId === s.id ? ' <span class="muted">(assist)</span>' : ''}</li>`).join('')}</ul>` : ''}</td>`;
    }).join('')}</tr>`).join('');
    return `<div class="head"><h1>7-day schedule</h1>
      <div class="row"><button class="btn icon" data-act="day-shift" data-n="-7" aria-label="Previous week">◀</button><span class="sub">${fmtD(r.days[0])} – ${fmtD(r.days[6])}</span>
      <button class="btn icon" data-act="day-shift" data-n="7" aria-label="Next week">▶</button><button class="btn" data-act="day-today">This week</button></div>
      <span class="spacer"></span><button class="btn" data-act="print-week">🖨 Print week</button></div>
      ${r.warnings.map(w => `<div class="alert ${w.type === 'balance' ? 'bad' : 'warn'}">⚠ ${esc(w.text)}</div>`).join('')}
      <div class="grid g2"><div class="card"><h2>Load per working day (helpers)</h2>${loadBars(r, helpers)}
        <div class="small muted">Load points = minutes × difficulty factor (Light ${state.settings.lightFactor}, Heavy ${state.settings.heavyFactor}). Target ±${Math.round(state.settings.tolerance * 100)}% of the average.</div></div>
        <div class="card"><h2>Week totals</h2><table class="t"><tr><th>Staff</th><th>Working days</th><th>Minutes</th><th>Load pts</th><th>Heavy</th></tr>
        ${staff.map(s => { const w = r.weekLoads[s.id]; return `<tr><td>${esc(s.nickname || s.fullName)}</td><td>${w.workDays}</td><td>${num(w.min)}</td><td>${num(w.pts)}</td><td>${w.heavy}</td></tr>`; }).join('')}</table>
        <div class="small muted" style="margin-top:6px">Generated in ${r.ms} ms.</div></div></div>
      <div style="height:16px"></div>
      <div class="card flush scroll-x"><table class="t week"><tr><th></th>${r.days.map(d => `<th class="${d === today ? 'today' : ''}">${fmtDS(d)}<div class="small muted" style="font-weight:400">${E.isSchoolDay(state, d) ? 'School day' : noSchoolLabel(d)}</div></th>`).join('')}</tr>
      <tr><th style="position:static">Leads</th>${leadRow}</tr>${rows}</table></div>
      <p class="small muted">Daily routine tasks (daily, school-day, every-other-day and menu cooking) are not listed here; they are on the Day view, the staff checklists and the manager's list. The task and minute totals include everything. Badges: W weekly, 2W every 2 weeks, M monthly, Q quarterly, 6M, Y yearly, n×W times per week, Event, 1× one-off. Click a day to open it.</p>`;
  }

  // ---------- Leads & Rotation ----------
  function vLeads() {
    const d = todayStr(), S = state.settings;
    const ps = E.periodStartOf(S, d), pe = U.addDays(E.nextPeriodStart(S, ps), -1), next = E.nextPeriodStart(S, ps);
    const plan = E.leadPlan(state, U.addDays(next, 1));
    const cur = E.leadsOn(plan, d), nxt = E.leadsOn(plan, next);
    const loads = E.categoryLoads(state);
    const cats = state.categories.filter(c => c.id !== 'driver');
    const helpers = state.staff.filter(s => s.role === 'helper' && (!s.exitDate || s.exitDate >= ps));
    const r = getWeek(d);
    const matrixPlan = E.leadPlan(state, d);
    return `<div class="head"><h1>Leads & Rotation</h1><span class="sub">Rotation: ${esc({ weekly: 'weekly', biweekly: 'every 2 weeks, on a Monday', monthly: 'monthly, on the 1st' }[S.rotation])}</span></div>
      <div class="grid g2"><div class="card"><h2>Current leads <span class="muted small">${fmtD(cur.start)} – ${fmtD(cur.end)}</span></h2>
        <table class="t"><tr><th>Category</th><th>Lead</th><th>Assignment</th><th>Weekly load</th><th></th></tr>
        ${cats.map(c => `<tr><td><span class="dot" style="background:${c.color}"></span> ${esc(c.name)}</td><td>${esc(sName(cur.leads[c.id]))}</td>
          <td>${assignChip(c, cur, d)}</td><td>${num(loads[c.id])} pts</td><td><button class="btn sm" data-act="lead-ov" data-c="${c.id}" data-ps="${d}">Assignment…</button></td></tr>`).join('')}
        <tr><td><span class="dot" style="background:#6b7280"></span> Driver (fixed)</td><td colspan="3">${esc(state.staff.filter(s => s.role === 'driver' && E.isActive(s, d)).map(s => s.nickname || s.fullName).join(', ') || '—')}</td></tr></table>
        ${cur.end < pe ? `<div class="small muted" style="margin-top:6px">Leads change on ${fmtD(U.addDays(cur.end, 1))} (staff change or manual override).</div>` : ''}</div>
        <div class="card"><h2>Next rotation <span class="muted small">from ${fmtD(next)}</span></h2>
        <table class="t"><tr><th>Category</th><th>Lead</th><th>Assignment</th><th></th></tr>${cats.map(c => `<tr><td><span class="dot" style="background:${c.color}"></span> ${esc(c.name)}</td><td>${esc(sName(nxt.leads[c.id]))}</td>
          <td>${assignChip(c, nxt, next)}</td><td><button class="btn sm" data-act="lead-ov" data-c="${c.id}" data-ps="${next}">Change</button></td></tr>`).join('')}</table></div></div>
      <div style="height:16px"></div>
      <div class="grid g2"><div class="card"><h2>Rotation matrix</h2><div class="scroll-x"><table class="t"><tr><th>Helper</th>${cats.map(c => `<th>${esc(c.name)}</th>`).join('')}</tr>
        ${helpers.map(h => `<tr><td>${esc(h.nickname || h.fullName)}</td>${cats.map(c => { const n = (matrixPlan.counts[h.id] || {})[c.id] || 0; const last = (matrixPlan.lastPeriod[h.id] || {})[c.id];
          return `<td><b>${n}×</b><div class="small muted">${last ? MON[+last.slice(5, 7) - 1] + ' ' + last.slice(0, 4) : 'never'}</div></td>`; }).join('')}</tr>`).join('')}</table></div>
        <div class="small muted">Times led (rotation periods since ${fmtD(S.rotationAnchor)}) and when last led. Skill levels come with the Training module (Phase 4).</div></div>
        <div class="card"><h2>Load comparison — this week</h2>${loadBars(r, helpers.filter(h => E.isActive(h, d)).map(h => h.id))}</div></div>
      <div style="height:16px"></div>
      <div class="card"><h2>Fixed areas and manual overrides</h2>
        ${cats.some(c => c.assign && c.assign.mode === 'fixed') ? `<div class="list" style="margin-bottom:10px">${cats.filter(c => c.assign && c.assign.mode === 'fixed').map(c => `<div class="li"><span class="chip">Fixed</span><span class="grow"><b>${esc(c.name)}</b> always led by ${esc(sName(c.assign.staffId))}${c.assign.since ? ` <span class="muted small">since ${fmtD(c.assign.since)}</span>` : ''}</span><button class="btn sm" data-act="lead-ov" data-c="${c.id}" data-ps="${d}">Change</button></div>`).join('')}</div>` : ''}
        ${(state.leadOverrides || []).length ? `<table class="t"><tr><th>From</th><th>Until</th><th>Category</th><th>Lead</th><th>Reason</th><th></th></tr>
        ${[...state.leadOverrides].sort((a, b) => E.ovFrom(b).localeCompare(E.ovFrom(a))).map(o => `<tr><td>${fmtD(E.ovFrom(o))}</td><td>${fmtD(E.ovUntil(S, o))}${E.ovUntil(S, o) < d ? ' <span class="chip">ended</span>' : ''}</td><td>${esc(cat(o.categoryId).name)}</td><td>${esc(sName(o.staffId))}</td><td>${esc(o.reason)}</td><td><button class="btn sm danger" data-act="lead-ov-del" data-id="${o.id}">Remove</button></td></tr>`).join('')}</table>`
        : '<div class="empty">No manual overrides. They are kept when the schedule re-generates.</div>'}
        <div class="small muted" style="margin-top:6px">Rotation: the lead changes every period and everyone leads every area over time. Fixed: always the same helper (rotation skips that area). Manual override: a helper from one date until another, then back to rotation or fixed. Past days stay as recorded.</div></div>`;
  }
  /** Assignment label for a lead area in a segment: rotation / fixed / manual until … */
  function assignChip(c, seg, d) {
    const src = seg.source[c.id];
    if (src === 'override') { const o = (state.leadOverrides || []).find(x => x.categoryId === c.id && E.ovFrom(x) <= d && d <= E.ovUntil(state.settings, x)); return `<span class="chip info">Manual${o ? ' until ' + fmtDS(E.ovUntil(state.settings, o)) : ''}</span>`; }
    if (src === 'fixed') return '<span class="chip">Fixed</span>';
    return `<span class="chip ok">Rotation</span>${c.assign && c.assign.mode === 'fixed' ? ' <span class="small muted">(fixed helper unavailable)</span>' : ''}`;
  }
  function leadOverrideModal(c, from) {
    const S = state.settings, C = state.categories.find(x => x.id === c), ps = E.periodStartOf(S, from), pe = U.addDays(E.nextPeriodStart(S, ps), -1);
    const helpers = state.staff.filter(s => (s.role === 'helper' || s.role === 'driver') && E.isActive(s, from)).sort((a, b) => (a.role === 'driver') - (b.role === 'driver'));
    const cur = E.leadsOn(E.leadPlan(state, from), from), mode = C.assign && C.assign.mode === 'fixed' ? 'fixed' : 'rotate';
    modal(`Lead assignment — ${esc(C.name)}`, `<form data-form="lead-ov" class="form" id="lead-ov-form"><input type="hidden" name="c" value="${c}">
      <div class="field full">Lead on ${fmtD(from)}: <b>${esc(sName(cur.leads[c]))}</b> ${assignChip(C, cur, from)}</div>
      <label class="field full">How this area is assigned<select name="mode" data-change="lead-mode">${opt('rotate', 'Automatic rotation (changes every period, balanced)', mode)}${opt('fixed', 'Fixed assignment (always the same person)', mode)}${opt('manual', 'Manual override (a person from … until …)', '')}</select></label>
      <label class="field lm-person"${mode === 'rotate' ? ' hidden' : ''}>Person<select name="staffId" data-change="lead-mode">${helpers.map(h => opt(h.id, (h.nickname || h.fullName) + (h.role === 'driver' && !/driver/i.test(h.nickname || h.fullName) ? ' (driver)' : ''), (C.assign && C.assign.staffId) || cur.leads[c])).join('')}</select></label>
      <label class="field lm-manual" hidden>Reason (optional)<input name="reason" placeholder="e.g., training in the kitchen"></label>
      <label class="field lm-manual" hidden>From<input type="date" name="from" value="${from}" min="${todayStr()}" data-change="lead-mode"></label><label class="field lm-manual" hidden>Until<input type="date" name="until" value="${pe}" min="${todayStr()}" data-change="lead-mode"></label>
      <div class="full" id="lead-msg"></div>
      <div class="full small muted">Fixed takes the area out of the rotation; the other areas are re-balanced. A manual override wins over both for its dates, then the area goes back to its usual assignment. If the chosen helper is off or not yet allowed to lead (shadow mode), the area falls back to the rotation. The driver can lead an area only as a <b>fixed</b> assignment (never rotation, manual or assisting): he does its tasks within his hours (${state.settings.driverHours.start}–${state.settings.driverHours.end}); on his rest day, or for tasks outside his hours, the helpers do them.</div>
      <div class="full" id="impact"></div></form>`,
      `<button class="btn" data-act="lead-impact">Preview load impact</button><button class="btn primary" type="submit" form="lead-ov-form">Save</button>`, true);
    leadModeUI();
  }
  /** Show only the fields for the chosen mode, and warn about days the person is off (their tasks go to someone else). */
  function leadModeUI() {
    const f = document.getElementById('lead-ov-form'); if (!f) return;
    const mode = f.mode.value;
    f.querySelectorAll('.lm-person').forEach(el => { el.hidden = mode === 'rotate'; });
    f.querySelectorAll('.lm-manual').forEach(el => { el.hidden = mode !== 'manual'; });
    const msg = document.getElementById('lead-msg'), sid = f.staffId.value, s = staffById(sid);
    if (mode === 'rotate' || !s) { msg.innerHTML = ''; return; }
    const from = mode === 'manual' ? f.from.value : todayStr(), until = mode === 'manual' ? f.until.value : U.addDays(todayStr(), 13);
    if (!from || !until || until < from) { msg.innerHTML = '<div class="alert warn">Set the dates: "until" must be on or after "from".</div>'; return; }
    const off = [];
    for (let d = from, n = 0; d <= until && n < 62; d = U.addDays(d, 1), n++) { const st = E.dayStatus(state, s, d); if (!st.working) off.push(fmtDS(d) + ' (' + st.label.toLowerCase() + ')'); }
    const shadow = E.inShadow(s, from, state.settings);
    msg.innerHTML = (shadow ? `<div class="alert warn">${esc(s.fullName)} is in shadow mode (assist only) on ${fmtD(from)}, so the area stays on rotation until shadow mode ends.</div>` : '') +
      (off.length ? `<div class="alert info">${esc(s.nickname || s.fullName)} is off on ${off.slice(0, 8).join(', ')}${off.length > 8 ? ' and ' + (off.length - 8) + ' more days' : ''}. ${s.nickname || s.fullName} still leads the area, but those days' tasks go to whoever is working.</div>` : '');
  }
  function applyLeadAssign(st, fd) {
    const c = st.categories.find(x => x.id === fd.get('c')), mode = fd.get('mode'), sid = fd.get('staffId');
    if (mode === 'rotate') delete c.assign;
    else if (mode === 'fixed') c.assign = { mode: 'fixed', staffId: sid, since: todayStr() };
    else {
      const from = fd.get('from'), until = fd.get('until') || from;
      st.leadOverrides = (st.leadOverrides || []).filter(o => !(o.categoryId === c.id && E.ovFrom(o) === from));
      st.leadOverrides.push({ id: uid('l'), categoryId: c.id, staffId: sid, from, until, reason: fd.get('reason') || '' });
    }
    return { c, mode, sid };
  }

  // ---------- Task library ----------
  function vTasks() {
    const S = state.settings, loads = E.categoryLoads(state);
    const q = ui.taskQ.toLowerCase();
    const cats = state.categories.filter(c => !ui.taskCat || c.id === ui.taskCat);
    const fq = ui.taskFreq || '', pr = ui.taskPri || '';
    const keep = t => (!fq || t.freq.type === fq) && (!pr || (pr === 'hold' ? onHold(t) : t.priority === pr)) && (ui.showInactive || t.active || pr === 'hold');
    const shown = []; // categories in the list, for the jump buttons
    const rows = cats.map(c => {
      const ts = state.tasks.filter(t => t.categoryId === c.id && keep(t) && (!q || t.name.toLowerCase().includes(q)));
      if (!ts.length) return '';
      shown.push([c, ts.length]);
      return `<tr class="group" data-cat="${c.id}"><td class="tm-task"><span class="dot" style="background:${c.color}"></span> ${esc(c.name)} <span class="muted small" style="font-weight:400">· ${ts.length} tasks · ${num(loads[c.id])} pts/week</span></td><td colspan="7"></td></tr>` +
        ts.map(t => `<tr class="${t.active && !onHold(t) ? '' : 'inactive'}"><td class="tm-task"><span class="clickable" data-act="task-edit" data-id="${t.id}">${esc(t.name)}</span>
            <div class="small muted">${t.instructions.length ? t.instructions.length + ' steps' : ''}${(t.constraints || []).length ? (t.instructions.length ? ' · ' : '') + (t.constraints || []).map(x => `<span title="${esc(CONS_ICON[x][1])}">${CONS_ICON[x][0]}</span>`).join(' ') : ''}${t.driverOnly ? ' <span title="Driver only (driving)">🚘</span>' : ''}${t.startAt ? ` <span title="Starts at a set time">⏰ ${esc(t.startAt)}</span>` : ''}</div>
            ${onHold(t) ? `<span class="chip warn">On hold${t.holdUntil ? ' until ' + fmtDS(t.holdUntil) : ''}</span>` : ''}${!t.active ? ' <span class="chip">inactive</span>' : ''}</td>
          <td>${freqSelect(t)}</td>
          <td class="tm-stack"><input type="time" class="inp sm" value="${esc(t.window[0])}" data-change="task-field" data-id="${t.id}" data-f="ws" aria-label="From (earliest start)" title="From"><input type="time" class="inp sm" value="${esc(t.window[1])}" data-change="task-field" data-id="${t.id}" data-f="we" aria-label="To (latest finish)" title="To">
            <label class="tm-min"><input type="number" class="inp sm" min="5" step="5" value="${t.minutes}" data-change="task-field" data-id="${t.id}" data-f="minutes" aria-label="Minutes"> min</label></td>
          <td class="tm-stack"><select class="inp sm" data-change="task-field" data-id="${t.id}" data-f="priority" aria-label="Priority">${opt('essential', 'Essential', t.priority)}${opt('standard', 'Standard', t.priority)}${opt('canMove', 'Can move', t.priority)}</select>
            <select class="inp sm" data-change="task-field" data-id="${t.id}" data-f="difficulty" aria-label="Difficulty">${opt('L', 'Light', t.difficulty)}${opt('H', 'Heavy', t.difficulty)}</select></td>
          <td class="tm-stack">${taskWhoSelect(t)}
            <select class="inp sm" data-change="task-field" data-id="${t.id}" data-f="assistMode" aria-label="Assist">${opt('none', 'No assist', t.assistMode)}${opt('optional', 'Assist: optional', t.assistMode)}${opt('required', 'Assist: required', t.assistMode)}</select></td>
          <td class="nowrap small">${esc(t.handbookRef)}</td>
          <td class="tm-stack">${onHold(t) ? `<button class="btn sm" data-act="task-resume" data-id="${t.id}">Resume</button>` : `<button class="btn sm" data-act="task-hold" data-id="${t.id}" title="Pause this task (optionally until a date)">Hold</button>`}<button class="btn sm danger" data-act="task-del" data-id="${t.id}" aria-label="Delete ${esc(t.name)}" title="Delete">🗑 Delete</button></td><td></td></tr>`).join('');
    }).join('');
    const held = state.tasks.filter(onHold).length;
    return `<div class="head"><h1>Task Library</h1><span class="sub">${state.tasks.filter(t => t.active && !onHold(t)).length} active chores${held ? ' · ' + held + ' on hold' : ''} · minutes and difficulty are starting estimates</span><span class="spacer"></span>
      <button class="btn primary" data-act="task-new">+ Add task</button></div>
      <div class="row" style="margin-bottom:12px"><select class="inp" style="width:auto" data-change="task-cat" aria-label="Category">${opt('', 'All categories', ui.taskCat)}${state.categories.map(c => opt(c.id, c.name, ui.taskCat)).join('')}</select>
      <select class="inp" style="width:auto" data-change="task-freqf" aria-label="Frequency">${opt('', 'All frequencies', fq)}${[['daily', 'Daily'], ['schoolDays', 'School days'], ['eod', 'Every other day'], ['perWeek', 'Times a week'], ['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['months', 'Every 3–6 months'], ['yearly', 'Yearly'], ['asNeeded', 'As needed']].map(([v, l]) => opt(v, l, fq)).join('')}</select>
      <select class="inp" style="width:auto" data-change="task-prif" aria-label="Priority">${opt('', 'All priorities', pr)}${opt('essential', 'Essential', pr)}${opt('standard', 'Standard', pr)}${opt('canMove', 'Can move', pr)}${opt('hold', 'On hold', pr)}</select>
      <input class="inp" style="width:220px" placeholder="Search tasks" value="${esc(ui.taskQ)}" data-change="task-q">
      <label class="checks"><label><input type="checkbox" data-change="task-inactive" ${ui.showInactive ? 'checked' : ''}> Show inactive</label></label>
      ${fq || pr || ui.taskCat || ui.taskQ ? '<button class="btn sm" data-act="task-filters-clear">Clear filters</button>' : ''}
      <span class="spacer" style="flex:1"></span><button class="btn" data-act="task-print">🖨 Print this list</button></div>
      <div class="small muted" style="margin:-6px 0 10px">👶 children not in area · 🔇 quiet hours · 🚶 low traffic · 🪜 ladder · 🚘 driver only (driving) · ⏰ set start time</div>
      ${shown.length ? `<div class="tm-jump"><span class="small muted">${shown.reduce((a, x) => a + x[1], 0)} tasks in ${shown.length} ${shown.length === 1 ? 'category' : 'categories'} — scroll inside the list, or jump to:</span>
        ${shown.map(([c, n]) => `<button class="btn sm" data-act="task-jump" data-cat="${c.id}"><span class="dot" style="background:${c.color}"></span> ${esc(c.name)} (${n})</button>`).join('')}</div>` : ''}
      <div class="card flush tm-freeze"><table class="t tm"><thead><tr><th class="tm-task">Task</th><th>Frequency</th><th>Window<div class="tm-sub">from / to · minutes</div></th><th>Priority<div class="tm-sub">difficulty</div></th><th>Who<div class="tm-sub">assist</div></th><th>Ref</th><th></th><th></th></tr></thead>
        <tbody>${rows || '<tr><td class="tm-task empty">No tasks match these filters.</td><td colspan="7"></td></tr>'}</tbody></table></div>`;
  }
  const onHold = t => !!t.onHold && (!t.holdUntil || t.holdUntil >= todayStr());
  /** Print the Task Library exactly as filtered on screen (landscape). */
  function printTasks() {
    const q = (ui.taskQ || '').toLowerCase(), fq = ui.taskFreq || '', pr = ui.taskPri || '';
    const keep = t => (!fq || t.freq.type === fq) && (!pr || (pr === 'hold' ? onHold(t) : t.priority === pr)) && (ui.showInactive || t.active || pr === 'hold') && (!q || t.name.toLowerCase().includes(q));
    const cats = state.categories.filter(c => !ui.taskCat || c.id === ui.taskCat);
    const filters = [ui.taskCat ? cat(ui.taskCat).name : '', fq ? ({ daily: 'Daily', schoolDays: 'School days', eod: 'Every other day', perWeek: 'Times a week', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', months: 'Every 3–6 months', yearly: 'Yearly', asNeeded: 'As needed' }[fq]) : '',
      pr ? ({ essential: 'Essential', standard: 'Standard', canMove: 'Can move', hold: 'On hold' }[pr]) : '', q ? '"' + ui.taskQ + '"' : '', ui.showInactive ? 'incl. inactive' : ''].filter(Boolean);
    const who = t => { const a = t.assign; if (!a || !a.staffId) return 'Rotation'; return (a.mode === 'fixed' ? 'Fixed: ' : 'Until ' + fmtDS(a.until) + ': ') + sName(a.staffId); };
    let n = 0;
    const body = cats.map(c => { const ts = state.tasks.filter(t => t.categoryId === c.id && keep(t)); n += ts.length; if (!ts.length) return '';
      return `<tr class="fixed"><td colspan="10"><b>${esc(c.name)}</b> (${ts.length})</td></tr>` + ts.map(t => `<tr><td>${esc(t.name)}${onHold(t) ? ' [on hold]' : ''}${!t.active ? ' [inactive]' : ''}</td><td>${esc(E.freqLabel(t.freq))}</td><td class="nowrap">${t.window[0]}–${t.window[1]}</td><td>${t.minutes}</td>
        <td>${t.difficulty === 'H' ? 'Heavy' : 'Light'}</td><td>${{ none: '—', optional: 'Optional', required: 'Required' }[t.assistMode]}</td><td>${{ essential: 'Essential', standard: 'Standard', canMove: 'Can move' }[t.priority]}</td><td>${esc(who(t))}</td><td>${esc((t.constraints || []).map(x => CONS_ICON[x][1]).join('; '))}</td><td class="nowrap">${esc(t.handbookRef)}</td></tr>`).join(''); }).join('');
    if (!n) { toast('No tasks match these filters.'); return; }
    const html = `<div class="pg tasks"><h1><span>${esc(state.settings.householdName.toUpperCase())} — TASK LIST</span><span>${fmtD(todayStr())}</span></h1>
      <div class="who"><b>Filters:</b> ${esc(filters.join(' · ') || 'all active tasks')} · ${n} tasks</div>
      <table><thead><tr><th>Task</th><th>Frequency</th><th>Window</th><th>Min</th><th>Difficulty</th><th>Assist</th><th>Priority</th><th>Who</th><th>Rules</th><th>Ref</th></tr></thead><tbody>${body}</tbody></table></div>`;
    setPage('landscape', 'Task list' + (filters.length ? ' · ' + filters.join(' · ') : '')); document.getElementById('print-root').innerHTML = html; printPreview();
  }
  // inline frequency choice in the Task Library list (fixed days / weekdays stay as "custom" — edit them in the task form)
  const FREQ_OPTS = [['daily', 'Daily'], ['schoolDays', 'School days'], ['eod', 'Every other day'], ['pw2', '2× a week'], ['pw3', '3× a week'], ['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['m3', 'Every 3 months'], ['m6', 'Every 6 months'], ['yearly', 'Yearly'], ['asNeeded', 'As needed']];
  function freqKey(f) {
    if (f.type === 'perWeek') return f.days && f.days.length ? 'custom' : [2, 3].includes(Number(f.n)) ? 'pw' + f.n : 'custom';
    if (f.type === 'weekly' || f.type === 'biweekly') return f.day != null ? 'custom' : f.type;
    if (f.type === 'months') return [3, 6].includes(Number(f.n)) ? 'm' + f.n : 'custom';
    if (f.type === 'yearly') return f.month ? 'custom' : 'yearly';
    return f.type;
  }
  function freqFromKey(k, old) {
    if (k === 'pw2' || k === 'pw3') return { type: 'perWeek', n: Number(k.slice(2)), days: null };
    if (k === 'm3' || k === 'm6') return { type: 'months', n: Number(k.slice(1)) };
    if (k === 'eod') return { type: 'eod', offset: old.offset || 0 };
    if (k === 'weekly' || k === 'biweekly') return { type: k, day: null };
    return { type: k };
  }
  const freqSelect = t => { const k = freqKey(t.freq); return `<select class="inp sm" style="width:auto;max-width:150px" data-change="task-field" data-id="${t.id}" data-f="freq" aria-label="Frequency">${k === 'custom' ? opt('custom', E.freqLabel(t.freq), 'custom') : ''}${FREQ_OPTS.map(([v, l]) => opt(v, l, k)).join('')}</select>`; };
  /** Inline "Who" choice in the Task Library list: rotation, fixed to a helper or the driver, or manual until a date (opens the form). */
  function taskWhoSelect(t) {
    const a = t.assign, d = todayStr(), manualOn = a && a.mode === 'manual' && a.staffId && (!a.until || a.until >= d);
    const val = !a || !a.staffId ? 'rotation' : a.mode === 'fixed' ? 'fixed:' + a.staffId : manualOn ? 'manual' : 'rotation';
    const people = state.staff.filter(s => E.isActive(s, d)).sort((x, y) => (x.role === 'driver') - (y.role === 'driver'));
    return `<select class="inp sm" style="width:auto;min-width:130px" data-change="task-who" data-id="${t.id}" aria-label="Who does ${esc(t.name)}">${opt('rotation', 'Rotation', val)}
      <optgroup label="Fixed (permanent)">${people.map(s => opt('fixed:' + s.id, (s.nickname || s.fullName) + (s.role === 'driver' && !/driver/i.test(s.nickname || s.fullName) ? ' (driver)' : ''), val)).join('')}</optgroup>
      ${opt('manual', manualOn ? `Manual: ${sName(a.staffId)} until ${fmtDS(a.until)}` : 'Manual until a date…', val)}</select>`;
  }
  function taskAssignLabel(t) {
    const a = t.assign, d = todayStr();
    if (!a || !a.staffId) return '<span class="muted small">Rotation</span>';
    if (a.mode === 'fixed') return `<span class="chip">Fixed: ${esc(sName(a.staffId))}</span>`;
    if (a.until && a.until < d) return `<span class="muted small">Rotation</span> <span class="small muted" title="Manual assignment ended">(manual ended ${fmtDS(a.until)})</span>`;
    return `<span class="chip info">${esc(sName(a.staffId))} until ${fmtDS(a.until)}</span>`;
  }
  function taskModal(id) {
    const t = id ? state.tasks.find(x => x.id === id) : { id: '', name: '', categoryId: 'kitchen', areaIds: [], freq: { type: 'weekly', day: null }, preferredDays: [], window: ['08:00', '16:00'], minutes: 30, difficulty: 'L', assistMode: 'optional', assistMinutes: 15, driverMayAssist: false, priority: 'standard', constraints: [], instructions: [], handbookRef: '', checklist: [], active: true };
    const f = t.freq;
    modal(id ? 'Edit task' : 'Add task', `<form data-form="task" class="form" id="task-form"><input type="hidden" name="id" value="${esc(t.id)}">
      <label class="field full">Name<input name="name" required value="${esc(t.name)}"></label>
      <label class="field">Lead category<select name="categoryId">${state.categories.map(c => opt(c.id, c.name, t.categoryId)).join('')}</select></label>
      <label class="field">Priority<select name="priority">${opt('essential', 'Essential', t.priority)}${opt('standard', 'Standard', t.priority)}${opt('canMove', 'Can move', t.priority)}</select></label>
      <label class="field">Frequency<select name="ftype">${[['daily', 'Daily'], ['schoolDays', 'School days (Mon–Fri)'], ['eod', 'Every other day'], ['perWeek', 'X times per week'], ['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['months', 'Every N months'], ['yearly', 'Yearly'], ['asNeeded', 'As needed (not scheduled)']].map(([v, l]) => opt(v, l, f.type)).join('')}</select></label>
      <div class="row"><label class="field" style="flex:1">Times / N months<input type="number" min="1" max="12" name="fn" value="${f.n || ''}"></label>
        <label class="field" style="flex:1">Weekday (weekly)<select name="fday">${opt('', 'Any (lowest load)', f.day ?? '')}${DOWL.map((n, i) => opt(i, n, f.day ?? '')).join('')}</select></label></div>
      <div class="field full">Fixed days (X times/week)<div class="checks">${DOWS.map((n, i) => `<label><input type="checkbox" name="fdays" value="${i}" ${(f.days || []).includes(i) ? 'checked' : ''}>${n}</label>`).join('')}</div></div>
      <div class="row"><label class="field" style="flex:1">Every-other-day cycle<select name="foffset">${opt(0, 'Cycle A', f.offset || 0)}${opt(1, 'Cycle B (day after A)', f.offset || 0)}</select></label>
        <label class="field" style="flex:1">Month (yearly)<select name="fmonth">${opt('', 'Spread automatically', f.month || '')}${MON.map((m, i) => opt(i + 1, m, f.month || '')).join('')}</select></label></div>
      <div class="field full">Preferred days (optional)<div class="checks">${DOWS.map((n, i) => `<label><input type="checkbox" name="pdays" value="${i}" ${(t.preferredDays || []).includes(i) ? 'checked' : ''}>${n}</label>`).join('')}</div></div>
      <label class="field">Earliest start<input type="time" name="ws" value="${esc(t.window[0])}" required></label>
      <label class="field">Latest finish<input type="time" name="we" value="${esc(t.window[1])}" required></label>
      <label class="field">Estimated minutes<input type="number" min="5" step="5" name="minutes" value="${t.minutes}" required></label>
      <label class="field">Difficulty<select name="difficulty">${opt('L', 'Light', t.difficulty)}${opt('H', 'Heavy', t.difficulty)}</select></label>
      <label class="field">Assist mode<select name="assistMode">${opt('none', 'None', t.assistMode)}${opt('optional', 'Optional', t.assistMode)}${opt('required', 'Required (two people)', t.assistMode)}</select></label>
      <label class="field">Assist minutes<input type="number" min="0" step="5" name="assistMinutes" value="${t.assistMinutes || 0}"></label>
      <div class="field full">Constraints<div class="checks">${Object.entries(CONS_ICON).map(([k, [ic, l]]) => `<label><input type="checkbox" name="cons" value="${k}" ${(t.constraints || []).includes(k) ? 'checked' : ''}>${ic} ${l}</label>`).join('')}
        <label title="Driving jobs: skipped on the driver's day off instead of going to a helper"><input type="checkbox" name="driverOnly" ${t.driverOnly ? 'checked' : ''}>🚘 Driver only (driving)</label></div></div>
      <label class="field">Set start time (optional)<input type="time" name="startAt" value="${esc(t.startAt || '')}"><span class="small muted">e.g. the school run leaves at 07:10 — placed exactly then; the person is busy until it ends</span></label>
      <div class="field full">Areas<div class="checks">${state.areas.map(a => `<label><input type="checkbox" name="areas" value="${esc(a)}" ${(t.areaIds || []).includes(a) ? 'checked' : ''}>${esc(a)}</label>`).join('')}</div></div>
      ${(a => `<div class="full section-title" style="margin:4px 0 0">Who does it</div>
      <label class="field">Assignment<select name="amode">${opt('rotation', 'On rotation (the area\'s lead, balanced)', a.mode || 'rotation')}${opt('fixed', 'Fixed (always the same person)', a.mode || 'rotation')}${opt('manual', 'Manually assigned until a date', a.mode || 'rotation')}</select></label>
      <label class="field">Person (fixed or manual)<select name="astaff">${opt('', '—', a.staffId || '')}${state.staff.filter(s => E.isActive(s, todayStr())).map(s => opt(s.id, (s.nickname || s.fullName) + (s.role === 'driver' && !/driver/i.test(s.nickname || s.fullName) ? ' (driver)' : ''), a.staffId || '')).join('')}</select></label>
      <label class="field">Manual: from<input type="date" name="afrom" value="${esc(a.from || todayStr())}"></label><label class="field">Manual: until<input type="date" name="auntil" value="${esc(a.until || '')}"></label>
      <div class="full small muted">On rotation, the task follows its lead area (and can be shared out to balance the load). Fixed or manual: it goes to that person every time it is scheduled; on their rest day or absence it falls back to the rotation that day. After the "until" date it returns to the rotation. Rotation, manual and assisting are for the helpers; the driver takes <b>fixed</b> assignments only.</div>`)(t.assign || {})}
      <label class="field">Handbook reference<input name="handbookRef" value="${esc(t.handbookRef)}" placeholder="§4.3"></label>
      <label class="field">Dish from the menu<select name="mealSlot">${opt('', '— not a cooking task —', t.mealSlot || '')}${E.MEAL_SLOTS.filter(x => !x.info).map(x => opt(x.id, x.label, t.mealSlot || '')).join('')}</select></label>
      <label class="field">Active<select name="active">${opt('1', 'Yes', t.active ? '1' : '0')}${opt('0', 'No', t.active ? '1' : '0')}</select></label>
      <label class="field full">Instructions (one step per line — printed on the checklist)<textarea name="instructions">${esc(t.instructions.join('\n'))}</textarea></label>
      <label class="field full">Checklist items (one per line)<textarea name="checklist">${esc((t.checklist || []).join('\n'))}</textarea></label></form>`,
      `${id ? '<button class="btn danger" data-act="task-del" data-id="' + id + '">Delete</button><span style="flex:1"></span>' : ''}<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="task-form">Save task</button>`, true);
  }

  // ---------- Staff ----------
  function staffMeta(s) {
    const d = todayStr(), reg = E.regularizationDue(s);
    if (s.exitDate && s.exitDate < d) return `<span class="chip">Exited ${fmtD(s.exitDate)}</span>`;
    if (s.status === 'provisional' && reg) {
      const total = U.daysBetween(s.hireDate, reg), day = Math.min(total, U.daysBetween(s.hireDate, d) + 1);
      return `<span class="chip warn">PROVISIONAL · Day ${day} of ${total}</span> <span class="small muted">Regularization due ${fmtD(reg)} (${reg >= d ? 'in ' + U.daysBetween(d, reg) + ' days' : 'overdue'})</span>`;
    }
    return `<span class="chip ok">${esc((s.status || '').toUpperCase())}</span>`;
  }
  const avatar = (s, lg) => `<div class="avatar${lg ? ' lg' : ''}">${s.photos && s.photos.face ? `<img src="${s.photos.face.src}" alt="">` : esc((s.nickname || s.fullName || '?').slice(0, 1))}</div>`;
  function vStaff() {
    const d = todayStr(), seg = E.leadsOn(E.leadPlan(state, d), d);
    const list = state.staff.filter(s => ui.showExited || !s.exitDate || s.exitDate >= d);
    return `<div class="head"><h1>Staff</h1><span class="sub">${activeStaff(d).length} active</span><span class="spacer"></span>
      <label class="checks"><label><input type="checkbox" data-change="show-exited" ${ui.showExited ? 'checked' : ''}> Show exited</label></label>
      <button class="btn" data-act="templates" data-v="biodata">📄 Forms & templates</button><button class="btn primary" data-act="staff-new">+ Add staff</button></div>
      <div class="grid g2">${list.map(s => `<div class="card staff-card" data-act="staff" data-id="${s.id}">${avatar(s)}<div style="min-width:0">
        <h2 style="margin:0 0 4px">${esc(s.fullName)}${s.nickname ? ` <span class="muted" style="font-weight:400">“${esc(s.nickname)}”</span>` : ''}</h2>
        <div class="small muted">${s.role === 'driver' ? 'Driver' : 'House helper'}${s.arrangement ? ' · ' + (s.arrangement === 'live-out' ? 'Live-out' : 'Live-in') : ''} · Rest day: ${s.restDay === '' || s.restDay == null ? '—' : DOWL[s.restDay]} · Hired ${fmtD(s.hireDate)}</div>
        <div style="margin:6px 0">${staffMeta(s)} ${E.inShadow(s, d, state.settings) ? '<span class="chip info">Shadow mode (assist only)</span>' : ''}</div>
        ${s.role === 'helper' || leadCatsOf(seg, s.id).length ? `<div class="small">Current lead: ${esc(leadCatsOf(seg, s.id).join(', ') || '—')}</div>` : ''}</div></div>`).join('')}</div>
      <p class="small muted">Open a staff member for biodata, contracts, pay & vale and contributions. Photos, IDs and signed documents are stored on this device only.</p>`;
  }
  function staffModal(id, tab) {
    ui.staffTab = tab || ui.staffTab || 'overview';
    const s = id ? staffById(id) : { id: '', fullName: '', nickname: '', role: 'helper', status: 'provisional', hireDate: todayStr(), restDay: 0, shadow: 'auto', birthDate: '', phone: '', address: '', emergency: '', notes: '', photos: {}, ids: [] };
    if (!id) ui.staffTab = 'profile';
    const tabs = id ? [['overview', 'Overview'], ['profile', 'Profile'], ['biodata', 'Biodata'], ['photos', 'Photos & IDs'], ['contracts', 'Contracts'], ['pay', 'Pay & Vale'], ['contrib', 'Contributions'], ['exceptions', 'Leave & rest days'], ['quality', 'Tasks & quality']] : [['profile', 'Profile']];
    let body = '';
    if (ui.staffTab === 'overview') body = staffOverview(s);
    else if (ui.staffTab === 'profile') body = staffProfile(s);
    else if (ui.staffTab === 'biodata') body = staffBiodata(s);
    else if (ui.staffTab === 'photos') body = staffPhotos(s);
    else if (ui.staffTab === 'contracts') body = staffContracts(s);
    else if (ui.staffTab === 'pay') body = staffPay(s);
    else if (ui.staffTab === 'contrib') body = staffContrib(s);
    else if (ui.staffTab === 'exceptions') body = staffExceptions(s);
    else body = staffQuality(s);
    modal(id ? esc(s.fullName) : 'Add staff', `${id ? `<div class="row" style="gap:16px;align-items:flex-start">${avatar(s, true)}<div><h2 style="margin:0">${esc(s.fullName)}</h2>
      <div class="small muted">${s.role === 'driver' ? 'Driver' : 'House helper'}</div><div style="margin-top:6px">${staffMeta(s)}</div></div></div>` : ''}
      <div class="tabs">${tabs.map(([k, l]) => `<button class="${ui.staffTab === k ? 'on' : ''}" data-act="staff-tab" data-id="${s.id}" data-tab="${k}">${l}</button>`).join('')}</div>${body}`,
      ui.staffTab === 'profile' ? `<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="staff-form">Save</button>` : '', true);
  }
  function staffOverview(s) {
    const d = todayStr(), seg = E.leadsOn(E.leadPlan(state, d), d), r = getWeek(d);
    const w = r.weekLoads[s.id];
    return `<div class="grid g2"><div><div class="section-title" style="margin-top:0">Employment</div>
      <div class="list"><div class="li"><span class="grow">Hire date</span>${fmtD(s.hireDate)}</div>
      <div class="li"><span class="grow">Status</span>${esc(s.status)}</div>
      ${s.status === 'provisional' ? `<div class="li"><span class="grow">Regularization due (6 months)</span>${fmtD(E.regularizationDue(s))} ${(rr => rr ? `<span class="chip ${rr.stage === 7 ? 'bad' : 'warn'}">in ${rr.left} days</span>` : `<span class="muted small">day ${Math.max(0, U.daysBetween(s.hireDate, todayStr()))} of ${U.daysBetween(s.hireDate, E.regularizationDue(s))}</span>`)(P.regReminder(s, todayStr()))} <button class="btn sm" data-act="regularize" data-id="${s.id}">Regularize</button></div>` : ''}
      <div class="li"><span class="grow">Salary</span>${(sal => sal ? peso(sal.rate) + ' ' + BASIS_LABEL[sal.basis].toLowerCase() : '—')(curSalary(s.id))} · next payday ${fmtDS(P.nextDue(state, s, todayStr()).payday)} · ${esc({ cash: 'Cash', gcash: 'GCash', mixed: 'Mixed' }[P.payOf(s).mode])}</div>
      <div class="li"><span class="grow">Vale balance</span><b>${peso(P.valeBalanceOf(state, s.id))}</b></div>
      ${s.regularizedOn ? `<div class="li"><span class="grow">Regularized on</span>${fmtD(s.regularizedOn)}</div>` : ''}
      <div class="li"><span class="grow">Rest day</span>${s.restDay === '' || s.restDay == null ? '—' : DOWL[s.restDay]}</div>
      <div class="li"><span class="grow">Shadow mode</span>${{ auto: 'Auto (first ' + state.settings.shadowDays + ' days if provisional)', on: 'On', off: 'Off' }[s.shadow || 'auto']}</div>
      ${s.role === 'helper' || leadCatsOf(seg, s.id).length ? `<div class="li"><span class="grow">Current lead</span>${esc(leadCatsOf(seg, s.id).join(', ') || '—')}</div>` : ''}</div></div>
      <div><div class="section-title" style="margin-top:0">This week</div>
      <div class="list"><div class="li"><span class="grow">Working days</span>${w ? w.workDays : 0}</div><div class="li"><span class="grow">Minutes</span>${w ? num(w.min) : 0}</div>
      <div class="li"><span class="grow">Load points</span>${w ? num(w.pts) : 0}</div><div class="li"><span class="grow">Heavy tasks</span>${w ? w.heavy : 0}</div></div>
      <div class="section-title">Contact</div><div class="small">${esc(s.phone || '—')}<br>Emergency: ${esc(s.emergency || '—')}</div>
      ${s.notes ? `<div class="section-title">Notes</div><div class="small">${esc(s.notes)}</div>` : ''}</div></div>`;
  }
  function staffProfile(s) {
    const x = bioDerived(s), f = (k, label, type, full) => x[k]
      ? `<label class="field${full ? ' full' : ''}">${label} ${DERIVED_NOTE(s, x)}${roInput(k, x[k], type === 'date' ? 'type="date"' : '')}</label>`
      : `<label class="field${full ? ' full' : ''}">${label}<input name="${k}" ${type === 'date' ? 'type="date"' : ''} value="${esc(s[k])}" ${k === 'fullName' ? 'required' : ''}></label>`;
    return `<form data-form="staff" class="form" id="staff-form"><input type="hidden" name="id" value="${esc(s.id)}">
      ${s.id ? (x.version ? `<div class="full alert info">Name, birthday, address, contact and emergency contact come from the <b>Biodata (v${x.version})</b>, so they are greyed here. To change them, save a new biodata version.</div>`
        : `<div class="full alert warn">No biodata yet. <span class="clickable" data-act="staff-tab" data-id="${s.id}" data-tab="biodata" style="text-decoration:underline">Fill in the biodata</span> first: name, birthday, address, contacts and government numbers then flow to the profile, contracts and contributions.</div>`)
        : '<div class="full alert info">Start with the basics here. After saving, the Biodata form opens: that is where name, birthday, address, contacts and government numbers are kept.</div>'}
      ${f('fullName', 'Full name')}
      <label class="field">Nickname<input name="nickname" value="${esc(s.nickname)}"></label>
      <label class="field">Role<select name="role">${opt('helper', 'House helper', s.role)}${opt('driver', 'Driver', s.role)}</select></label>
      <label class="field">Status<select name="status">${['applicant', 'provisional', 'regular'].map(x => opt(x, x[0].toUpperCase() + x.slice(1), s.status)).join('')}</select></label>
      <label class="field">Hire date<input type="date" name="hireDate" value="${esc(s.hireDate)}" required></label>
      <label class="field">Arrangement<select name="arrangement">${opt('live-in', 'Live-in', s.arrangement || 'live-in')}${opt('live-out', 'Live-out', s.arrangement || 'live-in')}</select></label>
      <label class="field">Weekly rest day<select name="restDay">${opt('', 'None', s.restDay ?? '')}${DOWL.map((n, i) => opt(i, n, s.restDay ?? '')).join('')}</select></label>
      <label class="field">Usually on her day-off<select name="dayoffStyle">${opt('home', 'Stays in the house, resting', s.dayoffStyle || 'home')}${opt('out', 'Goes out (leaves 7 PM the evening before)', s.dayoffStyle || 'home')}</select></label>
      <label class="field">Shadow mode (assist only)<select name="shadow">${opt('auto', 'Auto — first ' + state.settings.shadowDays + ' days if provisional', s.shadow || 'auto')}${opt('on', 'On', s.shadow)}${opt('off', 'Off', s.shadow)}</select></label>
      ${f('birthDate', 'Birth date', 'date')}
      ${f('phone', 'Contact number')}
      ${f('emergency', 'Emergency contact')}
      ${f('address', 'Address', '', true)}
      <label class="field full">Notes<textarea name="notes">${esc(s.notes)}</textarea></label>
      <label class="field full"><span><input type="checkbox" name="consent" ${s.consent ? 'checked' : ''}> Signed data privacy consent on file (RA 10173) — required before storing photos and IDs</span></label>
      ${(rc => `<div class="full section-title">Working on the rest day</div>
      <label class="field">Rest-day premium (% of day rate)<input type="number" name="rcPremium" min="0" max="200" value="${rc.premiumPct}"></label>
      <label class="field">Bank replacement days<select name="rcAccum">${opt('0', 'No — use within ' + (state.settings.replacementWindowDays || 14) + ' days', rc.accumulate ? '1' : '0')}${opt('1', 'Yes — allow banking', rc.accumulate ? '1' : '0')}</select></label>
      <label class="field">If banking: max days banked<input type="number" name="rcMax" min="1" max="30" value="${rc.maxDays}"></label>
      <label class="field">If banking: expire after (days)<input type="number" name="rcExpiry" min="7" max="365" value="${rc.expiryDays}"></label>`)(E.restCompOf(s))}
      ${s.id ? `<div class="full section-title">Exit</div>
      <label class="field">Last working day<input type="date" name="exitDate" value="${esc(s.exitDate || '')}"></label>
      <label class="field">Exit reason<select name="exitReason">${opt('', '—', s.exitReason || '')}${['Resigned', 'Terminated', 'End of contract', 'AWOL'].map(x => opt(x, x, s.exitReason || '')).join('')}</select></label>
      <div class="full small muted">After the last working day, future tasks go to the remaining staff. Past records stay unchanged.${s.exitDate ? ` <button class="btn sm" type="button" data-act="final-pay" data-id="${s.id}">Final pay</button>` : ''}</div>` : ''}</form>`;
  }
  function staffPhotos(s) {
    const slot = (k, label) => { const p = s.photos && s.photos[k];
      return `<div><div class="photo-slot" data-act="pick-photo" data-id="${s.id}" data-slot="${k}">${p ? `<img src="${p.src}" alt="${label}">` : `${label}<br>Click to add`}</div><div class="small muted" style="margin-top:4px">${p ? 'Taken ' + fmtD(p.date) : ''}</div></div>`; };
    return `${s.consent ? '' : '<div class="alert warn">⚠ Record the signed data privacy consent (Profile tab) before storing photos and IDs.</div>'}
      <div class="grid g3" style="grid-template-columns:repeat(4,minmax(0,1fr))">${slot('face', 'Face photo')}${slot('body', 'Full-body photo')}</div>
      <div class="section-title">IDs and clearances</div>
      ${(s.ids || []).length ? `<table class="t"><tr><th>Type</th><th>Number</th><th>Issued</th><th>Expires</th><th>Front</th><th>Back</th><th></th></tr>${s.ids.map(x => {
        const exp = x.expires && x.expires <= U.addDays(todayStr(), 30);
        return `<tr><td>${esc(x.type)}</td><td>•••• ${esc((x.number || '').slice(-4))}</td><td>${fmtD(x.issued)}</td><td>${fmtD(x.expires)} ${exp ? '<span class="chip bad">expiring</span>' : ''}</td>
        <td>${x.front ? `<img src="${x.front}" style="height:40px;border-radius:4px">` : '—'}</td><td>${x.back ? `<img src="${x.back}" style="height:40px;border-radius:4px">` : '—'}</td>
        <td><button class="btn sm danger" data-act="id-del" data-id="${s.id}" data-x="${x.id}">Remove</button></td></tr>`; }).join('')}</table>` : '<div class="empty">No IDs yet.</div>'}
      <form data-form="add-id" class="form" style="margin-top:12px" id="id-form"><input type="hidden" name="sid" value="${s.id}">
      <label class="field">Type<select name="type">${['PhilSys / National ID', 'SSS / UMID', 'PhilHealth', 'Pag-IBIG', 'Postal ID', "Voter's ID", "Driver's License", 'Passport', 'Barangay ID', 'NBI clearance', 'Barangay clearance', 'Police clearance', 'Medical certificate', 'Birth certificate', 'Other'].map(x => opt(x, x)).join('')}</select></label>
      <label class="field">ID / document number<input name="number" autocomplete="off"></label>
      <label class="field">Issued<input type="date" name="issued"></label><label class="field">Expires<input type="date" name="expires"></label>
      <label class="field">Front image<input type="file" name="front" accept="image/*"></label><label class="field">Back image<input type="file" name="back" accept="image/*"></label>
      <div class="full"><button class="btn primary" type="submit">+ Add ID</button> <span class="small muted">Numbers are shown masked. Images are resized and location data removed.</span></div></form>
      <input type="file" accept="image/*" id="photo-input" hidden data-change="photo">`;
  }
  function staffExceptions(s) {
    const ex = state.exceptions.filter(e => e.staffId === s.id).sort((a, b) => b.date.localeCompare(a.date));
    return `${ex.length ? `<table class="t"><tr><th>Date</th><th>Type</th><th>Pay effect (default)</th><th>Notes</th></tr>${ex.map(e => `<tr><td>${fmtD(e.date)}</td><td>${esc((EXC_TYPES[e.type] || [e.type])[0])}${excDetail(e) ? `<div class="small muted">${esc(excDetail(e))}</div>` : ''}</td><td class="small">${esc(EXC_TYPES[e.type][1])}</td><td>${esc(e.notes)}</td></tr>`).join('')}</table>` : '<div class="empty">No exceptions recorded.</div>'}
      <div style="margin-top:12px"><button class="btn" data-act="exc-new" data-id="${s.id}">+ Record exception</button></div>`;
  }
  function staffQuality(s) {
    const counts = {}; let total = 0;
    Object.values(state.marks).forEach(m => { if ((m.doneBy || []).includes(s.id)) { counts[m.status] = (counts[m.status] || 0) + 1; total++; } });
    const q = {}; Object.values(state.marks).forEach(m => { if ((m.doneBy || []).includes(s.id) && m.quality) q[m.quality] = (q[m.quality] || 0) + 1; });
    return `<div class="grid g2"><div><div class="section-title" style="margin-top:0">Task marks (all time)</div><div class="list">${Object.entries(MARK_STATUS).map(([k, l]) => `<div class="li"><span class="grow">${l}</span>${counts[k] || 0}${total ? ` <span class="muted small">(${Math.round((counts[k] || 0) / total * 100)}%)</span>` : ''}</div>`).join('')}</div></div>
      <div><div class="section-title" style="margin-top:0">Quality</div><div class="list">${['good', 'ok', 'poor'].map(k => `<div class="li"><span class="grow">${k[0].toUpperCase() + k.slice(1)}</span>${q[k] || 0}</div>`).join('')}</div>
      <div class="small muted" style="margin-top:8px">Trends by category and period come with Reports (Phase 4).</div></div></div>`;
  }

  // ---------- Attendance ----------
  function excForm(sid, type, date) {
    const d = date || todayStr();
    const groups = [['Day-offs', ['dayoff_home', 'dayoff_out', 'rest_worked', 'two_day_off', 'rest_moved']], ['Away or off on a working day', ['vacation', 'errand', 'half_am', 'half_pm', 'dayoff_paid', 'dayoff_unpaid', 'paid_leave']], ['Sick or absent', ['sick', 'absent_unauthorized']]];
    const t = type || 'rest_worked';
    return `<form data-form="exc" class="form" id="exc-form">
      <label class="field">Staff<select name="staffId" required data-change="exc-type">${activeStaff(d).map(s => opt(s.id, s.nickname || s.fullName, sid)).join('')}</select></label>
      <label class="field">What happened<select name="type" data-change="exc-type">${groups.map(([g, ks]) => `<optgroup label="${g}">${ks.map(k => opt(k, EXC_TYPES[k][0], t)).join('')}</optgroup>`).join('')}</select></label>
      <label class="field"><span class="x-datelabel">Date</span><input type="date" name="date" value="${d}" required data-change="exc-type"></label>
      <label class="field x-to" hidden><span class="x-tolabel">Moved to</span><input type="date" name="to"></label>
      <label class="field x-rest_worked" hidden>Whose idea<select name="initiated">${opt('employer', 'Employer asked her to work')}${opt('helper', 'Her own choice')}</select></label>
      <label class="field x-rest_worked" hidden>Portion worked<select name="portion">${opt('whole', 'Whole day')}${opt('half', 'Half day (AM)')}</select></label>
      <label class="field x-rest_worked" hidden>Compensation<select name="comp" data-change="exc-type">${opt('pay', 'Extra day\'s pay (in payroll)')}${opt('replacement', 'Replacement day-off later')}${opt('none', 'No extra pay (her choice, unpaid)')}${opt('outside', 'Paid outside the app (someone else pays her)')}</select></label>
      <label class="field x-repl" hidden>Replacement day (optional — can be set later)<input type="date" name="replDate"></label>
      <label class="field x-two_day_off" hidden>The extra day off is<select name="swap" data-change="exc-type">${opt('exchange', 'Swapped: she works her day-off on another date')}${opt('paid', 'Paid (no deduction)')}${opt('unpaid', 'Unpaid (deducted)')}</select></label>
      <label class="field x-exch" hidden>She works her day-off on (swap date)<input type="date" name="exchangeDate"></label>
      <label class="field x-errand" hidden>Out from<input type="time" name="from" value="13:00"></label><label class="field x-errand" hidden>Back by<input type="time" name="until" value="16:00"></label>
      <label class="field x-errand" hidden>Pay<select name="paid" data-change="exc-type">${opt('paid', 'Paid (no deduction)')}${opt('unpaid', 'Unpaid')}</select></label>
      <label class="field x-errand-unpaid" hidden>Deduct<select name="eportion">${opt('half', 'Half day')}${opt('whole', 'Whole day')}</select></label>
      <label class="field x-vacation" hidden>Pay<select name="vpay">${opt('sil', 'From service incentive leave (paid)')}${opt('paid', 'Paid (extra, not from SIL)')}${opt('unpaid', 'Unpaid (deducted per working day)')}</select></label>
      <label class="field x-vacation" hidden>Where<input name="vplace" placeholder="e.g., Leyte"></label>
      <label class="field x-sick" hidden>Where<select name="where">${opt('house', 'Resting in the house')}${opt('away', 'Away (home, hospital…)')}</select></label>
      <label class="field full">Notes<input name="notes" placeholder="optional, e.g. visitors today"></label>
      <div class="full small muted" id="exc-help"></div></form>`;
  }
  const EXC_HELP = {
    dayoff_home: 'Day-off spent in the house, resting. No tasks that day.',
    dayoff_out: 'Day-off spent out. She leaves at 7 PM the evening before, so her evening tasks that day go to the other helper.',
    rest_worked: 'She works on her day-off: by your request (e.g. visitors) or her own choice. Choose how it is compensated.',
    two_day_off: 'Two days off in a row, going out (e.g. leave Friday 7 PM, back Sunday 7 PM). Usually alternating weekends: the extra day is swapped for a day-off she works on another week.',
    rest_moved: 'Her weekly day-off falls on another date this week.',
    errand: 'Out for part of a working day. Tasks during those hours go to whoever is working.',
    vacation: 'Away for days or weeks. While she is away the other helper does the essential daily tasks first; other daily tasks are done about twice a week, and can-move chores wait until she is back.',
    half_am: 'Off in the morning; works from 12:00.', half_pm: 'Works the morning; off from 12:00.',
    dayoff_paid: 'An extra day off with pay, approved by you.', dayoff_unpaid: 'An extra day off without pay, approved by you.',
    paid_leave: 'Service incentive leave (paid).', sick: 'Sick and can\'t work. She may still be in the house, resting.', absent_unauthorized: 'Absent without permission (flagged in reports).',
  };
  /** Show only the fields for the chosen situation. */
  function excTypeUI() {
    const f = document.getElementById('exc-form'); if (!f) return;
    const t = f.type.value, show = (sel, on) => f.querySelectorAll(sel).forEach(el => { el.hidden = !on; });
    show('.x-to', t === 'rest_moved' || t === 'two_day_off' || t === 'vacation');
    f.querySelector('.x-tolabel').textContent = t === 'two_day_off' ? 'Second day off' : t === 'vacation' ? 'Last day of vacation' : 'Moved to';
    f.querySelector('.x-datelabel').textContent = t === 'vacation' ? 'First day of vacation' : t === 'two_day_off' ? 'First day off' : t === 'rest_worked' ? 'Day-off she works' : t.startsWith('dayoff_') && t !== 'dayoff_paid' && t !== 'dayoff_unpaid' ? 'Day-off date' : 'Date';
    if (t === 'two_day_off' && f.date.value && !f.to.value) f.to.value = U.addDays(f.date.value, 1);
    ['rest_worked', 'two_day_off', 'errand', 'sick', 'vacation'].forEach(k => show('.x-' + k, t === k));
    show('.x-repl', t === 'rest_worked' && f.comp.value === 'replacement');
    show('.x-exch', t === 'two_day_off' && f.swap.value === 'exchange');
    show('.x-errand-unpaid', t === 'errand' && f.paid.value === 'unpaid');
    document.getElementById('exc-help').textContent = EXC_HELP[t] || '';
  }
  // ---------- Monitoring: rest days, vacation and sick leave per person ----------
  function attendanceSummary(st, from, to, today) {
    const z = { restHome: 0, restOut: 0, restPlanned: 0, twoDayOff: 0, worked: 0, workedPay: 0, vacation: 0, vacationPlanned: 0, sick: 0, sickHouse: 0, extraPaid: 0, extraUnpaid: 0, absent: 0, half: 0, errands: 0, withFamily: 0 };
    const lo = [from, st.hireDate || from].sort()[1], hi = st.exitDate && st.exitDate < to ? st.exitDate : to;
    for (let d = lo; d <= hi; d = U.addDays(d, 1)) {
      const s = E.dayStatus(state, st, d);
      if (s.rest) { if (d > today) z.restPlanned++; else if (/Two-day/.test(s.label)) z.twoDayOff++; else if (s.away) z.restOut++; else z.restHome++; }
      if (s.withFamily) z.withFamily++;
      if (s.vacation) { if (d > today) z.vacationPlanned++; else z.vacation++; }
    }
    (state.exceptions || []).filter(e => e.staffId === st.id && e.date >= lo && e.date <= hi).forEach(e => {
      if (e.type === 'rest_worked') { z.worked++; if ((e.comp || 'pay') === 'pay') z.workedPay++; }
      if (e.type === 'paid_leave') { if (e.date > today) z.vacationPlanned++; else z.vacation++; }
      if (e.type === 'sick') { z.sick++; if (e.where !== 'away') z.sickHouse++; }
      if (e.type === 'dayoff_paid') z.extraPaid++;
      if (e.type === 'dayoff_unpaid') z.extraUnpaid++;
      if (e.type === 'absent_unauthorized') z.absent++;
      if (e.type === 'half_am' || e.type === 'half_pm') z.half++;
      if (e.type === 'errand') z.errands++;
    });
    return z;
  }
  function monitoringCard() {
    const today = todayStr(), mode = ui.monMode || 'month', anchor = ui.monDate || today;
    const from = mode === 'year' ? anchor.slice(0, 4) + '-01-01' : anchor.slice(0, 8) + '01', to = mode === 'year' ? anchor.slice(0, 4) + '-12-31' : U.addDays(U.nextMonth(from), -1);
    const people = state.staff.filter(s => s.hireDate && s.hireDate <= to && (!s.exitDate || s.exitDate >= from));
    const y = +anchor.slice(0, 4);
    const rows = people.map(s => { const z = attendanceSummary(s, from, to, today), sil = P.silBalance(state, s, y), sickPaid = P.payOf(s).sickPaid;
      return `<tr><td><b>${esc(s.nickname || s.fullName)}</b></td>
        <td>${z.restHome + z.restOut + z.twoDayOff}<div class="small muted">${z.restHome} at home · ${z.restOut} out${z.twoDayOff ? ' · ' + z.twoDayOff + ' in 2-day offs' : ''}${z.restPlanned ? ' · ' + z.restPlanned + ' still to come' : ''}</div></td>
        <td>${z.worked}<div class="small muted">${z.workedPay} with extra pay</div></td>
        <td>${z.vacation}${z.vacationPlanned ? ` <span class="small muted">+${z.vacationPlanned} planned</span>` : ''}<div class="small muted">${sil.entitled ? `SIL ${sil.balance} of ${sil.entitled} left (${y})` : 'SIL from ' + fmtD(sil.eligibleFrom)}</div></td>
        <td>${z.sick}<div class="small muted">${z.sickHouse} in the house · ${sickPaid ? 'paid' : 'unpaid'}</div></td>
        <td>${z.extraPaid + z.extraUnpaid}<div class="small muted">${z.extraPaid} paid · ${z.extraUnpaid} unpaid</div></td>
        <td>${z.half} / ${z.errands}</td><td>${z.absent ? `<span class="chip bad">${z.absent}</span>` : 0}</td></tr>`; }).join('');
    return `<div class="card"><div class="row" style="margin-bottom:8px"><h2 style="margin:0;flex:1">Monitoring: rest days, vacation and sick leave</h2>
        <button class="btn icon" data-act="mon-shift" data-n="-1" aria-label="Previous">◀</button><b>${mode === 'year' ? y : MON[+from.slice(5, 7) - 1] + ' ' + y}</b><button class="btn icon" data-act="mon-shift" data-n="1" aria-label="Next">▶</button>
        <select class="inp" style="width:auto" data-change="mon-mode">${opt('month', 'Month', mode)}${opt('year', 'Year', mode)}</select></div>
      <div class="scroll-x"><table class="t"><tr><th>Staff</th><th>Rest days taken</th><th>Worked on rest day</th><th>Vacation / paid leave (days)</th><th>Sick days</th><th>Extra days off</th><th>Half days / errands</th><th>Unauthorized</th></tr>${rows || '<tr><td colspan="8" class="empty">No staff in this period.</td></tr>'}</table></div>
      <div class="small muted" style="margin-top:6px">Counted from the schedule record and the exceptions below. Rest days include day-offs at home, going out, replacement days and 2-day offs. Vacation uses "Paid leave" entries; service incentive leave (SIL) balance is per calendar year.</div></div>`;
  }
  // ---------- Rest-day agreements (alternating two-day off) ----------
  function agreementsCard() {
    const today = todayStr(), helpers = state.staff.filter(s => s.role === 'helper' && E.isActive(s, today)), list = state.restAgreements || [];
    const nextTurns = ag => { const out = []; for (let m = U.mondayOf([today, ag.start].sort()[1]), i = 0; i < 4; m = U.addDays(m, 7), i++) { const d = [0, 1, 2, 3, 4, 5, 6].map(k => U.addDays(m, k)).find(x => (ag.days || []).includes(U.dow(x))); if (!d) continue; const who = ag.staff.find(id => { const a = E.agreementFor(state, staffById(id), d); return a && a.mode === 'off'; }); out.push(`${fmtDS(d)}: ${esc(sName(who))}`); } return out.join(' · '); };
    return `<div class="card"><h2>Rest-day agreements</h2>
      ${list.length ? `<div class="list">${list.map(ag => `<div class="li"><span class="grow"><b>Alternating two-day off</b> — ${ag.staff.map(id => esc(sName(id))).join(' ⇄ ')} · ${(ag.days || []).map(x => DOWS[x]).join(' + ')} · ${ag.goOut !== false ? 'going out (leaves 7 PM the evening before)' : 'resting at home'}
          <div class="small muted">From ${fmtD(ag.start)}${ag.end ? ' to ' + fmtD(ag.end) : ''}. Next: ${nextTurns(ag)}</div></span>
          ${!ag.end || ag.end >= today ? `<button class="btn sm danger" data-act="agree-end" data-id="${ag.id}">End</button>` : '<span class="chip">ended</span>'}</div>`).join('')}</div>` : '<div class="empty">No standing agreement. Each helper has her own weekly rest day.</div>'}
      <form data-form="agreement" class="form" style="margin-top:10px">
        <div class="full small"><b>New: alternating two-day off</b> — one helper takes both days off while the other works both; the next week they swap. No pay effect.</div>
        <div class="field full">Helpers<div class="checks">${helpers.map(s => `<label><input type="checkbox" name="staff" value="${s.id}" checked>${esc(s.nickname || s.fullName)}</label>`).join('')}</div></div>
        <label class="field">Days<select name="days">${opt('6,0', 'Saturday + Sunday')}${opt('5,6', 'Friday + Saturday')}${opt('0,1', 'Sunday + Monday')}</select></label>
        <label class="field">First turn (off first)<select name="first">${helpers.map(s => opt(s.id, s.nickname || s.fullName)).join('')}</select></label>
        <label class="field">Starting the week of<input type="date" name="start" value="${today}" required></label>
        <label class="field">On those days she usually<select name="goOut">${opt('1', 'Goes out (leaves 7 PM the evening before, back the last evening)')}${opt('0', 'Stays home, resting')}</select></label>
        <div class="full"><button class="btn primary" type="submit">Save agreement</button> <span class="small muted">Day-offs or absences you record still win on their days. If nobody is left to work, you get a warning.</span></div></form></div>`;
  }
  /** Days in the next n days when no helper is available (cached per week by getWeek). */
  function noHelperDays(from, n) {
    const out = [];
    for (let i = 0; i < n; i++) { const d = U.addDays(from, i), r = getWeek(d); if ((r.noHelper || []).includes(d)) out.push(d); }
    return out;
  }
  function availabilityStrip() {
    const today = todayStr(), days = Array.from({ length: 14 }, (_, i) => U.addDays(today, i)), staff = state.staff.filter(s => E.isActive(s, today));
    const none = new Set(noHelperDays(today, 14));
    const short = st => !st ? '' : st.working ? (st.half || (st.blocks || []).length ? '½' : '✓') : st.withFamily ? 'Fam' : st.rest ? (st.away ? 'Out' : 'Off') : /Sick/.test(st.label) ? 'Sick' : 'Away';
    return `<div class="scroll-x"><table class="t avail"><tr><th></th>${days.map(d => `<th class="${none.has(d) ? 'bad' : ''}">${DOWS[U.dow(d)]}<div class="small">${+d.slice(8)}</div></th>`).join('')}</tr>
      ${staff.map(s => `<tr><td class="nowrap"><b>${esc(s.nickname || s.fullName)}</b></td>${days.map(d => { const st = getWeek(d).status[d][s.id]; return `<td class="clickable ${st && st.working ? 'ok' : 'off'}${none.has(d) ? ' bad' : ''}" title="${esc(st ? st.label : '')}" data-act="goto-day" data-d="${d}">${short(st)}</td>`; }).join('')}</tr>`).join('')}</table></div>
      ${none.size ? `<div class="alert bad" style="margin-top:8px">⚠ No helper available on ${[...none].map(fmtDS).join(', ')}. The family needs to adjust (cooking, the children, essentials).</div>` : '<div class="small muted" style="margin-top:6px">At least one helper is available every day.</div>'}
      <div class="small muted">✓ working · ½ part of the day away · Off day-off at home · Out day-off going out · Fam with the family · Sick · Away other absence. Hover for details; click to open the day.</div>`;
  }
  /** Short status for the attendance calendar: [text, css class] or null when it is a normal working day. */
  function attShort(st) {
    if (!st) return null;
    if (st.working) {
      if (/rest day|agreement/i.test(st.label)) return [/agreement/i.test(st.label) ? 'Works (swap)' : 'Works day-off', 'info'];
      if (st.half) return ['½ day', 'warn'];
      if (/errand/.test(st.label)) return ['Errand', 'warn'];
      if (/with the family/.test(st.label)) return ['With family (part)', 'info'];
      if (/leaves 19:00/.test(st.label)) return ['Leaves 7 PM', ''];
      return null;
    }
    if (st.vacation) return ['Vacation', 'vac'];
    if (st.withFamily) return ['With family', 'info'];
    if (st.rest) return [/Two-day/.test(st.label) ? '2-day off' : st.away ? 'Off · out' : 'Off · home', 'rest'];
    if (/Sick/.test(st.label)) return [st.inHouse ? 'Sick (home)' : 'Sick', 'bad'];
    if (/Unauthorized/.test(st.label)) return ['Absent', 'bad'];
    if (/Paid leave/.test(st.label)) return ['Leave', 'vac'];
    if (/Day-off/.test(st.label)) return ['Extra day off', 'rest'];
    return [st.label.replace(/^(.{14}).+$/, '$1…'), ''];
  }
  function attendanceCalendar() {
    const today = todayStr(), ms = (ui.attMonth || today.slice(0, 7)) + '-01', me = U.addDays(U.nextMonth(ms), -1);
    const staff = state.staff.filter(s => s.hireDate && s.hireDate <= me && (!s.exitDate || s.exitDate >= ms)).sort((a, b) => (a.role === 'driver') - (b.role === 'driver'));
    const cells = [];
    for (let d = U.mondayOf(ms); d <= me || U.dow(d) !== 1; d = U.addDays(d, 1)) {
      if (d > me && U.dow(d) === 1) break;
      const r = getWeek(d), nh = (r.noHelper || []).includes(d), evs = r.events[d] || [];
      const ns = E.noSchoolOn(state, d), wkday = U.dow(d) >= 1 && U.dow(d) <= 5;
      const hol = (ns && wkday ? `<div class="ac hol" data-act="ns-new" data-id="${ns.id}" title="${esc((E.NO_SCHOOL[ns.reason] || E.NO_SCHOOL.other)[1] + (ns.note ? ': ' + ns.note : ''))} — click to edit">${noSchoolLabel(d)}</div>` : '')
        + birthdaysOn(d).map(b => `<div class="ac bday">${esc(bdayText(b))}</div>`).join('');
      const chips = staff.filter(s => E.isActive(s, d)).map(s => { const x = attShort(r.status[d][s.id]); return x ? `<div class="ac ${x[1]}" data-act="exc-new" data-id="${s.id}" data-d="${d}" title="${esc((s.nickname || s.fullName) + ': ' + r.status[d][s.id].label)}"><b>${esc((n => n.length <= 10 ? n : n.split(' ')[0])(s.nickname || s.fullName))}</b> ${esc(x[0])}</div>` : ''; }).join('');
      cells.push(`<div class="mc att${d >= ms && d <= me ? '' : ' out'}${d === today ? ' today' : ''}${nh ? ' nohelper' : ''}" data-act="exc-new" data-d="${d}" title="Click to record a day-off, absence or errand on ${fmtD(d)}">
        <div class="md">${+d.slice(8)}</div>${hol}${evs.filter(e => !(e.type === 'holiday' && hol)).map(e => `<div class="ac evt" data-act="event-new" data-id="${e.seriesId || e.id}" title="${esc(E.EVENT_TYPES[e.type].label)} — click to edit">${evIcon(e)} ${esc(e.title || E.EVENT_TYPES[e.type].label)}${e.startTime && e.date === d ? ' ' + e.startTime : ''}</div>`).join('')}${nh ? '<div class="ac bad">No helper</div>' : ''}${chips}</div>`);
    }
    return `<div class="card flush" style="margin-bottom:16px"><div class="row" style="padding:12px 14px 6px"><h2 style="margin:0;flex:1">Calendar</h2>
        <button class="btn icon" data-act="att-month" data-n="-1" aria-label="Previous month">◀</button><b>${MON[+ms.slice(5, 7) - 1]} ${ms.slice(0, 4)}</b><button class="btn icon" data-act="att-month" data-n="1" aria-label="Next month">▶</button>
        <button class="btn" data-act="att-month" data-n="0">This month</button><button class="btn" data-act="print-cal">🖨 Print (1 page)</button><button class="btn primary" data-act="exc-new">+ Record</button></div>
      <div class="scroll-x"><div class="month">${DOWS.slice(1).concat('Sun').map(x => `<div class="mh">${x}</div>`).join('')}${cells.join('')}</div></div>
      <div class="small muted" style="padding:8px 14px 12px">Click a day to record something for that date, or click a name to record it for that person. Shown: public holidays and other no-school days (🇵🇭 🌧️ 🤒 🏖️ — click to edit), events, and changes from a normal working day: day-offs (at home / out), vacation, sick, extra days off, working on a day-off, half days, errands, going with the family, and days with no helper (red).</div></div>`;
  }
  /** Shrink a print to exactly one page: measure it at the printable size, then zoom it down to fit (never up). */
  /** Printable area in CSS px for the paper size with the 0.75" margins set in setPage. */
  function printArea(orient) {
    const mm = 96 / 25.4, letter = state.settings.paper === 'Letter';
    let w = letter ? 279.4 : 297, h = letter ? 215.9 : 210; if (orient !== 'landscape') [w, h] = [h, w];
    return { w: (w - 2 * PRINT_MARGIN_MM) * mm, h: (h - 2 * PRINT_MARGIN_MM) * mm - 4 };
  }
  function fitOnePage(orient) {
    const root = document.getElementById('print-root'), pg = root.querySelector('.pg'); if (!pg) return;
    const { w: availW, h: availH } = printArea(orient);
    const keep = root.getAttribute('style') || '';
    root.setAttribute('style', `display:block;position:fixed;left:-20000px;top:0;width:${availW}px;font-family:Arial,sans-serif;color:#000`);
    pg.style.zoom = 1; pg.style.width = availW + 'px';
    const z = Math.min(1, availH / pg.scrollHeight, availW / pg.scrollWidth);
    pg.style.zoom = (Math.floor(z * 100) / 100).toFixed(2); pg.style.width = (availW / z) + 'px';
    root.setAttribute('style', keep);
  }
  /** The Calendar screen's month, printed on one page with holidays and events written out. */
  function printCalendar() {
    const today = todayStr(), ms = (ui.attMonth || today.slice(0, 7)) + '-01', me = U.addDays(U.nextMonth(ms), -1);
    const staff = state.staff.filter(s => s.hireDate && s.hireDate <= me && (!s.exitDate || s.exitDate >= ms)).sort((a, b) => (a.role === 'driver') - (b.role === 'driver'));
    const cells = [];
    for (let d = U.mondayOf(ms); d <= me || U.dow(d) !== 1; d = U.addDays(d, 1)) {
      if (d > me && U.dow(d) === 1) break;
      const r = getWeek(d), evs = r.events[d] || [], ns = E.noSchoolOn(state, d), wk = U.dow(d) >= 1 && U.dow(d) <= 5, items = [];
      if (ns && wk) items.push(`<div class="mi hol">${noSchoolLabel(d)}${ns.note && /holiday|non-working/.test(ns.note) ? ' <span class="cal-k">(' + esc((ns.note.match(/\((.*)\)$/) || ['', ''])[1]) + ')</span>' : ''}</div>`);
      birthdaysOn(d).forEach(b => items.push(`<div class="mi hol">${esc(bdayText(b))}</div>`));
      evs.filter(e => !(e.type === 'holiday' && ns)).forEach(e => items.push(`<div class="mi ev">${evIcon(e)} ${esc(e.title || E.EVENT_TYPES[e.type].label)}${e.startTime && e.date === d ? ' ' + e.startTime + (e.endTime ? '–' + e.endTime : '') : ''}${e.location === 'out' && e.place ? ' · ' + esc(e.place) : ''}</div>`));
      if ((r.noHelper || []).includes(d)) items.push('<div class="mi abs"><b>No helper available</b></div>');
      staff.filter(s => E.isActive(s, d)).forEach(s => { const x = attShort(r.status[d][s.id]); if (x) items.push(`<div class="mi ${x[1] === 'bad' ? 'abs' : 'rest'}">${esc(sName(s.id))}: ${esc(x[0])}</div>`); });
      cells.push({ d, inMonth: d >= ms && d <= me, items });
    }
    printMonthGrid('CALENDAR', ms, cells, 'Calendar', 'Holidays and no-school days (bold), events, day-offs, absences and days with no helper. Normal working days are left blank.');
  }
  function vAttendance() {
    const ex = [...state.exceptions].sort((a, b) => b.date.localeCompare(a.date));
    return `<div class="head"><h1>Calendar</h1><span class="sub">Holidays, no-school days, day-offs and absences — only exceptions are recorded</span><span class="spacer"></span><button class="btn" data-act="sc-paste">📋 Paste events</button><button class="btn" data-act="event-new">+ Event</button><button class="btn" data-act="ns-new">🏫 + No-school day(s)</button></div>
      ${attendanceCalendar()}
      ${schoolCalendarCard(+((ui.attMonth || todayStr().slice(0, 7)).slice(0, 4)))}<div style="height:16px"></div>
      ${monitoringCard()}<div style="height:16px"></div>
      <div class="grid g2">${agreementsCard()}<div class="card"><h2>Who is available — next 14 days</h2>${availabilityStrip()}</div></div><div style="height:16px"></div>
      <div class="grid g2"><div class="card"><h2>Recorded</h2><div class="list" style="max-height:340px;overflow:auto">${ex.slice(0, 60).map(e => `<div class="li"><span class="time">${fmtDS(e.date)}</span><span class="grow"><b>${esc(sName(e.staffId))}</b> · ${esc((EXC_TYPES[e.type] || [e.type])[0])}${excDetail(e) ? `<div class="small muted">${esc(excDetail(e))}</div>` : ''}${e.notes ? `<div class="small muted">${esc(e.notes)}</div>` : ''}</span><button class="btn sm danger" data-act="exc-del" data-id="${e.id}">Remove</button></div>`).join('') || '<div class="empty">Nothing recorded yet. Click a day on the calendar.</div>'}</div></div>
      <div class="card"><h2>Pay effects (defaults)</h2><table class="t">${Object.values(EXC_TYPES).map(([l, p]) => `<tr><td>${esc(l)}</td><td class="small">${esc(p)}</td></tr>`).join('')}
      <tr><td>Weekly rest day (scheduled)</td><td class="small">Paid as part of salary; no tasks assigned</td></tr></table>
      <div class="small muted" style="margin-top:6px">Deductions and rest-day premium pay are computed in Payroll (Phase 3).</div></div></div>
      <div style="height:16px"></div>${restTracker()}`;
  }

  // ---------- Settings ----------
  function vSettings() {
    const S = state.settings;
    return `<div class="head"><h1>Settings</h1></div>
      <div class="card"><h2>Household & schedule rules</h2><form data-form="settings" class="form" id="settings-form" style="grid-template-columns:repeat(3,minmax(0,1fr))">
      <label class="field">Household name<input name="householdName" value="${esc(S.householdName)}"></label>
      <label class="field">Employer name (payslips and contribution forms)<input name="employerName" value="${esc(S.employerName || '')}" placeholder="e.g., Mr. & Mrs. … Montalban"></label>
      <label class="field">Household address<input name="householdAddress" value="${esc(S.householdAddress || '')}"></label>
      <label class="field">Paper size for printing<select name="paper">${opt('A4', 'A4', S.paper)}${opt('Letter', 'Letter (short bond)', S.paper)}</select></label>
      <label class="field">Rotation period<select name="rotation">${opt('weekly', 'Weekly', S.rotation)}${opt('biweekly', 'Every 2 weeks', S.rotation)}${opt('monthly', 'Monthly (on the 1st)', S.rotation)}</select></label>
      <label class="field">Rotation history starts<input type="date" name="rotationAnchor" value="${esc(S.rotationAnchor)}"></label>
      <label class="field">Light factor<input type="number" step="0.1" min="0.1" name="lightFactor" value="${S.lightFactor}"></label>
      <label class="field">Heavy factor<input type="number" step="0.1" min="0.1" name="heavyFactor" value="${S.heavyFactor}"></label>
      <label class="field">Balance tolerance (%)<input type="number" min="1" max="50" name="tolerance" value="${Math.round(S.tolerance * 100)}"></label>
      <label class="field">Shadow mode for new provisional helpers<select name="shadowEnabled">${opt('1', 'On', S.shadowEnabled ? '1' : '0')}${opt('0', 'Off', S.shadowEnabled ? '1' : '0')}</select></label>
      <label class="field">Shadow mode length (days)<input type="number" min="0" max="90" name="shadowDays" value="${S.shadowDays}"></label>
      <label class="field">Child-free window start (weekdays)<input type="time" name="cf0" value="${S.childFree[0]}"></label>
      <label class="field">Child-free window end<input type="time" name="cf1" value="${S.childFree[1]}"></label>
      <span></span>
      <label class="field">Quiet hours end (no noisy tasks before)<input type="time" name="q0" value="${S.quiet[0]}"></label>
      <label class="field">Quiet hours start (no noisy tasks after)<input type="time" name="q1" value="${S.quiet[1]}"></label>
      <span></span>
      <label class="field">Helpers' day starts<input type="time" name="h0" value="${S.helperHours.start}"></label>
      <label class="field">Helpers' day ends<input type="time" name="h1" value="${S.helperHours.end}"></label><span></span>
      <label class="field">Driver's day starts<input type="time" name="d0" value="${S.driverHours.start}"></label>
      <label class="field">Driver's day ends<input type="time" name="d1" value="${S.driverHours.end}"></label>
      <label class="field">Daily rate = monthly salary ÷<input type="number" min="1" max="31" name="dayRateDivisor" value="${S.dayRateDivisor}"><span class="small muted">Same for all staff. Used for absence and half-day deductions (payroll, Phase 3).</span></label>
      <label class="field">Use a replacement day within (days)<input type="number" min="1" max="90" name="replacementWindowDays" value="${S.replacementWindowDays || 14}"><span class="small muted">For a rest day worked. Expires after this; banking is set per helper.</span></label>
      </form><div style="margin-top:12px"><button class="btn primary" type="submit" form="settings-form">Save settings</button></div></div>
      <div style="height:16px"></div>
      <div class="grid g2"><div class="card"><h2>Lead categories</h2><form data-form="cats" id="cats-form"><table class="t"><tr><th>Name</th><th>Color</th></tr>
        ${state.categories.map(c => `<tr><td><input class="inp" name="name_${c.id}" value="${esc(c.name)}"></td><td><input type="color" name="color_${c.id}" value="${c.color}"></td></tr>`).join('')}</table>
        <div class="row" style="margin-top:10px"><input class="inp" style="flex:1" name="newCat" placeholder="New category name"><button class="btn primary" type="submit">Save</button></div></form></div>
      <div class="card"><h2>Daily fixed blocks</h2><form data-form="blocks" id="blocks-form"><table class="t"><tr><th>Block</th><th>Start</th><th>End</th><th title="No tasks placed">Block</th><th title="Never filled">Protected</th><th>Show</th></tr>
        ${state.fixedBlocks.map(b => `<tr><td><input class="inp" name="name_${b.id}" value="${esc(b.name)}"></td><td><input class="inp" type="time" name="start_${b.id}" value="${b.start}"></td><td><input class="inp" type="time" name="end_${b.id}" value="${b.end}"></td>
          <td><input type="checkbox" name="blocking_${b.id}" ${b.blocking ? 'checked' : ''}></td><td><input type="checkbox" name="protected_${b.id}" ${b.protected ? 'checked' : ''}></td><td><input type="checkbox" name="show_${b.id}" ${b.show ? 'checked' : ''}></td></tr>`).join('')}</table>
        <div style="margin-top:10px"><button class="btn primary" type="submit">Save blocks</button></div></form></div></div>
      <div style="height:16px"></div>
      <div class="grid g2"><div class="card"><h2>Family members</h2><form data-form="members" id="members-form"><table class="t"><tr><th>Name</th><th>Role</th><th title="Shown on the calendars and in Coming up">Birthday</th><th>Notes</th><th title="The menu planner warns when a recipe uses these">Avoid foods</th></tr>
        ${state.members.map(m => `<tr><td><input class="inp" name="name_${m.id}" value="${esc(m.name)}"></td><td><select class="inp" name="role_${m.id}">${opt('parent', 'Parent', m.role)}${opt('child', 'Child', m.role)}</select></td>
          <td><input class="inp" type="date" name="bd_${m.id}" value="${esc(m.birthday || '')}" style="width:140px"><input type="hidden" name="by_${m.id}" value="${esc(m.birthYear || '')}">${!m.birthday && m.birthYear ? `<div class="small muted">born ${esc(m.birthYear)}</div>` : ''}</td><td><input class="inp" name="notes_${m.id}" value="${esc(m.notes)}"></td>
          <td><input class="inp" name="avoid_${m.id}" value="${esc(m.avoid || '')}" placeholder="e.g., peanuts, shrimp"></td></tr>`).join('')}</table>
        <div class="small muted" style="margin-top:6px">Avoid foods: comma-separated. The menu planner warns when a recipe's ingredients or allergy tags match.</div>
        <div style="margin-top:10px"><button class="btn primary" type="submit">Save</button> <button class="btn" type="button" data-act="member-add">+ Add member</button></div></form></div>
      <div class="card"><h2>Areas & rooms</h2><form data-form="areas" id="areas-form"><label class="field">One per line (list each bathroom and bedroom by name)<textarea name="areas" style="min-height:220px">${esc(state.areas.join('\n'))}</textarea></label>
        <div style="margin-top:10px"><button class="btn primary" type="submit">Save areas</button></div></form></div></div>
      <div style="height:16px"></div>
      <div class="card"><h2>Payroll policy</h2><form data-form="payroll-policy" class="form" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <label class="field">13th month paid in the pay run covering (MM-DD)<input name="thirteenthDate" pattern="\\d\\d-\\d\\d" value="${esc(S.thirteenthDate || '12-15')}"><span class="small muted">Contract: given at Christmas. Law: by 24 Dec.</span></label>
        <label class="field">Annual increase (₱, regular contract)<input type="number" name="annualIncrease" min="0" value="${S.annualIncrease}"></label>
        <label class="field">Salary cap for the annual increase (₱)<input type="number" name="salaryCap" min="0" value="${S.salaryCap}"><span class="small muted">After this, increases follow DOLE minimum wage.</span></label>
        <label class="field">Regularization cash incentive (₱)<input type="number" name="regIncentive" min="0" value="${S.regIncentive}"></label>
        <label class="field">Vale limit (months of salary)<input type="number" name="valeMaxMonths" min="0.5" step="0.5" value="${S.valeMaxMonths}"></label>
        <label class="field">Regional minimum wage for kasambahay (₱/month)<input type="number" name="minWage" min="0" value="${esc(S.minWage)}" placeholder="enter the current rate"></label>
        <div class="full"><button class="btn primary" type="submit">Save payroll policy</button> <span class="small muted">Defaults come from your contracts in formats/. Day rate divisor and replacement-day window are set above.</span></div></form></div>
      <div style="height:16px"></div>
      <div class="card"><h2>Vehicles</h2><form data-form="vehicles" id="veh-form"><div class="scroll-x"><table class="t"><tr><th>Type</th><th>Name</th><th>Plate</th><th>LTO registration month</th><th>Insurance renewal</th><th>PMS every (months)</th><th>Last PMS</th><th></th></tr>
        ${(state.vehicles || []).map(v => `<tr><td><select class="inp" name="type_${v.id}">${['Car', 'Motorcycle', 'Van', 'Other'].map(x => opt(x, x, v.type)).join('')}</select></td><td><input class="inp" name="name_${v.id}" value="${esc(v.name)}"></td>
          <td><input class="inp" name="plate_${v.id}" value="${esc(v.plate)}" style="width:100px"></td><td><select class="inp" name="reg_${v.id}">${opt('', '—', v.regMonth || '')}${MON.map((m, i) => opt(i + 1, m, v.regMonth || '')).join('')}</select></td>
          <td><input class="inp" type="date" name="ins_${v.id}" value="${esc(v.insurance)}"></td><td><input class="inp" type="number" min="1" max="24" name="pms_${v.id}" value="${esc(v.pmsMonths)}" style="width:70px"></td>
          <td><input class="inp" type="date" name="last_${v.id}" value="${esc(v.lastPms)}"></td><td><button class="btn sm danger" type="button" data-act="vehicle-del" data-id="${v.id}">Remove</button></td></tr>`).join('')}</table></div>
        <div class="row" style="margin-top:10px"><button class="btn primary" type="submit">Save vehicles</button><button class="btn" type="button" data-act="vehicle-add">+ Add vehicle</button>
        <span class="small muted">Registration, insurance and PMS show in the Year view and in Coming up.</span></div></form></div>
      <div style="height:16px"></div>
      <div class="grid g2"><div class="card"><h2>Data on this device</h2>
        <p class="small">Everything is saved in this browser on this device only (no cloud). Download an encrypted backup at least monthly and keep it off this device — if the device is lost or the browser data is cleared, only the backup can bring the records back.</p>
        <div class="${backupDue(todayStr()) ? 'alert warn' : 'alert info'}">Last backup: ${state.lastBackupAt ? fmtD(state.lastBackupAt.slice(0, 10)) : 'never'}${backupDue(todayStr()) ? ' — a backup is due.' : ''}</div>
        <div class="small muted" id="storage-est" style="margin-bottom:8px"></div>
        <div class="row"><button class="btn primary" data-act="export">🔒 Download encrypted backup</button><button class="btn" data-act="import">⬆ Restore from backup</button>
        <input type="file" id="import-input" accept=".mhmbackup,.json,application/json" hidden data-change="import"></div>
        <div class="row" style="margin-top:10px"><button class="btn" data-act="clear-history">Clear stored past schedules</button><button class="btn danger" data-act="reset">Reset to sample data</button></div>
        <p class="small muted">Using since ${fmtD(state.startedOn)} · ${Object.keys(state.history).length} past days stored · ${Object.keys(state.marks).length} task marks.</p></div>
      <div class="card"><h2>Audit trail</h2><div class="list" style="max-height:300px;overflow:auto">${state.audit.slice(0, 100).map(a => `<div class="li small"><span class="time">${a.at.slice(0, 16).replace('T', ' ')}</span><span class="grow"><b>${esc(a.action)}</b> ${esc(a.detail)}</span></div>`).join('') || '<div class="empty">No changes yet.</div>'}</div></div></div>`;
  }

  // ---------- Meals & Recipes (Phase 2, spec §5.7) ----------
  // 'ulam' is kept as the key for main courses so older recipes keep their category
  const RECIPE_CATS = { breakfast: 'Breakfast', appetizer: 'Appetizer', soup: 'Soup', ulam: 'Main course', vegetable: 'Vegetable side dish', carbs: 'Carbs (rice, noodles, bread)', snack: 'Snack', baon: 'Baon' };
  const householdSize = () => Math.max(1, state.members.length);
  const recipeById = id => (state.recipes || []).find(r => r.id === id);
  const fmtQty = q => {
    q = Number(q); if (!q) return '';
    const w = Math.floor(q + 1e-9), f = q - w;
    if (f < 0.04) return String(w);
    const fr = [[0.25, '¼'], [0.33, '⅓'], [0.5, '½'], [0.67, '⅔'], [0.75, '¾']].find(([v]) => Math.abs(f - v) < 0.04);
    return fr ? (w ? w + ' ' : '') + fr[1] : String(Math.round(q * 100) / 100);
  };
  const parseQty = s => {
    s = String(s || '').trim().replace('½', ' 1/2').replace('¼', ' 1/4').replace('¾', ' 3/4').replace('⅓', ' 1/3').replace('⅔', ' 2/3').trim();
    if (!s) return 0;
    return s.split(/\s+/).reduce((a, p) => { const [n, d] = p.split('/').map(Number); return a + (d ? n / d : Number(p) || 0); }, 0);
  };
  const MEAL_TYPES = [['breakfast', '🍳 Breakfast'], ['lunch', '🍛 Lunch'], ['dinner', '🍲 Dinner'], ['snack', '🍌 Snacks']];
  const mealTypeChips = r => (r.mealTypes || []).length ? MEAL_TYPES.filter(([k]) => r.mealTypes.includes(k)).map(([, l]) => `<span class="chip info">${l}</span>`).join('') : '<span class="chip">Any meal</span>';
  const itemName = i => { const r = i && i.recipeId && recipeById(i.recipeId); return r ? r.name : (i && i.text) || ''; };
  const mealLabel = m => { if (!m) return ''; if (m.items && m.items.length) return m.items.map(itemName).filter(Boolean).join(', '); return itemName(m); };
  const COURSE_SHORT = { appetizer: 'Appetizer', soup: 'Soup', main: 'Main', vegetable: 'Veg', carbs: 'Carbs' };
  // ---------- one meal's dishes (several per course) ----------
  function mealEditModal(d, slot) {
    const sl = E.MEAL_SLOTS.find(x => x.id === slot), own = (state.mealPlan[d] || {})[slot], it = E.mealItems(state, d, slot);
    const recs = [...(state.recipes || [])].sort((a, b) => a.name.localeCompare(b.name));
    const rows = [...it, ...[{ course: slot === 'breakfast' ? 'main' : 'soup' }, { course: 'main' }, { course: slot === 'breakfast' ? 'carbs' : 'vegetable' }, { course: 'carbs' }].slice(0, Math.max(2, 5 - it.length))];
    const recipeSel = (i, row) => `<select class="inp sm" name="r_${i}" data-row="${i}">${opt('', '— choose a recipe —', row.recipeId || '')}${recs.map(r => `<option value="${r.id}" data-cats="${esc(r.category)}"${r.id === row.recipeId ? ' selected' : ''}${!E.COURSE_CATS[row.course || 'main'].includes(r.category) && r.id !== row.recipeId ? ' hidden' : ''}>${esc(r.name)}${E.recipeFits(r, slot) ? '' : ' (not usually for ' + esc(sl.label.toLowerCase()) + ')'}</option>`).join('')}</select>`;
    modal(`${esc(sl.label)} — ${fmtDL(d)}`, `<form data-form="meal-edit" class="form" id="meal-edit-form"><input type="hidden" name="d" value="${d}"><input type="hidden" name="slot" value="${slot}"><input type="hidden" name="n" value="${rows.length}">
      ${!own && it.length ? '<div class="full alert info">These dishes come from the menu rotation. Saving makes them this day\'s own menu.</div>' : ''}
      <div class="full"><table class="t meal-rows"><thead><tr><th>Course</th><th>Recipe</th><th>or type a dish</th><th></th></tr></thead><tbody id="meal-rows">
        ${rows.map((row, i) => `<tr><td><select class="inp sm" name="c_${i}" data-change="meal-course" data-row="${i}">${E.COURSES.map(([k, l]) => opt(k, l, row.course || 'main')).join('')}</select></td><td>${recipeSel(i, row)}</td>
          <td><input class="inp sm" name="t_${i}" value="${esc(row.recipeId ? '' : row.text || '')}" placeholder="e.g. Steamed rice"></td><td><label class="small nowrap"><input type="checkbox" name="x_${i}"> remove</label></td></tr>`).join('')}</tbody></table>
        <button type="button" class="btn sm" data-act="meal-row-add">+ Add another dish</button></div>
      <label class="full small"><input type="checkbox" name="none" ${own && own.none ? 'checked' : ''}> No ${esc(sl.label.toLowerCase())} this day (nothing to cook)</label>
      <div class="full small muted">Add as many dishes as you need — e.g. soup + two mains + vegetable + rice. Recipes are listed by course; untick a course to choose from all recipes by changing the course first.</div></form>`,
      `${own ? '<button class="btn" data-act="meal-use-rotation">Use the rotation for this meal</button><span style="flex:1"></span>' : ''}<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="meal-edit-form">Save</button>`, true);
  }
  // ---------- auto-assign a menu from the recipe library ----------
  function mealAutoModal() {
    const mon = U.mondayOf(ui.date);
    modal('✨ Auto-assign menu', `<form data-form="meal-auto" class="form" id="meal-auto-form">
      <label class="field">Which week(s)<select name="weeks">${opt('1', 'This week (' + fmtDS(mon) + ' – ' + fmtDS(U.addDays(mon, 6)) + ')', '1')}${opt('2', 'This week and next week', '1')}${opt('4', 'The next 4 weeks', '1')}</select></label>
      <label class="field">Meals already planned<select name="mode">${opt('empty', 'Keep them — fill only empty meals', 'empty')}${opt('all', 'Replace them all', 'empty')}</select></label>
      <div class="field full">Meals to fill<div class="checks">${E.MEAL_SLOTS.filter(s => !s.info).map(s => `<label><input type="checkbox" name="slots" value="${s.id}" checked>${esc(s.label)}</label>`).join('')}</div></div>
      ${['lunch', 'dinner'].map(m => `<div class="field full">Courses for ${m}<div class="checks">${E.COURSES.map(([k, l]) => `<label><input type="checkbox" name="c_${m}" value="${k}" ${(m === 'lunch' ? ['soup', 'main', 'carbs'] : ['main', 'vegetable', 'carbs']).includes(k) ? 'checked' : ''}>${esc(l.replace(/ \(.*/, ''))}</label>`).join('')}</div></div>`).join('')}
      <label class="field full small"><input type="checkbox" name="weekendApp" checked> Add an appetizer to Saturday and Sunday dinner</label>
      <div class="full small muted">Dishes come from the recipe library, matched to each meal ("Can be served as") and course, without repeating a dish in the same week where possible. Breakfast gets one breakfast dish; packed lunch gets a main course and rice. You can change any meal afterwards.</div></form>`,
      `<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="meal-auto-form">Auto-assign</button>`);
  }
  function autoAssignMenu(opts) {
    const recs = state.recipes || [], rice = recs.find(r => r.id === 'rb-steamed-rice') || recs.find(r => r.category === 'carbs');
    const mon = U.mondayOf(ui.date), days = Array.from({ length: 7 * opts.weeks }, (_, i) => U.addDays(mon, i)).filter(d => d >= todayStr());
    const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
    const used = {}; let filled = 0;
    // count dishes already on the menu so new ones don't repeat them
    days.forEach(d => Object.values(state.mealPlan[d] || {}).forEach(m => (m.items || [m]).forEach(i => { if (i && i.recipeId) used[i.recipeId] = (used[i.recipeId] || 0) + 1; })));
    const pick = (course, slot, d, avoid) => {
      if (course === 'carbs' && rice && slot !== 'breakfast') return rice;
      const pool = recs.filter(r => E.COURSE_CATS[course].includes(r.category) && E.recipeFits(r, slot) && !avoid.has(r.id) && (course !== 'main' || slot === 'breakfast' ? true : r.category !== 'breakfast'));
      const list = (slot === 'breakfast' && course === 'main' ? pool.filter(r => r.category === 'breakfast') : pool);
      const cands = list.length ? list : pool; if (!cands.length) return null;
      return cands.slice().sort((a, b) => (used[a.id] || 0) - (used[b.id] || 0) || hash(d + course + a.id) - hash(d + course + b.id))[0];
    };
    days.forEach(d => {
      const dayUsed = new Set(), dow = U.dow(d);
      opts.slots.forEach(slot => {
        const sl = E.MEAL_SLOTS.find(x => x.id === slot); if (!sl || (sl.school && !E.isSchoolDay(state, d))) return;
        const cur = (state.mealPlan[d] || {})[slot];
        if (opts.mode === 'empty' && cur && (cur.none || (cur.items || []).length || cur.recipeId || cur.text)) return;
        let courses = slot === 'breakfast' ? ['main'] : slot === 'baon' ? ['main', 'carbs'] : (opts.courses[slot] || ['main', 'carbs']).slice();
        if (slot === 'dinner' && opts.weekendApp && (dow === 0 || dow === 6) && !courses.includes('appetizer')) courses.unshift('appetizer');
        const items = [];
        courses.forEach(c => { const r = pick(c, slot, d, dayUsed); if (r) { items.push({ course: c, recipeId: r.id }); if (r !== rice) { dayUsed.add(r.id); used[r.id] = (used[r.id] || 0) + 1; } } });
        if (items.length) { (state.mealPlan[d] = state.mealPlan[d] || {})[slot] = { items, auto: true }; filled++; }
      });
    });
    return filled;
  }
  /** Family members' "avoid" lists checked against a recipe's ingredients and allergy tags. */
  function dietWarnings(r) {
    const words = [...(r.allergyTags || []), ...(r.ingredients || []).map(i => i.item)].map(x => String(x).toLowerCase());
    const out = [];
    state.members.forEach(m => String(m.avoid || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
      .forEach(a => { if (words.some(w => w.includes(a))) out.push(`${m.name} avoids ${a}`); }));
    return out;
  }
  function vMeals() {
    const tab = ui.mealTab || 'plan';
    return `<div class="head"><h1>Meals & Recipes</h1></div>
      <div class="tabs">${[['plan', 'Menu planner'], ['grocery', '🛒 Grocery list'], ['recipes', `Recipe library (${(state.recipes || []).length})`]].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="meal-tab" data-v="${k}">${l}</button>`).join('')}</div>
      ${tab === 'plan' ? mealPlanner() : tab === 'grocery' ? groceryView() : recipeLibrary()}`;
  }

  // ---------- Grocery list (16 Nov 2026): ingredients for the menu on the days ticked, with quantities and dishes ----------
  const GROC_STOP = new Set(['with', 'and', 'na', 'at', 'in', 'of', 'the', 'ng', 'sa', 'or', 'a', 'on']);
  const normName = s => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  /** Library recipes named in a free-text dish, e.g. "Fried chicken and chop suey" → Crispy fried chicken + Chop suey. */
  function matchRecipes(text) {
    const t = ' ' + normName(text) + ' ', found = [];
    const phrases = [];
    (state.recipes || []).forEach(r => {
      const w = normName(r.name).split(' ').filter(Boolean);
      for (let a = 0; a < w.length; a++) for (let b = w.length; b > a; b--) {
        const p = w.slice(a, b);
        if ((p.length < 2 && !(w.length === 1 && p[0].length >= 5)) || GROC_STOP.has(p[0]) || GROC_STOP.has(p[p.length - 1])) continue;
        phrases.push({ r, p: p.join(' ') });
      }
    });
    phrases.sort((x, y) => y.p.length - x.p.length);
    let rest = t;
    for (const x of phrases) { if (found.includes(x.r)) continue; const i = rest.indexOf(' ' + x.p + ' '); if (i >= 0) { found.push(x.r); rest = rest.slice(0, i) + ' # ' + rest.slice(i + x.p.length + 2); } }
    return found;
  }
  // supermarket aisles, in walking order; checked from the most specific (frozen, canned, condiments) to the most general
  const AISLES = [['produce', '🥬 Fruits & vegetables'], ['meat', '🥩 Meat & poultry'], ['seafood', '🐟 Fish & seafood'], ['dairy', '🥚 Eggs, dairy & tofu'], ['grains', '🍚 Rice, noodles & bread'],
    ['canned', '🥫 Canned & packaged'], ['condiments', '🧂 Condiments, sauces & spices'], ['frozen', '❄️ Frozen'], ['other', '🛒 Other']];
  const AISLE_RX = [
    ['frozen', /frozen|nugget|fish ?ball|kikiam|squid ball/],
    ['canned', /\bcan\b|canned|tuna|sardine|corned beef|spam|luncheon|tomato sauce|coconut milk|cream.style|pineapple chunk|sinigang mix|broth|bouillon|cracker|tablea|cocoa|raisin|pickle relish|evaporated|condensed|all.purpose cream|chocolate/],
    ['condiments', /soy sauce|vinegar|fish sauce|patis|oyster sauce|ketchup|mayonnaise|mustard|bagoong|\bsalt\b|pepper(corn)?s?\b(?! *bell)|sugar|bay lea|paprika|cinnamon|curry|annatto|atsuete|garlic powder|cornstarch|baking powder|cooking oil|vegetable oil|\boil\b|chili sauce|sweet chili|syrup|tartar|turmeric/],
    ['seafood', /fish|bangus|tilapia|cream dory|galunggong|shrimp|prawn|squid|tahong|mussel|crab|tuyo|tinapa|daing|dilis/],
    ['meat', /chicken|pork|beef|liempo|ground (pork|beef|chicken)|liver|bacon|\bham\b|longganisa|tocino|hotdog|sausage|tapa/],
    ['dairy', /\beggs?\b|milk|butter|cheese|cream|yogurt|tofu|tokwa/],
    ['grains', /rice|noodle|bihon|canton|misua|miki|mami|macaroni|spaghetti|pasta|bread|pandesal|lumpia wrapper|wrapper|flour|panko|breadcrumb|oat/],
    ['produce', /cabbage|carrot|onion|garlic|tomato|potato|eggplant|ampalaya|sayote|chayote|pechay|bok choy|kangkong|malunggay|spinach|sitaw|beans|okra|squash|kalabasa|ginger|calamansi|lemon|lime|banana|mango|papaya|pineapple|corn|broccoli|cauliflower|bell pepper|chili|radish|labanos|patola|spring onion|celery|lettuce|cucumber|mushroom|snow peas|sitsaro|bean sprouts|togue|parsley|shallot|leek|peas|kamote|gabi|fruit/],
  ];
  const aisleOf = item => {
    const s = normName(item), rx = k => AISLE_RX.find(x => x[0] === k)[1];
    if (rx('frozen').test(s)) return 'frozen';
    if (/noodle|bihon|canton|misua|miki|mami|wrapper/.test(s)) return 'grains'; // "fresh egg noodles" is not dairy
    if (/bell pepper|green pepper|red pepper/.test(s)) return 'produce';
    if (rx('canned').test(s)) return 'canned';
    if (rx('condiments').test(s)) return 'condiments';
    // "chicken or shrimp", "pork or tinapa": the first thing named decides
    const m = s.search(rx('meat')), f = s.search(rx('seafood'));
    if (m >= 0 || f >= 0) return f < 0 || (m >= 0 && m < f) ? 'meat' : 'seafood';
    const hit = AISLE_RX.find(([k, r]) => !['frozen', 'canned', 'condiments', 'meat', 'seafood'].includes(k) && r.test(s));
    return hit ? hit[0] : 'other';
  };
  const STAPLE = /^(salt|pepper|black pepper|ground pepper|peppercorns|whole peppercorns|salt and pepper|water|cold water|cooking oil|oil|vegetable oil|sugar|brown sugar|white sugar|soy sauce|vinegar|cane vinegar|fish sauce.*|cornstarch|all purpose flour|baking powder)$/;
  function groceryData(days) {
    const staffN = Math.max(1, state.staff.filter(s => E.isActive(s, days[0] || todayStr())).length), fam = householdSize();
    const items = {}, noRecipe = [], dishes = [];
    days.forEach(d => E.MEAL_SLOTS.forEach(sl => {
      if (sl.school && !E.isSchoolDay(state, d)) return;
      E.mealItems(state, d, sl.id).forEach(m => {
      const recs = m.recipeId ? [recipeById(m.recipeId)].filter(Boolean) : m.text ? matchRecipes(m.text) : [];
      const label = itemName(m), when = fmtDS(d) + ' ' + sl.label.toLowerCase();
      dishes.push({ d, slot: sl.label, label, recs: recs.map(r => r.name) });
      if (!recs.length) { noRecipe.push({ d, slot: sl.label, label }); return; }
      recs.forEach(r => {
        const k = (sl.id === 'staff' ? staffN : fam) / (Number(r.servings) || 1);
        (r.ingredients || []).forEach(i => {
          const item = String(i.item || '').trim(); if (!item || /^(cold |hot |warm )?water$/i.test(item)) return; // water isn't bought
          const sing = normName(item).replace(/\b(\w{3,}?)(oes|es(?=\b)(?<=(?:ch|sh|x)es)|s)\b/g, (m, a, b) => b === 'oes' ? a + 'o' : a); // eggs → egg, tomatoes → tomato
          const key = sing + '|' + String(i.unit || '').trim().toLowerCase();
          const x = items[key] = items[key] || { item, unit: i.unit || '', qty: 0, uses: [], staple: STAPLE.test(normName(item)), aisle: aisleOf(item) };
          x.qty += (Number(i.qty) || 0) * k;
          x.uses.push(r.name + ' (' + when + ')');
        });
      });
      });
    }));
    // shopping amounts: whole pieces / cans / packs (rounded up); under 1 kg in grams (to the nearest 50 g)
    Object.values(items).forEach(x => {
      const u = String(x.unit || '').toLowerCase();
      if (!x.qty) return;
      if (['', 'pc', 'pcs', 'can', 'pack', 'bundle', 'head', 'clove', 'slice', 'stalk', 'pouch', 'block', 'bunch', 'sachet', 'thumb', 'sprig'].includes(u)) x.qty = Math.ceil(x.qty - 0.05);
      else if (u === 'kg' && x.qty < 1) { x.qty = Math.max(50, Math.ceil(x.qty * 1000 / 50) * 50); x.unit = 'g'; }
      else if (u === 'kg') x.qty = Math.ceil(x.qty * 4) / 4;
      else if (u === 'g') x.qty = Math.max(50, Math.ceil(x.qty / 50) * 50);
      else if (['cup', 'tbsp', 'tsp', 'l', 'liter'].includes(u)) x.qty = Math.ceil(x.qty * 4 - 0.1) / 4;
      else if (u === 'pinch') x.qty = Math.ceil(x.qty);
      else if (u === 'ml') x.qty = Math.ceil(x.qty / 10) * 10;
    });
    const list = Object.values(items).sort((a, b) => a.item.localeCompare(b.item));
    const byAisle = AISLES.map(([k, l]) => ({ k, label: l, items: list.filter(x => x.aisle === k) })).filter(g => g.items.length);
    return { byAisle, all: list, buy: list.filter(x => !x.staple), staples: list.filter(x => x.staple), noRecipe, dishes, fam, staffN };
  }
  function groceryDays() {
    const today = todayStr();
    if (!ui.groceryDays) ui.groceryDays = Array.from({ length: 7 }, (_, i) => U.addDays(today, i));
    return ui.groceryDays.filter(d => d >= today).sort();
  }
  function groceryView() {
    const today = todayStr(), opts = Array.from({ length: 21 }, (_, i) => U.addDays(today, i)), sel = groceryDays(), g = groceryData(sel);
    const uses = x => [...new Set(x.uses)];
    const row = (x, i) => `<tr><td><input type="checkbox" data-change="groc-got" data-k="${esc(x.item + '|' + x.unit)}" ${(ui.groceryGot || []).includes(x.item + '|' + x.unit) ? 'checked' : ''} aria-label="Bought ${esc(x.item)}"></td>
      <td class="nowrap" style="text-align:right"><b>${x.qty ? fmtQty(x.qty) : '—'}</b></td><td class="nowrap">${esc(x.unit)}</td><td><b>${esc(x.item)}</b>${x.staple ? ' <span class="chip">check pantry</span>' : ''}</td><td class="small">${uses(x).map(esc).join('<br>')}</td></tr>`;
    return `<div class="card" style="margin-bottom:12px"><div class="row" style="margin-bottom:6px"><h2 style="margin:0;flex:1">Shopping for which days?</h2>
        <button class="btn sm" data-act="groc-days" data-v="3">Next 3 days</button><button class="btn sm" data-act="groc-days" data-v="7">Next 7 days</button><button class="btn sm" data-act="groc-days" data-v="week">Rest of this week</button><button class="btn sm" data-act="groc-days" data-v="0">Clear</button>
        <button class="btn primary" data-act="groc-print" ${sel.length ? '' : 'disabled'}>🖨 Print grocery list</button></div>
      <div class="groc-days">${opts.map(d => `<label class="${E.isSchoolDay(state, d) ? '' : 'wkend'}"><input type="checkbox" data-change="groc-day" data-d="${d}" ${sel.includes(d) ? 'checked' : ''}> ${DOWS[U.dow(d)]} ${+d.slice(8)} ${MON[+d.slice(5, 7) - 1]}</label>`).join('')}</div>
      <div class="small muted" style="margin-top:6px">Tick every day this trip is for (one day or several). Quantities are scaled to ${g.fam} family members (staff meals: ${g.staffN}) and added together across the days. Tick items on screen as you shop.</div></div>
      ${sel.length ? `<div class="card flush scroll-x"><table class="t groc"><thead><tr><th style="width:28px"></th><th style="text-align:right">Qty</th><th>Unit</th><th>Item</th><th>For (dish · day)</th></tr></thead><tbody>
        ${g.byAisle.map(a => `<tr class="group aisle"><td colspan="5">${esc(a.label)} <span class="muted small" style="font-weight:400">· ${a.items.length}</span></td></tr>${a.items.map(row).join('')}`).join('') || '<tr><td colspan="5" class="empty">No recipe ingredients for these days.</td></tr>'}</tbody></table></div>
      ${g.noRecipe.length ? `<div class="card" style="margin-top:12px"><h2>Dishes without a recipe in the library</h2><div class="small muted" style="margin-bottom:6px">Add their ingredients by hand, or add the recipe (Recipe library → New recipe or Import from a web page).</div>
        <div class="list">${g.noRecipe.map(x => `<div class="li"><span class="time">${fmtDS(x.d)}</span><span class="grow">${esc(x.label)} <span class="small muted">· ${esc(x.slot)}</span></span></div>`).join('')}</div></div>` : ''}`
      : '<div class="card empty">Tick at least one day above.</div>'}`;
  }
  function printGrocery() {
    const sel = groceryDays(), g = groceryData(sel); if (!sel.length) { toast('Tick at least one day.'); return; }
    const range = sel.length === 1 ? fmtDL(sel[0]) : sel.map(fmtDS).join(', ');
    const row = x => `<tr><td class="box">☐</td><td class="nowrap" style="text-align:right">${x.qty ? fmtQty(x.qty) : '—'}</td><td class="nowrap">${esc(x.unit)}</td><td><b>${esc(x.item)}</b>${x.staple ? ' (check pantry)' : ''}</td><td>${[...new Set(x.uses)].map(esc).join('; ')}</td></tr>`;
    document.getElementById('print-root').innerHTML = `<div class="pg"><h1><span>${esc(state.settings.householdName.toUpperCase())} — GROCERY LIST</span><span>${sel.length} day${sel.length === 1 ? '' : 's'}</span></h1>
      <div class="who"><b>For:</b> ${esc(range)} · scaled to ${g.fam} family members (staff meals: ${g.staffN})</div>
      <table><thead><tr><th class="box"></th><th style="text-align:right">Qty</th><th>Unit</th><th>Item</th><th>For (dish · day)</th></tr></thead><tbody>${g.byAisle.map(a => `<tr class="fixed aisle"><td colspan="5"><b>${esc(a.label)}</b></td></tr>${a.items.map(row).join('')}`).join('')}</tbody></table>
      ${g.noRecipe.length ? `<div class="who" style="margin-top:8px"><b>No recipe in the library (buy by hand):</b> ${g.noRecipe.map(x => esc(x.label) + ' (' + fmtDS(x.d) + ')').join(' · ')}</div>` : ''}
      <div class="sig"><div>Bought by</div><div>Amount spent</div></div></div>`;
    setPage('landscape', 'Grocery list · ' + range); printPreview();
  }
  function mealPlanner() {
    const mon = U.mondayOf(ui.date), days = [0, 1, 2, 3, 4, 5, 6].map(i => U.addDays(mon, i)), recs = state.recipes || [];
    const cyc = state.mealCycle || { on: false, weeks: [{}, {}, {}, {}] }, cw = E.cycleWeek(mon) + 1;
    const warns = [];
    const cell = (d, sl) => {
      if (sl.school && !E.isSchoolDay(state, d)) return '<td class="off small muted">No school</td>';
      const it = E.mealItems(state, d, sl.id), own = !!((state.mealPlan[d] || {})[sl.id]);
      it.forEach(i => { const r = i.recipeId && recipeById(i.recipeId); if (r) dietWarnings(r).forEach(w => warns.push(`${fmtDS(d)} · ${sl.label} · ${r.name}: ${w}`)); });
      return `<td class="clickable meal-cell${own ? '' : ' cyc'}" data-act="meal-edit" data-d="${d}" data-slot="${sl.id}" title="Click to change the dishes">
        ${it.length ? it.map(i => `<div class="dish"><span class="course c-${i.course}">${esc(COURSE_SHORT[i.course] || '')}</span> ${esc(itemName(i))}${i.recipeId ? ' <span class="muted">📖</span>' : ''}</div>`).join('') : `<span class="muted small">${own ? 'No meal' : '+ add dishes'}</span>`}
        ${it.length && !own ? '<div class="small muted">↻ rotation</div>' : ''}</td>`;
    };
    return `<div class="head" style="margin-bottom:10px"><div class="row"><button class="btn icon" data-act="day-shift" data-n="-7" aria-label="Previous week">◀</button><span class="sub">${fmtD(days[0])} – ${fmtD(days[6])}</span>
      <button class="btn icon" data-act="day-shift" data-n="7" aria-label="Next week">▶</button><button class="btn" data-act="day-today">This week</button></div><span class="spacer"></span>
      <button class="btn primary" data-act="meal-auto">✨ Auto-assign menu</button><button class="btn" data-act="meal-copy">Copy last week</button><button class="btn" data-act="meal-clear">Clear week</button><button class="btn" data-act="print-menu">🖨 Print menu & ingredients</button></div>
      ${warns.map(w => `<div class="alert warn">⚠ ${esc(w)}</div>`).join('')}
      <div class="card flush scroll-x"><table class="t menu"><tr><th></th>${days.map(d => `<th>${fmtDS(d)}${(E.eventsOn(state, d)).map(e => ` <span title="${esc(E.EVENT_TYPES[e.type].label)}">${E.EVENT_TYPES[e.type].icon}</span>`).join('')}</th>`).join('')}</tr>
      ${E.MEAL_SLOTS.map(sl => `<tr><th style="position:static">${esc(sl.label)}</th>${days.map(d => cell(d, sl)).join('')}</tr>`).join('')}</table></div>
      <div class="small muted" style="margin-top:8px">Click a meal to choose its dishes — appetizer, soup, main course, vegetable side and carbs, as many as you like. <b>✨ Auto-assign</b> fills the week from the recipe library. Breakfast, packed lunch, lunch and dinner name the Cooking Lead's task and set its time from the recipes. Staff meals are listed on the menu only.</div>
      <div style="height:16px"></div>
      <div class="card"><h2>Menu rotation (4 weeks)</h2>
        <label class="row small"><input type="checkbox" data-change="meal-cycle-on" ${cyc.on ? 'checked' : ''}> Use the 4-week rotation for any meal not planned above</label>
        <div class="small muted" style="margin-top:4px">${cyc.source === 'default' ? 'Currently the <b>default menu</b>: everyday Filipino dishes for breakfast, snacks, baon, lunch and dinner. Type over any dish above for a single day, or save a week below to replace that cycle week.' : 'Your own saved cycle weeks.'}</div>
        <div class="row" style="margin-top:8px"><button class="btn" data-act="meal-cycle-default">↻ Load the default menu</button></div>
        <div class="row" style="margin-top:10px"><span class="small">This week is <b>cycle week ${cw}</b>.</span><select class="inp" style="width:auto" id="cycle-n">${[1, 2, 3, 4].map(n => opt(n, 'Cycle week ' + n, cw)).join('')}</select>
        <button class="btn" data-act="meal-cycle-save">Save this week's menu as that cycle week</button></div>
        <div class="small muted" style="margin-top:6px">Saved cycle weeks: ${[0, 1, 2, 3].map(i => `${i + 1} ${Object.keys(cyc.weeks[i] || {}).length ? '✓' : '—'}`).join(' · ')}. Cycle dishes show as ↻ in the planner.</div></div>`;
  }
  function recipeLibrary() {
    const all = state.recipes || [], fc = ui.recipeCat || '', q = (ui.recipeQ || '').toLowerCase();
    const recs = all.filter(r => (!fc || r.category === fc) && (!q || r.name.toLowerCase().includes(q) || (r.ingredients || []).some(i => String(i.item).toLowerCase().includes(q)))).sort((a, b) => a.name.localeCompare(b.name));
    const count = k => all.filter(r => r.category === k).length;
    const groups = Object.keys(RECIPE_CATS).filter(k => recs.some(r => r.category === k)).concat(recs.some(r => !RECIPE_CATS[r.category]) ? ['other'] : []);
    const card = r => `<div class="card staff-card" data-act="recipe" data-id="${r.id}">`;
    return `<div class="row" style="margin-bottom:12px"><button class="btn primary" data-act="recipe-new">+ New recipe</button><button class="btn" data-act="recipe-import">🌐 Import from a web page</button>
        <select class="inp" style="width:auto" data-change="recipe-cat" aria-label="Category">${opt('', `All categories (${all.length})`, fc)}${Object.entries(RECIPE_CATS).filter(([k]) => count(k)).map(([k, l]) => opt(k, `${l} (${count(k)})`, fc)).join('')}</select>
        <input class="inp" style="width:200px" placeholder="Search recipe or ingredient" value="${esc(ui.recipeQ || '')}" data-change="recipe-q">
        <span class="small muted">Servings scale to the household size (${householdSize()}) when printing.</span></div>
      ${groups.map(g => `<div class="section-title">${esc(RECIPE_CATS[g] || 'Other')} (${recs.filter(r => g === 'other' ? !RECIPE_CATS[r.category] : r.category === g).length})</div>
      <div class="grid g3">${recs.filter(r => g === 'other' ? !RECIPE_CATS[r.category] : r.category === g).map(r => `${card(r)}
        <div class="avatar">${r.photo ? `<img src="${r.photo}" alt="">` : ({ breakfast: '🍳', appetizer: '🥟', vegetable: '🥬', soup: '🥣', ulam: '🍲', carbs: '🍚', snack: '🍌', baon: '🍱' }[r.category] || '🍲')}</div>
        <div style="min-width:0"><h3>${esc(r.name)}</h3><div class="small muted">${r.servings} servings · ${E.recipeMinutes(r)} min · ${esc(r.difficulty)}${r.sourceUrl ? ' · from the web' : ''}</div>
        <div class="row" style="margin-top:6px">${mealTypeChips(r)}${(r.allergyTags || []).map(t => `<span class="chip warn">${esc(t)}</span>`).join('')}</div></div></div>`).join('')}</div>`).join('') || '<div class="card empty">No recipes match.</div>'}`;
  }
  function recipeBody(r, serv) {
    const k = serv / (Number(r.servings) || 1);
    return `<div class="row" style="margin-bottom:10px">${mealTypeChips(r)}<span class="chip">${esc(RECIPE_CATS[r.category] || r.category)}</span><span class="chip">Prep ${r.prepMin} min · Cook ${r.cookMin} min</span><span class="chip">${esc(r.difficulty)}</span>
        ${(r.allergyTags || []).map(t => `<span class="chip warn">${esc(t)}</span>`).join('')}${r.video ? `<a class="chip info" href="${esc(r.video)}" target="_blank" rel="noopener">▶ Video</a>` : ''}</div>
      ${dietWarnings(r).map(w => `<div class="alert warn">⚠ ${esc(w)}</div>`).join('')}
      <div class="grid g2"><div>${r.photo ? `<img src="${r.photo}" alt="" style="width:100%;border-radius:10px;margin-bottom:10px">` : ''}
        <div class="section-title" style="margin-top:0">Ingredients <span style="text-transform:none;letter-spacing:0">for</span> <input type="number" class="inp" style="width:70px;display:inline-block" min="1" value="${serv}" data-change="recipe-serv" data-id="${r.id}" aria-label="Servings"> <span style="text-transform:none;letter-spacing:0">servings</span></div>
        <ul class="small" style="margin:0;padding-left:18px">${(r.ingredients || []).map(i => `<li><b>${fmtQty(i.qty * k)} ${esc(i.unit)}</b> ${esc(i.item)}${i.note ? ` <span class="muted">(${esc(i.note)})</span>` : ''}</li>`).join('')}</ul>
        ${r.equipment ? `<div class="section-title">Equipment</div><div class="small">${esc(r.equipment)}</div>` : ''}</div>
      <div><div class="section-title" style="margin-top:0">Steps</div><ol class="small" style="margin:0;padding-left:18px">${(r.steps || []).map(s => `<li style="margin-bottom:4px">${esc(s)}</li>`).join('')}</ol>
        ${r.kidNotes ? `<div class="section-title">For the children</div><div class="small">${esc(r.kidNotes)}</div>` : ''}
        ${r.storage ? `<div class="section-title">Leftovers & storage</div><div class="small">${esc(r.storage)}</div>` : ''}
        ${r.safety ? `<div class="alert warn" style="margin-top:10px">⚠ ${esc(r.safety)}</div>` : ''}</div></div>`;
  }
  function recipeModal(id, serv) {
    const r = recipeById(id); if (!r) { toast('Recipe not found.'); return; }
    serv = serv || householdSize();
    modal('📖 ' + esc(r.name), recipeBody(r, serv), `<button class="btn danger" data-act="recipe-del" data-id="${r.id}">Delete</button><span class="spacer" style="flex:1"></span>
      <button class="btn" data-act="recipe-print" data-id="${r.id}" data-s="${serv}">🖨 Print</button><button class="btn primary" data-act="recipe-edit" data-id="${r.id}">Edit</button>`, true);
  }
  // ---------- Import a recipe from a web page (16 Nov 2026) ----------
  // Most recipe sites embed schema.org "Recipe" data (JSON-LD); that is read first. Otherwise the page text is scanned
  // for "Ingredients" and "Instructions/Directions/Method/Procedure" sections. The result opens in the recipe form to check.
  function recipeImportModal(msg) {
    modal('🌐 Import a recipe from a web page', `<form class="form" id="rimp-form" onsubmit="return false">
      <label class="field full">Web page address<input name="url" type="url" placeholder="https://www.example.com/recipe/chicken-adobo" value="${esc(ui.rimpUrl || '')}"></label>
      <div class="full row"><button type="button" class="btn primary" data-act="recipe-import-go">Get the recipe</button><span class="small muted" id="rimp-msg">${msg ? esc(msg) : 'Works with most recipe websites. The details open in the recipe form so you can check them before saving.'}</span></div>
      <details class="full"><summary class="small">Website blocks it? Use the "Copy recipe page" bookmark (one-time setup)</summary>
        <div class="small" style="margin:6px 0">1. Drag this button to your browser's bookmarks bar: <a class="btn sm" href="${esc(RIMP_BOOKMARKLET)}" onclick="return false" title="Drag me to the bookmarks bar">📋 Copy recipe page</a></div>
        <div class="small">2. On any recipe page, click the bookmark. 3. Come back here and click <button type="button" class="btn sm" data-act="recipe-import-clip">Paste copied page</button></div></details>
      <details class="full"><summary class="small">Or paste the page yourself</summary>
        <div class="small muted" style="margin:6px 0">On the recipe page press Ctrl+A then Ctrl+C, and paste here (Ctrl+V). You can also paste the page source (Ctrl+U, then Ctrl+A, Ctrl+C) for the best result.</div>
        <textarea name="paste" style="min-height:140px;width:100%" placeholder="Paste the recipe page here"></textarea>
        <button type="button" class="btn" data-act="recipe-import-paste" style="margin-top:6px">Read the pasted page</button></details>
      <div class="full small muted">For your household's own use. Check quantities, allergens and the "Can be served as" boxes before saving; the page address is kept on the recipe.</div></form>`,
      `<button class="btn" data-act="close">Cancel</button>`);
  }
  // A bookmark the owner runs on a recipe page in their own browser: copies the page (with its address) to the clipboard
  const RIMP_BOOKMARKLET = "javascript:(function(){var h='<!--mhm-url:'+location.href+'-->'+document.documentElement.outerHTML;navigator.clipboard.writeText(h).then(function(){alert('Recipe page copied. Go back to Home Manager and click Paste copied page.');},function(){prompt('Copy this (Ctrl+C), then paste it in Home Manager:',location.href);});})();";
  const ISO_MIN = s => { const m = String(s || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i); return m ? (Number(m[1] || 0) * 1440 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0; };
  const UNITS = { cup: 'cup', cups: 'cup', c: 'cup', tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbs: 'tbsp', tbl: 'tbsp', teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp', g: 'g', gram: 'g', grams: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
    ml: 'ml', l: 'L', liter: 'L', liters: 'L', litre: 'L', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', oz: 'oz', ounce: 'oz', ounces: 'oz', pc: 'pc', pcs: 'pc', piece: 'pc', pieces: 'pc', clove: 'clove', cloves: 'clove',
    can: 'can', cans: 'can', pack: 'pack', packs: 'pack', packet: 'pack', sachet: 'pack', bundle: 'bundle', bundles: 'bundle', head: 'head', heads: 'head', slice: 'slice', slices: 'slice', stalk: 'stalk', stalks: 'stalk', thumb: 'thumb', pinch: 'pinch', dash: 'pinch', sprig: 'sprig', sprigs: 'sprig', bunch: 'bundle', pouch: 'pouch' };
  /** "1 1/2 cups soy sauce, divided" → { qty: 1.5, unit: 'cup', item: 'soy sauce', note: 'divided' } */
  function parseIngredientText(s) {
    let t = String(s || '').replace(/\s+/g, ' ').trim().replace(/[▢•◦]/g, '').trim()
      .replace(/½/g, ' 1/2').replace(/¼/g, ' 1/4').replace(/¾/g, ' 3/4').replace(/⅓/g, ' 1/3').replace(/⅔/g, ' 2/3').replace(/⅛/g, ' 1/8').trim();
    const qm = t.match(/^((?:\d+\s+)?\d+(?:[./]\d+)?)(?:\s*(?:-|–|to)\s*(?:\d+(?:[./]\d+)?))?\s*/);
    let qty = 0; if (qm) { qty = parseQty(qm[1]); t = t.slice(qm[0].length); }
    let unit = ''; const um = t.match(/^([a-zA-Z]+)\.?\s+/); if (um && UNITS[um[1].toLowerCase()]) { unit = UNITS[um[1].toLowerCase()]; t = t.slice(um[0].length); }
    t = t.replace(/^\/\s*[\d.\/ ]+\s*[a-zA-Z]+\.?\s*/, '').replace(/^of\s+/i, ''); // drop a second measure ("/ 1 lb") and "of"
    let note = ''; const cut = t.search(/\s*\(|,\s/); // item = up to the first "(" or ", "; the rest is the note
    if (cut > 2) { note = t.slice(cut); t = t.slice(0, cut); }
    note = note.replace(/\(?\bnotes? \d+\)?/gi, '').replace(/[()]/g, ' ').replace(/\s+,/g, ',').replace(/\s+/g, ' ').replace(/^[\s,;]+|[\s,;]+$/g, '');
    return { qty: Math.round(qty * 100) / 100, unit, item: t.trim(), note };
  }
  const guessCategory = (name, cats) => { const s = (name + ' ' + cats).toLowerCase();
    return /breakfast|pancake|omelet|egg|silog|champorado|toast|waffle|lugaw|oatmeal/.test(s) && !/soup/.test(s) ? 'breakfast'
      : /soup|sinigang|tinola|nilaga|sopas|bulalo|mami|lomi|misua|chowder|broth/.test(s) ? 'soup'
        : /appetizer|starter|snack|finger food|lumpia|spring roll|dip|fritter|wings/.test(s) ? 'appetizer'
          : /vegetable|salad|side dish|side|chop suey|pinakbet|kangkong|ampalaya|sayote|pechay/.test(s) ? 'vegetable' : 'ulam'; };
  const MEALS_FOR = { breakfast: ['breakfast'], appetizer: ['snack'], snack: ['snack'], vegetable: ['lunch', 'dinner'], soup: ['lunch', 'dinner'], ulam: ['lunch', 'dinner'], baon: ['lunch'] };
  /** Read a recipe from page HTML or pasted text. Returns a draft recipe, or null. */
  function parseRecipePage(text, url) {
    const dec = s => { const ta = document.createElement('textarea'); ta.innerHTML = String(s == null ? '' : s); return ta.value; }; // &amp; → &
    const draft = (name, ings, steps, extra) => { name = dec(name); ings = ings.map(dec); steps = steps.map(dec); const cat = guessCategory(name, (extra && extra.cats) || '');
      return Object.assign({ name: (name || '').trim() || 'Imported recipe', category: cat, mealTypes: MEALS_FOR[cat], servings: householdSize(), prepMin: 10, cookMin: 20, difficulty: 'beginner',
        ingredients: ings.map(parseIngredientText).filter(i => i.item), steps: steps.map(x => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean), allergyTags: [], equipment: '', sourceUrl: url || '' }, extra || {}); };
    let doc = null; if (/<[a-z][\s\S]*>/i.test(text)) { try { doc = new DOMParser().parseFromString(text, 'text/html'); } catch (e) { doc = null; } }
    if (doc) { // 1) schema.org Recipe in JSON-LD
      const found = []; const walk = x => { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) return x.forEach(walk);
        const ty = [].concat(x['@type'] || []); if (ty.some(t => /Recipe$/i.test(t))) found.push(x); if (x['@graph']) walk(x['@graph']); if (x.mainEntity) walk(x.mainEntity); };
      doc.querySelectorAll('script[type="application/ld+json"]').forEach(sc => { try { walk(JSON.parse(sc.textContent)); } catch (e) { /* skip bad JSON */ } });
      const r = found[0];
      if (r) {
        const steps = []; const addSteps = x => { if (!x) return; if (typeof x === 'string') return x.split(/\n+/).forEach(s => steps.push(s.replace(/<[^>]+>/g, ''))); if (Array.isArray(x)) return x.forEach(addSteps);
          if (x.itemListElement) return addSteps(x.itemListElement); if (x.text) steps.push(String(x.text).replace(/<[^>]+>/g, '')); else if (x.name) steps.push(x.name); };
        addSteps(r.recipeInstructions);
        const yieldN = parseInt([].concat(r.recipeYield || [])[0], 10), img = [].concat(r.image || [])[0];
        return draft(r.name, [].concat(r.recipeIngredient || r.ingredients || []).map(x => String(x).replace(/<[^>]+>/g, '')), steps, {
          cats: [].concat(r.recipeCategory || []).join(' ') + ' ' + [].concat(r.keywords || []).join(' '),
          servings: yieldN > 0 && yieldN < 100 ? yieldN : householdSize(), prepMin: ISO_MIN(r.prepTime) || 10, cookMin: ISO_MIN(r.cookTime) || Math.max(0, ISO_MIN(r.totalTime) - ISO_MIN(r.prepTime)) || 20,
          imageUrl: typeof img === 'string' ? img : img && img.url ? img.url : '', video: r.video && (r.video.contentUrl || r.video.embedUrl) || '', kidNotes: '', storage: '' });
      }
      var title = ((doc.querySelector('h1') || doc.querySelector('title') || {}).textContent || '').trim();
      // keep line breaks between blocks so the sections can be found
      const raw = text.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<(br|\/p|\/li|\/h\d|\/div|\/tr|\/section|\/ul|\/ol)\b[^>]*>/gi, '\n').replace(/<li\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ');
      const ta = document.createElement('textarea'); ta.innerHTML = raw; text = ta.value.replace(/[ \t]+/g, ' ');
    }
    // 2) plain text: "Ingredients" … "Instructions / Directions / Method / Procedure" …
    const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const iI = lines.findIndex(l => /^ingredients?\b:?$/i.test(l) || /^ingredients?\s*(\(|for|:)/i.test(l));
    const iS = lines.findIndex((l, i) => i > iI && /^(instructions?|directions?|method|procedure|steps|how to (make|cook)|preparation)\b:?/i.test(l));
    if (iI < 0 || iS < 0) return null;
    const stop = lines.findIndex((l, i) => i > iS + 1 && /^(notes?|nutrition|tips?|video|related|you may also|recipe notes|comments?)\b/i.test(l));
    const ings = lines.slice(iI + 1, iS).filter(l => l.length < 160 && !/^(for the|serves|yield|prep|cook|total)/i.test(l));
    const steps = lines.slice(iS + 1, stop > 0 ? stop : iS + 40).map(l => l.replace(/^(step\s*)?\d+[.):]\s*/i, '')).filter(l => l.length > 3);
    const name = (typeof title !== 'undefined' && title) || lines.slice(0, Math.max(1, iI)).find(l => l.length > 3 && l.length < 90) || '';
    return draft(name.split(/\s[|–-]\s/)[0], ings, steps, {});
  }
  async function recipeImportFrom(url, pasted, msgId) {
    const msg = t => { const m = document.getElementById(msgId || 'rimp-msg'); if (m) m.innerHTML = t; };
    let text = pasted;
    if (!text) {
      if (!/^https?:\/\//i.test(url || '')) { msg('<span style="color:var(--bad)">Enter the full address, starting with https://</span>'); return; }
      if (!/^https?:$/.test(location.protocol)) { msg('<span style="color:var(--bad)">Open the app through serve.ps1 (http://localhost:8765) to fetch pages, or paste the page below.</span>'); return; }
      msg('Getting the page…');
      try { const res = await fetch('api/fetch?url=' + encodeURIComponent(url), { cache: 'no-store' }); text = await res.text(); if (!res.ok) throw new Error(text.slice(0, 200)); }
      catch (e) { msg(`<span style="color:var(--bad)">Could not get that page (${esc(String(e.message || e).slice(0, 140))}). Paste it below instead.</span>`); const d = document.querySelector('#rimp-form details'); if (d) d.open = true; return; }
    }
    const r = parseRecipePage(text, url);
    if (!r || !r.ingredients.length) { msg('<span style="color:var(--bad)">No recipe found on that page. Try pasting the page source (Ctrl+U) below.</span>'); const d = document.querySelector('#rimp-form details'); if (d) d.open = true; return; }
    if (r.imageUrl && /^https?:/.test(location.protocol)) { // the photo, resized like an upload
      try { const res = await fetch('api/fetch?url=' + encodeURIComponent(new URL(r.imageUrl, url || undefined).href)); if (res.ok) { const b = await res.blob(); if (/^image\//.test(b.type)) r.photo = await readImage(new File([b], 'photo', { type: b.type }), 1200); } } catch (e) { /* no photo */ }
    }
    recipeForm(null, r);
    toast(`Read ${r.ingredients.length} ingredients and ${r.steps.length} steps. Check them, then Save.`);
  }
  function recipeForm(id, imported) {
    const r = id ? recipeById(id) : imported || { name: '', category: 'ulam', servings: householdSize(), prepMin: 10, cookMin: 30, difficulty: 'beginner', ingredients: [], steps: [], allergyTags: [], equipment: 'Stainless steel cookware only (§9.1)' };
    modal(id ? 'Edit recipe' : imported ? 'Imported recipe — check and save' : 'New recipe', `<form data-form="recipe" class="form" id="recipe-form"><input type="hidden" name="id" value="${esc(id || '')}">
      <input type="hidden" name="sourceUrl" value="${esc(r.sourceUrl || '')}"><input type="hidden" name="photoData" value="${imported && r.photo ? esc(r.photo) : ''}">
      ${!id && !imported ? `<div class="full rf-link"><label class="small"><b>🌐 Copy from a web page</b> — paste the recipe's link and the details are filled in for you</label>
        <div class="row" style="margin-top:4px"><input class="inp" style="flex:1;min-width:220px" name="linkUrl" type="url" placeholder="https://www.example.com/recipe/…"><button type="button" class="btn" data-act="recipe-link-go">Copy recipe</button></div>
        <div class="small muted" id="rf-link-msg" style="margin-top:4px">Or fill in the form below yourself.</div></div>` : ''}
      ${r.sourceUrl ? `<div class="full small muted">From: <a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">${esc(r.sourceUrl.length > 80 ? r.sourceUrl.slice(0, 78) + '…' : r.sourceUrl)}</a>${imported && r.photo ? ' · photo included' : ''}</div>` : ''}
      <label class="field full">Name<input name="name" required value="${esc(r.name)}"></label>
      <label class="field">Category<select name="category">${Object.entries(RECIPE_CATS).map(([k, l]) => opt(k, l, r.category)).join('')}</select></label>
      <label class="field">Difficulty (for training)<select name="difficulty">${opt('beginner', 'Beginner', r.difficulty)}${opt('intermediate', 'Intermediate', r.difficulty)}</select></label>
      <label class="field">Servings<input type="number" name="servings" min="1" value="${r.servings}"></label>
      <label class="field">Video link<input name="video" value="${esc(r.video || '')}" placeholder="https://"></label>
      <label class="field">Prep minutes<input type="number" name="prepMin" min="0" value="${r.prepMin}"></label>
      <label class="field">Cook minutes<input type="number" name="cookMin" min="0" value="${r.cookMin}"></label>
      <label class="field full">Ingredients — one per line: quantity | unit | item | note<textarea name="ingredients" style="min-height:140px" placeholder="1 | kg | chicken | cut into pieces&#10;1/2 | cup | soy sauce">${esc((r.ingredients || []).map(i => [fmtQty(i.qty).replace(' ', ' '), i.unit, i.item, i.note].join(' | ').replace(/( \| )+$/, '')).join('\n'))}</textarea></label>
      <label class="field full">Steps — one per line<textarea name="steps" style="min-height:140px">${esc((r.steps || []).join('\n'))}</textarea></label>
      <label class="field full">Equipment<input name="equipment" value="${esc(r.equipment || '')}"></label>
      <div class="field full">Can be served as (the menu planner lists it only for these meals; leave all unticked for any meal)<div class="checks">${MEAL_TYPES.map(([k, l]) => `<label><input type="checkbox" name="mealTypes" value="${k}" ${(r.mealTypes || []).includes(k) ? 'checked' : ''}>${l}</label>`).join('')}</div></div>
      <label class="field">Allergy tags (comma-separated)<input name="allergyTags" value="${esc((r.allergyTags || []).join(', '))}" placeholder="soy, shellfish, peanuts"></label>
      <label class="field">Photo<input type="file" name="photo" accept="image/*"></label>
      <label class="field full">Notes for the children<input name="kidNotes" value="${esc(r.kidNotes || '')}"></label>
      <label class="field full">Leftovers & storage<input name="storage" value="${esc(r.storage || '')}"></label>
      <label class="field full">Safety reminder<input name="safety" value="${esc(r.safety || '')}"></label></form>`,
      `<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="recipe-form">Save recipe</button>`, true);
  }
  function todayMenu(d) {
    const rows = E.MEAL_SLOTS.filter(sl => !(sl.school && !E.isSchoolDay(state, d))).map(sl => {
      const it = E.mealItems(state, d, sl.id); if (!it.length) return '';
      return `<div class="li"><span class="time">${esc(sl.label)}</span><span class="grow">${it.map(i => { const r = i.recipeId && recipeById(i.recipeId); return r ? `<span class="clickable" data-act="recipe" data-id="${r.id}">📖 ${esc(r.name)}</span>` : esc(i.text); }).join(' · ')}${it[0].fromCycle ? ' <span class="muted small">↻ rotation</span>' : ''}</span></div>`;
    }).join('');
    return `<div class="card"><div class="row" style="margin-bottom:6px"><h2 style="margin:0;flex:1">Today's menu</h2><button class="btn sm" data-act="nav" data-v="meals">Plan meals</button></div>
      <div class="list">${rows || '<div class="empty">Nothing planned for today. Open Meals & Recipes to plan the week.</div>'}</div></div>`;
  }
  function recipePage(r, serv) {
    const k = serv / (Number(r.servings) || 1);
    return `<div class="pg recipe"><h1><span>RECIPE — ${esc(r.name.toUpperCase())}</span><span>${serv} servings · prep ${r.prepMin} + cook ${r.cookMin} min</span></h1>
      ${r.equipment ? `<div class="who"><b>Equipment:</b> ${esc(r.equipment)}</div>` : ''}
      <table><tr><th style="width:38%">Ingredients</th><th>Steps</th></tr><tr><td>${(r.ingredients || []).map(i => `☐ <b>${fmtQty(i.qty * k)} ${esc(i.unit)}</b> ${esc(i.item)}${i.note ? ' (' + esc(i.note) + ')' : ''}`).join('<br>')}</td>
      <td>${(r.steps || []).map((s, i) => `<div style="margin-bottom:3px">${i + 1}. ${esc(s)}</div>`).join('')}</td></tr></table>
      ${r.kidNotes ? `<div class="note">Children: ${esc(r.kidNotes)}</div>` : ''}${r.storage ? `<div class="note">Leftovers: ${esc(r.storage)}</div>` : ''}${r.safety ? `<div class="note">⚠ ${esc(r.safety)}</div>` : ''}</div>`;
  }
  function printMenu() {
    const mon = U.mondayOf(ui.date), days = [0, 1, 2, 3, 4, 5, 6].map(i => U.addDays(mon, i));
    const staffN = Math.max(1, state.staff.filter(s => E.isActive(s, mon)).length);
    const need = {};
    const grid = E.MEAL_SLOTS.map(sl => `<tr><td><b>${esc(sl.label)}</b></td>${days.map(d => {
      if (sl.school && !E.isSchoolDay(state, d)) return '<td>—</td>';
      const it = E.mealItems(state, d, sl.id); if (!it.length) return '<td></td>';
      it.forEach(m => {
        const r = m.recipeId && recipeById(m.recipeId); if (!r) return;
        const k = (sl.id === 'staff' ? staffN : householdSize()) / (Number(r.servings) || 1);
        (r.ingredients || []).forEach(i => {
          const key = i.item.trim().toLowerCase() + '|' + i.unit.trim().toLowerCase();
          const x = need[key] = need[key] || { item: i.item, unit: i.unit, qty: 0, for: new Set() };
          x.qty += (Number(i.qty) || 0) * k; x.for.add(r.name);
        });
      });
      return `<td>${it.map(i => `<div>${esc(itemName(i))}</div>`).join('')}</td>`;
    }).join('')}</tr>`).join('');
    const list = Object.values(need).sort((a, b) => a.item.localeCompare(b.item));
    const html = `<div class="pg week"><h1><span>${esc(state.settings.householdName.toUpperCase())} — WEEKLY MENU</span><span>${fmtD(days[0])} – ${fmtD(days[6])}</span></h1>
      <table><thead><tr><th></th>${days.map(d => `<th>${fmtDS(d)}</th>`).join('')}</tr></thead><tbody>${grid}</tbody></table></div>
      <div class="pg"><h1><span>INGREDIENTS LIST</span><span>${fmtD(days[0])} – ${fmtD(days[6])}</span></h1>
      <div class="who">Scaled to ${householdSize()} family members (staff meals: ${staffN}). Recipes only — add items for free-text dishes by hand. A printed list only; no stock tracking.</div>
      <table><thead><tr><th class="box"></th><th>Qty</th><th>Item</th><th>For</th></tr></thead>${list.map(x => `<tr><td class="box">☐</td><td class="nowrap">${fmtQty(x.qty)} ${esc(x.unit)}</td><td>${esc(x.item)}</td><td>${esc([...x.for].join(', '))}</td></tr>`).join('') || '<tr><td colspan="4">No recipes planned this week.</td></tr>'}</table>
      <div class="sig"><div>Prepared by</div><div>Checked by</div></div></div>`;
    setPage('landscape', 'Weekly menu · ' + fmtD(days[0]) + ' – ' + fmtD(days[6])); document.getElementById('print-root').innerHTML = html; printPreview();
  }

  // ---------- Month, Year & Events (Phase 2, spec §5.4.6) ----------
  const isPeriodicBadge = b => !['D', 'EOD', 'Menu', 'Event'].includes(b) && !/×W$/.test(b);
  const nextPms = (v, from) => { if (!v.lastPms || !v.pmsMonths) return null; let d = v.lastPms; while (d < from) d = U.addMonths(d, Number(v.pmsMonths)); return d; };
  function vMonth() {
    const tab = ui.calTab || 'month';
    return `<div class="head"><h1>Tasks — Month & Year</h1><span class="sub">Weekly and longer tasks by month and year</span><span class="spacer"></span><button class="btn" data-act="event-new">🎉 Event mode</button></div>
      <div class="tabs">${[['month', 'Month'], ['year', 'Year'], ['events', `Event planner (${(state.events || []).length})`]].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="cal-tab" data-v="${k}">${l}</button>`).join('')}</div>
      ${tab === 'month' ? monthView() : tab === 'year' ? yearView() : eventsView()}`;
  }
  function monthCells() {
    const ms = (ui.month || todayStr().slice(0, 7)) + '-01', me = U.addDays(U.nextMonth(ms), -1), S = state.settings;
    const fs = ui.calStaff || '', fc = ui.calCat || '';
    const rot = new Set(); for (let p = E.periodStartOf(S, ms); p <= me; p = E.nextPeriodStart(S, p)) if (p >= ms) rot.add(p);
    const cells = [];
    for (let d = U.mondayOf(ms); d <= me || U.dow(d) !== 1; d = U.addDays(d, 1)) {
      if (d > me && U.dow(d) === 1) break;
      const r = getWeek(d), items = [];
      if (rot.has(d)) items.push('<div class="mi rot">🔁 Lead rotation</div>');
      { const ns = E.noSchoolOn(state, d), w = U.dow(d); if (ns && w >= 1 && w <= 5) items.push(`<div class="mi ev hol">${noSchoolLabel(d)}</div>`); }
      birthdaysOn(d).forEach(b => items.push(`<div class="mi ev hol">${esc(bdayText(b))}</div>`));
      const payees = state.staff.filter(s => (!fs || s.id === fs) && E.isActive(s, d) && P.periodFor(state, s, d).payday === d);
      if (payees.length) items.push(`<div class="mi rot">💰 Payday: ${payees.map(s => esc(sName(s.id))).join(', ')}</div>`);
      (r.events[d] || []).forEach(e => items.push(`<div class="mi ev">${evIcon(e)} ${esc(e.title || E.EVENT_TYPES[e.type].label)}${e.startTime && e.date === d ? ' ' + e.startTime : ''}</div>`));
      state.staff.filter(s => (!fs || s.id === fs) && r.status[d][s.id] && !r.status[d][s.id].working && E.isActive(s, d))
        .forEach(s => { const st = r.status[d][s.id]; items.push(`<div class="mi ${st.absence ? 'abs' : 'rest'}">${esc(sName(s.id))}: ${esc(st.label)}</div>`); });
      state.staff.filter(s => (!fs || s.id === fs) && r.status[d][s.id] && r.status[d][s.id].half).forEach(s => items.push(`<div class="mi abs">${esc(sName(s.id))}: ${esc(r.status[d][s.id].label)}</div>`));
      r.occurrences.filter(o => o.date === d && !o.skipped && isPeriodicBadge(o.badge) && (!fs || o.mainId === fs || o.assistId === fs) && (!fc || o.categoryId === fc))
        .forEach(o => items.push(`<div class="mi"><span class="dot" style="background:${cat(o.categoryId).color}"></span> <span class="tag badge">${o.badge}</span> ${esc(o.name)}</div>`));
      cells.push({ d, inMonth: d >= ms && d <= me, items });
    }
    return { ms, cells };
  }
  function monthView() {
    const { ms, cells } = monthCells(), today = todayStr();
    return `<div class="head" style="margin-bottom:10px"><div class="row"><button class="btn icon" data-act="month-shift" data-n="-1" aria-label="Previous month">◀</button><b>${MON[+ms.slice(5, 7) - 1]} ${ms.slice(0, 4)}</b>
      <button class="btn icon" data-act="month-shift" data-n="1" aria-label="Next month">▶</button><button class="btn" data-act="month-shift" data-n="0">This month</button></div><span class="spacer"></span>
      <select class="inp" style="width:auto" data-change="cal-staff" aria-label="Filter by staff">${opt('', 'All staff', ui.calStaff || '')}${state.staff.map(s => opt(s.id, s.nickname || s.fullName, ui.calStaff || '')).join('')}</select>
      <select class="inp" style="width:auto" data-change="cal-cat" aria-label="Filter by category">${opt('', 'All categories', ui.calCat || '')}${state.categories.map(c => opt(c.id, c.name, ui.calCat || '')).join('')}</select>
      <button class="btn" data-act="print-month">🖨 Print month</button></div>
      <div class="card flush scroll-x"><div class="month">${DOWS.slice(1).concat('Sun').map(x => `<div class="mh">${x}</div>`).join('')}
      ${cells.map(c => `<div class="mc${c.inMonth ? '' : ' out'}${c.d === today ? ' today' : ''} clickable" data-act="goto-day" data-d="${c.d}"><div class="md">${+c.d.slice(8)}</div>${c.items.slice(0, 7).join('')}${c.items.length > 7 ? `<div class="mi muted">+${c.items.length - 7} more</div>` : ''}</div>`).join('')}</div></div>
      <p class="small muted">Shows weekly-and-up tasks (W, 2W, M, Q, 6M, Y), rest days, absences, replacement days, events, paydays and lead rotation changes. Daily tasks are in the Day view. Click a day to open it.</p>`;
  }
  function printMonth() {
    const { ms, cells } = monthCells();
    printMonthGrid('MONTHLY TASKS CALENDAR', ms, cells, 'Monthly tasks', '');
  }
  /** A month grid on one landscape page at a readable size: equal week rows that fill the page, items wrapped
      (never cut), "+N more" when a day is too full. Used by the Month calendar and the Calendar prints. */
  function printMonthGrid(title, ms, cells, label, foot) {
    const weeks = Math.ceil(cells.length / 7), area = printArea('landscape');
    const rowH = Math.floor((area.h - 52 - 18 - 30 - (foot ? 16 : 0)) / weeks), lines = Math.max(2, Math.floor((rowH - 16) / 12.5));
    const perLine = Math.max(12, Math.floor((area.w / 7 - 10) / 5.2)); // characters per printed line at 9.5px
    const fit = items => { // whole items (wrapped, never cut) while they fit; the rest as "+N more"
      const out = []; let used = 0;
      for (let i = 0; i < items.length; i++) {
        const n = Math.max(1, Math.ceil(items[i].replace(/<[^>]+>/g, '').trim().length / perLine)), last = i === items.length - 1;
        if (used + n > (last ? lines : lines - 1)) { out.push(`<div class="mi more">+${items.length - i} more</div>`); break; }
        out.push(items[i]); used += n;
      }
      return out.join('');
    };
    const html = `<div class="pg month mprint"><h1 class="mtitle"><div>${esc(state.settings.householdName.toUpperCase())} — ${esc(title)}</div><div class="msub">${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+ms.slice(5, 7) - 1]} ${ms.slice(0, 4)}</div></h1>
      <div class="month" style="grid-template-rows:18px repeat(${weeks}, ${rowH}px)">${DOWS.slice(1).concat('Sun').map(x => `<div class="mh">${x}</div>`).join('')}${cells.map(c => `<div class="mc${c.inMonth ? '' : ' out'}"><div class="md">${+c.d.slice(8)}</div>${fit(c.items)}</div>`).join('')}</div>${foot ? `<div class="mfoot">${foot}</div>` : ''}</div>`;
    setPage('landscape', label + ' · ' + MON[+ms.slice(5, 7) - 1] + ' ' + ms.slice(0, 4)); document.getElementById('print-root').innerHTML = html; printPreview();
  }
  function yearView() {
    const y = ui.year || +todayStr().slice(0, 4), months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const row = (label, marks, extra) => `<tr><td>${label}${extra ? ` <span class="small muted">${extra}</span>` : ''}</td>${months.map(m => `<td class="yc">${marks[m] ? `<span class="ym">${marks[m] === true ? '●' : esc(marks[m])}</span>` : ''}</td>`).join('')}</tr>`;
    const tasks = state.tasks.filter(t => t.active && ['months', 'yearly'].includes(t.freq.type)).sort((a, b) => (cat(a.categoryId).sort || 0) - (cat(b.categoryId).sort || 0) || a.name.localeCompare(b.name));
    const taskRows = tasks.map(t => { const mk = {}; E.monthsFor(t, y).forEach(m => { mk[m] = E.badge(t.freq); }); return row(`<span class="dot" style="background:${cat(t.categoryId).color}"></span> ${esc(t.name)}`, mk); }).join('');
    const vRows = (state.vehicles || []).map(v => {
      const reg = {}, ins = {}, pms = {};
      if (v.regMonth) reg[+v.regMonth] = 'Reg';
      if (v.insurance) { let d = v.insurance; while (+d.slice(0, 4) < y) d = U.addMonths(d, 12); if (+d.slice(0, 4) === y) ins[+d.slice(5, 7)] = +d.slice(8); }
      if (v.lastPms && v.pmsMonths) for (let d = nextPms(v, y + '-01-01'); d && +d.slice(0, 4) === y; d = U.addMonths(d, Number(v.pmsMonths))) pms[+d.slice(5, 7)] = +d.slice(8);
      const nm = `${esc(v.name)}${v.plate ? ' · ' + esc(v.plate) : ''}`;
      return row(`🚗 ${nm} — LTO registration`, reg) + row(`🚗 ${nm} — insurance renewal`, ins, 'day shown') + row(`🚗 ${nm} — PMS (every ${v.pmsMonths} months)`, pms, 'day shown');
    }).join('');
    const sRows = state.staff.filter(s => s.status === 'provisional' && !s.exitDate).map(s => { const r = E.regularizationDue(s), mk = {}; if (r && +r.slice(0, 4) === y) mk[+r.slice(5, 7)] = +r.slice(8); return row(`👤 Regularization due — ${esc(s.nickname || s.fullName)}`, mk, 'day shown'); }).join('');
    const th = row('💰 13th month pay due (by 24 Dec, RA 10361)', { 12: 24 });
    return `<div class="head" style="margin-bottom:10px"><div class="row"><button class="btn icon" data-act="year-shift" data-n="-1" aria-label="Previous year">◀</button><b>${y}</b><button class="btn icon" data-act="year-shift" data-n="1" aria-label="Next year">▶</button></div></div>
      <div class="card flush scroll-x"><table class="t year"><tr><th>Item</th>${months.map(m => `<th class="yc">${MON[m - 1]}</th>`).join('')}</tr>
      <tr class="group"><td colspan="13">Quarterly, semi-annual and yearly tasks</td></tr>${taskRows || '<tr><td colspan="13" class="empty">None.</td></tr>'}
      <tr class="group"><td colspan="13">Vehicles</td></tr>${vRows || '<tr><td colspan="13" class="empty">No vehicles. Add them in Settings.</td></tr>'}
      <tr class="group"><td colspan="13">Staff & pay</td></tr>${sRows}${th}</table></div>
      <p class="small muted">Monthly tasks are in the Month view. The exact day of each task is chosen when its week is scheduled. Contract milestones arrive with Contracts (Phase 3). Edit vehicles in Settings.</p>`;
  }
  /** Event planner: every planned occasion of the year, by month — once-only and yearly — with not held / moved per occasion. */
  // ---------- School calendar: Monday–Friday are school days unless marked here (16 Nov 2026) ----------
  /** Short label for a day without school: the holiday or reason (e.g. "🇵🇭 Bonifacio Day"), else "No school" / "Weekend". */
  const noSchoolLabel = d => {
    const ns = E.noSchoolOn(state, d), w = U.dow(d);
    const hol = (state.events || []).length && E.eventsOn(state, d).find(e => e.type === 'holiday');
    if (ns && w >= 1 && w <= 5) { const k = E.NO_SCHOOL[ns.reason] || E.NO_SCHOOL.other; return k[0] + ' ' + esc(ns.note ? ns.note.replace(/ \((regular holiday|special non-working day)\)$/, '') : k[1]); }
    if (hol) return '🏖️ ' + esc(hol.title || 'Holiday');
    return w === 0 || w === 6 ? 'Weekend' : 'No school';
  };
  /** "No school" button for a weekday: record it, or edit the entry already covering that day. */
  const noSchoolBtn = d => { const w = U.dow(d); if (w < 1 || w > 5) return ''; const ns = E.noSchoolOn(state, d);
    return ns ? `<button class="btn" data-act="ns-new" data-id="${ns.id}" title="Edit the no-school entry">${(E.NO_SCHOOL[ns.reason] || E.NO_SCHOOL.other)[0]} No school</button>` : `<button class="btn" data-act="ns-new" data-d="${d}">🏫 No school…</button>`; };
  const nsDays = x => { let n = 0; for (let d = x.from; d <= (x.to || x.from); d = U.addDays(d, 1)) { const w = U.dow(d); if (w >= 1 && w <= 5) n++; } return n; };
  function schoolCalendarCard(y) {
    const list = (state.noSchool || []).filter(x => x.from.slice(0, 4) <= String(y) && (x.to || x.from).slice(0, 4) >= String(y)).sort((a, b) => a.from.localeCompare(b.from)), today = todayStr();
    return `<div class="card"><div class="row" style="margin-bottom:6px"><h2 style="margin:0;flex:1">🏫 School calendar ${y}</h2><button class="btn" data-act="sc-paste" data-v="school">📋 Paste school calendar</button><button class="btn primary" data-act="ns-new">+ No-school day(s)</button></div>
      <div class="small muted" style="margin-bottom:8px">Monday to Friday are school days by default. Mark the exceptions here: public holidays, class suspensions, days everyone is sick at home, and school vacations. On those days there is no school run or packed lunch, the children are home (mopping and dusting wait until they are out of the area), and <b>the driver is free for his own tasks</b>.</div>
      ${list.length ? `<div class="list">${list.map(x => { const k = E.NO_SCHOOL[x.reason] || E.NO_SCHOOL.other, n = nsDays(x), past = (x.to || x.from) < today;
        return `<div class="li"><span style="font-size:20px">${k[0]}</span><span class="grow"><b>${esc(k[1])}</b>${x.note ? ' — ' + esc(x.note) : ''}${past ? ' <span class="chip">past</span>' : ''}
          <div class="small muted">${fmtD(x.from)}${x.to && x.to !== x.from ? ' – ' + fmtD(x.to) : ''} · ${n} school day${n === 1 ? '' : 's'} off · <i>Source: ${x.source === 'proclamation' ? 'Proclamation No. ' + (x.from < '2027' ? '1006 (2026 holidays)' : '1427 (2027 holidays)') : esc(x.source || 'entered by you')}</i></div></span>
          <button class="btn sm" data-act="ns-new" data-id="${x.id}">Edit</button><button class="btn sm danger" data-act="ns-del" data-id="${x.id}">Delete</button></div>`; }).join('')}</div>`
        : '<div class="empty">No no-school days marked for this year.</div>'}
      <div class="small muted" style="margin-top:10px"><b>Source of the public holidays:</b> Proclamation No. 1006 (signed 3 Sep 2025) for 2026 and Proclamation No. 1427 (signed 8 Sep 2026) for 2027, issued by the Office of the President (Malacañang); as reported by the
        <a href="https://ptvnews.ph/palace-releases-official-list-of-2026-holidays" target="_blank" rel="noopener">PTV (2026 list)</a>, <a href="https://www.pna.gov.ph/articles/1283808" target="_blank" rel="noopener">Philippine News Agency (2027 list)</a> and
        <a href="https://dole.gov.ph/news/dole-sets-guidelines-for-holiday-pay-rules-in-2027/" target="_blank" rel="noopener">DOLE (2027 holiday pay rules)</a>. Eid'l Fitr and Eid'l Adha are proclaimed separately each year — add them when announced. Entries you add or paste are marked with their own source.</div></div>`;
  }
  // ---------- Paste a school calendar from a spreadsheet or another schedule (DATE, DETAILS) ----------
  const NO_CLASS_RX = /\b(no (class|classes|school|pasok)|walang pasok|holiday|suspen\w*|break|vacation|semestral|sembreak|day off|teachers'? (day|in-?service)|in-?service|asynchronous|non-working)\b/i;
  function parseSchoolDate(s) {
    s = String(s || '').trim().replace(/^(mon|tue|wed|thu|fri|sat|sun)\w*,?\s*/i, ''); if (!s || !/\d/.test(s)) return ''; // a date always has a number
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
    const yFor = mo => { const t = todayStr(), y = +t.slice(0, 4); return mo < +t.slice(5, 7) - 4 ? y + 1 : y; }; // no year: this school year
    if (m) { let a = +m[1], b = +m[2], y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : 0; let mo = a, da = b; if (a > 12) { mo = b; da = a; } y = y || yFor(mo);
      return mo >= 1 && mo <= 12 && da >= 1 && da <= 31 ? `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}` : ''; }
    const t = Date.parse(/\d{4}/.test(s) ? s : s + ' ' + todayStr().slice(0, 4)); if (isNaN(t)) return '';
    const dt = new Date(t); let y = dt.getFullYear(); if (!/\d{4}/.test(s)) y = yFor(dt.getMonth() + 1);
    return `${y}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  /** Rows of DATE + DETAILS from pasted text (tabs from a spreadsheet, or "date - details" lines). Extra columns become "Header: value". */
  function parseSchoolPaste(text) {
    const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const split = l => l.includes('\t') ? l.split('\t') : l.includes(';') ? l.split(';') : (m => m ? [m[1], m[2]] : l.split(/\s{2,}|,(?=\s*[A-Za-z])/))(l.match(/^(.+?\d)\s*[-–:|]\s+(.+)$/));
    let head = null, rows = lines.map(split);
    if (/^\s*(date|dates|petsa|araw|day)\b/i.test(rows[0][0] || '') || (!parseSchoolDate(rows[0][0]) && rows[0].length > 1 && rows.slice(1).some(r => parseSchoolDate(r[0])))) { head = rows[0].map(h => h.trim()); rows = rows.slice(1); }
    let last = '';
    return rows.map(c => {
      let d = parseSchoolDate(c[0]); if (!d && !String(c[0] || '').trim()) d = last; if (d) last = d; // merged date cells: same date as above
      const parts = c.slice(1).map((v, i) => ({ h: head ? (head[i + 1] || '') : '', v: String(v || '').trim() })).filter(x => x.v);
      const details = parts.map(x => (x.h && parts.length > 1 ? x.h + ': ' : '') + x.v).join(' · ');
      const general = parts.find(x => /general|all|kids|lahat/i.test(x.h));
      const kidCols = head ? parts.filter(x => x.h && !/mom|mommy|dad|daddy|parent|general/i.test(x.h)) : [];
      const noClass = general ? NO_CLASS_RX.test(general.v) : kidCols.length ? kidCols.every(x => NO_CLASS_RX.test(x.v)) && kidCols.length >= Math.max(1, head.filter(h => h && !/date|mom|mommy|dad|daddy|parent|general/i.test(h)).length) : NO_CLASS_RX.test(details);
      return { date: d, details, noClass, raw: c.join(' | ') };
    }).filter(r => r.details);
  }
  /** Icon for an event on calendars: its category (family / work / school / holiday) for reminders, else its schedule type. */
  const evIcon = e => (e.type === 'occasion' && e.category && EVENT_CATS[e.category]) ? EVENT_CATS[e.category][0] : (E.EVENT_TYPES[e.type] || { icon: '📅' }).icon;
  const EVENT_CATS = { family: ['👨‍👩‍👧', 'Family event'], work: ['💼', 'Work event'], school: ['🏫', 'School event'], holiday: ['🇵🇭', 'Public holiday'] };
  const guessEventCat = (txt, dflt) => /holiday|non-working|national|araw ng|independence|christmas day|new year/i.test(txt) && !/school|class/i.test(txt) ? 'holiday'
    : /school|class|quiz|exam|test|program|pta|recognition|field trip|intramurals|teacher|enrol|grading|report card|homework|project/i.test(txt) ? 'school'
      : /work|office|meeting|deadline|client|business|conference|seminar|training/i.test(txt) ? 'work' : (dflt || 'family');
  function schoolPasteModal(dflt) {
    ui.scDefault = dflt || 'family';
    modal('📋 Paste events', `<form class="form" id="scp-form" onsubmit="return false">
      <div class="full small muted">Copy rows from a schedule (Excel, Google Sheets, a Word table, an email or the school calendar) and paste them here. Columns: <b>DATE</b> and <b>DETAILS</b> — extra columns (e.g. one per child, General (kids), Mommy) are kept as "Column: details". A header row is detected automatically. You choose the type of each event before adding.</div>
      <textarea name="paste" class="full" style="min-height:150px;width:100%;font-family:inherit" placeholder="DATE&#9;DETAILS&#10;Nov 18&#9;No classes — teachers' in-service&#10;11/21/2026&#9;Family Day&#10;Dec 19 - Jan 4&#9;Christmas break"></textarea>
      <div class="full row"><button type="button" class="btn primary" data-act="sc-preview">Read the rows</button><span class="small muted" id="scp-msg"></span></div>
      <div class="full" id="scp-preview"></div></form>`, `<button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="sc-import" id="scp-go" disabled>Add to the calendar</button>`, true);
  }
  function schoolPastePreview() {
    const f = document.getElementById('scp-form'), text = f.paste.value;
    // a range like "Dec 19 - Jan 4" in the date column becomes one row per weekday
    const rows = [];
    parseSchoolPaste(text).forEach(r => {
      const rg = String(r.raw.split(' | ')[0]).match(/^(.+?)\s*(?:-|–|to)\s*(.+)$/);
      const a = rg && parseSchoolDate(rg[1]), b = rg && parseSchoolDate(rg[2]);
      if (a && b && b > a && U.daysBetween(a, b) <= 60) rows.push(Object.assign({}, r, { date: a, to: b })); else rows.push(r);
    });
    ui.scRows = rows;
    const ok = rows.filter(r => r.date).length;
    document.getElementById('scp-msg').textContent = rows.length ? `${ok} of ${rows.length} rows have a date I could read.` : 'No rows found.';
    document.getElementById('scp-preview').innerHTML = rows.length ? `<div class="scroll-x"><table class="t"><thead><tr><th>Add</th><th>Date</th><th>Details</th><th>Type</th><th title="No classes: no school run, children home">No school</th></tr></thead><tbody>
      ${rows.map((r, i) => { const cat = r.noClass && /holiday/i.test(r.details) ? 'holiday' : guessEventCat(r.details, ui.scDefault);
        return `<tr${r.date ? '' : ' style="opacity:.5"'}><td><input type="checkbox" data-sc="${i}" data-f="add" ${r.date ? 'checked' : 'disabled'}></td><td class="nowrap">${r.date ? fmtDS(r.date) + (r.to ? ' – ' + fmtDS(r.to) : '') : '<span style="color:var(--bad)">? ' + esc(r.raw.split(' | ')[0]) + '</span>'}</td><td>${esc(r.details)}</td>
        <td><select class="inp sm" data-sc="${i}" data-f="cat" ${r.date ? '' : 'disabled'}>${Object.entries(EVENT_CATS).map(([k, v]) => opt(k, v[0] + ' ' + v[1], cat)).join('')}</select></td>
        <td><input type="checkbox" data-sc="${i}" data-f="noClass" ${r.noClass || cat === 'holiday' ? 'checked' : ''} ${r.date ? '' : 'disabled'}></td></tr>`; }).join('')}</tbody></table></div>
      <div class="small muted">Each row becomes an event of the chosen type on the calendar and in Coming up (a Public holiday goes to the School calendar). "No school" = no classes for the children (no school run, packed lunch or school prep; the driver does his own tasks). Rows without a readable date are skipped.</div>` : '';
    document.getElementById('scp-go').disabled = !ok;
  }
  function schoolPasteImport() {
    const val = (i, f) => document.querySelector(`[data-sc="${i}"][data-f="${f}"]`) || {};
    const rows = (ui.scRows || []).map((r, i) => Object.assign({}, r, { add: !!val(i, 'add').checked, noClass: !!val(i, 'noClass').checked, cat: val(i, 'cat').value || 'family' })).filter(r => r.date && r.add);
    let ns = 0, ev = 0; state.noSchool = state.noSchool || []; state.events = state.events || [];
    rows.forEach(r => {
      if ((r.noClass || r.cat === 'holiday') && !state.noSchool.some(n => n.from === r.date && (n.to || '') === (r.to || ''))) {
        state.noSchool.push({ id: uid('ns'), reason: r.cat === 'holiday' || /holiday/i.test(r.details) ? 'holiday' : /break|vacation|sembreak|semestral/i.test(r.details) ? 'vacation' : /suspen/i.test(r.details) ? 'suspension' : 'other', from: r.date, to: r.to || '', note: r.details.slice(0, 140), source: 'pasted' }); ns++;
      }
      if (r.cat !== 'holiday') {
        const title = r.details.slice(0, 90);
        if (!state.events.some(e => e.date === r.date && e.title === title)) { state.events.push({ id: uid('e'), title, category: r.cat, repeat: 'none', type: 'occasion', date: r.date, end: r.to || '', startTime: '', endTime: '', location: 'home', place: '', companions: [], notes: r.details.length > 90 ? r.details : '', skipMeals: [], approvedTasks: [], source: 'pasted' }); ev++; }
      }
    });
    closeModal(); commit('Pasted events', `${ev} event(s), ${ns} no-school day(s)`);
    toast(`Added ${ev} event(s) and ${ns} no-school day(s) to the calendar.`);
  }
  function noSchoolModal(id, d) {
    const x = id ? (state.noSchool || []).find(n => n.id === id) : { reason: 'suspension', from: d || todayStr(), to: '', note: '' };
    modal(id ? 'Edit no-school day(s)' : '🏫 No school', `<form data-form="no-school" class="form" id="ns-form"><input type="hidden" name="id" value="${id || ''}">
      <label class="field full">Reason<select name="reason">${Object.entries(E.NO_SCHOOL).map(([k, v]) => opt(k, v[0] + ' ' + v[1], x.reason)).join('')}</select></label>
      <label class="field">From<input type="date" name="from" value="${esc(x.from)}" required></label>
      <label class="field">Until (optional, for several days)<input type="date" name="to" value="${esc(x.to || '')}"></label>
      <label class="field full">Note (optional)<input name="note" value="${esc(x.note || '')}" placeholder="e.g., Typhoon signal no. 2 · Christmas break · flu"></label>
      <div class="full small muted">The children are home and there is no school run, so the driver does his own tasks those days. Past days are not changed.</div>
      <div class="full" id="ns-msg"></div></form>`,
      `<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="ns-form">Save</button>`);
  }
  function eventsView() {
    const today = todayStr(), y = ui.evYear || +today.slice(0, 4);
    const list = E.eventInstances(state, y + '-01-01', y + '-12-31', { includeCancelled: true }).filter(e => +((e.originalDate || e.date).slice(0, 4)) === y || +e.date.slice(0, 4) === y);
    const show = ui.evShow || 'all', catOf = e => e.category || (e.type === 'holiday' ? 'holiday' : 'family');
    const rows = list.filter(e => show === 'all' || (EVENT_CATS[show] ? catOf(e) === show : show === 'upcoming' ? (e.end || e.date) >= today && !e.cancelled : show === 'yearly' ? e.repeat === 'yearly' : e.repeat !== 'yearly'));
    const byMonth = {}; rows.forEach(e => { const m = +(e.cancelled ? e.originalDate : e.date).slice(5, 7); (byMonth[m] = byMonth[m] || []).push(e); });
    const item = e => { const def = E.EVENT_TYPES[e.type] || { icon: '📅', label: e.type }, past = (e.end || e.date) < today, base = e.originalDate || e.date;
      return `<div class="li ev-row${e.cancelled ? ' ev-cancel' : ''}"><span style="font-size:20px">${def.icon}</span>
        <span class="grow"><b>${esc(e.title || def.label)}</b> <span class="chip cat-${catOf(e)}">${EVENT_CATS[catOf(e)][0]} ${esc(EVENT_CATS[catOf(e)][1])}</span> ${e.repeat === 'yearly' ? '<span class="chip info">every year</span>' : '<span class="chip">once</span>'}
          ${e.cancelled ? '<span class="chip bad">not held</span>' : ''}${e.moved ? `<span class="chip warn">moved from ${fmtDS(base)}</span>` : ''}${past && !e.cancelled ? ' <span class="chip">past</span>' : ''}
          <div class="small">${esc(eventWhen(e))} · ${esc(def.label)}</div>${eventWhere(e) ? `<div class="small muted">${esc(eventWhere(e))}</div>` : ''}${e.notes ? `<div class="small muted">${esc(e.notes)}</div>` : ''}</span>
        <span class="ev-ctl">${past ? '' : `<label class="small nowrap"><input type="checkbox" data-change="ev-cancel" data-sid="${e.seriesId}" data-y="${e.year}" ${e.cancelled ? 'checked' : ''}> Not held</label>
          <label class="small nowrap"><input type="checkbox" data-change="ev-movechk" data-sid="${e.seriesId}" data-y="${e.year}" ${e.moved ? 'checked' : ''} ${e.cancelled ? 'disabled' : ''}> Moved</label>
          <input type="date" class="inp sm ev-move" style="width:auto${e.moved ? '' : ';display:none'}" value="${e.moved ? e.date : ''}" data-change="ev-move" data-sid="${e.seriesId}" data-y="${e.year}" aria-label="New date">`}
          <button class="btn sm" data-act="event-new" data-id="${e.seriesId}">Edit</button>${e.cancelled ? '' : `<button class="btn sm" data-act="goto-day" data-d="${e.date}">Day</button>`}</span></div>`; };
    const counts = { all: list.length, upcoming: list.filter(e => (e.end || e.date) >= today && !e.cancelled).length };
    return `<div class="card"><div class="row" style="margin-bottom:8px"><h2 style="margin:0;flex:1">Event planner ${y}</h2>
        <button class="btn icon" data-act="ev-year" data-n="-1" aria-label="Previous year">◀</button><b>${y}</b><button class="btn icon" data-act="ev-year" data-n="1" aria-label="Next year">▶</button>
        <select class="inp" style="width:auto" data-change="ev-show" aria-label="Show">${opt('all', `All (${counts.all})`, show)}${opt('upcoming', `Upcoming (${counts.upcoming})`, show)}${opt('yearly', 'Every year', show)}${opt('once', 'Once only', show)}${Object.entries(EVENT_CATS).map(([k, v]) => opt(k, v[0] + ' ' + v[1] + 's', show)).join('')}</select>
        <button class="btn" data-act="sc-paste">📋 Paste events</button><button class="btn primary" data-act="event-new">+ Plan an event</button></div>
      ${Object.keys(byMonth).length ? Object.keys(byMonth).map(Number).sort((a, b) => a - b).map(m => `<div class="section-title">${MON[m - 1]} ${y}</div><div class="list">${byMonth[m].map(item).join('')}</div>`).join('')
        : '<div class="empty">No events planned for this year. Use "+ Plan an event": birthdays, anniversaries, fiestas, holidays, parties, trips, or times the family is out.</div>'}
      <div class="small muted" style="margin-top:10px">"Every year" events are set by month and day; if the celebration falls on another day, untick "Celebrated on the same day" in Edit and give the actual date. "Not held" and "Moved" apply to that one occasion only (for a yearly event, just that year); Edit changes the event itself. Planned events also adjust the helpers' schedule — see the types below.</div></div>
      <div style="height:16px"></div>
      <div class="card"><h2>Event types and what they do to the schedule</h2><div class="list">${Object.entries(E.EVENT_TYPES).map(([k, x]) => `<div class="li"><span style="font-size:20px">${x.icon}</span><span class="grow"><b>${esc(x.label)}</b>
        <div class="small muted">${esc(k === 'occasion' ? 'A reminder on the calendar and in Coming up (birthdays, anniversaries…). The schedule does not change unless helpers are ticked as coming along.' : EVENT_EFFECT(x))}</div></span></div>`).join('')}</div></div>`;
  }
  const EVENT_EFFECT = x => x.holiday ? 'No school: the children are home all day, so mopping and dusting wait until they are out of the area. Can-move tasks pause.'
    : x.noPause ? 'Helpers by themselves for the hours (or days) you set: chores that need the children away (mopping, dusting) can be done then; family meals in that time are skipped. Nothing is paused.'
      : 'Can-move tasks pause' + (x.away ? '; family cooking and school-day tasks pause' : '') + '.' + (x.tasks.length ? ' Adds: ' + x.tasks.map(t => t[1].split(':')[0] + (t[2] === 'next' ? ' (day after)' : t[2] === 'first' ? ' (first day)' : '')).join(' · ') : '');
  const eventWhen = e => `${fmtD(e.date)}${e.startTime ? ' ' + e.startTime : ''}${e.end && e.end !== e.date ? ' – ' + fmtD(e.end) : (e.endTime ? ' –' : '')}${e.endTime ? ' ' + e.endTime : ''}`;
  const eventWhere = e => [e.location === 'out' ? 'Outside the house' + (e.place ? ': ' + e.place : '') : e.location === 'home' ? 'In the house' : '',
    (e.companions || []).length ? 'Coming along: ' + e.companions.map(sName).join(', ') : ''].filter(Boolean).join(' · ');
  function eventModal(d, id) {
    if (id) id = String(id).split('#')[0]; // an occasion of a yearly event → edit the event itself
    const e = id ? state.events.find(x => x.id === id) : { type: 'guests', date: d, end: '', startTime: '', endTime: '', location: 'home', place: '', companions: [], notes: '', title: '', repeat: 'none' };
    const staff = state.staff.filter(s => E.isActive(s, e.date || d));
    modal(id ? 'Edit event' : '🎉 Plan an event', `<form data-form="event" class="form" id="event-form"><input type="hidden" name="id" value="${id || ''}">
      <label class="field">Title<input name="title" value="${esc(e.title || '')}" placeholder="e.g., Lola's birthday, Wedding anniversary, Sinulog"></label>
      <div class="field full">What kind of event<div class="checks ev-cats">${Object.entries(EVENT_CATS).map(([k, v]) => `<label><input type="radio" name="category" value="${k}" data-change="event-cat" ${(e.category || (e.type === 'holiday' ? 'holiday' : 'family')) === k ? 'checked' : ''}> ${v[0]} ${esc(v[1])}</label>`).join('')}</div></div>
      <label class="field">Repeats<select name="repeat" data-change="event-type">${opt('none', 'Once', e.repeat || 'none')}${opt('yearly', 'Every year (month and day)', e.repeat || 'none')}</select></label>
      ${(() => { // yearly: month + day; "celebrated on the same day" for the next occasion, else the actual celebration date
        const md = (e.repeat === 'yearly' && e.date ? e.date : d).slice(5), today = todayStr(), ty = +today.slice(0, 4);
        const ny = e.repeat === 'yearly' && e.date ? (E.annualDate(e.date, ty) >= today ? ty : ty + 1) : ty;
        const ov = e.repeat === 'yearly' ? (e.overrides || {})[ny] : null, moved = ov && ov.movedTo;
        return `<label class="field ev-yearly" hidden>Month<select name="ymonth">${MON.map((m, i) => opt(i + 1, ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][i], +md.slice(0, 2))).join('')}</select></label>
          <label class="field ev-yearly" hidden>Day<select name="yday">${Array.from({ length: 31 }, (_, i) => opt(i + 1, i + 1, +md.slice(3, 5))).join('')}</select></label>
          <label class="field full ev-yearly" hidden><span><input type="checkbox" name="sameDay" data-change="event-type" ${moved ? '' : 'checked'}> Celebrated on the same day${e.repeat === 'yearly' ? ' in ' + ny : ' (next occasion)'}</span></label>
          <label class="field ev-yearly ev-exact" hidden>Actual celebration date${e.repeat === 'yearly' ? ' (' + ny + ')' : ''}<input type="date" name="exactDate" value="${moved ? esc(ov.movedTo) : ''}" min="${today}"></label>
          <input type="hidden" name="nextYear" value="${ny}">`; })()}
      <label class="field">Type<select name="type" data-change="event-type">${Object.entries(E.EVENT_TYPES).map(([k, x]) => opt(k, x.icon + ' ' + x.label, e.type)).join('')}</select></label>
      <label class="field">Where<select name="location" data-change="event-type">${opt('home', 'In the house', e.location || 'home')}${opt('out', 'Outside the house', e.location || 'home')}</select></label>
      <label class="field ev-once">From (date)<input type="date" name="date" value="${e.date}" data-change="event-type"></label><label class="field">Start time (optional)<input type="time" name="startTime" value="${esc(e.startTime || '')}"></label>
      <label class="field ev-once">To (date, optional)<input type="date" name="end" value="${esc(e.end || '')}" data-change="event-type"></label><label class="field">End time (optional)<input type="time" name="endTime" value="${esc(e.endTime || '')}"></label>
      <label class="field full ev-place"${e.location === 'out' ? '' : ' hidden'}>Place<input name="place" value="${esc(e.place || '')}" placeholder="e.g., Lola's house, SM Seaside, Bohol"></label>
      <div class="field full">Who comes with the family (away for those hours)<div class="checks">${staff.map(s => `<label><input type="checkbox" name="companions" value="${s.id}" ${(e.companions || []).includes(s.id) ? 'checked' : ''}>${esc(s.nickname || s.fullName)}${s.role === 'driver' && !/driver/i.test(s.nickname || s.fullName) ? ' (driver)' : ''}</label>`).join('')}</div></div>
      <div class="field full ev-meals" hidden>Meals the family will not eat at home — cooking is just a simple meal for the staff (baon and snacks are skipped)
        <div class="checks">${E.MEAL_SLOTS.filter(x => !x.info).map(x => `<label><input type="checkbox" name="skipMeals" value="${x.id}" ${(e.skipMeals || []).includes(x.id) ? 'checked' : ''}>${esc(x.label)}</label>`).join('')}</div></div>
      <div class="field full ev-clean" hidden>Heavy cleaning to do while the family is away (even if not yet due) — tick the ones you approve
        <div class="small muted">Best first: jobs that need the children away, are noisy or need low foot traffic. Approved jobs are spread over the trip days, and the regular one in the next 45 days is skipped.</div>
        ${(() => { // a table: tick · task · area · how often · minutes · people, with Check all / Clear
          const list = E.suggestDeepClean(state).slice(0, 14), ap = e.approvedTasks || [];
          return `<div class="ev-tasks-bar"><button type="button" class="btn sm" data-act="ev-approve-all" data-v="1">☑ Check all</button><button type="button" class="btn sm" data-act="ev-approve-all" data-v="0">☐ Clear</button>
            <span class="small muted" id="ev-approve-count">${list.filter(t => ap.includes(t.id)).length} of ${list.length} approved</span></div>
          <div class="ev-tasks"><table class="t"><thead><tr><th style="width:28px"></th><th>Task</th><th>Area</th><th>How often</th><th style="text-align:right">Min</th><th>People</th></tr></thead><tbody>
          ${list.map(t => `<tr><td><input type="checkbox" name="approve" value="${t.id}" id="ap-${t.id}" data-change="ev-approve" ${ap.includes(t.id) ? 'checked' : ''}></td>
            <td><label for="ap-${t.id}">${esc(t.name)}</label>${(t.constraints || []).length ? `<div class="small muted">${t.constraints.map(c => CONS_ICON[c] ? CONS_ICON[c][0] + ' ' + CONS_ICON[c][1].toLowerCase() : '').filter(Boolean).join(' · ')}</div>` : ''}</td>
            <td class="nowrap"><span class="dot" style="background:${cat(t.categoryId).color}"></span> ${esc(cat(t.categoryId).name)}</td><td class="nowrap">${esc(E.freqLabel(t.freq))}</td><td class="nowrap" style="text-align:right">${t.minutes}</td><td class="nowrap">${t.assistMode === 'required' ? '2' : '1'}</td></tr>`).join('')}
          </tbody></table></div>`; })()}</div>
      <label class="field full">Notes<input name="notes" value="${esc(e.notes || '')}" placeholder="e.g., Lola's birthday, 20 guests"></label>
      <div class="full small muted" id="ev-help"></div></form>`,
      `${id ? `<button class="btn danger" data-act="event-del" data-id="${id}">Delete event</button><span style="flex:1"></span>` : ''}<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="event-form">Save event</button>`, true);
    eventTypeUI();
  }
  function evApproveCount() {
    const all = [...document.querySelectorAll('#event-form input[name="approve"]')], el = document.getElementById('ev-approve-count');
    if (el) el.textContent = `${all.filter(x => x.checked).length} of ${all.length} approved`;
  }
  function eventTypeUI() {
    const f = document.getElementById('event-form'); if (!f) return;
    const x = E.EVENT_TYPES[f.type.value] || {};
    if (f.type.value === 'family_out' || f.type.value === 'travel') f.location.value = 'out';
    if (f.type.value === 'holiday') f.location.value = 'home';
    f.querySelector('.ev-place').hidden = f.location.value !== 'out';
    const yearly = f.repeat.value === 'yearly';
    f.querySelectorAll('.ev-once').forEach(el => { el.hidden = yearly; });
    f.querySelectorAll('.ev-yearly').forEach(el => { el.hidden = !yearly; });
    f.querySelector('.ev-exact').hidden = !yearly || f.sameDay.checked;
    f.querySelector('.ev-meals').hidden = f.type.value !== 'family_out';
    const multi = !yearly && f.end.value && f.end.value > f.date.value;
    f.querySelector('.ev-clean').hidden = !(multi && (f.type.value === 'travel' || f.type.value === 'family_out'));
    document.getElementById('ev-help').textContent = EVENT_EFFECT(x) + (f.location.value === 'out' ? ' Outside the house: the children are away for the event\'s hours, so the helpers can do those chores then.' : '') + ' Anyone ticked under "Who comes with the family" is away for those hours; their tasks go to whoever stays. Past days are not changed.';
  }

  // ---------- Rest-day compensation tracker (Phase 2, spec §5.6) ----------
  const LEDGER_CHIP = { earned: ['warn', 'Replacement day earned'], scheduled: ['info', 'Replacement day set'], used: ['ok', 'Used'], expired: ['bad', 'Expired'], paid: ['', 'Extra day\'s pay (payroll)'], nopay: ['', 'No extra pay (her choice)'], outside: ['', 'Paid outside the app'] };
  function restTracker() {
    const today = todayStr();
    const helpers = state.staff.filter(s => s.role !== 'driver' || (state.exceptions || []).some(e => e.staffId === s.id && e.type === 'rest_worked'));
    const blocks = helpers.map(s => {
      const L = E.restLedger(state, s.id, today), rc = E.restCompOf(s);
      if (!L.length) return '';
      const n = st => L.filter(x => x.status === st).length;
      return `<div class="section-title">${esc(s.nickname || s.fullName)} <span style="text-transform:none;letter-spacing:0">· earned ${n('earned') + n('scheduled')} · used ${n('used')} · expired ${n('expired')} · paid ${n('paid')}${n('nopay') ? ' · no extra pay ' + n('nopay') : ''}${n('outside') ? ' · paid outside the app ' + n('outside') : ''} · premium +${rc.premiumPct}% of day rate${rc.accumulate ? ` · may bank up to ${rc.maxDays} days for ${rc.expiryDays} days` : ''}</span></div>
        <table class="t"><tr><th>Rest day worked</th><th>Portion</th><th>Compensation</th><th>Use by</th><th>Status</th><th></th></tr>${L.map(x => `<tr><td>${fmtD(x.date)}</td><td>${x.portion === 'half' ? 'Half day (AM)' : 'Whole day'}</td>
          <td>${x.comp === 'replacement' ? 'Replacement day' + (x.replDate ? ' — ' + fmtD(x.replDate) : '') : { none: 'No extra pay (her choice)', outside: 'Paid outside the app' }[x.comp] || 'Extra day\'s pay'}</td><td>${x.comp === 'replacement' ? fmtD(x.expires) : '—'}</td>
          <td><span class="chip ${LEDGER_CHIP[x.status][0]}">${LEDGER_CHIP[x.status][1]}</span>${x.warn ? ` <span class="chip bad">${x.daysLeft} day${x.daysLeft === 1 ? '' : 's'} left</span>` : ''}</td>
          <td>${x.status === 'earned' ? `<form data-form="repl-set" class="row nowrap"><input type="hidden" name="id" value="${x.id}"><input type="date" class="inp" style="width:auto" name="replDate" min="${U.addDays(x.date, 1)}" max="${x.expires}" required aria-label="Replacement day"><button class="btn sm primary" type="submit">Set day off</button></form>`
            : x.status === 'scheduled' ? `<button class="btn sm" data-act="repl-clear" data-id="${x.id}">Clear date</button>` : ''}</td></tr>`).join('')}</table>`;
    }).join('');
    return `<div class="card"><h2>Rest-day compensation</h2>
      <div class="small muted" style="margin-bottom:6px">When a helper works on their rest day (by agreement, Handbook §2.4), record it above as "Worked on rest day" and choose premium pay or a replacement day. A replacement day must be used within ${state.settings.replacementWindowDays || 14} days (Settings), unless the helper's profile allows banking days. The app warns 3 days before a day expires.</div>
      ${blocks || '<div class="empty">No rest days worked yet.</div>'}</div>`;
  }

  // ---------- Phase 3 helpers ----------
  const P = MHM.Payroll;
  const peso = n => '₱' + P.fmt(n);
  const mask = s => s ? '•••• ' + String(s).replace(/[^0-9A-Za-z]/g, '').slice(-4) : '—';
  function readFile(file, maxMB) {
    return new Promise((res, rej) => {
      if (!file || !file.size) return res(null);
      if (file.size > (maxMB || 8) * 1048576) return rej(new Error('too big'));
      const fr = new FileReader(); fr.onerror = rej; fr.onload = () => res({ name: file.name, type: file.type, size: file.size, data: fr.result, at: todayStr() }); fr.readAsDataURL(file);
    });
  }
  /** Images are resized (and lose location data); PDFs and Word files are kept as they are. */
  async function readDoc(file) { if (!file || !file.size) return null; if (/^image\//.test(file.type)) { const data = await readImage(file, 1600); return { name: file.name, type: 'image/jpeg', data, at: todayStr() }; } return readFile(file, 8); }
  const fileLink = (f, label) => f ? `<a class="chip info" href="${f.data}" download="${esc(f.name || 'file')}" target="_blank">📎 ${esc(label || f.name || 'file')}</a>` : '<span class="muted small">none</span>';
  const curSalary = (sid, d) => P.salaryOn(state, sid, d || todayStr());
  const upcomingSalary = sid => P.history(state, sid).filter(h => h.effectiveFrom > todayStr());
  const SCHED_LABEL = sch => sch.type === 'everyN' ? `Every ${sch.n} days (paydays from ${fmtD(sch.anchor)})` : sch.type === 'weekday' ? `Every ${DOWL[sch.weekday]}` : sch.type === 'fixedDays' ? `Days ${(sch.days || []).join(' & ')} of the month` : 'Custom dates';
  const BASIS_LABEL = { monthly: 'Monthly', semiMonthly: 'Semi-monthly', weekly: 'Weekly', daily: 'Daily', custom: 'Custom per pay period' };

  // ---------- Biodata (spec §5.8.2) ----------
  const latestBio = sid => (state.biodata || []).filter(b => b.staffId === sid).sort((a, b) => b.version - a.version)[0];
  /** Data that comes from the latest biodata (the source of truth); shown read-only elsewhere. */
  function bioDerived(s) {
    const b = s && s.id ? latestBio(s.id) : null; if (!b) return { version: 0 };
    const d = b.data || {}, v = x => (x == null ? '' : String(x)).trim();
    const name = [d.firstName, d.middleName, d.lastName].map(v).filter(Boolean).join(' ');
    const phone = [d.globe, d.smart, d.sun, d.landline].map(v).filter(Boolean).join(' / ');
    const em = Array.isArray(d.emergency) ? (d.emergency.find(r => r && v(r[0])) || []) : [];
    const out = { version: b.version, fullName: name, birthDate: v(d.birthday), address: v(d.cityAddress), phone,
      emergency: em.length ? `${v(em[0])}${v(em[2]) ? ' (' + v(em[2]) + ')' : ''}${v(em[3]) ? ' · ' + v(em[3]) : ''}` : '',
      sss: v(d.sss), philhealth: v(d.philhealth), pagibig: v(d.pagibig), civil: v(d.civil), provAddress: v(d.provAddress), gender: v(d.gender) };
    Object.keys(out).forEach(k => { if (out[k] === '') delete out[k]; });
    return out;
  }
  /** Copy the biodata into the staff record and government numbers (biodata wins). */
  function applyBiodata(s) {
    const x = bioDerived(s); if (!x.version) return;
    ['fullName', 'birthDate', 'address', 'phone', 'emergency'].forEach(k => { if (x[k]) s[k] = x[k]; });
    s.gov = s.gov || {};
    ['sss', 'philhealth', 'pagibig'].forEach(ag => { if (x[ag]) s.gov[ag] = Object.assign(P.govOf(s, ag), { no: x[ag] }); });
  }
  const DERIVED_NOTE = (s, x) => `<span class="small derived-note">from biodata v${x.version}${s ? ` · <span class="clickable" data-act="staff-tab" data-id="${s.id}" data-tab="biodata">change it there</span>` : ''}</span>`;
  /** A read-only, greyed input for a value that comes from another form. */
  const roInput = (name, value, extra) => `<input name="${name}" value="${esc(value)}" readonly class="derived" tabindex="-1" ${extra || ''}>`;
  function bioField(f, v, ro) {
    const n = 'f_' + f.id, dis = ro ? ' disabled' : '';
    if (f.type === 'textarea') return `<label class="field full">${esc(f.label)}<textarea name="${n}"${dis}>${esc(v || '')}</textarea></label>`;
    if (f.type === 'choice') return `<label class="field">${esc(f.label)}<select name="${n}"${dis}>${opt('', '—', v || '')}${(f.options || []).map(o => opt(o, o, v || '')).join('')}</select></label>`;
    if (f.type === 'yesno') return `<label class="field full"><span><input type="checkbox" name="${n}" ${v ? 'checked' : ''}${dis}> ${esc(f.label)}</span></label>`;
    if (f.type === 'photo') return `<div class="field">${esc(f.label)}${v ? `<img src="${v}" alt="" style="max-width:140px;border-radius:8px">` : ''}${ro ? '' : `<input type="file" name="${n}" accept="image/*">`}</div>`;
    if (f.type === 'table') {
      const rows = Number(f.rows) || 3, cols = f.columns || [], val = Array.isArray(v) ? v : [];
      return `<div class="field full">${esc(f.label)}<div class="scroll-x"><table class="t"><tr><th>#</th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>
        ${Array.from({ length: rows }, (_, r) => `<tr><td>${r + 1}</td>${cols.map((c, ci) => `<td><input class="inp sm" name="${n}_${r}_${ci}" value="${esc((val[r] || [])[ci] || '')}"${dis}></td>`).join('')}</tr>`).join('')}</table></div></div>`;
    }
    return `<label class="field">${esc(f.label)}<input type="${f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}" name="${n}" value="${esc(v || '')}"${dis}></label>`;
  }
  function staffBiodata(s) {
    const T = state.biodataTemplate, cur = latestBio(s.id), vers = (state.biodata || []).filter(b => b.staffId === s.id).sort((a, b) => b.version - a.version);
    const viewV = ui.bioView && vers.find(b => b.id === ui.bioView), shown = viewV || cur, ro = !!viewV && viewV !== cur;
    const data = shown ? shown.data : { lastName: s.fullName.split(' ').slice(-1)[0], firstName: s.fullName.split(' ').slice(0, -1).join(' '), birthday: s.birthDate, cityAddress: s.address };
    const sections = [...new Set(T.fields.map(f => f.section || 'Other'))];
    return `<div class="row" style="margin-bottom:8px"><span class="small">Form: <b>${esc(T.name)}</b> v${T.version} · template file ${fileLink(T.file, 'original form')}</span><span class="spacer" style="flex:1"></span>
        <button class="btn sm" data-act="templates" data-v="biodata">Edit form fields</button></div>
      ${vers.length ? `<div class="small muted" style="margin-bottom:8px">Versions: ${vers.map(b => `<span class="clickable chip${shown && b.id === shown.id ? ' brand' : ''}" data-act="bio-view" data-id="${s.id}" data-v="${b.id}">v${b.version} · ${fmtD(b.savedAt.slice(0, 10))}</span>`).join(' ')}</div>` : '<div class="alert info">No biodata yet. Fill in the form from the helper\'s signed paper copy, then upload the signed scan.</div>'}
      ${ro ? `<div class="alert warn">Viewing an older version (read-only). <span class="clickable" data-act="bio-view" data-id="${s.id}" data-v="">Back to the latest</span></div>` : ''}
      <form data-form="biodata" class="form" id="bio-form"><input type="hidden" name="sid" value="${s.id}">
      ${sections.map(sec => `<div class="full section-title">${esc(sec)}</div>${T.fields.filter(f => (f.section || 'Other') === sec).map(f => bioField(f, data[f.id], ro)).join('')}`).join('')}
      <div class="full section-title">Signed copy</div>
      <div class="field">Signed scan of this biodata ${shown && shown.signed ? fileLink(shown.signed, 'signed biodata') : ''}${ro ? '' : '<input type="file" name="signed" accept="image/*,application/pdf">'}</div>
      ${ro ? '' : `<div class="full row"><button class="btn primary" type="submit">Save as version ${cur ? cur.version + 1 : 1}</button><span class="small muted">Each save keeps the previous version. The biodata is the source: name, birthday, address, contact numbers, emergency contact and SSS / PhilHealth / Pag-IBIG numbers go to the profile, contracts and contributions (shown greyed there).</span></div>`}</form>`;
  }

  // ---------- Contracts (spec §5.8.4) ----------
  const CONTRACT_STATUS = { draft: ['', 'Draft'], signed: ['ok', 'Signed'], superseded: ['', 'Superseded'], ended: ['', 'Ended'] };
  function staffContracts(s) {
    const list = (state.contracts || []).filter(c => c.staffId === s.id).sort((a, b) => (b.fields.startDate || '').localeCompare(a.fields.startDate || '') || b.version - a.version);
    return `<div class="row" style="margin-bottom:10px"><button class="btn primary" data-act="contract-new" data-id="${s.id}" data-t="provisional">+ Provisional contract</button>
        <button class="btn" data-act="contract-new" data-id="${s.id}" data-t="regular">+ Regular contract</button><span class="spacer" style="flex:1"></span><button class="btn sm" data-act="templates" data-v="provisional">Contract templates</button></div>
      ${list.length ? `<table class="t"><tr><th>Contract</th><th>Version</th><th>Dates</th><th>Salary</th><th>Status</th><th>Signed copy</th><th></th></tr>${list.map(c => `<tr>
        <td>${c.type === 'regular' ? 'Regular' : 'Provisional'}</td><td>v${c.version}</td><td class="nowrap">${fmtD(c.fields.startDate)} – ${c.fields.endDate ? fmtD(c.fields.endDate) : 'open'}</td>
        <td>${c.fields.salary ? peso(c.fields.salary) : '—'}</td><td><span class="chip ${CONTRACT_STATUS[c.status][0]}">${CONTRACT_STATUS[c.status][1]}</span></td><td>${fileLink(c.signed, 'signed')}</td>
        <td><button class="btn sm" data-act="contract-edit" data-id="${c.id}">${c.status === 'draft' ? 'Edit' : 'Open'}</button></td></tr>`).join('')}</table>`
        : '<div class="empty">No contracts yet. Start from the template; the fields are filled from the staff record and can be changed.</div>'}
      <p class="small muted">No document is generated in this prototype: print or fill your Word template, have it signed, then upload the signed copy here. Editing a signed contract saves a new version and marks the old one Superseded. A signed contract's salary goes into the salary history from its start date.</p>`;
  }
  function contractModal(staffId, id, type) {
    const s = staffById(staffId), c = id ? state.contracts.find(x => x.id === id) : null;
    type = c ? c.type : type;
    const T = state.contractTemplates[type], sal = curSalary(staffId);
    const start = type === 'regular' ? (E.regularizationDue(s) || todayStr()) : (s.hireDate || todayStr());
    const auto = { startDate: start, endDate: type === 'provisional' ? U.addDays(U.addMonths(start, 6), -1) : '', salary: sal ? P.monthlyOf(state, sal, P.payOf(s).schedule) : '', payMode: P.payOf(s).mode === 'gcash' ? 'GCash' : P.payOf(s).mode === 'mixed' ? 'Cash and GCash' : 'Cash',
      absenceRate: P.payOf(s).absenceRule === 'fixed' ? P.payOf(s).absenceAmount : '' };
    const val = f => c ? c.fields[f.id] : (auto[f.id] !== undefined && auto[f.id] !== '' ? auto[f.id] : f.default);
    const ro = c && c.status !== 'draft' && !ui.contractEdit;
    const field = f => {
      const n = 'c_' + f.id, v = val(f) == null ? '' : val(f), dis = ro ? ' disabled' : '';
      if (f.type === 'textarea') return `<label class="field full">${esc(f.label)}<textarea name="${n}"${dis}>${esc(v)}</textarea></label>`;
      if (f.id === 'payMode') return `<label class="field">${esc(f.label)}<select name="${n}"${dis}>${['Cash', 'GCash', 'Cash and GCash'].map(x => opt(x, x, v)).join('')}</select></label>`;
      return `<label class="field">${esc(f.label)}<input type="${f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}" name="${n}" value="${esc(v)}"${dis}></label>`;
    };
    modal(`${type === 'regular' ? 'Regular' : 'Provisional'} contract — ${esc(s.fullName)}${c ? ' · v' + c.version : ''}`, `<form data-form="contract" class="form" id="contract-form">
      <input type="hidden" name="sid" value="${staffId}"><input type="hidden" name="id" value="${c ? c.id : ''}"><input type="hidden" name="type" value="${type}">
      <div class="full small">Template: <b>${esc(T.name)}</b> v${T.version} ${fileLink(T.file, 'original Word file')}</div>
      ${(() => { const bx = bioDerived(s), bd = bx.birthDate || s.birthDate, age = bd ? Math.floor(U.daysBetween(bd, todayStr()) / 365.25) : '';
        const p = c && c.party ? c.party : { name: bx.fullName || s.fullName, civil: bx.civil || '', birthday: bd || '', age, address: bx.address || s.address || '', phone: bx.phone || s.phone || '' };
        return `<div class="full section-title" style="margin:4px 0 0">B. Kasambahay ${c && c.party ? '<span class="small" style="text-transform:none;letter-spacing:0">(as recorded on this contract)</span>' : DERIVED_NOTE(s, bx.version ? bx : { version: '—' })}</div>
        <label class="field">Pangalan ng Kasambahay${roInput('p_name', p.name)}</label><label class="field">Civil status${roInput('p_civil', p.civil || '—')}</label>
        <label class="field">Age and birthday${roInput('p_bday', (p.age !== '' ? p.age + ' yrs · ' : '') + (p.birthday ? fmtD(p.birthday) : '—'))}</label><label class="field">Tirahan at telepono${roInput('p_addr', [p.address, p.phone].filter(Boolean).join(' · ') || '—')}</label>
        <div class="full section-title" style="margin:4px 0 0">Terms</div>`; })()}
      ${T.fields.map(field).join('')}
      <label class="field">Status<select name="status"${ro ? ' disabled' : ''}>${Object.entries(CONTRACT_STATUS).map(([k, [, l]]) => opt(k, l, c ? c.status : 'draft')).join('')}</select></label>
      <div class="field">Signed copy ${c && c.signed ? fileLink(c.signed, 'signed') : ''}<input type="file" name="signed" accept="image/*,application/pdf"></div>
      ${c && (c.history || []).length ? `<div class="full small muted">History: ${c.history.map(h => esc(h)).join(' · ')}</div>` : ''}</form>`,
      ro ? `<button class="btn" data-act="contract-unlock" data-id="${c.id}">Edit (saves a new version)</button><button class="btn primary" type="submit" form="contract-form">Save signed copy / status</button>`
        : `<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="contract-form">Save contract</button>`, true);
  }

  // ---------- Pay & Vale tab ----------
  function staffPay(s) {
    const p = P.payOf(s), b = P.benOf(s), sch = p.schedule, d = todayStr(), sal = curSalary(s.id), next = P.nextDue(state, s, d);
    const hist = P.history(state, s.id).slice().reverse(), bens = (state.benefits || []).filter(x => x.staffId === s.id);
    const vales = (state.vales || []).filter(v => v.staffId === s.id), runs = (state.payRuns || []).filter(r => r.staffId === s.id).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
    return `<div class="grid g2"><div class="list">
        <div class="li"><span class="grow">Current salary</span><b>${sal ? peso(sal.rate) + ' ' + esc(BASIS_LABEL[sal.basis]).toLowerCase() : '—'}</b></div>
        ${upcomingSalary(s.id).map(h => `<div class="li"><span class="grow">Upcoming salary</span><span><b>${peso(h.rate)}</b> from ${fmtD(h.effectiveFrom)} <span class="chip info">applies automatically</span></span></div>`).join('')}
        <div class="li"><span class="grow">Day rate (for deductions)</span>${peso(P.dayRate(state, s, d))} <span class="muted small">= monthly ÷ ${state.settings.dayRateDivisor}</span></div>
        <div class="li"><span class="grow">Next pay period</span>${fmtD(next.start)} – ${fmtD(next.end)} · payday ${fmtDS(next.payday)}</div>
        <div class="li"><span class="grow">Vale balance</span><b>${peso(P.valeBalanceOf(state, s.id))}</b></div>
        <div class="li"><span class="grow">13th month so far (${d.slice(0, 4)})</span>${peso(P.thirteenth(state, s, +d.slice(0, 4), d).amount)}</div></div>
      <div class="row" style="align-items:flex-start"><button class="btn primary" data-act="run-new" data-id="${s.id}" data-p="${next.start}">Prepare pay run for ${fmtDS(next.payday)}</button><button class="btn" data-act="vale-new" data-id="${s.id}">+ Vale</button></div></div>
      <div class="section-title">Pay settings</div>
      <form data-form="pay-settings" class="form" id="pay-form" style="grid-template-columns:repeat(3,minmax(0,1fr))"><input type="hidden" name="sid" value="${s.id}">
        <label class="field">Pay schedule<select name="stype">${opt('everyN', 'Every N days', sch.type)}${opt('fixedDays', 'Fixed days of the month', sch.type)}${opt('weekday', 'Every weekday', sch.type)}${opt('list', 'Custom list of dates', sch.type)}</select></label>
        <label class="field">Every N days<input type="number" name="sn" min="1" max="31" value="${sch.n}"></label><label class="field">…counting from payday<input type="date" name="sanchor" value="${esc(sch.anchor)}"></label>
        <label class="field">Fixed days (e.g. 15, 30)<input name="sdays" value="${esc((sch.days || []).join(', '))}"></label>
        <label class="field">Weekday<select name="swd">${DOWL.map((n, i) => opt(i, n, sch.weekday)).join('')}</select></label>
        <label class="field">Custom dates (comma-separated)<input name="slist" value="${esc((sch.list || []).join(', '))}"></label>
        <label class="field">Payday on the rest day<select name="adjust">${opt('before', 'Pay the day before', p.adjust)}${opt('after', 'Pay the day after', p.adjust)}${opt('same', 'Same day', p.adjust)}</select></label>
        <label class="field">Payment mode<select name="mode">${opt('cash', 'Cash', p.mode)}${opt('gcash', 'GCash', p.mode)}${opt('mixed', 'Mixed', p.mode)}</select></label>
        <label class="field">GCash name<input name="gcashName" value="${esc(p.gcashName)}"></label>
        <label class="field">GCash number ${p.gcashNumber ? `<span class="muted">(${mask(p.gcashNumber)})</span>` : ''}<input name="gcashNumber" autocomplete="off" placeholder="${p.gcashNumber ? 'leave blank to keep' : ''}"></label>
        <label class="field">Absence deduction<select name="absenceRule">${opt('dayRate', 'Day rate (salary ÷ ' + state.settings.dayRateDivisor + ')', p.absenceRule)}${opt('fixed', 'Fixed ₱ per day (contract)', p.absenceRule)}</select></label>
        <label class="field">Fixed ₱ per absent day<input type="number" name="absenceAmount" min="0" value="${p.absenceAmount}"></label>
        <label class="field">Sick leave<select name="sickPaid">${opt('0', 'Unpaid (deducted)', p.sickPaid ? '1' : '0')}${opt('1', 'Paid', p.sickPaid ? '1' : '0')}</select></label>
        <label class="field">Warn if vale deductions exceed (% of pay)<input type="number" name="valeCapPct" min="1" max="100" value="${p.valeCapPct}"></label>
        <label class="field">Contributions<select name="contrib">${opt('shared', 'Shared per table', p.contrib)}${opt('employer', 'Employer pays all', p.contrib)}</select></label>
        <label class="field">13th month pay<select name="thirteenth">${opt('1', 'Yes', b.thirteenth ? '1' : '0')}${opt('0', 'No', b.thirteenth ? '1' : '0')}</select></label>
        <label class="field">Service incentive leave (days/yr after 1 year)<input type="number" name="silDays" min="0" max="30" value="${b.silDays}"></label>
        <label class="field">Birthday cash gift (₱, 0 = none)<input type="number" name="birthdayGift" min="0" value="${b.birthdayGift}"></label>
        <div class="full"><button class="btn primary" type="submit">Save pay settings</button> <span class="small muted">Schedule now: ${esc(SCHED_LABEL(sch))}.</span></div></form>
      <div class="grid g2"><div><div class="section-title">Salary history</div>
        <table class="t"><tr><th>From</th><th>Salary</th><th>Reason</th><th></th></tr>${hist.map(h => { const fromC = h.source === 'contract' || /contract v\d/i.test(h.reason || '');
          return `<tr class="${fromC ? 'derived-row' : ''}"><td>${fmtD(h.effectiveFrom)}${h.effectiveFrom > d ? ' <span class="chip info">upcoming</span>' : sal && h.id === sal.id ? ' <span class="chip ok">current</span>' : ''}</td><td>${peso(h.rate)} <span class="muted small">${esc(BASIS_LABEL[h.basis])}</span></td><td>${esc(h.reason)}</td>
          <td class="nowrap">${fromC ? `<span class="small derived-note" title="Comes from the signed contract — change it with a new contract version">from contract · <span class="clickable" data-act="staff-tab" data-id="${s.id}" data-tab="contracts">open</span></span>`
            : `<button class="btn sm" data-act="salary-edit" data-id="${h.id}">Edit</button> <button class="btn sm danger" data-act="salary-del" data-id="${h.id}" data-s="${s.id}" aria-label="Remove">✕</button>`}</td></tr>`; }).join('') || '<tr><td colspan="4" class="empty">No salary yet.</td></tr>'}</table>
        <div style="margin-top:8px"><button class="btn primary" data-act="salary-edit" data-s="${s.id}">Change salary (today or a future date)</button></div>
        <div class="small muted" style="margin-top:4px">A future salary starts automatically on its date; a pay period that spans the change is split by days.</div></div>
      <div><div class="section-title">Allowances, bonuses and other benefits</div>
        <table class="t"><tr><th>Benefit</th><th>Amount</th><th>When</th><th></th></tr>${bens.map(x => `<tr><td>${esc(x.name)} <span class="muted small">${esc(x.type)}</span>${x.note ? `<div class="small muted">${esc(x.note)}</div>` : ''}</td><td>${peso(x.amount)}</td>
          <td class="small">${x.schedule === 'once' ? fmtD(x.date) : x.schedule === 'perPayday' ? 'Every payday' : 'Monthly'}${x.start ? ' from ' + fmtD(x.start) : ''}${x.end ? ' to ' + fmtD(x.end) : ''}</td><td><button class="btn sm danger" data-act="benefit-del" data-id="${x.id}" data-s="${s.id}">✕</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">None.</td></tr>'}</table>
        <form data-form="benefit-add" class="form" style="margin-top:8px"><input type="hidden" name="sid" value="${s.id}">
          <label class="field">Type<select name="type">${[['allowance', 'Allowance (rice, load, transport, uniform)'], ['bonus', 'Bonus (Christmas, performance…)'], ['medical', 'Medical assistance (record only)'], ['custom', 'Custom']].map(([k, l]) => opt(k, l)).join('')}</select></label>
          <label class="field">Name<input name="name" required></label><label class="field">Amount (₱)<input type="number" name="amount" min="0" step="0.01" required></label>
          <label class="field">When<select name="schedule">${opt('once', 'Once (on a date)')}${opt('perPayday', 'Every payday')}${opt('monthly', 'Monthly (first payday of the month)')}</select></label>
          <label class="field">Date / from<input type="date" name="date" value="${d}"></label><label class="field">Until (optional)<input type="date" name="end"></label>
          <label class="field full">Note<input name="note" placeholder="No diagnosis needed for medical assistance"></label>
          <div class="full"><button class="btn" type="submit">+ Add</button></div></form></div></div>
      <div class="grid g2"><div><div class="section-title">Vale</div>${valeTable(vales, false)}</div>
      <div><div class="section-title">Pay runs</div><table class="t"><tr><th>Payday</th><th>Period</th><th>Net</th><th>Status</th></tr>${runs.map(r => `<tr class="clickable" data-act="run" data-id="${r.id}"><td>${fmtD(r.payday)}</td><td class="small">${fmtD(r.periodStart)} – ${fmtD(r.periodEnd)}</td><td>${peso(P.totals(r.lines).net)}</td><td>${runChip(r)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">None yet.</td></tr>'}</table></div></div>`;
  }
  const runChip = r => r.status === 'paid' ? '<span class="chip ok">Paid · locked</span>' : '<span class="chip warn">Draft</span>';
  function valeTable(vales, withStaff) {
    return `<table class="t"><tr>${withStaff ? '<th>Staff</th>' : ''}<th>Date</th><th>Amount</th><th>Repayment</th><th>Balance</th><th>Status</th></tr>${vales.map(v => {
      const bal = P.valeBalance(v);
      return `<tr class="clickable" data-act="vale" data-id="${v.id}">${withStaff ? `<td>${esc(sName(v.staffId))}</td>` : ''}<td>${fmtD(v.date)}</td><td>${peso(v.amount)}</td>
        <td class="small">${esc(valePlanText(v))}${['salary', 'mixed'].includes(v.method) && !v.authorization ? ' <span class="chip bad">no signed authorization</span>' : ''}</td><td><b>${peso(Math.max(0, bal))}</b></td>
        <td><span class="chip ${v.status === 'active' ? 'warn' : v.status === 'paid' ? 'ok' : ''}">${{ active: 'Active', paid: 'Paid', writtenOff: 'Written off' }[v.status]}</span></td></tr>`;
    }).join('') || `<tr><td colspan="${withStaff ? 6 : 5}" class="empty">No vale.</td></tr>`}</table>`;
  }
  const valePlanText = v => {
    const p = v.plan || {}, m = { salary: 'salary deduction', cash: 'cash repayment', gcash: 'GCash repayment', mixed: 'mixed' }[v.method];
    return m + (p.type === 'installment' ? ` · ${peso(p.amount)} per payday from ${fmtD(p.start)}` : p.type === 'lump' ? ` · lump sum on ${fmtD(p.date)}` : p.type === 'custom' ? ` · ${(p.items || []).length} scheduled amounts` : '');
  };

  // ---------- Contributions tab (per staff) ----------
  function staffContrib(s) {
    const d = todayStr(), y = +d.slice(0, 4), sil = P.silBalance(state, s, y), t13 = P.thirteenth(state, s, y, d);
    const months = []; for (let m = U.addMonths(d.slice(0, 7) + '-01', -5); m <= d; m = U.addMonths(m, 1)) months.push(m.slice(0, 7));
    return `<form data-form="gov" class="form" id="gov-form" style="grid-template-columns:repeat(5,minmax(0,1fr))"><input type="hidden" name="sid" value="${s.id}">
      ${Object.entries(P.AGENCIES).map(([k, l]) => { const g = P.govOf(s, k), bx = bioDerived(s); return `<div class="full section-title" style="margin:6px 0 0">${l}</div>
        ${bx[k] ? `<label class="field">Number ${DERIVED_NOTE(s, bx)}<input value="${esc(mask(bx[k]))}" readonly class="derived" tabindex="-1"><input type="hidden" name="${k}_no" value=""></label>`
          : `<label class="field">Number ${g.no ? `<span class="muted">(${mask(g.no)})</span>` : ''}<input name="${k}_no" autocomplete="off" placeholder="${g.no ? 'leave blank to keep' : 'or add it in the Biodata'}"></label>`}
        <label class="field">Registration<select name="${k}_status">${['not registered', 'applied', 'registered'].map(x => opt(x, x[0].toUpperCase() + x.slice(1), g.status)).join('')}</select></label>
        <label class="field">Date registered<input type="date" name="${k}_registered" value="${esc(g.registered)}"></label>
        <label class="field">Coverage starts<input type="date" name="${k}_coverage" value="${esc(g.coverage || s.hireDate)}"></label>
        <label class="field">Contribute<select name="${k}_enabled">${opt('1', 'Yes', g.enabled ? '1' : '0')}${opt('0', 'No', g.enabled ? '1' : '0')}</select></label>`; }).join('')}
      <div class="full"><button class="btn primary" type="submit">Save</button></div></form>
      <div class="section-title">Last 6 months</div>
      <table class="t"><tr><th>Month</th>${Object.values(P.AGENCIES).map(l => `<th>${l}</th>`).join('')}</tr>${months.map(m => `<tr><td>${MON[+m.slice(5) - 1]} ${m.slice(0, 4)}</td>${Object.keys(P.AGENCIES).map(ag => {
        const c = P.contribStatus(state, s, ag, m, d); return `<td>${c ? `${peso(c.ee)} + ${peso(c.er)} <span class="chip ${/Paid/.test(c.status) ? 'ok' : c.status === 'Late' ? 'bad' : 'warn'}">${c.status}</span>` : '<span class="muted">—</span>'}</td>`;
      }).join('')}</tr>`).join('')}</table>
      <div class="small muted" style="margin-top:4px">Employee + employer share. Mark payments in Contributions & Benefits.</div>
      <div class="grid g2" style="margin-top:12px"><div class="list"><div class="li"><span class="grow">13th month accrued ${y} (to today)</span>${peso(t13.amount)}</div>
        <div class="li"><span class="grow">Service incentive leave ${y}</span>${sil.entitled ? `${sil.balance} of ${sil.entitled} days left` : `eligible from ${fmtD(sil.eligibleFrom)}`}</div></div>
        <div class="small muted">SIL is used by recording "Paid leave" in Calendar. Unused days are paid out in final pay.</div></div>`;
  }

  // ---------- Templates (biodata form and contract templates) ----------
  function templatesModal(kind) {
    ui.tplKind = kind || ui.tplKind || 'biodata';
    const k = ui.tplKind, T = k === 'biodata' ? state.biodataTemplate : state.contractTemplates[k];
    const TYPES = k === 'biodata' ? ['text', 'textarea', 'date', 'number', 'choice', 'yesno', 'table', 'photo'] : ['text', 'textarea', 'date', 'number'];
    const rows = T.fields.map((f, i) => `<tr><td><input class="inp sm" name="label_${i}" value="${esc(f.label)}"></td>${k === 'biodata' ? `<td><input class="inp sm" name="section_${i}" value="${esc(f.section || '')}"></td>` : ''}
      <td><select class="inp sm" name="type_${i}">${TYPES.map(t => opt(t, t, f.type)).join('')}</select></td>
      <td><input class="inp sm" name="extra_${i}" value="${esc(k === 'biodata' ? (f.type === 'choice' ? (f.options || []).join(', ') : f.type === 'table' ? (f.columns || []).join(', ') + (f.rows ? ' | ' + f.rows : '') : '') : (f.default == null ? '' : f.default))}"></td>
      <td><input type="checkbox" name="del_${i}" aria-label="Remove"></td><input type="hidden" name="id_${i}" value="${esc(f.id)}"></tr>`).join('');
    modal('Forms & templates', `<div class="tabs">${[['biodata', 'Biodata form'], ['provisional', 'Provisional contract'], ['regular', 'Regular contract']].map(([x, l]) => `<button class="${k === x ? 'on' : ''}" data-act="templates" data-v="${x}">${l}</button>`).join('')}</div>
      <form data-form="template" id="tpl-form"><input type="hidden" name="kind" value="${k}"><input type="hidden" name="n" value="${T.fields.length}">
      <div class="form" style="margin-bottom:10px"><label class="field">Name<input name="name" value="${esc(T.name)}"></label>
        <div class="field">Original file (PDF, Word or photo) ${fileLink(T.file, T.file ? T.file.name : '')}<input type="file" name="file" accept=".pdf,.doc,.docx,image/*"></div></div>
      <div class="scroll-x" style="max-height:52vh;overflow:auto"><table class="t"><tr><th>Field label</th>${k === 'biodata' ? '<th>Section</th>' : ''}<th>Type</th><th>${k === 'biodata' ? 'Choices / table columns | rows' : 'Default value'}</th><th>Remove</th></tr>${rows}
        <tr><td><input class="inp sm" name="label_new" placeholder="+ New field"></td>${k === 'biodata' ? '<td><input class="inp sm" name="section_new"></td>' : ''}<td><select class="inp sm" name="type_new">${TYPES.map(t => opt(t, t)).join('')}</select></td><td><input class="inp sm" name="extra_new"></td><td></td></tr></table></div>
      <p class="small muted">Version ${T.version}. Saving creates version ${T.version + 1}; records already saved keep their values. ${k === 'biodata' ? 'Fields were set up from your Bio-Data form (formats/biodata.docx).' : 'Defaults were taken from your DOLE Form BK-1 contract (formats/).'}</p></form>`,
      `<button class="btn" data-act="close">Close</button><button class="btn primary" type="submit" form="tpl-form">Save template</button>`, true);
  }

  // ---------- Payroll view (spec §5.9) ----------
  function vPayroll() {
    const tab = ui.payTab || 'runs', d = todayStr();
    const staff = state.staff.filter(s => E.isActive(s, d) || (s.exitDate && s.exitDate >= U.addDays(d, -60)));
    const cards = staff.map(s => {
      const n = P.nextDue(state, s, d), sal = curSalary(s.id), vb = P.valeBalanceOf(state, s.id), draft = (state.payRuns || []).find(r => r.staffId === s.id && r.status === 'draft');
      return `<div class="card"><div class="row"><h3 style="margin:0;flex:1">${esc(s.nickname || s.fullName)}</h3>${sal ? `<span class="small muted">${peso(sal.rate)} ${esc(BASIS_LABEL[sal.basis]).toLowerCase()}</span>` : '<span class="chip bad">no salary</span>'}</div>
        <div class="small" style="margin:6px 0">Next payday <b>${fmtDS(n.payday)}</b> <span class="muted">(${fmtD(n.start)} – ${fmtD(n.end)})</span>${n.payday <= d ? ' <span class="chip bad">due</span>' : U.daysBetween(d, n.payday) <= 3 ? ' <span class="chip warn">soon</span>' : ''}</div>
        <div class="small muted">Vale balance ${peso(vb)} · ${esc(SCHED_LABEL(P.payOf(s).schedule))}</div>
        ${upcomingSalary(s.id).map(h => `<div class="small"><span class="chip info">Upcoming</span> ${peso(h.rate)} from ${fmtD(h.effectiveFrom)}</div>`).join('')}
        <div class="row" style="margin-top:8px">${draft ? `<button class="btn sm primary" data-act="run" data-id="${draft.id}">Open draft (${fmtDS(draft.payday)})</button>` : `<button class="btn sm primary" data-act="run-new" data-id="${s.id}" data-p="${n.start}">Prepare pay run</button>`}
        <button class="btn sm" data-act="vale-new" data-id="${s.id}">+ Vale</button><button class="btn sm" data-act="staff-tab" data-id="${s.id}" data-tab="pay">Pay settings</button></div></div>`;
    }).join('');
    const runs = [...(state.payRuns || [])].sort((a, b) => b.payday.localeCompare(a.payday));
    const body = tab === 'runs' ? `<div class="row" style="margin-bottom:8px"><button class="btn" data-act="slips-selected">🖨 Print selected payslips</button><span class="small muted">Tick pay runs below; each payslip prints on its own page with a kasambahay's copy and an employer's copy.</span></div>
      <div class="card flush scroll-x"><table class="t"><tr><th><input type="checkbox" data-change="slip-all" aria-label="Select all"></th><th>Payday</th><th>Staff</th><th>Period</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Status</th></tr>
      ${runs.map(r => { const t = P.totals(r.lines); return `<tr><td><input type="checkbox" class="slip-pick" value="${r.id}" aria-label="Select ${esc(sName(r.staffId))} ${fmtD(r.payday)}"></td><td class="clickable" data-act="run" data-id="${r.id}">${fmtD(r.payday)}</td><td class="clickable" data-act="run" data-id="${r.id}">${esc(sName(r.staffId))}</td><td class="small">${fmtD(r.periodStart)} – ${fmtD(r.periodEnd)}</td><td>${peso(t.gross)}</td><td>${peso(t.ded)}</td><td><b>${peso(t.net)}</b></td><td>${runChip(r)}</td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">No pay runs yet. Prepare one from a card above.</td></tr>'}</table></div>`
      : `<div class="row" style="margin-bottom:10px"><button class="btn primary" data-act="vale-new">+ New vale</button><span class="small muted">Contract: vale must not exceed one month's salary. Salary deductions need the helper's signed written authorization.</span></div>
        <div class="card flush scroll-x">${valeTable([...(state.vales || [])].sort((a, b) => b.date.localeCompare(a.date)), true)}</div>`;
    // staff who share the same next payday can be paid as one batch
    // a payday stays in the batch until all its pay runs are paid (unpaid drafts, plus each person's next due period)
    const groups = {};
    const addTo = (pd, s, n) => { const g = groups[pd] = groups[pd] || []; if (!g.some(x => x.s.id === s.id)) g.push({ s, n }); };
    (state.payRuns || []).filter(r => r.status === 'draft').forEach(r => { const s = staffById(r.staffId); if (s) addTo(r.payday, s, { start: r.periodStart, end: r.periodEnd, payday: r.payday }); });
    staff.forEach(s => { const n = P.nextDue(state, s, d); addTo(n.payday, s, n); });
    Object.keys(groups).forEach(pd => { const g = groups[pd]; if (g.every(({ s, n }) => (state.payRuns || []).some(r => r.staffId === s.id && r.periodStart === n.start && r.status === 'paid'))) delete groups[pd]; });
    const batch = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 3).map(([pd, list]) => {
      const runsFor = list.map(({ s, n }) => (state.payRuns || []).find(r => r.staffId === s.id && r.periodStart === n.start)).filter(Boolean);
      const paid = runsFor.filter(r => r.status === 'paid').length;
      return `<div class="li"><span class="time">${fmtDS(pd)}</span><span class="grow">${list.map(({ s }) => esc(s.nickname || s.fullName)).join(', ')} <span class="small muted">· ${runsFor.length} of ${list.length} prepared${paid ? ' · ' + paid + ' paid' : ''}</span></span>
        ${runsFor.length < list.length ? `<button class="btn sm primary" data-act="run-batch" data-p="${pd}">Prepare all (${list.length - runsFor.length})</button>` : ''}
        ${runsFor.length ? `<button class="btn sm" data-act="slips-batch" data-p="${pd}">🖨 Print ${runsFor.length} payslip${runsFor.length === 1 ? '' : 's'}</button>` : ''}</div>`;
    }).join('');
    return `<div class="head"><h1>Payroll & Vale</h1><span class="sub">Day rate = monthly salary ÷ ${state.settings.dayRateDivisor}</span></div>
      <div class="card" style="margin-bottom:16px"><h2>Payday batch</h2><div class="list">${batch || '<div class="empty">No staff.</div>'}</div>
        <div class="small muted" style="margin-top:4px">Everyone with the same payday is grouped: prepare all their pay runs at once, review each, then print all the payslips together.</div></div>
      <div class="grid g3">${cards}</div>
      <div class="tabs">${[['runs', 'Pay runs'], ['vale', `Vale (${(state.vales || []).filter(v => v.status === 'active').length} active)`]].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="pay-tab" data-v="${k}">${l}</button>`).join('')}</div>${body}`;
  }
  function runModal(id) {
    const r = state.payRuns.find(x => x.id === id); if (!r) return;
    const s = staffById(r.staffId), t = P.totals(r.lines), locked = r.status === 'paid', p = P.payOf(s);
    const line = (l, i) => `<tr><td>${l.kind === 'basic' ? 'Basic' : l.kind === 'add' ? 'Addition' : 'Deduction'}</td><td>${esc(l.desc)}${l.reason ? `<div class="small muted">Changed: ${esc(l.reason)}</div>` : ''}${!l.auto ? ' <span class="chip">added</span>' : ''}</td>
      <td style="text-align:right">${locked ? (l.kind === 'ded' ? '−' : '') + peso(l.amount) : `<input class="inp sm" style="width:110px;text-align:right" type="number" step="0.01" name="amt_${i}" value="${l.amount}">`}</td>
      ${locked ? '' : `<td><input type="checkbox" name="del_${i}" aria-label="Remove line"></td>`}</tr>`;
    modal(`Pay run — ${esc(s.fullName)} · payday ${fmtD(r.payday)}`, `<div class="row" style="margin-bottom:8px">${runChip(r)}<span class="small">Period ${fmtD(r.periodStart)} – ${fmtD(r.periodEnd)} · ${esc(SCHED_LABEL(p.schedule))}</span></div>
      ${(r.warnings || []).map(w => `<div class="alert warn">⚠ ${esc(w)}</div>`).join('')}
      <form data-form="run-lines" id="run-form"><input type="hidden" name="id" value="${r.id}">
      <table class="t"><tr><th>Kind</th><th>Line</th><th style="text-align:right">Amount</th>${locked ? '' : '<th>Remove</th>'}</tr>${r.lines.map(line).join('')}
        <tr class="group"><td></td><td>Gross (basic ${peso(t.basic)} + additions ${peso(t.add)})</td><td style="text-align:right">${peso(t.gross)}</td>${locked ? '' : '<td></td>'}</tr>
        <tr class="group"><td></td><td>Deductions</td><td style="text-align:right">−${peso(t.ded)}</td>${locked ? '' : '<td></td>'}</tr>
        <tr class="group"><td></td><td><b>Net pay</b></td><td style="text-align:right"><b>${peso(t.net)}</b></td>${locked ? '' : '<td></td>'}</tr></table>
      <div class="small muted" style="margin:6px 0">Day rate ${peso(r.dayRate)} = monthly salary ÷ ${r.divisor}. Vale balance after this run: ${peso(P.valeBalanceOf(state, s.id) - (locked ? 0 : r.lines.filter(l => l.code === 'vale').reduce((a, l) => a + l.amount, 0)))}.</div>
      ${locked ? '' : `<div class="form" style="margin-top:8px"><label class="field">Add line<select name="nkind">${opt('add', 'Addition')}${opt('ded', 'Deduction')}</select></label><label class="field">Description<input name="ndesc" placeholder="e.g., Incentive for covering 2 days"></label>
        <label class="field">Amount (₱)<input type="number" step="0.01" min="0" name="namt"></label><label class="field">Reason for any change (required if you edit a computed line)<input name="reason"></label></div>
        <div class="row" style="margin-top:10px"><button class="btn primary" type="submit">Save lines</button><button class="btn" type="button" data-act="run-recalc" data-id="${r.id}">Recalculate</button><span class="small muted">Recalculate rebuilds the computed lines from records; lines you added stay.</span></div>`}</form>
      ${locked ? `<div class="section-title">Payment</div><div class="list"><div class="li"><span class="grow">Paid on</span>${fmtD(r.payment.date)} · ${esc(r.payment.mode)}</div>
        ${r.payment.cash ? `<div class="li"><span class="grow">Cash</span>${peso(r.payment.cash)}${r.payment.envelope ? ' · ' + esc(r.payment.envelope) : ''}</div>` : ''}${r.payment.gcash ? `<div class="li"><span class="grow">GCash</span>${peso(r.payment.gcash)} · ref ${esc(r.payment.ref || '—')} ${fileLink(r.payment.proof, 'screenshot')}</div>` : ''}
        <div class="li"><span class="grow">Signed payslip</span>${fileLink(r.signedSlip, 'signed payslip')} <form data-form="run-slip" class="row"><input type="hidden" name="id" value="${r.id}"><input type="file" name="slip" accept="image/*,application/pdf"><button class="btn sm" type="submit">Upload</button></form></div></div>
        <p class="small muted">Locked after payment. Corrections go in as adjustment lines in the next pay run.</p>`
        : `<div class="section-title">Record payment (locks this run)</div><form data-form="run-pay" class="form" id="pay-rec"><input type="hidden" name="id" value="${r.id}">
        <label class="field">Date paid<input type="date" name="date" value="${todayStr()}" required></label><label class="field">Mode<select name="mode">${opt('Cash', 'Cash', p.mode === 'gcash' ? 'GCash' : p.mode === 'mixed' ? 'Split' : 'Cash')}${opt('GCash', 'GCash', p.mode === 'gcash' ? 'GCash' : '')}${opt('Split', 'Cash + GCash', p.mode === 'mixed' ? 'Split' : '')}</select></label>
        <label class="field">Cash amount<input type="number" step="0.01" name="cash" value="${p.mode === 'gcash' ? '' : t.net}"></label><label class="field">GCash amount<input type="number" step="0.01" name="gcash" value="${p.mode === 'gcash' ? t.net : ''}"></label>
        <label class="field">GCash reference no.<input name="ref"></label><label class="field">GCash screenshot<input type="file" name="proof" accept="image/*"></label>
        <label class="field full">Cash envelope note<input name="envelope" placeholder="optional"></label>
        <div class="full row"><button class="btn primary" type="submit">Record payment and lock</button></div></form>`}`,
      `${locked ? '' : `<button class="btn danger" data-act="run-del" data-id="${r.id}">Delete draft</button><span class="spacer" style="flex:1"></span>`}<button class="btn" data-act="run-print" data-id="${r.id}">🖨 Payslip</button>`, true);
  }
  /** Kasambahay payslip (RA 10361: a payslip every payday showing the cash paid and every deduction; employer keeps
      copies for 3 years). One page holds the kasambahay's copy and the employer's copy. */
  function payslipCopy(r, label) {
    const s = staffById(r.staffId), t = P.totals(r.lines), sal = curSalary(s.id, r.periodEnd), S = state.settings;
    const earn = r.lines.filter(l => l.kind !== 'ded'), ded = r.lines.filter(l => l.kind === 'ded');
    const vb = P.valeBalanceOf(state, s.id) - (r.status === 'paid' ? 0 : r.lines.filter(l => l.code === 'vale').reduce((a, l) => a + l.amount, 0));
    const absent = P.absenceDays(state, s, r.periodStart, r.periodEnd).reduce((a, x) => a + x.days, 0);
    const pos = ((state.contracts || []).filter(c => c.staffId === s.id && c.status !== 'superseded').sort((a, b) => b.version - a.version)[0] || { fields: {} }).fields.position || (s.role === 'driver' ? 'Driver' : 'Kasambahay');
    const er = ym => Object.keys(P.AGENCIES).map(ag => { const c = P.contribution(state, s, ag, ym); return c && c.er ? `${P.AGENCIES[ag]} ₱${P.fmt(c.er)}` : ''; }).filter(Boolean).join(', ');
    const hasContrib = ded.some(l => l.code === 'contrib');
    const cell = (l, i, arr) => `<tr><td>${esc(l.desc)}</td><td class="amt">${P.fmt(l.amount)}</td></tr>`;
    return `<div class="slip"><div class="slip-h"><div><b>PAY SLIP</b> <span class="slip-copy">${label}</span><div class="slip-sub">Kasambahay — RA 10361 (Batas Kasambahay)</div></div>
        <div style="text-align:right"><b>${esc(S.employerName || S.householdName)}</b><div class="slip-sub">${esc(S.householdAddress || '')}</div></div></div>
      <table class="slip-info"><tr><td><b>Kasambahay:</b> ${esc(s.fullName)}</td><td><b>Position:</b> ${esc(pos)}</td><td><b>Payday:</b> ${fmtD(r.payday)}</td></tr>
        <tr><td><b>Pay period:</b> ${fmtD(r.periodStart)} – ${fmtD(r.periodEnd)}</td><td><b>Salary:</b> ${sal ? '₱' + P.fmt(sal.rate) + ' ' + BASIS_LABEL[sal.basis].toLowerCase() : '—'}</td><td><b>Daily rate:</b> ₱${P.fmt(r.dayRate)} <span class="slip-sub">(÷${r.divisor})</span></td></tr>
        <tr><td><b>Days not worked (unpaid):</b> ${absent || 0}</td><td colspan="2"><b>Paid through:</b> ${r.payment ? esc(r.payment.mode) + ' on ' + fmtD(r.payment.date) + (r.payment.ref ? ' · ref ' + esc(r.payment.ref) : '') : '________________'}</td></tr></table>
      <div class="slip-cols"><table><tr><th>EARNINGS</th><th class="amt">₱</th></tr>${earn.map(cell).join('')}<tr class="tot"><td>Gross pay</td><td class="amt">${P.fmt(t.gross)}</td></tr></table>
        <table><tr><th>DEDUCTIONS</th><th class="amt">₱</th></tr>${ded.map(cell).join('') || '<tr><td>None</td><td></td></tr>'}<tr class="tot"><td>Total deductions</td><td class="amt">${P.fmt(t.ded)}</td></tr></table></div>
      <div class="slip-net">NET PAY RECEIVED: <b>₱${P.fmt(t.net)}</b></div>
      <div class="slip-sub">Vale balance after this payday: ₱${P.fmt(Math.max(0, vb))}.${hasContrib ? ` Employer's share paid separately (${r.payday.slice(0, 7)}): ${er(r.payday.slice(0, 7))}.` : ''} Deductions: only those allowed by law and the contract (contributions when the salary is ₱5,000 or more, authorized vale, unpaid absences).</div>
      <div class="sig"><div>Received the above amount in full — Kasambahay (signature over printed name) / date</div><div>Paid by — Employer (signature) / date</div></div></div>`;
  }
  function payslipHtml(r) {
    return `<div class="pg payslip">${payslipCopy(r, "KASAMBAHAY'S COPY")}<div class="slip-cut">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>${payslipCopy(r, "EMPLOYER'S COPY (keep for 3 years)")}</div>`;
  }
  /** Monthly contribution payment reference (household employer). Laid out after what each agency asks for:
      SSS — figures to generate the Payment Reference Number (PRN) in My.SSS; PhilHealth — the PhilHealth Payment Slip (PPS),
      Individual Kasambahay Payment Scheme; Pag-IBIG — the Member's Contribution Remittance Form (MCRF). */
  function printContribForm(m) {
    const S = state.settings, today = todayStr(), mon = MON[+m.slice(5) - 1] + ' ' + m.slice(0, 4);
    const staff = state.staff.filter(s => s.hireDate && s.hireDate.slice(0, 7) <= m && (!s.exitDate || s.exitDate.slice(0, 7) >= m));
    const sect = (ag, title, form, cols, row, extra) => {
      const list = staff.map(s => ({ s, c: P.contribStatus(state, s, ag, m, today) })).filter(x => x.c);
      if (!list.length) return '';
      const tot = list.reduce((a, x) => ({ ee: a.ee + x.c.ee, er: a.er + x.c.er, t: a.t + x.c.total }), { ee: 0, er: 0, t: 0 });
      return `<h2 class="cf-h">${title}</h2><div class="who">${form} &nbsp;·&nbsp; <b>Employer no.:</b> ${esc((S.employerNos || {})[ag] || '________________')} &nbsp;·&nbsp; <b>Applicable month:</b> ${mon} &nbsp;·&nbsp; <b>Due:</b> ${fmtD(list[0].c.due)}</div>
        <table><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>${list.map(x => `<tr>${row(x.s, x.c).map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}
        <tr class="fixed"><td colspan="${cols.length - 3}"><b>TOTAL TO PAY</b></td><td style="text-align:right">${P.fmt(tot.ee)}</td><td style="text-align:right">${P.fmt(tot.er)}</td><td style="text-align:right"><b>₱${P.fmt(tot.t)}</b></td></tr></table>
        <div class="cf-fill">${extra} &nbsp;&nbsp; Date paid: ______________ &nbsp;&nbsp; Paid at / channel: ____________________ &nbsp;&nbsp; Amount paid: ₱____________</div>`;
    };
    const num = (s, ag) => esc(P.govOf(s, ag).no || '________________'), n = v => `<span style="display:block;text-align:right">${P.fmt(v)}</span>`;
    const tSSS = P.tableFor(state, 'sss', m);
    const html = `<div class="pg cform"><h1><span>CONTRIBUTION PAYMENT REFERENCE — HOUSEHOLD EMPLOYER</span><span>${mon}</span></h1>
      <div class="who"><b>Household employer:</b> ${esc(S.employerName || S.householdName)} &nbsp;·&nbsp; <b>Address:</b> ${esc(S.householdAddress || '________________________________')}</div>
      ${sect('sss', 'SSS — Social Security System', 'Use these figures to generate the <b>Payment Reference Number (PRN)</b> in My.SSS / SSS app, then pay at an SSS-accredited channel.',
        ['Kasambahay', 'SS number', 'Monthly salary credit', 'EC', 'Employee share', 'Employer share (incl. EC)', 'Total'],
        (s, c) => [esc(s.fullName), num(s, 'sss'), n(c.basis), n(tSSS ? c.er - c.basis * Number(tSSS.erRate) - (c.note ? c.basis * Number(tSSS.eeRate) : 0) : 0), n(c.ee), n(c.er), n(c.total)], 'PRN: ______________________________')}
      ${sect('philhealth', 'PhilHealth', 'Information for the <b>PhilHealth Payment Slip (PPS)</b> — Individual Kasambahay Payment Scheme (pay at a PhilHealth office or accredited collecting agent).',
        ['Kasambahay', 'PhilHealth no. (PIN)', 'Monthly basic salary', 'Premium rate', 'Employee share', 'Employer share', 'Total'],
        (s, c) => [esc(s.fullName), num(s, 'philhealth'), n(c.basis), ((P.tableFor(state, 'philhealth', m).eeRate + P.tableFor(state, 'philhealth', m).erRate) * 100).toFixed(1) + '%', n(c.ee), n(c.er), n(c.total)], 'Official receipt no.: ________________')}
      ${sect('pagibig', 'Pag-IBIG Fund (HDMF)', 'Information for the <b>Member\'s Contribution Remittance Form (MCRF)</b> (pay at a Pag-IBIG branch or accredited channel).',
        ['Kasambahay', 'Pag-IBIG MID no.', 'Monthly compensation', 'Period', 'Employee share', 'Employer share', 'Total'],
        (s, c) => [esc(s.fullName), num(s, 'pagibig'), n(c.monthly), mon, n(c.ee), n(c.er), n(c.total)], 'Receipt / transaction no.: ________________')}
      <div class="note">Amounts come from the editable rate tables in the app (Contributions & Benefits) — check them against the agencies' current tables before paying. Below ₱5,000 a month the employer pays the employee's share too (RA 10361). After paying, record it with "Mark paid" and attach the receipt.</div>
      <div class="sig"><div>Prepared by / date</div><div>Paid by / date</div></div></div>`;
    setPage('landscape', 'Contribution payment reference form'); document.getElementById('print-root').innerHTML = html; printPreview();
  }
  function printPayslips(ids) {
    const runs = ids.map(id => state.payRuns.find(x => x.id === id)).filter(Boolean);
    if (!runs.length) { toast('Choose at least one pay run.'); return; }
    setPage(); document.getElementById('print-root').innerHTML = runs.map(payslipHtml).join(''); printPreview();
  }
  function valeModal(staffId) {
    const d = todayStr(), staff = state.staff.filter(s => E.isActive(s, d));
    modal('New vale (cash advance)', `<form data-form="vale-new" class="form" id="vale-form">
      <label class="field">Staff<select name="sid">${staff.map(s => opt(s.id, s.nickname || s.fullName, staffId || '')).join('')}</select></label><label class="field">Date given<input type="date" name="date" value="${d}" required></label>
      <label class="field">Amount (₱)<input type="number" name="amount" min="1" step="0.01" required></label><label class="field">Given via<select name="via">${opt('cash', 'Cash')}${opt('gcash', 'GCash')}</select></label>
      <label class="field">GCash reference no.<input name="ref"></label><label class="field">GCash screenshot<input type="file" name="proof" accept="image/*"></label>
      <label class="field full">Reason (optional)<input name="reason"></label>
      <label class="field">Repayment method<select name="method">${opt('salary', 'Salary deduction')}${opt('cash', 'Cash repayment')}${opt('gcash', 'GCash repayment')}${opt('mixed', 'Mixed')}</select></label>
      <label class="field">Plan<select name="ptype">${opt('installment', 'Installments per payday')}${opt('lump', 'Lump sum on a date')}${opt('custom', 'Custom schedule')}</select></label>
      <label class="field">Installment per payday (₱)<input type="number" name="pamount" min="0" step="0.01"></label><label class="field">Installments start (first payday) / lump-sum date<input type="date" name="pdate"></label>
      <label class="field full">Custom schedule — one per line: date | amount<textarea name="pitems" placeholder="2026-12-04 | 500&#10;2026-12-18 | 500"></textarea></label>
      <div class="field full">Signed authorization for salary deduction (photo or PDF) — required before anything is deducted<input type="file" name="auth" accept="image/*,application/pdf"></div></form>`,
      `<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="vale-form">Save vale</button>`, true);
  }
  function valeDetail(id) {
    const v = state.vales.find(x => x.id === id), bal = P.valeBalance(v);
    modal(`Vale — ${esc(sName(v.staffId))} · ${fmtD(v.date)}`, `<div class="grid g2"><div class="list">
        <div class="li"><span class="grow">Amount</span><b>${peso(v.amount)}</b> via ${esc(v.via)}${v.ref ? ' · ref ' + esc(v.ref) : ''} ${fileLink(v.proof, 'screenshot')}</div>
        <div class="li"><span class="grow">Repayment</span>${esc(valePlanText(v))}</div><div class="li"><span class="grow">Reason</span>${esc(v.reason || '—')}</div>
        <div class="li"><span class="grow">Signed authorization</span>${fileLink(v.authorization, 'authorization')}</div>
        <div class="li"><span class="grow">Balance</span><b>${peso(Math.max(0, bal))}</b></div></div>
      <div><form data-form="vale-auth" class="row"><input type="hidden" name="id" value="${v.id}"><input type="file" name="auth" accept="image/*,application/pdf"><button class="btn sm" type="submit">Upload authorization</button></form></div></div>
      <div class="section-title">Ledger</div><table class="t"><tr><th>Date</th><th>Entry</th><th>Amount</th><th>Running balance</th></tr><tr><td>${fmtD(v.date)}</td><td>Given</td><td>${peso(v.amount)}</td><td>${peso(v.amount)}</td></tr>
        ${(() => { let b = Number(v.amount); return (v.entries || []).slice().sort((a, c) => a.date.localeCompare(c.date)).map(e => { b -= Number(e.amount); return `<tr><td>${fmtD(e.date)}</td><td>Repayment — ${esc(e.via)}${e.ref ? ' · ref ' + esc(e.ref) : ''}</td><td>−${peso(e.amount)}</td><td>${peso(b)}</td></tr>`; }).join(''); })()}</table>
      ${v.status === 'active' ? `<div class="section-title">Record a direct repayment</div><form data-form="vale-repay" class="form"><input type="hidden" name="id" value="${v.id}">
        <label class="field">Date<input type="date" name="date" value="${todayStr()}"></label><label class="field">Amount<input type="number" name="amount" min="0.01" step="0.01" max="${bal}" required></label>
        <label class="field">Via<select name="via">${opt('cash', 'Cash')}${opt('gcash', 'GCash')}</select></label><label class="field">Reference no.<input name="ref"></label>
        <div class="full"><button class="btn" type="submit">Record repayment</button></div></form>` : ''}`,
      v.status === 'active' ? `<button class="btn danger" data-act="vale-writeoff" data-id="${v.id}">Write off</button>` : '', true);
  }

  // ---------- Contributions & Benefits view (spec §5.10) ----------
  function vContrib() {
    const d = todayStr(), m = ui.cMonth || U.addMonths(d.slice(0, 7) + '-01', -1).slice(0, 7), y = +m.slice(0, 4), S = state.settings;
    const staff = state.staff.filter(s => s.hireDate && s.hireDate.slice(0, 7) <= m && (!s.exitDate || s.exitDate.slice(0, 7) >= m));
    const rows = staff.flatMap(s => Object.keys(P.AGENCIES).map(ag => ({ s, ag, c: P.contribStatus(state, s, ag, m, d) }))).filter(x => x.c);
    const tot = rows.reduce((a, x) => ({ ee: a.ee + x.c.ee, er: a.er + x.c.er }), { ee: 0, er: 0 });
    const yearSum = staff.map(s => {
      const cells = Object.keys(P.AGENCIES).map(ag => { let ee = 0, er = 0, paid = 0, n = 0; for (let k = 1; k <= 12; k++) { const mm = y + '-' + String(k).padStart(2, '0'); const c = P.contribStatus(state, s, ag, mm, d); if (c) { ee += c.ee; er += c.er; n++; if (/Paid/.test(c.status)) paid++; } } return n ? `${peso(ee + er)} <span class="muted small">(${paid}/${n} paid)</span>` : '—'; });
      return `<tr><td>${esc(s.nickname || s.fullName)}</td>${cells.map(c => `<td>${c}</td>`).join('')}<td>${peso(P.thirteenth(state, s, y, [d, y + '-12-31'].sort()[0]).amount)}</td><td>${(sil => sil.entitled ? sil.balance + '/' + sil.entitled : '—')(P.silBalance(state, s, y))}</td></tr>`;
    }).join('');
    const medical = (state.benefits || []).filter(b => b.type === 'medical').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return `<div class="head"><h1>Contributions & Benefits</h1><div class="row"><button class="btn icon" data-act="cmonth" data-n="-1" aria-label="Previous month">◀</button><b>${MON[+m.slice(5) - 1]} ${m.slice(0, 4)}</b><button class="btn icon" data-act="cmonth" data-n="1" aria-label="Next month">▶</button></div><span class="spacer"></span>
      <button class="btn primary" data-act="contrib-form" data-m="${m}">🖨 Payment reference form (${MON[+m.slice(5) - 1]})</button></div>
      <div class="alert info">Rates are sample data from the editable tables below, not legal advice. Check current rates with SSS, PhilHealth and Pag-IBIG (spec §7).</div>
      <div class="card flush scroll-x"><table class="t"><tr><th>Staff</th><th>Agency</th><th>Salary basis</th><th>Employee</th><th>Employer</th><th>Total</th><th>Due</th><th>Status</th><th></th></tr>
        ${rows.map(({ s, ag, c }) => `<tr><td>${esc(s.nickname || s.fullName)}<div class="small muted">${P.govOf(s, ag).no ? mask(P.govOf(s, ag).no) : 'no number yet'}</div></td><td>${P.AGENCIES[ag]}</td><td>${peso(c.basis)}${c.note ? `<div class="small muted">${esc(c.note)}</div>` : ''}</td>
          <td>${peso(c.ee)}</td><td>${peso(c.er)}</td><td><b>${peso(c.total)}</b></td><td>${fmtD(c.due)}</td><td><span class="chip ${/Paid/.test(c.status) ? 'ok' : c.status === 'Late' ? 'bad' : 'warn'}">${c.status}</span>${c.rec ? `<div class="small muted">${fmtD(c.rec.paidOn)} · ${esc(c.rec.channel)}${c.rec.ref ? ' · ' + esc(c.rec.ref) : ''}</div>` : ''}</td>
          <td>${c.rec ? fileLink(c.rec.receipt, 'receipt') + ` <button class="btn sm" data-act="contrib-undo" data-k="${s.id}|${ag}|${m}">Undo</button>` : `<button class="btn sm primary" data-act="contrib-pay" data-k="${s.id}|${ag}|${m}">Mark paid</button>`}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">No contributions for this month.</td></tr>'}
        <tr class="group"><td colspan="3">Total ${MON[+m.slice(5) - 1]}</td><td>${peso(tot.ee)}</td><td>${peso(tot.er)}</td><td>${peso(tot.ee + tot.er)}</td><td colspan="3"></td></tr></table></div>
      <div style="height:16px"></div>
      <div class="card flush scroll-x"><table class="t"><tr><th>${y} summary</th>${Object.values(P.AGENCIES).map(l => `<th>${l} (EE + ER)</th>`).join('')}<th>13th month ${y}</th><th>SIL left</th></tr>${yearSum}</table></div>
      <div style="height:16px"></div>
      <div class="grid g2"><div class="card"><h2>Rate tables</h2><form data-form="ctables" id="ct-form"><div class="scroll-x"><table class="t"><tr><th>Agency</th><th>From</th><th>EE %</th><th>ER %</th><th>Floor ₱</th><th>Ceiling ₱</th><th>Step ₱</th><th>EC ₱ (low/high)</th></tr>
        ${state.contribTables.map(t => `<tr><td>${P.AGENCIES[t.agency]}<div class="small muted">${esc(t.note || '')}</div></td><td><input class="inp sm" type="date" name="from_${t.id}" value="${t.from}"></td>
          <td><input class="inp sm" style="width:64px" type="number" step="0.01" name="ee_${t.id}" value="${+(t.eeRate * 100).toFixed(3)}"></td><td><input class="inp sm" style="width:64px" type="number" step="0.01" name="er_${t.id}" value="${+(t.erRate * 100).toFixed(3)}"></td>
          <td><input class="inp sm" style="width:84px" type="number" name="floor_${t.id}" value="${t.floor}"></td><td><input class="inp sm" style="width:90px" type="number" name="ceil_${t.id}" value="${t.ceiling}"></td>
          <td><input class="inp sm" style="width:64px" type="number" name="step_${t.id}" value="${t.step || ''}"></td><td class="nowrap">${t.agency === 'sss' ? `<input class="inp sm" style="width:50px" type="number" name="ecl_${t.id}" value="${t.ecLow || 0}"> / <input class="inp sm" style="width:50px" type="number" name="ech_${t.id}" value="${t.ecHigh || 0}">` : '—'}</td></tr>`).join('')}</table></div>
        <div class="row" style="margin-top:10px"><button class="btn primary" type="submit">Save tables</button><select class="inp" style="width:auto" name="newAgency">${Object.entries(P.AGENCIES).map(([k, l]) => opt(k, l)).join('')}</select><button class="btn" type="button" data-act="ctable-add">+ New table (copy of latest)</button></div>
        <p class="small muted">Each month uses the newest table that started on or before it. Add a new table when an agency changes its rates; old months keep the old rates.</p></form></div>
      <div class="card"><h2>Household employer</h2><form data-form="employer" class="form" id="emp-form">
        ${Object.entries(P.AGENCIES).map(([k, l]) => `<label class="field">${l} employer no.<input name="no_${k}" value="${esc((S.employerNos || {})[k] || '')}"></label><label class="field">${l} due: day of next month (0 = last day)<input type="number" min="0" max="31" name="due_${k}" value="${(S.contribDue || {})[k] ?? 0}"></label>`).join('')}
        <label class="field">Employer pays all below (₱/month)<input type="number" name="threshold" value="${S.kasambahayEeThreshold}"></label><span></span>
        <div class="full"><button class="btn primary" type="submit">Save</button></div></form>
        <div class="section-title">Medical assistance given</div><div class="list">${medical.map(b => `<div class="li"><span class="time">${fmtD(b.date)}</span><span class="grow">${esc(sName(b.staffId))} — ${esc(b.name)}${b.note ? ` <span class="muted small">${esc(b.note)}</span>` : ''}</span>${peso(b.amount)}</div>`).join('') || '<div class="empty">None recorded. Add under Staff → Pay & Vale → benefits (type: Medical).</div>'}</div></div></div>`;
  }

  // ---------- Regularization and final pay ----------
  function regularizeModal(id) {
    const s = staffById(id), due = E.regularizationDue(s), sal = curSalary(id), b = P.benOf(s);
    modal(`Regularize — ${esc(s.fullName)}`, `<form data-form="regularize" class="form" id="reg-form"><input type="hidden" name="sid" value="${id}">
      <label class="field">Effective date<input type="date" name="date" value="${due && due > todayStr() ? due : todayStr()}" required></label>
      <label class="field">New monthly salary (₱)<input type="number" name="salary" min="0" step="0.01" value="${sal ? P.monthlyOf(state, sal, P.payOf(s).schedule) : ''}"></label>
      <label class="field">Birthday cash gift (₱, regular contract)<input type="number" name="birthdayGift" min="0" value="${b.birthdayGift || ''}"></label>
      <label class="field">Service incentive leave days/yr<input type="number" name="silDays" min="0" value="${b.silDays}"></label>
      <label class="field full"><span><input type="checkbox" name="incentive" checked> Add the provisional contract's cash incentive: ₱<input type="number" name="incAmt" value="${state.settings.regIncentive || 0}" style="width:90px" class="inp sm"> in the next pay run</span></label>
      <label class="field full"><span><input type="checkbox" name="contract" checked> Create a Regular contract (draft) from the template and mark the provisional contract Superseded</span></label>
      <div class="full small muted">Status becomes Regular. The salary change goes into the salary history from the effective date, and payroll uses it from that day. 13th month pay stays on.</div></form>`,
      `<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="reg-form">Regularize</button>`);
  }
  function finalPayModal(id, through) {
    const s = staffById(id); if (!s.exitDate) { toast('Set the last working day first (Profile → Exit).'); return; }
    const runs = (state.payRuns || []).filter(r => r.staffId === id && r.status === 'paid').sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    through = through || (runs.length ? runs[runs.length - 1].periodEnd : U.addDays(P.periodFor(state, s, s.exitDate).start, -1));
    const fp = P.finalPay(state, s, s.exitDate, through);
    modal(`Final pay — ${esc(s.fullName)}`, `<div class="row" style="margin-bottom:8px"><span class="small">Last working day ${fmtD(s.exitDate)} · ${esc(s.exitReason || '')}</span><span class="spacer" style="flex:1"></span>
        <label class="small">Salary already paid through <input type="date" class="inp" style="width:auto" value="${through}" data-change="fp-through" data-id="${id}"></label></div>
      <table class="t">${fp.lines.map(l => `<tr><td>${esc(l.desc)}</td><td style="text-align:right">${l.kind === 'ded' ? '−' : ''}${peso(l.amount)}</td></tr>`).join('')}<tr class="group"><td><b>Final pay</b></td><td style="text-align:right"><b>${peso(fp.total)}</b></td></tr></table>
      <p class="small muted">Unpaid salary, pro-rated 13th month and unused service incentive leave, minus the vale balance. Damage costs are never deducted automatically (spec §7). Prepare the actual payment as a pay run, adding lines as needed.</p>`, '', true);
  }

  // ---------- Phase 4 helpers ----------
  const F4 = MHM.Phase4;
  const COACH_TYPES = { commendation: ['ok', 'Commendation'], coaching: ['info', 'Coaching'], verbal: ['warn', 'Verbal reminder'], written: ['bad', 'Written warning'], final: ['bad', 'Final warning'] };
  const OUTCOMES = { ongoing: 'Ongoing', improved: 'Improved', escalated: 'Escalated' };
  const latestHb = () => { const v = (state.handbook.versions || []); return v.length ? v[v.length - 1] : null; };
  const hbSection = num => { const v = latestHb(), list = v ? v.sections : state.handbook.draft.sections; return list.find(s => s.num === num); };
  const refLinks = ref => esc(ref || '').replace(/§\s*(\d+(?:\.\d+)*)/g, (m, n) => `<span class="clickable" data-act="hb-section" data-n="${n}" style="text-decoration:underline dotted">${m}</span>`);
  function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
  function whoPanel(date, target) {
    if (!date) return '<div class="empty">Choose the date it happened (or was found).</div>';
    const w = F4.whoWasAssigned(state, date, target, { week: getWeek(date) });
    if (!w.categoryId && !w.task) return '<div class="empty">Choose an appliance, a task or a lead area.</div>';
    return `<div class="alert info" style="display:block"><b>Who was assigned on ${fmtDL(date)}?</b> ${w.fromRecord ? '<span class="chip">from the permanent record</span>' : '<span class="chip warn">from the current schedule (no stored record for this day)</span>'}
      <div style="margin-top:6px">${w.categoryId ? `${esc(cat(w.categoryId).name)} ${w.categoryId === 'driver' ? 'driver' : 'lead (custodian)'}: <b>${esc(w.leadId ? sName(w.leadId) : '—')}</b>` : ''}${w.appliance ? ` · item: ${esc(w.appliance.name)}` : ''}</div>
      <div class="small" style="margin-top:4px">Working that day: ${w.working.map(id => esc(sName(id))).join(', ') || '—'}</div>
      <table class="t" style="margin-top:6px;background:#fff"><tr><th>Time</th><th>Task</th><th>Main</th><th>Assistant</th><th>Mark recorded</th></tr>${w.occurrences.map(o => `<tr><td class="nowrap">${fmtT(o.start)}</td><td>${esc(o.name)}${o.skipped ? ' <span class="chip">skipped' + (o.skipReason ? ': ' + esc(o.skipReason) : '') + '</span>' : ''}</td><td>${esc(sName(o.mainId))}</td><td>${o.assistId ? esc(sName(o.assistId)) : '—'}</td>
        <td>${o.mark ? `<span class="chip ${o.mark.status === 'done' ? 'ok' : ['redo', 'partial'].includes(o.mark.status) ? 'warn' : 'bad'}">${esc(MARK_STATUS[o.mark.status])}</span>${o.mark.quality ? ' · ' + esc(o.mark.quality) : ''}${(o.mark.doneBy || []).length ? ' · done by ' + o.mark.doneBy.map(id => esc(sName(id))).join(', ') : ''}${o.mark.note ? `<div class="small muted">${esc(o.mark.note)}</div>` : ''}` : '<span class="muted">not marked</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No matching tasks that day.</td></tr>'}</table></div>`;
  }
  const incTarget = i => ({ applianceId: i.applianceId || undefined, templateId: i.templateId || undefined, categoryId: i.categoryId || undefined });

  // ---------- Accountability (spec §5.11) ----------
  function vAccount() {
    const tab = ui.accTab || 'incidents', d = todayStr();
    const incs = [...(state.incidents || [])].sort((a, b) => (b.happenedOn || b.foundOn).localeCompare(a.happenedOn || a.foundOn));
    const body = tab === 'incidents' ? `<div class="row" style="margin-bottom:10px"><button class="btn primary" data-act="inc-new">+ Record incident</button><span class="small muted">The app never deducts damage costs from pay (spec §7). Costs are for household records only.</span></div>
      <div class="card flush scroll-x"><table class="t"><tr><th>Date</th><th>Type</th><th>Item / task</th><th>Assigned then</th><th>Action</th><th>Status</th></tr>${incs.map(i => `<tr class="clickable" data-act="inc" data-id="${i.id}">
        <td class="nowrap">${fmtD(i.happenedOn || i.foundOn)}${i.happenedOn && i.foundOn !== i.happenedOn ? `<div class="small muted">found ${fmtD(i.foundOn)}</div>` : ''}</td><td>${esc(F4.INCIDENT_TYPES[i.type])}</td>
        <td>${esc(incLabel(i))}<div class="small muted">${esc((i.description || '').slice(0, 80))}</div></td><td class="small">${i.snapshot ? esc(i.snapshot.leadId ? sName(i.snapshot.leadId) + ' (lead)' : '') + (i.snapshot.mainIds || []).filter(x => x !== i.snapshot.leadId).map(x => ', ' + esc(sName(x))).join('') : '—'}</td>
        <td class="small">${esc(i.action || '—')}${i.coachingId ? ' · coaching' : ''}</td><td><span class="chip ${i.status === 'closed' ? 'ok' : 'warn'}">${i.status === 'closed' ? 'Closed' : 'Open'}</span></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No incidents recorded.</td></tr>'}</table></div>`
      : `<div class="row" style="margin-bottom:10px"><button class="btn primary" data-act="appl-edit">+ Add item</button><span class="small muted">Custodian on any date = that area's lead on that date, from the schedule record.</span></div>
      <div class="card flush scroll-x"><table class="t"><tr><th>Item</th><th>Location</th><th>Brand / model</th><th>Purchased</th><th>Warranty</th><th>Condition</th><th>Custodian area</th><th>Custodian today</th></tr>${(state.appliances || []).map(a => {
        const lead = a.categoryId === 'driver' ? state.staff.find(s => s.role === 'driver' && E.isActive(s, d)) : staffById(E.leadsOn(E.leadPlan(state, d), d).leads[a.categoryId]);
        const exp = a.warrantyUntil && a.warrantyUntil >= d && a.warrantyUntil <= U.addDays(d, 30);
        return `<tr class="clickable" data-act="appl-edit" data-id="${a.id}"><td>${a.photo ? `<img src="${a.photo}" alt="" style="height:28px;border-radius:4px;vertical-align:middle"> ` : ''}${esc(a.name)}</td><td>${esc(a.area)}</td><td>${esc([a.brand, a.model].filter(Boolean).join(' ') || '—')}</td>
          <td>${fmtD(a.purchased)}</td><td>${fmtD(a.warrantyUntil)}${exp ? ' <span class="chip warn">ends soon</span>' : ''}</td><td>${esc(a.condition)}</td><td><span class="dot" style="background:${cat(a.categoryId).color}"></span> ${esc(cat(a.categoryId).name)}</td><td>${lead ? esc(lead.nickname || lead.fullName) : '—'}</td></tr>`;
      }).join('')}</table></div>`;
    return `<div class="head"><h1>Accountability</h1><span class="sub">A clear, fair record instead of finger-pointing</span></div>
      <div class="tabs">${[['incidents', `Incidents (${incs.filter(i => i.status !== 'closed').length} open)`], ['appliances', `Appliances & equipment (${(state.appliances || []).length})`]].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="acc-tab" data-v="${k}">${l}</button>`).join('')}</div>${body}`;
  }
  const incLabel = i => { const a = i.applianceId && state.appliances.find(x => x.id === i.applianceId), t = i.templateId && state.tasks.find(x => x.id === i.templateId); return a ? a.name : t ? t.name : i.categoryId ? cat(i.categoryId).name + ' area' : '—'; };
  function incidentModal(id) {
    const i = id ? state.incidents.find(x => x.id === id) : { type: 'broken', foundOn: todayStr(), happenedOn: '', applianceId: '', templateId: '', categoryId: '', description: '', photos: [], explanation: '', finding: '', action: '', cost: '', status: 'open' };
    const date = i.happenedOn || i.foundOn;
    modal(id ? 'Incident — ' + esc(F4.INCIDENT_TYPES[i.type]) : 'Record incident', `<form data-form="incident" class="form" id="inc-form"><input type="hidden" name="id" value="${id || ''}">
      <label class="field">Type<select name="type">${Object.entries(F4.INCIDENT_TYPES).map(([k, l]) => opt(k, l, i.type)).join('')}</select></label><label class="field">Status<select name="status">${opt('open', 'Open', i.status)}${opt('closed', 'Closed', i.status)}</select></label>
      <label class="field">Date found<input type="date" name="foundOn" value="${i.foundOn}" required data-change="inc-who"></label><label class="field">Date it happened (if known)<input type="date" name="happenedOn" value="${i.happenedOn}" data-change="inc-who"></label>
      <label class="field">Appliance / item<select name="applianceId" data-change="inc-who">${opt('', '—', i.applianceId)}${state.appliances.map(a => opt(a.id, a.name, i.applianceId)).join('')}</select></label>
      <label class="field">Task<select name="templateId" data-change="inc-who">${opt('', '—', i.templateId)}${state.tasks.filter(t => t.active).map(t => opt(t.id, t.name, i.templateId)).join('')}</select></label>
      <label class="field">Or lead area<select name="categoryId" data-change="inc-who">${opt('', '—', i.categoryId)}${state.categories.map(c => opt(c.id, c.name, i.categoryId)).join('')}</select></label>
      <label class="field">Photos<input type="file" name="photos" accept="image/*" multiple></label>
      ${(i.photos || []).length ? `<div class="full row">${i.photos.map(p => `<img src="${p}" alt="" style="height:70px;border-radius:6px">`).join('')}</div>` : ''}
      <label class="field full">What was found<textarea name="description">${esc(i.description)}</textarea></label>
      <div class="full" id="who-panel">${whoPanel(date, incTarget(i))}</div>
      <label class="field full">Explanation from staff (typed by the employer)<textarea name="explanation">${esc(i.explanation)}</textarea></label>
      <label class="field full">Finding<input name="finding" value="${esc(i.finding)}"></label>
      <label class="field">Action taken<select name="action">${['', 'Repair', 'Replace', 'Coaching entry', 'No action', 'Other'].map(x => opt(x, x || '—', i.action)).join('')}</select></label>
      <label class="field">Cost (₱, household records only)<input type="number" step="0.01" min="0" name="cost" value="${esc(i.cost)}"></label></form>`,
      `${id ? `<button class="btn" data-act="coach-new" data-inc="${id}">+ Coaching entry from this</button>${i.coachingId ? ' <span class="chip info">coaching linked</span>' : ''}<span class="spacer" style="flex:1"></span><button class="btn danger" data-act="inc-del" data-id="${id}">Delete</button>` : ''}
       <button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="inc-form">Save</button>`, true);
  }
  function applianceModal(id) {
    const a = id ? state.appliances.find(x => x.id === id) : { name: '', area: '', categoryId: 'kitchen', brand: '', model: '', purchased: '', warrantyUntil: '', condition: 'Good', notes: '' };
    modal(id ? esc(a.name) : 'Add appliance or equipment', `<form data-form="appliance" class="form" id="appl-form"><input type="hidden" name="id" value="${id || ''}">
      <label class="field">Item<input name="name" required value="${esc(a.name)}"></label><label class="field">Location<select name="area">${opt('', '—', a.area)}${state.areas.map(x => opt(x, x, a.area)).join('')}</select></label>
      <label class="field">Brand<input name="brand" value="${esc(a.brand)}"></label><label class="field">Model<input name="model" value="${esc(a.model)}"></label>
      <label class="field">Purchased<input type="date" name="purchased" value="${esc(a.purchased)}"></label><label class="field">Warranty until<input type="date" name="warrantyUntil" value="${esc(a.warrantyUntil)}"></label>
      <label class="field">Condition<select name="condition">${['Good', 'Fair', 'Needs repair', 'Broken', 'Disposed'].map(x => opt(x, x, a.condition)).join('')}</select></label>
      <label class="field">Custodian (lead area)<select name="categoryId">${state.categories.map(c => opt(c.id, c.name, a.categoryId)).join('')}</select></label>
      <label class="field">Photo<input type="file" name="photo" accept="image/*"></label><label class="field">Notes<input name="notes" value="${esc(a.notes || '')}"></label></form>`,
      `${id ? `<button class="btn danger" data-act="appl-del" data-id="${id}">Remove</button><span class="spacer" style="flex:1"></span>` : ''}<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="appl-form">Save</button>`);
  }

  // ---------- Coaching log (spec §5.12) ----------
  function vCoaching() {
    const fs = ui.coachStaff || '', list = [...(state.coaching || [])].filter(c => !fs || c.staffId === fs).sort((a, b) => b.date.localeCompare(a.date));
    const counts = Object.keys(COACH_TYPES).map(k => `${COACH_TYPES[k][1]}: ${list.filter(c => c.type === k).length}`).join(' · ');
    return `<div class="head"><h1>Coaching Log</h1><span class="sub">Employer only</span><span class="spacer"></span>
      <select class="inp" style="width:auto" data-change="coach-staff" aria-label="Filter by staff">${opt('', 'All staff', fs)}${state.staff.map(s => opt(s.id, s.nickname || s.fullName, fs)).join('')}</select><button class="btn primary" data-act="coach-new">+ New entry</button></div>
      <div class="small muted" style="margin-bottom:10px">${counts}. Commendations are included on purpose, to keep the record balanced.</div>
      <div class="card flush scroll-x"><table class="t"><tr><th>Date</th><th>Staff</th><th>Type</th><th>What happened</th><th>Agreed plan</th><th>Follow-up</th><th>Outcome</th></tr>${list.map(c => `<tr class="clickable" data-act="coach" data-id="${c.id}">
        <td class="nowrap">${fmtD(c.date)}</td><td>${esc(sName(c.staffId))}</td><td><span class="chip ${COACH_TYPES[c.type][0]}">${COACH_TYPES[c.type][1]}</span></td><td>${esc((c.what || '').slice(0, 90))}${c.related && c.related.label ? `<div class="small muted">Re: ${esc(c.related.label)}</div>` : ''}</td>
        <td class="small">${esc((c.plan || '').slice(0, 70))}</td><td class="nowrap">${c.followUp ? fmtD(c.followUp) + (c.followUp <= todayStr() && c.outcome === 'ongoing' ? ' <span class="chip warn">due</span>' : '') : '—'}</td><td>${esc(OUTCOMES[c.outcome] || '—')}${c.ack ? ' · 📎' : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No entries yet.</td></tr>'}</table></div>`;
  }
  function coachingModal(id, pre) {
    pre = pre || {};
    const c = id ? state.coaching.find(x => x.id === id) : Object.assign({ date: todayStr(), staffId: '', type: 'coaching', related: { kind: '', ref: '', label: '' }, what: '', plan: '', followUp: U.addDays(todayStr(), 14), outcome: 'ongoing' }, pre);
    const hbList = (latestHb() || { sections: state.handbook.draft.sections }).sections;
    modal(id ? 'Coaching entry' : 'New coaching entry', `<form data-form="coaching" class="form" id="coach-form"><input type="hidden" name="id" value="${id || ''}">
      <label class="field">Date<input type="date" name="date" value="${c.date}" required></label><label class="field">Staff<select name="staffId" required>${state.staff.map(s => opt(s.id, s.nickname || s.fullName, c.staffId)).join('')}</select></label>
      <label class="field">Type<select name="type">${Object.entries(COACH_TYPES).map(([k, [, l]]) => opt(k, l, c.type)).join('')}</select></label>
      <label class="field">Related to<select name="related">${opt('', '—', c.related && c.related.kind ? c.related.kind + ':' + c.related.ref : '')}
        <optgroup label="Incidents">${(state.incidents || []).map(i => opt('incident:' + i.id, fmtD(i.happenedOn || i.foundOn) + ' · ' + F4.INCIDENT_TYPES[i.type] + ' · ' + incLabel(i), c.related ? c.related.kind + ':' + c.related.ref : '')).join('')}</optgroup>
        <optgroup label="Handbook">${hbList.map(s => opt('handbook:' + s.num, '§' + s.num + ' ' + s.title, c.related ? c.related.kind + ':' + c.related.ref : '')).join('')}</optgroup>
        ${c.related && c.related.kind === 'task' ? `<optgroup label="Task">${opt('task:' + c.related.ref, c.related.label, 'task:' + c.related.ref)}</optgroup>` : ''}</select></label>
      <label class="field full">What happened<textarea name="what" required>${esc(c.what)}</textarea></label>
      <label class="field full">Agreed action / plan<textarea name="plan">${esc(c.plan)}</textarea></label>
      <label class="field">Follow-up date (shows on Today)<input type="date" name="followUp" value="${esc(c.followUp)}"></label><label class="field">Outcome<select name="outcome">${Object.entries(OUTCOMES).map(([k, l]) => opt(k, l, c.outcome)).join('')}</select></label>
      <div class="field full">Staff acknowledgment (signed page) ${c.ack ? fileLink(c.ack, 'signed acknowledgment') : ''}<input type="file" name="ack" accept="image/*,application/pdf"></div></form>`,
      `${id ? `<button class="btn danger" data-act="coach-del" data-id="${id}">Delete</button><span class="spacer" style="flex:1"></span>` : ''}<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="coach-form">Save</button>`, true);
  }

  // ---------- Training (spec §5.13) ----------
  function vTraining() {
    const tab = ui.trTab || 'skills', d = todayStr(), skills = F4.skillsOf(state);
    const staff = state.staff.filter(s => E.isActive(s, d));
    let body = '';
    if (tab === 'skills') {
      const plan = E.leadPlan(state, d);
      body = `<div class="card flush scroll-x"><table class="t"><tr><th>Skill</th>${staff.map(s => `<th>${esc(s.nickname || s.fullName)}</th>`).join('')}</tr>${skills.map(k => `<tr><td>${esc(k.name)}</td>${staff.map(s => {
        const v = (state.skillLevels || {})[s.id + '|' + k.id] || { level: 0 }, led = k.id.startsWith('cat:') ? ((plan.counts[s.id] || {})[k.id.slice(4)] || 0) : null;
        return `<td><select class="inp sm" data-change="skill-level" data-k="${s.id}|${k.id}" aria-label="${esc(k.name)} for ${esc(s.fullName)}">${F4.LEVELS.map((l, i) => opt(i, l, v.level)).join('')}</select>
          <div class="small muted">${led != null ? `led ${led}×` : ''}${v.date ? (led != null ? ' · ' : '') + 'set ' + fmtD(v.date) : ''}</div></td>`;
      }).join('')}</tr>`).join('')}</table></div>
        <p class="small muted">"Led n×" is from the rotation (Leads & Rotation), so the two together show whether everyone is learning every area.</p>`;
    } else if (tab === 'onboarding') {
      body = `<div class="grid g2">${staff.filter(s => s.role === 'helper').map(s => {
        const plan = (state.onboarding || {})[s.id];
        return `<div class="card"><h3>${esc(s.fullName)} <span class="small muted">hired ${fmtD(s.hireDate)}</span></h3>${plan ? `<div class="list">${plan.map(x => `<div class="li"><input type="checkbox" data-change="onb-done" data-s="${s.id}" data-x="${x.id}" ${x.done ? 'checked' : ''} aria-label="Done">
          <span class="time" style="min-width:76px">${esc(x.when)}</span><span class="grow">${esc(x.item)}${x.done ? `<div class="small muted">done ${fmtD(x.done)}</div>` : x.due < d ? ` <span class="chip warn">due ${fmtD(x.due)}</span>` : `<div class="small muted">by ${fmtD(x.due)}</div>`}</span></div>`).join('')}</div>`
          : `<div class="empty">No onboarding plan.</div><button class="btn sm" data-act="onb-create" data-id="${s.id}">Create plan from hire date</button>`}</div>`;
      }).join('')}</div><p class="small muted">A plan is created automatically when a helper is added. Shadow mode (assist-only) for the first ${state.settings.shadowDays} days is applied by the scheduler.</p>`;
    } else if (tab === 'lessons') {
      body = `<div class="row" style="margin-bottom:10px"><button class="btn primary" data-act="lesson-new">+ New lesson</button><span class="small muted">Build from a handbook section, a task's instructions or a recipe.</span></div>
        <div class="grid g2">${(state.lessons || []).map(l => `<div class="card clickable" data-act="lesson" data-id="${l.id}"><h3>${esc(l.title)}</h3><div class="small muted">${esc(l.source && l.source.label || '')}</div>
          <div class="small" style="margin-top:6px">${esc(l.objective || '')}</div><div class="row" style="margin-top:6px">${staff.map(s => { const c = (l.completions || []).find(x => x.staffId === s.id); return `<span class="chip ${c ? 'ok' : ''}">${esc(s.nickname || s.fullName)}${c ? ' ✓ ' + fmtD(c.date) : ''}</span>`; }).join('')}</div></div>`).join('') || '<div class="card empty">No lessons yet.</div>'}</div>`;
    } else {
      const recs = [...(state.courses || [])].sort((a, b) => (b.completed || b.schedule || '').localeCompare(a.completed || a.schedule || ''));
      body = `<div class="grid g2"><div class="card"><h2>Course records</h2><table class="t"><tr><th>Staff</th><th>Course</th><th>Schedule</th><th>Cost</th><th>Completed</th><th>Certificate</th><th></th></tr>${recs.map(c => `<tr><td>${esc(sName(c.staffId))}</td><td>${esc(c.course)}<div class="small muted">${esc(c.provider)}</div></td><td>${esc(c.schedule)}</td>
          <td>${c.cost ? peso(c.cost) : '—'}</td><td>${fmtD(c.completed)}</td><td>${fileLink(c.certificate, 'certificate')}</td><td><button class="btn sm danger" data-act="course-del" data-id="${c.id}">✕</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">None yet.</td></tr>'}</table></div>
        <div class="card"><h2>Add a course</h2><form data-form="course" class="form" id="course-form">
          <label class="field">Staff<select name="staffId">${staff.map(s => opt(s.id, s.nickname || s.fullName)).join('')}</select></label>
          <label class="field">From the reference list<select name="ref" data-change="course-ref">${opt('', '— or type below —')}${F4.COURSE_REFS.map(([p, c]) => opt(p + '|' + c, p + ' — ' + c)).join('')}</select></label>
          <label class="field">Course<input name="course" required></label><label class="field">Provider<input name="provider"></label>
          <label class="field">Schedule<input name="schedule" placeholder="e.g., Saturdays, Jan–Mar 2027"></label><label class="field">Cost (₱)<input type="number" name="cost" min="0" step="0.01"></label>
          <label class="field">Completed on<input type="date" name="completed"></label><label class="field">Certificate<input type="file" name="certificate" accept="image/*,application/pdf"></label>
          <div class="full"><button class="btn primary" type="submit">Add course</button> <span class="small muted">Course names change: check TESDA, the Red Cross or your LGU for current offerings and schedules.</span></div></form></div></div>`;
    }
    return `<div class="head"><h1>Training</h1></div><div class="tabs">${[['skills', 'Skills matrix'], ['onboarding', 'Onboarding'], ['lessons', `Lessons (${(state.lessons || []).length})`], ['courses', 'Outside courses']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="tr-tab" data-v="${k}">${l}</button>`).join('')}</div>${body}`;
  }
  function lessonModal(id, src) {
    let l = id ? state.lessons.find(x => x.id === id) : null;
    if (!l) {
      l = { title: '', objective: '', steps: [], showMe: [], source: { kind: '', ref: '', label: '' }, completions: [] };
      if (src) {
        const [kind, ref] = src.split(':');
        if (kind === 'recipe') { const r = recipeById(ref); l = Object.assign(l, { title: 'Cook ' + r.name, objective: `Cook ${r.name} safely and to the recipe for ${householdSize()} people.`, steps: r.steps.slice(), showMe: ['Washes hands and prepares ingredients (mise en place)', 'Follows each step without the recipe card by the end', 'Keeps the stove attended; stores leftovers labeled'], source: { kind, ref, label: 'Recipe: ' + r.name } }); }
        if (kind === 'task') { const t = state.tasks.find(x => x.id === ref); l = Object.assign(l, { title: t.name, objective: `Do "${t.name}" to the house standard in about ${t.minutes} minutes.`, steps: t.instructions.length ? t.instructions.slice() : ['(Add the steps)'], showMe: ['Shows each step', 'Finishes within the time', 'Leaves tools clean and stored'], source: { kind, ref, label: 'Task: ' + t.name } }); }
        if (kind === 'handbook') { const s = hbSection(ref); l = Object.assign(l, { title: '§' + s.num + ' ' + s.title, objective: 'Understand and follow §' + s.num + '.', steps: String(s.body || '').split(/\n+/).filter(x => x.trim() && !/^\[/.test(x)), showMe: ['Explains the rule in her own words', 'Shows it in practice'], source: { kind, ref, label: 'Handbook §' + s.num } }); }
      }
    }
    const staff = state.staff.filter(s => E.isActive(s, todayStr()));
    modal(id ? esc(l.title) : 'New lesson', `${!id ? `<div class="row" style="margin-bottom:10px"><span class="small">Start from:</span><select class="inp" style="width:auto" data-change="lesson-src">${opt('', '—')}<optgroup label="Recipes">${(state.recipes || []).map(r => opt('recipe:' + r.id, r.name, src)).join('')}</optgroup>
        <optgroup label="Tasks with instructions">${state.tasks.filter(t => t.instructions.length).map(t => opt('task:' + t.id, t.name, src)).join('')}</optgroup><optgroup label="Handbook">${(latestHb() || state.handbook.draft).sections.map(s => opt('handbook:' + s.num, '§' + s.num + ' ' + s.title, src)).join('')}</optgroup></select></div>` : ''}
      <form data-form="lesson" class="form" id="lesson-form"><input type="hidden" name="id" value="${id || ''}"><input type="hidden" name="source" value="${esc(JSON.stringify(l.source || {}))}">
      <label class="field full">Title<input name="title" required value="${esc(l.title)}"></label><label class="field full">Objective<input name="objective" value="${esc(l.objective)}"></label>
      <label class="field full">Steps — one per line<textarea name="steps" style="min-height:120px">${esc(l.steps.join('\n'))}</textarea></label>
      <label class="field full">"Show me" checklist — one per line<textarea name="showMe">${esc(l.showMe.join('\n'))}</textarea></label>
      ${id ? `<div class="full section-title">Sign-off (by the employer)</div>${staff.map(s => { const c = (l.completions || []).find(x => x.staffId === s.id); return `<label class="field">${esc(s.fullName)}<input type="date" name="done_${s.id}" value="${c ? c.date : ''}"></label>`; }).join('')}` : ''}</form>`,
      `${id ? `<button class="btn danger" data-act="lesson-del" data-id="${id}">Delete</button><span class="spacer" style="flex:1"></span><button class="btn" data-act="lesson-print" data-id="${id}">🖨 Print</button>` : ''}<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="lesson-form">Save</button>`, true);
  }

  // ---------- Handbook (spec §5.14) ----------
  // ---------- Handbook as a document: read on screen, print ready (16 Nov 2026) ----------
  /** Section text → paragraphs and lists ("•", "-", "*" bullets; "1." / "a." numbered lines). */
  function hbBody(text) {
    const out = []; let list = null;
    const close = () => { if (list) { out.push(`<${list.tag}>${list.items.map(x => `<li>${x}</li>`).join('')}</${list.tag}>`); list = null; } };
    String(text || '').split(/\r?\n/).forEach(raw => {
      const l = raw.trim();
      if (!l) { close(); return; }
      const b = l.match(/^[•\-*–▪◦]\s*(.+)$/), n = l.match(/^(\d{1,2}|[a-z])[.)]\s+(.+)$/i);
      if (b || n) { const tag = b ? 'ul' : 'ol'; if (!list || list.tag !== tag) { close(); list = { tag, items: [] }; } list.items.push(esc((b || n)[b ? 1 : 2])); return; }
      close();
      out.push(/^[A-Z][A-Za-z ,'&/()-]{2,60}:$/.test(l) ? `<p class="hb-lead">${esc(l)}</p>` : `<p>${esc(l)}</p>`); // "Morning routine:" style lead-ins in bold
    });
    close();
    return out.join('');
  }
  function handbookDoc(v, opts) {
    const hb = state.handbook, secs = F4.sortSections(v.sections || []), S = state.settings, print = opts && opts.print;
    const anchor = s => 'hb-' + String(s.num).replace(/\W+/g, '-');
    const toc = secs.filter(s => F4.level(s.num) <= 2).map(s => `<div class="hb-toc-row l${F4.level(s.num)}"><span>${esc(s.num)}&nbsp;&nbsp;${esc(s.title)}</span>${print ? '' : ''}</div>`).join('');
    const sections = secs.map(s => { const lv = Math.min(3, F4.level(s.num)), tag = ['h2', 'h3', 'h4'][lv - 1];
      return `<section class="hb-sec l${lv}" id="${anchor(s)}"><${tag}><span class="hb-num">${esc(s.num)}</span> ${esc(s.title)}</${tag}>${hbBody(s.body)}</section>`; }).join('');
    const ver = v.version ? 'Version ' + esc(String(v.version)) : 'Draft';
    return `<div class="hb-doc${print ? ' print' : ''}">
      <div class="hb-cover${print ? ' pg' : ''}"><div class="hb-cover-in"><div class="hb-house">${esc(S.householdName)}</div><h1>${esc(hb.title || 'House Helper Handbook')}</h1>
        <div class="hb-ver">${ver}${v.publishedOn ? ' · ' + fmtD(v.publishedOn) : ''}</div>${S.householdAddress ? `<div class="hb-addr">${esc(S.householdAddress)}</div>` : ''}
        <div class="hb-cover-note">Please read this handbook carefully. Ask the employer about anything that is not clear.</div></div></div>
      <div class="hb-tocpage${print ? ' pg' : ''}"><h2 class="hb-toc-h">Contents</h2>${toc}</div>
      <div class="hb-content${print ? ' pg' : ''}">${sections || '<p><i>No sections yet.</i></p>'}</div>
      ${print ? `<div class="hb-ack pg"><h2>Acknowledgment</h2><p>I have received, read and understood the ${esc(hb.title || 'House Helper Handbook')} (${ver}) of the ${esc(S.householdName)}. I agree to follow it, and I know I may ask the employer about anything that is not clear.</p>
        ${state.staff.filter(s => E.isActive(s, todayStr())).map(s => `<div class="hb-sign"><div><span>${esc(s.fullName)}</span>Name</div><div><span></span>Signature</div><div><span></span>Date</div></div>`).join('')}
        <div class="hb-sign"><div><span>${esc(S.employerName || '')}</span>Employer</div><div><span></span>Signature</div><div><span></span>Date</div></div></div>` : ''}</div>`;
  }
  function printHandbook(ver) {
    const hb = state.handbook, cur = latestHb();
    const v = ver === 'draft' || !cur ? { version: '', publishedOn: '', sections: hb.draft.sections } : (hb.versions.find(x => x.version === ver) || cur);
    document.getElementById('print-root').innerHTML = handbookDoc(v, { print: true });
    setPage('', (hb.title || 'Handbook') + (v.version ? ' · v' + v.version : ' · draft')); printPreview();
  }
  function vHandbook() {
    const hb = state.handbook, tab = ui.hbTab || 'read', cur = latestHb(), d = todayStr();
    const staff = state.staff.filter(s => E.isActive(s, d));
    let body = '';
    if (tab === 'read') {
      const vsel = ui.hbRead || (cur ? cur.version : 'draft'), v = vsel === 'draft' || !cur ? { version: '', publishedOn: '', sections: hb.draft.sections } : (hb.versions.find(x => x.version === vsel) || cur);
      body = `<div class="row" style="margin-bottom:10px"><select class="inp" style="width:auto" data-change="hb-read" aria-label="Version">${hb.versions.map(x => opt(x.version, 'v' + x.version + ' — published ' + fmtD(x.publishedOn) + (cur && x.version === cur.version ? ' (current)' : ''), vsel)).join('')}${opt('draft', 'Draft (not published)', vsel)}</select>
        <span class="spacer" style="flex:1"></span><button class="btn" data-act="hb-print" data-v="${esc(vsel)}">🖨 Print handbook</button><button class="btn primary" data-act="hb-tab" data-v="sections">✏️ Edit</button></div>
        <div class="card hb-screen">${handbookDoc(v)}</div>`;
    } else if (tab === 'sections') {
      const secs = F4.sortSections(hb.draft.sections);
      body = `${hb.outline ? `<div class="alert warn" style="display:block"><b>Starter outline.</b> The section numbers come from the references in your task library; the titles are my best guess and the text is empty.
          Import your current handbook (Word .docx) with the button above, or put it in <code>formats/handbook.docx</code> and reopen the app, then publish it as v1.0. Sections 14 (Pet care) and 15 (Driver) are suggested drafts.</div>` : ''}
        <form data-form="hb-draft" id="hb-form"><input type="hidden" name="n" value="${secs.length}">
        ${secs.map((s, i) => `<div class="card" style="margin-bottom:10px;padding:12px"><div class="row"><input class="inp" style="width:80px" name="num_${i}" value="${esc(s.num)}" aria-label="Section number"><input class="inp" style="flex:1" name="title_${i}" value="${esc(s.title)}" aria-label="Section title">
          <label class="small"><input type="checkbox" name="del_${i}"> Remove</label></div><textarea class="inp" style="margin-top:6px;min-height:${F4.level(s.num) === 1 && !s.body ? 40 : 90}px" name="body_${i}" aria-label="Section ${esc(s.num)} text">${esc(s.body)}</textarea></div>`).join('')}
        <div class="card" style="padding:12px"><div class="row"><input class="inp" style="width:80px" name="num_new" placeholder="e.g. 4.8"><input class="inp" style="flex:1" name="title_new" placeholder="+ New section title"></div><textarea class="inp" style="margin-top:6px" name="body_new" placeholder="Text"></textarea></div>
        <div class="row" style="margin-top:12px;position:sticky;bottom:0;background:var(--bg);padding:8px 0"><button class="btn primary" type="submit">Save draft</button><button class="btn" type="button" data-act="hb-publish">Publish as v${F4.nextVersion(cur && cur.version)}</button>
        <span class="small muted">Draft changes don't affect published versions. Blank lines separate paragraphs.</span></div></form>`;
    } else if (tab === 'versions') {
      body = `<div class="card flush"><table class="t"><tr><th>Version</th><th>Published</th><th>Sections</th><th>Note</th><th>Acknowledged by</th><th></th></tr>${[...hb.versions].reverse().map(v => `<tr><td><b>v${esc(v.version)}</b></td><td>${fmtD(v.publishedOn)}</td><td>${v.sections.length}</td><td>${esc(v.note || '')}</td>
        <td class="small">${(state.handbookAcks || []).filter(a => a.version === v.version).map(a => esc(sName(a.staffId))).join(', ') || '—'}</td><td><button class="btn sm" data-act="hb-export" data-v="${esc(v.version)}">⬇ Word</button> <button class="btn sm" data-act="hb-view" data-v="${esc(v.version)}">View</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nothing published yet. Edit the sections, then publish v1.0.</td></tr>'}</table></div>`;
    } else {
      body = cur ? `<div class="card flush scroll-x"><table class="t"><tr><th>Staff</th><th>v${esc(cur.version)} (current)</th><th>Signed page</th><th>Upload signed page</th><th>Earlier versions</th></tr>${staff.map(s => {
        const a = (state.handbookAcks || []).find(x => x.staffId === s.id && x.version === cur.version), old = (state.handbookAcks || []).filter(x => x.staffId === s.id && x.version !== cur.version);
        return `<tr><td>${esc(s.fullName)}</td><td>${a ? `<span class="chip ok">Signed ${fmtD(a.signedOn)}</span>` : '<span class="chip warn">Not yet</span>'}</td><td>${a ? fileLink(a.file, 'signed page') : '—'}</td>
          <td><form data-form="hb-ack" class="row nowrap"><input type="hidden" name="sid" value="${s.id}"><input type="date" class="inp" style="width:auto" name="date" value="${d}"><input type="file" name="file" accept="image/*,application/pdf"><button class="btn sm" type="submit">Save</button></form></td>
          <td class="small">${old.map(x => 'v' + esc(x.version) + ' ' + fmtD(x.signedOn)).join(', ') || '—'}</td></tr>`;
      }).join('')}</table></div><p class="small muted">Print the acknowledgment page from the Word export, have it signed, then upload it here. Each new version needs a new signature.</p>` : '<div class="card empty">Publish the handbook first; acknowledgments are per version.</div>';
    }
    return `<div class="head"><h1>Handbook</h1><span class="sub">${esc(hb.title)} · ${cur ? 'current v' + esc(cur.version) + ' (' + fmtD(cur.publishedOn) + ')' : 'not published yet'}</span><span class="spacer"></span>
      <button class="btn" data-act="hb-import">⬆ Import from Word</button><input type="file" id="hb-file" accept=".docx" hidden data-change="hb-import"><button class="btn primary" data-act="hb-export" data-v="${cur ? esc(cur.version) : 'draft'}">⬇ Export to Word</button></div>
      <div class="tabs">${[['read', '📖 Read'], ['sections', '✏️ Edit draft'], ['versions', `Versions (${hb.versions.length})`], ['acks', 'Acknowledgments']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="hb-tab" data-v="${k}">${l}</button>`).join('')}</div>${body}`;
  }
  function addendumFor(s) {
    const c = (state.contracts || []).filter(x => x.staffId === s.id && x.status !== 'superseded').sort((a, b) => b.version - a.version)[0], f = c ? c.fields : {}, sal = curSalary(s.id), p = P.payOf(s);
    return { name: s.fullName, rows: [['Position', f.position || (s.role === 'driver' ? 'Driver' : 'Kasambahay')], ['Status', s.status[0].toUpperCase() + s.status.slice(1)], ['Start date', fmtD(f.startDate || s.hireDate)],
      ['Monthly salary', sal ? '₱' + P.fmt(P.monthlyOf(state, sal, p.schedule)) : ''], ['Payday schedule', f.payday || SCHED_LABEL(p.schedule)], ['Payment mode', f.payMode || { cash: 'Cash', gcash: 'GCash', mixed: 'Cash and GCash' }[p.mode]],
      ['Rest day', s.restDay === '' || s.restDay == null ? '' : DOWL[s.restDay]], ['Working hours', f.hours || ''], ['Benefits', f.benefits || ''], ['Leave', f.leave || ''], ['Notice period', f.notice || '']] };
  }
  function exportModal(ver) {
    const d = todayStr(), staff = state.staff.filter(s => E.isActive(s, d)), hb = state.handbook;
    modal('Export handbook to Word', `<form data-form="hb-export" class="form" id="hbx-form">
      <label class="field">Version<select name="version">${hb.versions.map(v => opt(v.version, 'v' + v.version + ' (' + fmtD(v.publishedOn) + ')', ver)).join('')}${opt('draft', 'Current draft (not published)', ver)}</select></label>
      <label class="field">Paper<select name="paper">${opt('A4', 'A4', state.settings.paper)}${opt('Letter', 'Letter', state.settings.paper)}</select></label>
      <div class="field full">Section 13 addendum and signature lines for<div class="checks">${staff.map(s => `<label><input type="checkbox" name="staff" value="${s.id}" checked>${esc(s.fullName)}</label>`).join('')}</div></div>
      <div class="full small muted">The file has a cover page, a table of contents, the numbered sections, Section 13 filled from each person's contract and pay settings, and an acknowledgment page to sign. Open it in Word to print.</div></form>`,
      `<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="hbx-form">⬇ Download .docx</button>`);
  }

  // ---------- Reports (spec §5.15) ----------
  function reportData(tab, from, to) {
    const d = todayStr(), S = state.settings, nm = id => sName(id);
    if (tab === 'workload') return { head: ['Staff', 'Working days', 'Tasks (main)', 'Minutes', 'Load points', 'Points / working day', 'Heavy tasks', 'Delegated to them'], rows: F4.workload(state, from, to, d).map(r => [nm(r.staffId), r.days, r.tasks, r.min, r.pts, r.perDay, r.heavy, r.delegated]) };
    if (tab === 'completion') { const by = ui.rBy || 'person'; return { head: [by === 'person' ? 'Staff' : by === 'category' ? 'Lead area' : 'Task', 'Tasks', '% done', '% needs redo', '% not done', 'Partly done', 'Unmarked', 'Good', 'OK', 'Poor'], rows: F4.completion(state, from, to, by, d).sort((a, b) => b.total - a.total).map(g => [by === 'person' ? nm(g.key) : by === 'category' ? cat(g.key).name : g.key, g.total, g.pctDone, g.pctRedo, g.pctNot, g.partial, g.unmarked, g.good, g.ok, g.poor]) }; }
    if (tab === 'rotation') { const plan = E.leadPlan(state, to), cats = state.categories.filter(c => c.id !== 'driver'); return { head: ['Staff', ...cats.map(c => c.name)], rows: state.staff.filter(s => s.role === 'helper').map(s => [nm(s.id), ...cats.map(c => ((plan.counts[s.id] || {})[c.id]) || 0)]) }; }
    if (tab === 'payroll') return { head: ['Month', 'Staff', 'Pay runs', 'Basic', 'Additions', 'Gross', 'Deductions', 'Net', 'Payment mode'], rows: F4.payrollSummary(state, from, to).map(r => [r.month, nm(r.staffId), r.runs, P.r2(r.basic), P.r2(r.add), P.r2(r.gross), P.r2(r.ded), P.r2(r.net), r.modes]) };
    if (tab === 'vale') return { head: ['Staff', 'Given in period', 'Repaid in period', 'Outstanding now'], rows: F4.valeSummary(state, from, to).map(r => [nm(r.staffId), P.r2(r.given), P.r2(r.repaid), P.r2(r.outstanding)]) };
    if (tab === 'contrib') return { head: ['Month', 'Agency', 'Employee', 'Employer', 'Total', 'Paid', 'Due', 'Late'], rows: F4.contributionSummary(state, from, to, d).map(r => [r.month, P.AGENCIES[r.agency], P.r2(r.ee), P.r2(r.er), P.r2(r.total), r.paid, r.due, r.late]) };
    if (tab === 'absences') return { head: ['Staff', 'Half days', 'Day-offs without pay', 'Unauthorized absences', 'Sick leave', 'Paid leave', 'Rest days worked'], rows: F4.absenceSummary(state, from, to).map(r => [nm(r.staffId), r.half, r.dayoff, r.unauthorized, r.sick, r.paidLeave, r.restWorked]) };
    const x = F4.incidentSummary(state, from, to), rows = [];
    Object.entries(x.byType).forEach(([k, n]) => rows.push(['By type', F4.INCIDENT_TYPES[k], n]));
    Object.entries(x.byCategory).forEach(([k, n]) => rows.push(['By lead area', cat(k).name, n]));
    Object.entries(x.byPerson).forEach(([k, n]) => rows.push(['By person assigned', nm(k), n]));
    rows.push(['Total', x.total + ' incident(s)', 'cost ₱' + P.fmt(x.cost)]);
    return { head: ['Group', 'Item', 'Count'], rows };
  }
  const REPORTS = [['workload', 'Workload balance'], ['completion', 'Completion & quality'], ['rotation', 'Rotation coverage'], ['payroll', 'Payroll'], ['vale', 'Vale'], ['contrib', 'Contributions'], ['absences', 'Absences'], ['incidents', 'Incidents']];
  function vReports() {
    const d = todayStr(), tab = ui.rTab || 'workload', from = ui.rFrom || d.slice(0, 8) + '01', to = ui.rTo || d;
    const r = reportData(tab, from, to), num = v => typeof v === 'number';
    return `<div class="head"><h1>Reports</h1><span class="spacer"></span><label class="small">From <input type="date" class="inp" style="width:auto" value="${from}" data-change="r-from"></label><label class="small">to <input type="date" class="inp" style="width:auto" value="${to}" data-change="r-to"></label>
      <button class="btn" data-act="r-range" data-v="month">This month</button><button class="btn" data-act="r-range" data-v="year">This year</button></div>
      <div class="tabs">${REPORTS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="r-tab" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="row" style="margin-bottom:10px">${tab === 'completion' ? `<select class="inp" style="width:auto" data-change="r-by">${opt('person', 'By person', ui.rBy || 'person')}${opt('category', 'By lead area', ui.rBy || 'person')}${opt('task', 'By task', ui.rBy || 'person')}</select>` : ''}
        <span class="spacer" style="flex:1"></span><button class="btn" data-act="r-csv">⬇ CSV</button><button class="btn" data-act="r-print">🖨 Print</button></div>
      <div class="card flush scroll-x"><table class="t"><tr>${r.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${r.rows.map(row => `<tr>${row.map(c => `<td${num(c) ? ' style="text-align:right"' : ''}>${esc(num(c) ? c.toLocaleString('en-PH') : c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${r.head.length}" class="empty">No data for this period.</td></tr>`}</table></div>
      <p class="small muted">${tab === 'workload' || tab === 'completion' ? 'Past days come from the permanent schedule record. ' : ''}${tab === 'rotation' ? 'Times each helper led each area since the rotation history start (Settings). ' : ''}CSV opens in Excel or Google Sheets.</p>`;
  }

  // ---------- later phases ----------
  const LATER = {
    month: ['Month & Year views', 2, 'Month calendar of periodic tasks, rest days, absences, paydays and rotation changes; a 12-month grid for quarterly, semi-annual and yearly tasks, vehicle registration/insurance/PMS, regularization dates and the 13th-month due date. Also Event mode (Guests / Party / Travel / Sickness).'],
    meals: ['Meals & Recipes', 2, 'Weekly menu planner (breakfast, snacks, baon, lunch, dinner, staff meals) with a recipe library. Planned meals create cooking tasks for the Kitchen Lead at the right time with the recipe attached. The sample Chicken Adobo recipe will be seeded.'],
    payroll: ['Payroll & Vale', 3, 'Pay settings per person, salary history with pro-rating, custom paydays, pay runs, payslips with every line, and the vale (cash advance) ledger with signed authorization and deduction caps.'],
    contrib: ['Contributions & Benefits', 3, 'SSS, PhilHealth and Pag-IBIG records with editable rate tables, due-date reminders, 13th month, service incentive leave, bonuses and allowances.'],
    account: ['Accountability', 4, 'Appliance register with area custodians and an incident log that shows who was assigned on the date, using the permanent schedule records this prototype already keeps.'],
    coaching: ['Coaching Log', 4, 'Commendations, coaching, reminders and warnings tied to tasks or incidents, with follow-up dates on the dashboard.'],
    training: ['Training', 4, 'Skills matrix, lessons built from the handbook and recipes, the new-hire onboarding plan and outside courses (TESDA, Red Cross).'],
    handbook: ['Handbook', 4, 'The House Helper Handbook as versioned, numbered sections, linked from tasks, with signed acknowledgments and Word export.'],
    reports: ['Reports', 4, 'Workload balance, completion and quality, rotation coverage, payroll, vale, contributions, absences and incidents — with CSV export.'],
  };
  function vLater() {
    const x = LATER[ui.view] || ['Coming later', '', ''];
    return `<div class="head"><h1>${esc(x[0])}</h1><span class="chip brand">Phase ${x[1]}</span></div><div class="card" style="max-width:720px"><p>${esc(x[2])}</p>
      <p class="small muted">Not part of this Phase 1 prototype. See spec §8 for the phase plan.</p></div>`;
  }

  // ---------- occurrence modal ----------
  function occModal(key, date) {
    const r = getWeek(date), o = r.occurrences.find(x => x.key === key);
    if (!o) { toast('Task not found in this week.'); return; }
    const t = state.tasks.find(x => x.id === o.templateId), m = state.marks[key] || {};
    const frozen = !!o.frozen, ov = state.occOverrides[key];
    const staff = state.staff.filter(s => E.isActive(s, o.date));
    const defDone = m.doneBy || [o.mainId, o.assistId].filter(Boolean);
    const c = cat(o.categoryId);
    modal(esc(o.name), `<div class="row" style="margin-bottom:10px"><span class="chip"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</span><span class="tag badge">${o.badge}</span>
        <span class="tag ${o.difficulty}">${o.difficulty === 'H' ? 'Heavy' : 'Light'}</span><span class="chip">${esc({ essential: 'Essential', standard: 'Standard', canMove: 'Can move' }[o.priority] || '')}</span>
        ${o.locked ? '<span class="chip info">🔒 Override</span>' : ''}${frozen ? '<span class="chip">Permanent record</span>' : ''}</div>
      <div class="grid g2"><div class="list">
        <div class="li"><span class="grow">Date</span>${fmtDL(o.date)}</div>
        <div class="li"><span class="grow">Time</span>${fmtT(o.start)}–${fmtT(o.end)} <span class="muted small">(window ${fmtT(o.ws)}–${fmtT(o.we)}, ${o.minutes} min)</span></div>
        <div class="li"><span class="grow">Main</span><b>${esc(sName(o.mainId))}</b></div>
        <div class="li"><span class="grow">Assistant</span>${o.assistId ? esc(sName(o.assistId)) + ` <span class="muted small">(${o.assistMinutes} min)</span>` : '—'}</div>
        ${o.leadId && o.leadId !== o.mainId ? `<div class="li"><span class="grow">Category lead</span>${esc(sName(o.leadId))}</div>` : ''}
        ${o.handbookRef ? `<div class="li"><span class="grow">Handbook</span>${refLinks(o.handbookRef)}</div>` : ''}
        ${o.menu ? `<div class="li"><span class="grow">Menu</span>${o.recipeId ? `<span class="clickable" data-act="recipe" data-id="${o.recipeId}"><b>📖 ${esc(o.menu)}</b></span>` : esc(o.menu)}</div>` : ''}</div>
      <div>${o.whyNot ? `<div class="alert warn"><b>Why:</b> ${esc(o.whyNot)}</div>` : ''}${o.flags.filter(f => FLAG_TEXT[f]).map(f => `<div class="alert ${['conflict', 'unassigned', 'unplaced', 'noAssistant'].includes(f) ? 'warn' : 'info'}">${esc(FLAG_TEXT[f])}</div>`).join('')}
        ${o.overrideReason ? `<div class="alert info">Override reason: ${esc(o.overrideReason)}</div>` : ''}
        ${t && t.instructions.length ? `<div class="section-title" style="margin-top:0">Instructions</div><ol class="small" style="margin:0;padding-left:18px">${t.instructions.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
        ${o.notes ? `<div class="small">${esc(o.notes)}</div>` : ''}</div></div>
      <div class="section-title">Mark this task</div>
      <form data-form="mark" class="form" id="mark-form"><input type="hidden" name="key" value="${esc(key)}"><input type="hidden" name="date" value="${o.date}">
        <label class="field">Status<select name="status">${Object.entries(MARK_STATUS).map(([k, l]) => opt(k, l, m.status || 'done')).join('')}</select></label>
        <label class="field">Quality<select name="quality">${opt('', '—', m.quality || '')}${opt('good', 'Good', m.quality)}${opt('ok', 'OK', m.quality)}${opt('poor', 'Poor', m.quality)}</select></label>
        <div class="field full">Done by<div class="checks">${staff.map(s => `<label><input type="checkbox" name="doneBy" value="${s.id}" ${defDone.includes(s.id) ? 'checked' : ''}>${esc(s.nickname || s.fullName)}</label>`).join('')}</div></div>
        <label class="field full">Note<input name="note" value="${esc(m.note || '')}" placeholder="optional"></label>
        <div class="full row"><button class="btn primary" type="submit">Save mark</button><button class="btn" type="button" data-act="coach-new" data-k="${esc(key)}" data-d="${o.date}">+ Coaching note</button>${state.marks[key] ? '<button class="btn" type="button" data-act="mark-clear" data-k="' + esc(key) + '">Clear mark</button>' : ''}
        ${m.markedAt ? `<span class="small muted">Marked by ${esc(m.markedBy)} · ${m.markedAt.slice(0, 16).replace('T', ' ')}</span>` : ''}</div></form>
      ${frozen ? '<div class="alert info" style="margin-top:14px">🔒 Past day — the assignment is a permanent record and cannot be changed. Record who actually did it under "Done by".</div>' : o.oneOffId ? `<div class="section-title">One-off task</div><button class="btn danger" data-act="oneoff-del" data-id="${o.oneOffId}">Delete one-off task</button>` : `
      <div class="section-title">Override (locked — kept when the schedule re-generates)</div>
      <form data-form="occ-ov" class="form" id="ov-form"><input type="hidden" name="key" value="${esc(key)}"><input type="hidden" name="orig" value="${o.date}">
        <label class="field">Main<select name="mainId">${staff.map(s => opt(s.id, s.nickname || s.fullName, o.mainId)).join('')}</select></label>
        <label class="field">Assistant (helpers only)<select name="assistId">${opt('', 'None', o.assistId || '')}${staff.filter(s => s.role !== 'driver' || s.id === o.assistId).map(s => opt(s.id, s.nickname || s.fullName, o.assistId || '')).join('')}</select></label>
        <label class="field">Date<input type="date" name="date" value="${o.date}"></label>
        <label class="field">Start time (optional)<input type="time" name="start" value="${ov && ov.start ? ov.start : ''}"></label>
        <label class="field full"><span><input type="checkbox" name="skip" ${o.skipped ? 'checked' : ''}> Skip this occurrence</span></label>
        <label class="field full">Reason (optional)<input name="reason" value="${esc(ov ? ov.reason : '')}" placeholder="e.g., Helper B is training in the kitchen"></label>
        <div class="full" id="impact"></div>
        <div class="full row"><button class="btn" type="button" data-act="occ-impact">Preview load impact</button><button class="btn primary" type="submit">Save override</button>
        ${ov ? `<button class="btn danger" type="button" data-act="occ-ov-del" data-k="${esc(key)}">Remove override</button>` : ''}</div></form>`}`, '', true);
  }
  function weekPtsFor(st, dates) {
    const out = {};
    [...new Set(dates.map(U.mondayOf))].forEach(m => {
      const r = E.generateWeek(st, m, { today: todayStr(), history: st.history });
      Object.entries(r.weekLoads).forEach(([id, w]) => { out[id] = (out[id] || 0) + w.pts; });
    });
    return out;
  }
  function impactHtml(before, after) {
    return '<div class="alert info"><div>' + state.staff.filter(s => s.role === 'helper' && (before[s.id] || after[s.id])).map(s => {
      const b = before[s.id] || 0, a = after[s.id] || 0, pct = b ? Math.round((a - b) / b * 100) : 0;
      return `<div><b>${esc(s.nickname || s.fullName)}</b> this week: ${num(b)} → ${num(a)} load pts${a !== b ? `, ${pct >= 0 ? '+' : ''}${pct}%` : ' (no change)'}</div>`;
    }).join('') + '</div></div>';
  }
  function readOccOv(form) {
    const fd = new FormData(form), key = fd.get('key'), o = findOcc(key, fd.get('orig'));
    const x = { reason: (fd.get('reason') || '').trim() };
    if (fd.get('mainId') !== o.mainId) x.mainId = fd.get('mainId');
    if ((fd.get('assistId') || null) !== (o.assistId || null)) x.assistId = fd.get('assistId') || null;
    if (fd.get('date') && fd.get('date') !== o.date) x.date = fd.get('date');
    if (fd.get('start')) x.start = fd.get('start');
    if (fd.get('skip')) x.skip = true;
    const prev = state.occOverrides[key];
    if (prev) Object.keys(prev).forEach(k => { if (x[k] === undefined && k !== 'at') { if (k === 'skip' && !fd.get('skip')) return; if (k === 'start' && !fd.get('start')) return; x[k] = prev[k]; } });
    return { key, o, x };
  }

  // ---------- one-off ----------
  function oneOffModal(d) {
    const staff = activeStaff(d);
    modal('Add one-off task', `<form data-form="oneoff" class="form" id="oneoff-form">
      <label class="field full">Task<input name="name" required placeholder="e.g., Party preparation — clean garden"></label>
      <label class="field">Date<input type="date" name="date" value="${d}" required></label><label class="field">Start time (optional)<input type="time" name="start"></label>
      <label class="field">Minutes<input type="number" name="minutes" value="60" min="5" step="5" required></label>
      <label class="field">Difficulty<select name="difficulty">${opt('L', 'Light')}${opt('H', 'Heavy')}</select></label>
      <label class="field">Category (for lead)<select name="categoryId">${opt('', '— none —')}${state.categories.map(c => opt(c.id, c.name)).join('')}</select></label>
      <label class="field">Main (leave empty for automatic)<select name="mainId">${opt('', 'Automatic')}${staff.map(s => opt(s.id, s.nickname || s.fullName)).join('')}</select></label>
      <label class="field">Assistant (helpers only)<select name="assistId">${opt('', 'None')}${staff.filter(s => s.role !== 'driver').map(s => opt(s.id, s.nickname || s.fullName)).join('')}</select></label>
      <label class="field full">Notes<input name="notes"></label></form>`,
      `<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="oneoff-form">Add task</button>`);
  }

  // ---------- printing ----------
  const PRINT_MARGIN_MM = 19.05; // 0.75 inch
  let lastPage = { orient: '', label: '' };
  /** Show what will be printed (pages at the real paper size) before the print dialog opens. */
  function printPreview() {
    const root = document.getElementById('print-root'); if (!root.innerHTML.trim()) return;
    const letter = state.settings.paper === 'Letter', land = lastPage.orient === 'landscape';
    let w = letter ? 215.9 : 210, h = letter ? 279.4 : 297; if (land) [w, h] = [h, w];
    // the app's styles plus the print styles (css/print.css), linked directly so this also works when the app is
    // opened as a file (Chrome doesn't let a file page read its own style rules)
    const cssLinks = ['css/app.css', 'css/print.css'].map(f => `<link rel="stylesheet" href="${esc(new URL(f, location.href).href)}">`).join('');
    const css = '';
    const M = PRINT_MARGIN_MM, cw = w - 2 * M, ch = h - 2 * M; // printable area (mm)
    const title = state.settings.householdName + (lastPage.label ? ' — ' + lastPage.label : '');
    const pageCss = `html,body{background:#6b7280;margin:0} body{padding:18px 0;font-family:Arial,sans-serif}
      #print-root{display:block!important;color:#000;font-family:Arial,sans-serif}
      #measure{position:absolute;left:-30000px;top:0;width:${cw}mm}
      .pg{box-sizing:border-box;width:${cw}mm;padding:0!important;margin:0!important;min-height:0!important;box-shadow:none!important;background:#fff}
      .pg.mprint,.pg.month{height:auto!important;overflow:visible!important}
      .sheet{box-sizing:border-box;width:${w}mm;height:${h}mm;padding:${M}mm;margin:0 auto 18px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.35);position:relative;overflow:hidden}
      .clip{width:${cw}mm;height:${ch}mm;overflow:hidden;position:relative} .flow{width:100%}
      .hb-doc.print .hb-cover{min-height:${(ch - 4).toFixed(0)}mm!important}
      .sheet .hd{position:absolute;top:${(M / 2).toFixed(1)}mm;left:${M}mm;right:${M}mm;display:flex;justify-content:space-between;font:8pt Arial;color:#555}
      .sheet .ft{position:absolute;bottom:${(M / 2).toFixed(1)}mm;right:${M}mm;font:8pt Arial;color:#555}`;
    const html = `<!doctype html><html><head><meta charset="utf-8">${cssLinks}<style>${css}\n${pageCss}</style></head><body><div id="print-root"><div id="measure">${root.innerHTML}</div><div id="sheets"></div></div></body></html>`;
    let ov = document.getElementById('print-preview'); if (ov) ov.remove();
    ov = document.createElement('div'); ov.id = 'print-preview';
    ov.innerHTML = `<div class="pp-bar"><b>Print preview</b><span class="small" id="pp-info">${esc(lastPage.label || '')} · ${letter ? 'Letter' : 'A4'} ${land ? 'landscape' : 'portrait'} · margins 0.75"</span><span style="flex:1"></span>
      <button class="btn" data-act="pp-close">Close</button><button class="btn primary" data-act="pp-print">🖨 Print</button></div><iframe title="Print preview"></iframe>`;
    document.body.appendChild(ov);
    const fr = ov.querySelector('iframe');
    fr.onload = () => { // lay the content out page by page, the way the printer does
      const d = fr.contentDocument, mm = 96 / 25.4, pageH = ch * mm, pageW = cw * mm, out = d.getElementById('sheets'), meas = d.getElementById('measure');
      { // safety check: were the print styles loaded? (print.css makes every .pg text black via !important)
        const probe = d.createElement('div'); probe.className = 'pg'; probe.innerHTML = '<span style="color:rgb(1,2,3)">x</span>'; d.body.appendChild(probe);
        const ok = d.defaultView.getComputedStyle(probe.firstChild).color === 'rgb(0, 0, 0)'; probe.remove();
        if (!ok) { const info = document.getElementById('pp-info'); if (info) info.innerHTML += ' · <b style="color:var(--bad)">print styles did not load — reopen the app and try again</b>'; }
      }
      const tops = [...meas.querySelectorAll('.pg')].filter(p => !p.parentElement.closest('.pg'));
      // sections marked "fit on one page" (the 7-day schedule): shrink to fit — and print at that same size
      const realTops = [...root.querySelectorAll('.pg')].filter(p => !p.parentElement.closest('.pg'));
      tops.forEach((pg, i) => {
        if (!pg.classList.contains('fit1')) return;
        pg.style.zoom = 1; pg.style.width = cw + 'mm';
        const z = Math.min(1, (pageH - 4) / pg.scrollHeight, pageW / pg.scrollWidth);
        if (z < 1) { const zz = (Math.floor(z * 100) / 100).toFixed(2); pg.style.zoom = zz; pg.style.width = (cw / zz) + 'mm'; if (realTops[i]) { realTops[i].style.zoom = zz; realTops[i].style.width = (cw / zz) + 'mm'; } }
      });
      let sheet = null, flow = null, placed = 0;
      const makeSheet = () => {
        sheet = d.createElement('div'); sheet.className = 'sheet';
        sheet.innerHTML = `<div class="hd"><span>${esc(title)}</span><span>Printed ${esc(fmtD(todayStr()))}</span></div><div class="clip"><div class="flow"></div></div><div class="ft"></div>`;
        out.appendChild(sheet); flow = sheet.querySelector('.flow'); placed = 0;
      };
      const used = () => flow.scrollHeight + 20; // a little room for spacing that only counts once the next item lands
      const newPage = anc => { makeSheet(); let p = flow; anc.forEach(a => { const c = a.src.cloneNode(false); if (a.src.style && a.src.style.zoom) c.style.zoom = a.src.style.zoom; p.appendChild(c); a.clone = c; p = c; }); };
      const cur = anc => anc[anc.length - 1].clone;
      const ATOMIC = /^(TR|LI|P|H1|H2|H3|H4|IMG|svg)$/;
      const splitTable = (table, anc) => {
        const head = table.tHead, rows = [...table.querySelectorAll(':scope > tbody > tr, :scope > tr')];
        const start = () => { const t = table.cloneNode(false); if (head) t.appendChild(head.cloneNode(true)); const b = d.createElement('tbody'); t.appendChild(b); cur(anc).appendChild(t); return b; };
        let body = start();
        rows.forEach(r => {
          const c = r.cloneNode(true); body.appendChild(c);
          if (used() > pageH && body.rows.length > 1) { body.removeChild(c); newPage(anc); body = start(); body.appendChild(c); }
          placed++;
        });
      };
      const place = (node, anc) => {
        if (node.nodeType === 3) { if (node.textContent.trim()) cur(anc).appendChild(node.cloneNode()); return; }
        if (node.nodeType !== 1) return;
        if (node.classList.contains('hb-sec') && node.classList.contains('l1') && placed) newPage(anc); // each main handbook section on a new page
        const parent = cur(anc), c = node.cloneNode(true); parent.appendChild(c);
        if (used() <= pageH) { placed++; return; }
        parent.removeChild(c);
        if (node.tagName === 'TABLE') return splitTable(node, anc);
        if (!ATOMIC.test(node.tagName) && node.children.length && !node.classList.contains('month') && !node.classList.contains('fit1')) {
          const sc = node.cloneNode(false); parent.appendChild(sc);
          const a2 = [...anc, { src: node, clone: sc }];
          [...node.childNodes].forEach(ch => place(ch, a2));
          return;
        }
        if (placed) newPage(anc);
        cur(anc).appendChild(c); placed++;
      };
      tops.forEach(pg => { // every print section starts on a new page
        makeSheet();
        const root0 = pg.cloneNode(false); if (pg.style.zoom) root0.style.zoom = pg.style.zoom; flow.appendChild(root0);
        const anc = [{ src: pg, clone: root0 }];
        [...pg.childNodes].forEach(ch => place(ch, anc));
      });
      meas.remove();
      const all = [...out.querySelectorAll('.sheet')];
      all.forEach((s, i) => { s.querySelector('.ft').textContent = `Page ${i + 1} of ${all.length}`; });
      // fit the sheets to the window width
      const avail = fr.clientWidth - 40, sw = all[0] ? all[0].offsetWidth : 1;
      if (sw > avail) { // scale the picture only (a transform doesn't change the page layout)
        const z = avail / sw; out.style.width = sw + 'px'; out.style.transformOrigin = 'top left'; out.style.transform = `scale(${z})`;
        out.style.marginLeft = Math.max(0, (fr.clientWidth - sw * z) / 2) + 'px'; d.body.style.height = Math.ceil(out.scrollHeight * z + 40) + 'px'; d.body.style.overflowX = 'hidden';
      }
      const info = document.getElementById('pp-info'); if (info) info.textContent += ` · ${all.length} page${all.length === 1 ? '' : 's'}`;
    };
    fr.srcdoc = html;
  }
  /** Page size and margins for printing, with a running title at the top and "Page X of Y" at the bottom of every page. */
  function setPage(orient, label) {
    lastPage = { orient: orient || '', label: label || '' };
    const css = s => '"' + String(s || '').replace(/[\\"]/g, '\\$&').replace(/\n/g, ' ') + '"';
    const m = '0.75in'; // 0.75" on all sides for every printout (16 Nov 2026); the running title and page number sit in it
    const box = 'font-family: Arial, sans-serif; font-size: 8pt; color: #555;';
    document.getElementById('page-size').textContent = `@page { size: ${state.settings.paper === 'Letter' ? 'letter' : 'A4'}${orient === 'landscape' ? ' landscape' : ''}; margin: ${m};
      @top-left { content: ${css(state.settings.householdName + (label ? ' — ' + label : ''))}; ${box} }
      @top-right { content: ${css('Printed ' + fmtD(todayStr()))}; ${box} }
      @bottom-right { content: "Page " counter(page) " of " counter(pages); ${box} } }`;
  }
  function printDay(d) {
    const r = getWeek(d), seg = r.leadsByDay[d];
    const blocks = state.fixedBlocks.filter(b => b.show && (b.blocking || /break/i.test(b.name)));
    const pages = state.staff.filter(s => r.status[d][s.id] && r.status[d][s.id].working).map(s => {
      const list = staffTasks(r, d, s.id);
      if (!list.length) return '';
      const rows = [...list.map(o => ({ s: o.start ?? 9999, o })), ...blocks.map(b => ({ s: U.toMin(b.start), b }))].sort((a, b) => a.s - b.s);
      const notes = [...new Set(list.flatMap(o => o.flags.filter(f => ['checkChildren', 'slippery'].includes(f)).map(f => FLAG_TEXT[f])))];
      return `<div class="pg daypg"><h1><span>${esc(state.settings.householdName.toUpperCase())} — DAILY CHECKLIST</span><span>${fmtDL(d)}</span></h1>
        <div class="who"><b>Name:</b> ${esc(s.fullName)}${s.nickname ? ' (' + esc(s.nickname) + ')' : ''} &nbsp; ${s.role === 'helper' ? `<b>Leads this period:</b> ${esc(leadCatsOf(seg, s.id).join(' · ') || '—')}` : '<b>Driver</b>' + (leadCatsOf(seg, s.id).length ? ` · <b>Also leads:</b> ${esc(leadCatsOf(seg, s.id).join(' · '))}` : '')}</div>
        ${notes.map(n => `<div class="note">⚠ ${esc(n)}</div>`).join('')}
        <table><thead><tr><th class="box"></th><th>Time</th><th>Task</th><th>Role</th><th>L/H</th><th>Freq</th><th>Ref</th></tr></thead>
        ${rows.map(x => {
          if (x.b) return `<tr class="fixed"><td></td><td>${x.b.start}–${x.b.end}</td><td colspan="5">${esc(x.b.name)}</td></tr>`;
          const o = x.o, isMain = o.mainId === s.id, t = state.tasks.find(y => y.id === o.templateId);
          const end = isMain ? o.end : o.start + o.assistMinutes;
          return `<tr><td class="box">☐</td><td class="nowrap">${fmtT(o.start)}–${fmtT(end)}</td><td>${esc(o.name)}${t && t.instructions.length ? `<div class="steps">${t.instructions.map((y, i) => (i + 1) + '. ' + esc(y)).join(' ')}</div>` : ''}${o.notes ? `<div class="steps">${esc(o.notes)}</div>` : ''}</td>
            <td class="nowrap">${isMain ? '[MAIN]' + (o.assistId ? ' + ' + esc(sName(o.assistId)) : '') : '[ASSIST] with ' + esc(sName(o.mainId))}</td><td>${o.difficulty}</td><td>${o.badge}</td><td class="nowrap">${esc(o.handbookRef)}${o.recipeId ? ' · Recipe attached' : ''}</td></tr>`;
        }).join('')}</table>
        <div class="sig"><div>Done by</div><div>Checked by</div></div></div>
        ${[...new Set(list.filter(o => o.mainId === s.id && o.recipeId).flatMap(o => o.recipeIds || [o.recipeId]))].map(id => recipeById(id)).filter(Boolean).map(rc => recipePage(rc, householdSize())).join('')}`;
    }).join('');
    if (!pages) { toast('Nothing to print for this day.'); return; }
    setPage('landscape', 'Daily checklists · ' + fmtDL(d)); document.getElementById('print-root').innerHTML = pages; printPreview();
  }
  function printWeek() {
    const r = getWeek(ui.date);
    const staff = state.staff.filter(s => r.days.some(d => E.isActive(s, d)));
    const html = `<div class="pg week"><h1><span>${esc(state.settings.householdName.toUpperCase())} — WEEK SCHEDULE (weekly and periodic tasks)</span><span>${fmtD(r.days[0])} – ${fmtD(r.days[6])}</span></h1><div class="who">Daily routine tasks are not listed; they are on each day's checklists.</div>
      <table class="wk"><thead><tr><th class="wk-staff">Staff</th>${r.days.map(d => `<th>${fmtDS(d)}${(() => { const ns = E.noSchoolOn(state, d), w = U.dow(d); return ns && w >= 1 && w <= 5 ? '<div class="wk-ns">' + (E.NO_SCHOOL[ns.reason] || E.NO_SCHOOL.other)[0] + ' ' + esc(ns.note ? ns.note.replace(/ \((regular holiday|special non-working day)\)$/, '') : (E.NO_SCHOOL[ns.reason] || E.NO_SCHOOL.other)[1]) + '</div>' : ''; })()}</th>`).join('')}</tr></thead>
      <tbody>${staff.map(s => `<tr><td class="wk-staff"><b>${esc(s.nickname || s.fullName)}</b></td>${r.days.map(d => {
        const st = r.status[d][s.id]; if (!st.working) return `<td><i>${esc(st.label)}</i></td>`;
        const nonDaily = staffTasks(r, d, s.id).filter(o => !isRoutine(o)); return `<td>${nonDaily.length ? '' : '<i>No weekly or periodic tasks</i>'}<ul class="wk-list">${nonDaily.map(o => `<li><b>${fmtT(o.start)}</b> ${esc(o.name)}${o.mainId === s.id ? '' : ' (assist)'}</li>`).join('')}</ul></td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>`;
    setPage('landscape', 'Week schedule · ' + fmtD(r.days[0]) + ' – ' + fmtD(r.days[6])); document.getElementById('print-root').innerHTML = html; printPreview();
  }

  // ---------- images ----------
  function readImage(file, max) {
    return new Promise((res, rej) => {
      if (!file || !file.size) return res(null);
      const fr = new FileReader();
      fr.onerror = rej;
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', 0.8)); // re-encoding drops EXIF/location data
        };
        img.onerror = rej; img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  // ---------- actions ----------
  const ACT = {
    nav: ds => { ui.view = ds.v; if (['day', 'week'].includes(ds.v) && !ui.date) ui.date = todayStr(); render(); window.scrollTo(0, 0); },
    close: () => closeModal(),
    'modal-bg': (ds, el, e) => { if (e.target === el) closeModal(); },
    'goto-day': ds => { ui.date = ds.d; ui.view = 'day'; closeModal(); render(); window.scrollTo(0, 0); },
    'day-shift': ds => { ui.date = U.addDays(ui.date, Number(ds.n)); render(); },
    'day-today': () => { ui.date = todayStr(); render(); },
    tick: ds => {
      const o = findOcc(ds.k, ds.d); if (!o) return;
      if (state.marks[ds.k]) { delete state.marks[ds.k]; commit('Cleared task mark', o.name + ' · ' + fmtD(ds.d)); }
      else { state.marks[ds.k] = { status: 'done', doneBy: [o.mainId, o.assistId].filter(Boolean), quality: '', note: '', date: ds.d, markedAt: new Date().toISOString(), markedBy: 'Owner' }; commit('Marked task done', o.name + ' · ' + fmtD(ds.d)); }
    },
    bulk: ds => {
      const r = getWeek(ds.d); let n = 0;
      r.occurrences.filter(o => o.date === ds.d && !o.skipped && o.mainId === ds.id && !state.marks[o.key]).forEach(o => {
        state.marks[o.key] = { status: 'done', doneBy: [o.mainId, o.assistId].filter(Boolean), quality: '', note: '', date: ds.d, markedAt: new Date().toISOString(), markedBy: 'Owner' }; n++;
      });
      commit('Bulk marked done', `${sName(ds.id)} · ${n} tasks · ${fmtD(ds.d)}`); toast(`${n} tasks marked done. Change any exceptions by clicking them.`);
    },
    occ: ds => occModal(ds.k, ds.d),
    'mark-clear': ds => { delete state.marks[ds.k]; closeModal(); commit('Cleared task mark', ds.k); },
    'occ-impact': () => {
      const form = document.getElementById('ov-form'); const { key, x } = readOccOv(form);
      const before = weekPtsFor(state, [form.orig.value, x.date || form.orig.value]);
      const clone = JSON.parse(JSON.stringify(state)); clone.occOverrides[key] = x;
      const after = weekPtsFor(clone, [form.orig.value, x.date || form.orig.value]);
      document.getElementById('impact').innerHTML = impactHtml(before, after);
    },
    'occ-ov-del': ds => { delete state.occOverrides[ds.k]; closeModal(); commit('Removed override', ds.k); },
    'oneoff-new': ds => oneOffModal(ds.d || ui.date),
    'oneoff-del': ds => { state.oneOffs = state.oneOffs.filter(x => x.id !== ds.id); closeModal(); commit('Deleted one-off task', ds.id); },
    'print-day': ds => printDay(ds.d || ui.date),
    'print-week': () => printWeek(),
    'print-manager': ds => printManager(ds.d || ui.date),
    'day-mode': ds => { ui.dayMode = ds.v; render(); },
    'lead-ov': ds => leadOverrideModal(ds.c, ds.ps),
    'lead-impact': () => {
      const f = document.getElementById('lead-ov-form'), fd = new FormData(f);
      const d = [fd.get('mode') === 'manual' && fd.get('from') ? fd.get('from') : todayStr(), todayStr()].sort()[1];
      const before = weekPtsFor(state, [d]);
      const clone = JSON.parse(JSON.stringify(state)); applyLeadAssign(clone, fd);
      document.getElementById('impact').innerHTML = impactHtml(before, weekPtsFor(clone, [d]));
    },
    'lead-ov-del': ds => { state.leadOverrides = state.leadOverrides.filter(o => o.id !== ds.id); commit('Removed lead override', ds.id); },
    'task-print': () => printTasks(),
    'ns-new': ds => noSchoolModal(ds.id, ds.d),
    'ns-del': ds => {
      const x = (state.noSchool || []).find(n => n.id === ds.id); if (!x || !confirm('Delete this no-school entry? Those days become school days again (past days are not changed).')) return;
      state.noSchool = state.noSchool.filter(n => n.id !== ds.id); closeModal();
      commit('Deleted no-school day(s)', `${(E.NO_SCHOOL[x.reason] || E.NO_SCHOOL.other)[1]} · ${fmtD(x.from)}${x.to && x.to !== x.from ? ' – ' + fmtD(x.to) : ''}`);
    },
    'ev-approve-all': ds => { // event form: tick or clear every suggested heavy-cleaning job
      document.querySelectorAll('#event-form input[name="approve"]').forEach(x => { x.checked = ds.v === '1'; });
      evApproveCount();
    },
    'task-jump': ds => { // scroll the frozen list so that category sits just under the headings
      const box = document.querySelector('.tm-freeze'), row = box && box.querySelector(`tr.group[data-cat="${ds.cat}"]`);
      if (row) box.scrollTop = row.offsetTop - box.querySelector('thead').offsetHeight;
    },
    'task-filters-clear': () => { ui.taskCat = ''; ui.taskFreq = ''; ui.taskPri = ''; ui.taskQ = ''; render(); },
    'task-hold': ds => {
      const t = state.tasks.find(x => x.id === ds.id);
      modal('Put on hold — ' + esc(t.name), `<form data-form="task-hold" class="form" id="hold-form"><input type="hidden" name="id" value="${t.id}">
        <label class="field">Hold until (optional)<input type="date" name="until" min="${todayStr()}"></label><label class="field">Reason (optional)<input name="reason" placeholder="e.g., aircon under repair"></label>
        <div class="full small muted">While on hold the task is not scheduled (it shows as "On hold" on its days). With a date it resumes by itself the day after; without one, click Resume. Past days stay as recorded.</div></form>`,
        `<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="hold-form">Put on hold</button>`);
    },
    'task-resume': ds => { const t = state.tasks.find(x => x.id === ds.id); t.onHold = false; t.holdUntil = ''; commit('Resumed task', t.name); },
    'task-new': () => taskModal(null),
    'task-edit': ds => taskModal(ds.id),
    'task-del': ds => {
      const t = state.tasks.find(x => x.id === ds.id);
      if (!confirm(`Delete "${t.name}"? Past records keep their copy. Setting it to inactive is usually better.`)) return;
      state.tasks = state.tasks.filter(x => x.id !== ds.id); closeModal(); commit('Deleted task', t.name);
    },
    staff: ds => staffModal(ds.id, 'overview'),
    'staff-new': () => staffModal(null, 'profile'),
    'staff-tab': ds => staffModal(ds.id, ds.tab),
    regularize: ds => regularizeModal(ds.id),
    'final-pay': ds => finalPayModal(ds.id),
    // Phase 3 — forms, contracts, payroll, vale, contributions
    templates: ds => templatesModal(ds.v),
    'bio-view': ds => { ui.bioView = ds.v || ''; staffModal(ds.id, 'biodata'); },
    'contract-new': ds => { ui.contractEdit = false; contractModal(ds.id, null, ds.t); },
    'contract-edit': ds => { ui.contractEdit = false; const c = state.contracts.find(x => x.id === ds.id); contractModal(c.staffId, c.id); },
    'contract-unlock': ds => { ui.contractEdit = true; const c = state.contracts.find(x => x.id === ds.id); contractModal(c.staffId, c.id); },
    'pay-tab': ds => { ui.payTab = ds.v; render(); },
    'run-new': ds => {
      const s = staffById(ds.id), per = P.periodFor(state, s, ds.p);
      const dup = state.payRuns.find(r => r.staffId === s.id && r.periodStart === per.start);
      if (dup) { runModal(dup.id); return; }
      const id = uid('pr'), b = P.buildRun(state, s, per.start, id);
      state.payRuns.push({ id, staffId: s.id, periodStart: per.start, periodEnd: per.end, payday: per.payday, status: 'draft', lines: b.lines, warnings: b.warnings, dayRate: b.dayRate, divisor: b.divisor, createdAt: new Date().toISOString() });
      commit('Prepared pay run', `${s.fullName} · payday ${fmtD(per.payday)}`); runModal(id);
    },
    run: ds => runModal(ds.id),
    'run-recalc': ds => {
      const r = state.payRuns.find(x => x.id === ds.id), s = staffById(r.staffId), b = P.buildRun(state, s, r.periodStart, r.id);
      r.lines = [...b.lines, ...r.lines.filter(l => !l.auto)]; r.warnings = b.warnings; r.dayRate = b.dayRate; r.divisor = b.divisor;
      commit('Recalculated pay run', `${s.fullName} · ${fmtD(r.payday)}`); runModal(r.id);
    },
    'run-del': ds => { const r = state.payRuns.find(x => x.id === ds.id); if (!confirm('Delete this draft pay run?')) return; state.payRuns = state.payRuns.filter(x => x.id !== ds.id); closeModal(); commit('Deleted draft pay run', `${sName(r.staffId)} · ${fmtD(r.payday)}`); },
    'run-print': ds => printPayslips([ds.id]),
    'contrib-form': ds => printContribForm(ds.m),
    'slips-selected': () => printPayslips([...document.querySelectorAll('.slip-pick:checked')].map(x => x.value)),
    'run-batch': ds => {
      const d = todayStr(); let n = 0;
      state.staff.filter(s => E.isActive(s, d) || (s.exitDate && s.exitDate >= U.addDays(d, -60))).forEach(s => {
        const per = P.periodFor(state, s, ds.p); if (per.payday !== ds.p || state.payRuns.some(r => r.staffId === s.id && r.periodStart === per.start)) return;
        const id = uid('pr'), b = P.buildRun(state, s, per.start, id);
        state.payRuns.push({ id, staffId: s.id, periodStart: per.start, periodEnd: per.end, payday: per.payday, status: 'draft', lines: b.lines, warnings: b.warnings, dayRate: b.dayRate, divisor: b.divisor, createdAt: new Date().toISOString() }); n++;
      });
      commit('Prepared pay runs (batch)', `${n} for payday ${fmtD(ds.p)}`); toast(`${n} pay run${n === 1 ? '' : 's'} prepared. Review each, record payment, then print the payslips.`);
    },
    'slips-batch': ds => printPayslips(state.payRuns.filter(r => r.payday === ds.p).map(r => r.id)),
    'vale-new': ds => valeModal(ds.id),
    vale: ds => valeDetail(ds.id),
    'vale-writeoff': ds => { const v = state.vales.find(x => x.id === ds.id); const why = prompt('Reason for writing off the remaining ' + peso(P.valeBalance(v)) + '?'); if (!why) return; v.status = 'writtenOff'; v.writeOff = { date: todayStr(), reason: why, amount: P.valeBalance(Object.assign({}, v, { status: 'active' })) }; commit('Wrote off vale', `${sName(v.staffId)} · ${why}`); valeDetail(v.id); },
    'mon-shift': ds => { const a = ui.monDate || todayStr(), n = Number(ds.n); ui.monDate = (ui.monMode || 'month') === 'year' ? (+a.slice(0, 4) + n) + a.slice(4) : U.addMonths(a.slice(0, 8) + '01', n); render(); },
    'agree-end': ds => { const ag = state.restAgreements.find(x => x.id === ds.id); if (!confirm('End this agreement? From tomorrow each helper goes back to her own weekly rest day. Past days stay as recorded.')) return; ag.end = todayStr(); commit('Ended rest-day agreement', ag.staff.map(sName).join(' ⇄ ')); },
    'salary-edit': ds => {
      const h = ds.id ? state.salaryHistory.find(x => x.id === ds.id) : null, sid = h ? h.staffId : ds.s, cur = curSalary(sid);
      modal(`${h ? 'Edit salary' : 'Change salary'} — ${esc(sName(sid))}`, `<form data-form="salary-add" class="form" id="sal-form"><input type="hidden" name="sid" value="${sid}"><input type="hidden" name="id" value="${h ? h.id : ''}">
        <label class="field">Amount (₱)<input type="number" name="rate" min="1" step="0.01" value="${h ? h.rate : ''}" placeholder="${cur ? cur.rate : ''}" required></label>
        <label class="field">Basis<select name="basis">${Object.entries(BASIS_LABEL).map(([k, l]) => opt(k, l, h ? h.basis : cur ? cur.basis : 'monthly')).join('')}</select></label>
        <label class="field">Starts on<input type="date" name="from" value="${h ? h.effectiveFrom : todayStr()}" required></label>
        <label class="field">Reason (optional)<input name="reason" value="${esc(h ? h.reason : '')}" placeholder="Raise, regularization, annual ₱500…"></label>
        <div class="full small muted">Pick today for a change now, or a future date: the new salary starts automatically on that day (payroll splits the pay period by days). Current: ${cur ? peso(cur.rate) + ' since ' + fmtD(cur.effectiveFrom) : 'none'}.</div>
        <div class="full" id="sal-msg"></div></form>`,
        `<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="sal-form">Save salary</button>`);
    },
    'salary-del': ds => { const h = state.salaryHistory.find(x => x.id === ds.id); if (state.payRuns.some(r => r.staffId === h.staffId && r.status === 'paid' && r.periodEnd >= h.effectiveFrom)) { toast('A paid pay run uses this salary. Add a new salary change instead.'); return; } if (!confirm('Remove this salary entry?')) return; state.salaryHistory = state.salaryHistory.filter(x => x.id !== ds.id); commit('Removed salary entry', sName(h.staffId)); staffModal(ds.s, 'pay'); },
    'benefit-del': ds => { state.benefits = state.benefits.filter(x => x.id !== ds.id); commit('Removed benefit', sName(ds.s)); staffModal(ds.s, 'pay'); },
    cmonth: ds => { const cur = (ui.cMonth || U.addMonths(todayStr().slice(0, 7) + '-01', -1).slice(0, 7)) + '-01'; ui.cMonth = U.addMonths(cur, Number(ds.n)).slice(0, 7); render(); },
    'contrib-pay': ds => {
      const [sid, ag, m] = ds.k.split('|'), c = P.contribution(state, staffById(sid), ag, m);
      modal(`Mark paid — ${P.AGENCIES[ag]} ${MON[+m.slice(5) - 1]} ${m.slice(0, 4)} · ${esc(sName(sid))}`, `<form data-form="contrib-pay" class="form" id="cp-form"><input type="hidden" name="k" value="${ds.k}">
        <div class="full small">Employee ${peso(c.ee)} + employer ${peso(c.er)} = <b>${peso(c.total)}</b> · due ${fmtD(c.due)}</div>
        <label class="field">Date paid<input type="date" name="paidOn" value="${todayStr()}" required></label><label class="field">Channel<input name="channel" placeholder="GCash, bank, branch, online…" required></label>
        <label class="field">Reference no.<input name="ref"></label><label class="field">Receipt (photo or PDF)<input type="file" name="receipt" accept="image/*,application/pdf"></label></form>`,
        `<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="cp-form">Save</button>`);
    },
    'contrib-undo': ds => { if (!confirm('Remove this payment record?')) return; delete state.contributions[ds.k]; commit('Removed contribution payment', ds.k); },
    // Phase 4
    'acc-tab': ds => { ui.accTab = ds.v; render(); },
    'inc-new': () => incidentModal(null),
    inc: ds => incidentModal(ds.id),
    'inc-del': ds => { if (!confirm('Delete this incident record?')) return; state.incidents = state.incidents.filter(x => x.id !== ds.id); closeModal(); commit('Deleted incident', ds.id); },
    'appl-edit': ds => applianceModal(ds.id || null),
    'appl-del': ds => { const a = state.appliances.find(x => x.id === ds.id); if (!confirm(`Remove ${a.name} from the register?`)) return; state.appliances = state.appliances.filter(x => x.id !== ds.id); closeModal(); commit('Removed appliance', a.name); },
    'coach-new': ds => {
      const pre = {};
      if (ds.inc) { const i = state.incidents.find(x => x.id === ds.inc); pre.related = { kind: 'incident', ref: i.id, label: F4.INCIDENT_TYPES[i.type] + ' · ' + incLabel(i) }; pre.staffId = i.snapshot && ((i.snapshot.mainIds || [])[0] || i.snapshot.leadId) || ''; pre.what = i.description; pre.type = 'coaching'; pre.fromIncident = i.id; }
      if (ds.k) { const o = findOcc(ds.k, ds.d); pre.related = { kind: 'task', ref: ds.k, label: o.name + ' · ' + fmtD(ds.d) }; pre.staffId = o.mainId; }
      coachingModal(null, pre);
    },
    coach: ds => coachingModal(ds.id),
    'coach-del': ds => { if (!confirm('Delete this coaching entry?')) return; state.coaching = state.coaching.filter(x => x.id !== ds.id); closeModal(); commit('Deleted coaching entry', ds.id); },
    'tr-tab': ds => { ui.trTab = ds.v; render(); },
    'onb-create': ds => { state.onboarding[ds.id] = F4.onboardingPlan(staffById(ds.id), state.settings); commit('Created onboarding plan', sName(ds.id)); },
    'lesson-new': () => lessonModal(null),
    lesson: ds => lessonModal(ds.id),
    'lesson-del': ds => { if (!confirm('Delete this lesson?')) return; state.lessons = state.lessons.filter(x => x.id !== ds.id); closeModal(); commit('Deleted lesson', ds.id); },
    'lesson-print': ds => {
      const l = state.lessons.find(x => x.id === ds.id);
      setPage('landscape', 'Lesson'); document.getElementById('print-root').innerHTML = `<div class="pg"><h1><span>LESSON — ${esc(l.title.toUpperCase())}</span><span>${esc(l.source && l.source.label || '')}</span></h1><div class="who"><b>Objective:</b> ${esc(l.objective)}</div>
        <table><tr><th>Steps</th></tr>${l.steps.map((x, i) => `<tr><td>${i + 1}. ${esc(x)}</td></tr>`).join('')}</table><table style="margin-top:8px"><tr><th class="box"></th><th>"Show me" checklist</th></tr>${l.showMe.map(x => `<tr><td class="box">☐</td><td>${esc(x)}</td></tr>`).join('')}</table>
        <div class="sig"><div>Staff</div><div>Signed off by (employer) / date</div></div></div>`; printPreview();
    },
    'course-del': ds => { state.courses = state.courses.filter(x => x.id !== ds.id); commit('Removed course record'); },
    'hb-tab': ds => { ui.hbTab = ds.v; render(); },
    'hb-import': () => document.getElementById('hb-file').click(),
    'hb-export': ds => exportModal(ds.v),
    'hb-view': ds => { const v = state.handbook.versions.find(x => x.version === ds.v); modal('Handbook v' + esc(v.version), F4.sortSections(v.sections).map(s => `<h${Math.min(4, F4.level(s.num) + 1)} style="margin:12px 0 4px">${esc(s.num)} ${esc(s.title)}</h${Math.min(4, F4.level(s.num) + 1)}>${String(s.body || '').split(/\n\s*\n/).filter(x => x.trim()).map(x => `<p class="small" style="margin:4px 0;white-space:pre-wrap">${esc(x)}</p>`).join('')}`).join(''), '', true); },
    'hb-section': ds => { const s = hbSection(ds.n); modal('Handbook §' + esc(ds.n) + (s ? ' — ' + esc(s.title) : ''), s ? (String(s.body || '').trim() ? String(s.body).split(/\n\s*\n/).map(x => `<p style="white-space:pre-wrap">${esc(x)}</p>`).join('') : '<div class="empty">This section has no text yet. Add it in Handbook.</div>') : '<div class="empty">No such section in the handbook.</div>', `<button class="btn" data-act="nav" data-v="handbook">Open Handbook</button>`); },
    'hb-publish': () => {
      const cur = latestHb(), next = F4.nextVersion(cur && cur.version);
      modal('Publish handbook v' + next, `<form data-form="hb-publish" class="form" id="hbp-form"><label class="field full">What changed (shown in the version list)<input name="note" placeholder="${cur ? 'e.g., Added pet care section' : 'First version'}"></label>
        <div class="full small muted">Save the draft first if you have unsaved edits. Each staff member will need to sign the acknowledgment for v${next}.</div></form>`, `<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="hbp-form">Publish v${next}</button>`);
    },
    'r-tab': ds => { ui.rTab = ds.v; render(); },
    'r-range': ds => { const d = todayStr(); ui.rFrom = ds.v === 'year' ? d.slice(0, 4) + '-01-01' : d.slice(0, 8) + '01'; ui.rTo = d; render(); },
    'r-csv': () => { const d = todayStr(), tab = ui.rTab || 'workload', from = ui.rFrom || d.slice(0, 8) + '01', to = ui.rTo || d, r = reportData(tab, from, to); downloadBlob(new Blob(['﻿' + F4.toCSV([r.head, ...r.rows])], { type: 'text/csv' }), `report-${tab}-${from}-to-${to}.csv`); },
    'r-print': () => { const d = todayStr(), tab = ui.rTab || 'workload', from = ui.rFrom || d.slice(0, 8) + '01', to = ui.rTo || d, r = reportData(tab, from, to);
      setPage('landscape', 'Report'); document.getElementById('print-root').innerHTML = `<div class="pg"><h1><span>${esc(state.settings.householdName.toUpperCase())} — ${esc(REPORTS.find(x => x[0] === tab)[1].toUpperCase())}</span><span>${fmtD(from)} – ${fmtD(to)}</span></h1><table><thead><tr>${r.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>${r.rows.map(row => `<tr>${row.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>`; printPreview(); },
    'ctable-add': () => {
      const ag = document.querySelector('#ct-form [name=newAgency]').value;
      const last = state.contribTables.filter(t => t.agency === ag).sort((a, b) => b.from.localeCompare(a.from))[0];
      state.contribTables.push(Object.assign({}, last, { id: uid('ct'), from: todayStr().slice(0, 7) + '-01', note: 'New table — edit the rates' }));
      commit('Added contribution table', P.AGENCIES[ag]);
    },
    'pick-photo': ds => { const inp = document.getElementById('photo-input'); inp.dataset.id = ds.id; inp.dataset.slot = ds.slot; inp.click(); },
    'id-del': ds => { const s = staffById(ds.id); s.ids = s.ids.filter(x => x.id !== ds.x); commit('Removed ID', s.fullName); staffModal(s.id, 'photos'); },
    'att-month': ds => { const n = Number(ds.n), cur = (ui.attMonth || todayStr().slice(0, 7)) + '-01'; ui.attMonth = n === 0 ? todayStr().slice(0, 7) : U.addMonths(cur, n).slice(0, 7); render(); },
    'exc-new': ds => { modal(ds.d ? `Record for ${fmtDL(ds.d)}${ds.id ? ' — ' + esc(sName(ds.id)) : ''}` : 'Record a day-off, absence or errand', excForm(ds.id, ds.t, ds.d),`<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="exc-form">Save</button>`); excTypeUI(); },
    'exc-del': ds => { state.exceptions = state.exceptions.filter(e => e.id !== ds.id); commit('Removed exception', ds.id); },
    // Phase 2 — meals
    'meal-tab': ds => { ui.mealTab = ds.v; render(); },
    recipe: ds => recipeModal(ds.id),
    'print-cal': () => printCalendar(),
    'pp-close': () => { const ov = document.getElementById('print-preview'); if (ov) ov.remove(); },
    'pp-print': () => { const ov = document.getElementById('print-preview'); if (ov) ov.remove(); setTimeout(() => window.print(), 50); },
    'hb-print': ds => printHandbook(ds.v),
    'meal-edit': ds => mealEditModal(ds.d, ds.slot),
    'meal-auto': () => mealAutoModal(),
    'meal-use-rotation': () => {
      const f = document.getElementById('meal-edit-form'), d = f.d.value, slot = f.slot.value;
      if (state.mealPlan[d]) { delete state.mealPlan[d][slot]; if (!Object.keys(state.mealPlan[d]).length) delete state.mealPlan[d]; }
      closeModal(); commit('Meal back to the rotation', `${fmtD(d)} · ${slot}`);
    },
    'meal-row-add': () => {
      const f = document.getElementById('meal-edit-form'), tb = document.getElementById('meal-rows'), i = Number(f.n.value);
      const tr = tb.rows[tb.rows.length - 1].cloneNode(true);
      tr.querySelectorAll('[name]').forEach(el => { el.name = el.name.replace(/_\d+$/, '_' + i); if (el.dataset.row) el.dataset.row = i; if (el.tagName === 'INPUT') { if (el.type === 'checkbox') el.checked = false; else el.value = ''; } if (el.tagName === 'SELECT' && /^r_/.test(el.name)) el.value = ''; });
      tb.appendChild(tr); f.n.value = i + 1;
    },
    'sc-paste': ds => schoolPasteModal(ds.v),
    'sc-preview': () => schoolPastePreview(),
    'sc-import': () => schoolPasteImport(),
    'groc-print': () => printGrocery(),
    'groc-days': ds => {
      const today = todayStr();
      ui.groceryDays = ds.v === '0' ? [] : ds.v === 'week' ? Array.from({ length: 7 }, (_, i) => U.addDays(today, i)).filter(d => d <= U.addDays(U.mondayOf(today), 6)) : Array.from({ length: Number(ds.v) }, (_, i) => U.addDays(today, i));
      render();
    },
    'recipe-new': () => recipeForm(null),
    'recipe-import': () => recipeImportModal(),
    'recipe-link-go': () => {
      const f = document.getElementById('recipe-form'), u = (f.linkUrl.value || '').trim();
      if (!u) { const m = document.getElementById('rf-link-msg'); if (m) m.innerHTML = '<span style="color:var(--bad)">Paste the recipe\'s web address first.</span>'; return; }
      recipeImportFrom(u, '', 'rf-link-msg').then(() => { const m = document.getElementById('rf-link-msg'); if (m && /blocked|Could not|No recipe/.test(m.textContent)) m.innerHTML += ' <button type="button" class="btn sm" data-act="recipe-import">More ways to import…</button>'; });
    },
    'recipe-import-go': () => { const f = document.getElementById('rimp-form'); ui.rimpUrl = f.url.value.trim(); recipeImportFrom(ui.rimpUrl, ''); },
    'recipe-import-clip': async () => {
      let t = ''; try { t = await navigator.clipboard.readText(); } catch (e) { toast('The browser did not allow reading the clipboard. Paste the page in the box below instead.'); return; }
      if (!t || t.length < 200) { toast('Nothing copied yet — click the bookmark on the recipe page first.'); return; }
      const m = t.match(/^<!--mhm-url:(.*?)-->/), f = document.getElementById('rimp-form');
      recipeImportFrom(m ? m[1] : (f ? f.url.value.trim() : ''), t);
    },
    'recipe-import-paste': () => { const f = document.getElementById('rimp-form'); if (!f.paste.value.trim()) { toast('Paste the page first.'); return; } recipeImportFrom(f.url.value.trim(), f.paste.value); },
    'recipe-edit': ds => recipeForm(ds.id),
    'recipe-print': ds => { const r = recipeById(ds.id); if (!r) return; setPage('landscape', 'Recipe'); document.getElementById('print-root').innerHTML = recipePage(r, Number(ds.s) || householdSize()); printPreview(); },
    'recipe-del': ds => {
      const r = recipeById(ds.id);
      const used = Object.values(state.mealPlan).some(x => Object.values(x).some(m => m && (m.recipeId === ds.id || (m.items || []).some(i => i.recipeId === ds.id))));
      if (!confirm(`Delete the recipe "${r.name}"?${used ? ' It is on the menu; those meals will show empty.' : ''} Past records keep the dish name.`)) return;
      state.recipes = state.recipes.filter(x => x.id !== ds.id); closeModal(); commit('Deleted recipe', r.name);
    },
    'meal-copy': () => {
      const mon = U.mondayOf(ui.date); let n = 0;
      for (let i = 0; i < 7; i++) { const d = U.addDays(mon, i), src = state.mealPlan[U.addDays(d, -7)]; if (src) { state.mealPlan[d] = JSON.parse(JSON.stringify(src)); n++; } }
      if (!n) { toast('Last week has no menu to copy.'); return; }
      commit('Copied last week\'s menu', fmtD(mon));
    },
    'meal-clear': () => {
      if (!confirm('Clear this week\'s menu?')) return;
      const mon = U.mondayOf(ui.date); for (let i = 0; i < 7; i++) delete state.mealPlan[U.addDays(mon, i)];
      commit('Cleared week menu', fmtD(mon));
    },
    'meal-cycle-save': () => {
      const n = Number(document.getElementById('cycle-n').value) - 1, mon = U.mondayOf(ui.date);
      const w = JSON.parse(JSON.stringify(state.mealCycle.weeks[n] || {})); let got = 0; // planned dishes replace that cycle week's dishes; the rest stay
      for (let i = 0; i < 7; i++) { const d = U.addDays(mon, i), p = state.mealPlan[d]; if (p && Object.keys(p).length) { w[U.dow(d)] = Object.assign(w[U.dow(d)] || {}, JSON.parse(JSON.stringify(p))); got++; } }
      if (!got) { toast('Plan and save this week\'s menu first.'); return; }
      state.mealCycle.weeks[n] = w; state.mealCycle.source = 'custom'; commit('Saved menu cycle week', String(n + 1)); toast(`Saved as cycle week ${n + 1}.`);
    },
    'meal-cycle-default': () => {
      const custom = state.mealCycle && state.mealCycle.source !== 'default' && (state.mealCycle.weeks || []).some(w => Object.keys(w || {}).length);
      if (custom && !confirm('Replace your saved cycle weeks with the default 4-week menu? Dishes planned for specific dates are kept.')) return;
      state.mealCycle = MHM.Seed.defaultMenuCycle(); commit('Loaded default menu rotation'); toast('Default 4-week menu loaded and turned on.');
    },
    'print-menu': () => printMenu(),
    // Phase 2 — calendar and events
    'cal-tab': ds => { ui.calTab = ds.v; render(); },
    'month-shift': ds => {
      const n = Number(ds.n), cur = (ui.month || todayStr().slice(0, 7)) + '-01';
      ui.month = n === 0 ? todayStr().slice(0, 7) : U.addMonths(cur, n).slice(0, 7); render();
    },
    'year-shift': ds => { ui.year = (ui.year || +todayStr().slice(0, 4)) + Number(ds.n); render(); },
    'print-month': () => printMonth(),
    'event-new': ds => eventModal(ds.d || todayStr(), ds.id),
    'event-del': ds => {
      const id = String(ds.id).split('#')[0], e = state.events.find(x => x.id === id);
      if (!confirm(`Delete "${e.title || E.EVENT_TYPES[e.type].label}"${e.repeat === 'yearly' ? ' for every year' : ''}? To skip just one occasion, use "Not held" instead.`)) return;
      state.events = state.events.filter(x => x.id !== id); closeModal(); commit('Deleted event', `${e.title || E.EVENT_TYPES[e.type].label} · ${fmtD(e.date)}`);
    },
    'ev-year': ds => { ui.evYear = (ui.evYear || +todayStr().slice(0, 4)) + Number(ds.n); render(); },
    // Phase 2 — rest-day compensation, vehicles
    'repl-clear': ds => { const e = state.exceptions.find(x => x.id === ds.id); e.replDate = ''; commit('Cleared replacement day', `${sName(e.staffId)} · worked ${fmtD(e.date)}`); },
    'vehicle-add': () => { state.vehicles = state.vehicles || []; state.vehicles.push({ id: uid('v'), type: 'Car', name: 'New vehicle', plate: '', regMonth: '', insurance: '', pmsMonths: 6, lastPms: '' }); commit('Added vehicle'); },
    'vehicle-del': ds => { const v = state.vehicles.find(x => x.id === ds.id); if (!confirm(`Remove ${v.name}?`)) return; state.vehicles = state.vehicles.filter(x => x.id !== ds.id); commit('Removed vehicle', v.name); },
    'member-add': () => { state.members.push({ id: uid('m'), name: 'New member', role: 'child', birthYear: '', notes: '' }); commit('Added family member'); },
    export: () => {
      if (!(window.crypto && crypto.subtle)) { toast('Encryption is not available in this browser window. Open the app with serve.ps1 (http://localhost:8765).'); return; }
      modal('Download encrypted backup', `<form data-form="backup-export" class="form" id="bk-form">
        <div class="full small">The backup file holds everything: staff records, IDs, photos, schedules and marks. It is locked with a password you choose now.</div>
        <label class="field">Backup password<input type="password" name="pw" minlength="8" required autocomplete="new-password"></label>
        <label class="field">Type it again<input type="password" name="pw2" minlength="8" required autocomplete="new-password"></label>
        <div class="full alert warn">⚠ Write the password down and keep it safe. If it is forgotten, the backup cannot be opened by anyone — including you.</div>
        <div class="full small muted">Save the file somewhere off this device (e.g. your OneDrive folder or a USB drive).</div></form>`,
        `<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="bk-form">Encrypt and download</button>`);
    },
    import: () => document.getElementById('import-input').click(),
    'clear-history': () => { if (!confirm('Clear stored past schedules? Past days will be re-generated from current settings (marks are kept).')) return; state.history = {}; commit('Cleared stored past schedules'); },
    reset: () => { if (!confirm('Replace ALL data on this device with the sample data? Download a backup first. This cannot be undone.')) return; state = MHM.Seed.create(); state.startedOn = todayStr(); weekCache = {}; commit('Reset to sample data'); },
  };

  const FORMS = {
    mark: fd => {
      const key = fd.get('key'), d = fd.get('date'), o = findOcc(key, d);
      state.marks[key] = { status: fd.get('status'), quality: fd.get('quality'), doneBy: fd.getAll('doneBy'), note: fd.get('note'), date: d, markedAt: new Date().toISOString(), markedBy: 'Owner' };
      closeModal(); commit('Marked task', `${o ? o.name : key} · ${MARK_STATUS[fd.get('status')]} · ${fmtD(d)}`);
    },
    'occ-ov': (fd, form) => {
      const { key, o, x } = readOccOv(form);
      if (!x.reason) x.reason = x.skip ? 'Skipped' : 'Manual change'; // optional, like the event, salary and lead overrides
      x.at = new Date().toISOString();
      state.occOverrides[key] = x; closeModal(); commit('Override saved', `${o.name} · ${fmtD(o.date)} · ${x.reason}`);
    },
    oneoff: fd => {
      state.oneOffs.push({ id: uid('o'), name: fd.get('name'), date: fd.get('date'), start: fd.get('start') || '', minutes: Number(fd.get('minutes')), difficulty: fd.get('difficulty'), categoryId: fd.get('categoryId'), mainId: fd.get('mainId') || null, assistId: fd.get('assistId') || null, notes: fd.get('notes') });
      closeModal(); commit('Added one-off task', fd.get('name') + ' · ' + fmtD(fd.get('date')));
    },
    'lead-ov': fd => {
      const bad = t => { const m = document.getElementById('lead-msg'); if (m) m.innerHTML = `<div class="alert bad">${esc(t)}</div>`; else toast(t); };
      if (fd.get('mode') === 'manual') {
        if (!fd.get('from') || !fd.get('until') || fd.get('until') < fd.get('from')) { bad('Set the dates: "until" must be on or after "from".'); return; }
        if (fd.get('from') < todayStr()) { bad('A manual override starts today or later; past days stay as recorded.'); return; }
        if ((staffById(fd.get('staffId')) || {}).role === 'driver') { bad('The driver takes fixed assignments only. Choose "Fixed assignment", or a helper for a manual override.'); return; }
        if (!(fd.get('reason') || '').trim()) fd.set('reason', 'Manual override');
      }
      const { c, mode, sid } = applyLeadAssign(state, fd);
      closeModal();
      commit('Lead assignment', mode === 'rotate' ? `${c.name}: automatic rotation` : mode === 'fixed' ? `${c.name}: fixed to ${sName(sid)}` : `${c.name}: ${sName(sid)} from ${fmtD(fd.get('from'))} until ${fmtD(fd.get('until'))}`);
    },
    task: fd => {
      const id = fd.get('id'), type = fd.get('ftype');
      const freq = { type };
      if (type === 'perWeek') { freq.n = Number(fd.get('fn')) || 1; const days = fd.getAll('fdays').map(Number); freq.days = days.length ? days : null; if (days.length) freq.n = days.length; }
      if (type === 'months') freq.n = Number(fd.get('fn')) || 3;
      if (type === 'weekly' || type === 'biweekly') freq.day = fd.get('fday') === '' ? null : Number(fd.get('fday'));
      if (type === 'eod') freq.offset = Number(fd.get('foffset')) || 0;
      if (type === 'yearly' && fd.get('fmonth')) freq.month = Number(fd.get('fmonth'));
      if (fd.get('we') <= fd.get('ws')) { toast('Latest finish must be after earliest start.'); return; }
      { // a window the helpers can't work in → the task would end up "not placed"
        const S = state.settings, H = fd.get('categoryId') === 'driver' ? S.driverHours : S.helperHours, ws = fd.get('ws'), we = fd.get('we'), min = Number(fd.get('minutes')) || 0;
        const tm = x => U.toMin(x), room = Math.min(tm(we), tm(H.end)) - Math.max(tm(ws), tm(H.start));
        const kids = fd.getAll('cons').includes('children'), kroom = Math.min(tm(we), tm(S.childFree[1])) - Math.max(tm(ws), tm(S.childFree[0]));
        const issues = [];
        if (room < min) issues.push(`the window ${ws}–${we} has only ${Math.max(0, room)} of its ${min} minutes inside ${fd.get('categoryId') === 'driver' ? 'the driver\'s' : 'the helpers\''} hours (${H.start}–${H.end})`);
        if (kids && kroom < min) issues.push(`with "children must not be in the area", school days allow only ${S.childFree[0]}–${S.childFree[1]}, which leaves ${Math.max(0, kroom)} minutes in this window`);
        if (tm(we) - tm(ws) < min) issues.push(`the window is shorter than the ${min} minutes the task takes`);
        if (issues.length && !confirm('This task may not fit the day: ' + issues.join('; and ') + '.\n\nIt will be placed at the nearest free time and flagged amber. Save anyway? (Cancel to fix the window.)')) return;
      }
      const amode = fd.get('amode') || 'rotation';
      if (amode !== 'rotation' && !fd.get('astaff')) { toast('Choose the person for a fixed or manual assignment.'); return; }
      if (amode === 'manual' && !fd.get('auntil')) { toast('Set the "until" date for the manual assignment.'); return; }
      if (amode === 'manual' && (staffById(fd.get('astaff')) || {}).role === 'driver') { toast('The driver takes fixed assignments only. Choose "Fixed", or a helper for a manual assignment.'); return; }
      const t = {
        id: id || uid('t-'), name: fd.get('name').trim(), categoryId: fd.get('categoryId'), freq, preferredDays: fd.getAll('pdays').map(Number),
        window: [fd.get('ws'), fd.get('we')], minutes: Number(fd.get('minutes')), difficulty: fd.get('difficulty'), assistMode: fd.get('assistMode'),
        assistMinutes: Number(fd.get('assistMinutes')) || 0, driverMayAssist: false, driverOnly: !!fd.get('driverOnly'), startAt: fd.get('startAt') || '', priority: fd.get('priority'),
        constraints: fd.getAll('cons'), areaIds: fd.getAll('areas'), eligible: fd.get('categoryId') === 'driver' ? 'driver' : 'helpers',
        handbookRef: fd.get('handbookRef'), active: fd.get('active') === '1', mealSlot: fd.get('mealSlot') || '',
        assign: amode === 'rotation' ? null : { mode: amode, staffId: fd.get('astaff'), from: amode === 'manual' ? fd.get('afrom') : '', until: amode === 'manual' ? fd.get('auntil') : '' },
        instructions: fd.get('instructions').split('\n').map(x => x.trim()).filter(Boolean), checklist: fd.get('checklist').split('\n').map(x => x.trim()).filter(Boolean),
      };
      if (id) state.tasks[state.tasks.findIndex(x => x.id === id)] = t; else state.tasks.push(t);
      closeModal(); commit(id ? 'Edited task' : 'Added task', t.name);
    },
    staff: fd => {
      const id = fd.get('id');
      const s = id ? staffById(id) : { id: uid('s_'), photos: {}, ids: [] };
      ['fullName', 'nickname', 'role', 'status', 'hireDate', 'shadow', 'arrangement', 'birthDate', 'phone', 'emergency', 'address', 'notes', 'dayoffStyle'].forEach(k => { s[k] = (fd.get(k) || '').trim(); });
      s.restDay = fd.get('restDay') === '' ? '' : Number(fd.get('restDay'));
      s.consent = !!fd.get('consent');
      s.restComp = { premiumPct: Number(fd.get('rcPremium')) || 0, accumulate: fd.get('rcAccum') === '1', maxDays: Number(fd.get('rcMax')) || 2, expiryDays: Number(fd.get('rcExpiry')) || 60 };
      if (id) { s.exitDate = fd.get('exitDate') || ''; s.exitReason = fd.get('exitReason') || ''; }
      if (!id) { state.staff.push(s); if (s.role === 'helper' && s.hireDate) state.onboarding[s.id] = F4.onboardingPlan(s, state.settings); } // spec §5.13: plan created on add
      applyBiodata(s); // fields that come from the biodata always follow it
      commit(id ? 'Edited staff' : 'Added staff', s.fullName);
      staffModal(s.id, id ? 'overview' : 'biodata');
      if (!id) toast('Added. The schedule re-balances automatically' + (E.inShadow(s, todayStr(), state.settings) ? '; shadow mode for the first ' + state.settings.shadowDays + ' days.' : '.'));
    },
    'add-id': async (fd) => {
      const s = staffById(fd.get('sid'));
      try {
        const [front, back] = await Promise.all([readImage(fd.get('front'), 1600), readImage(fd.get('back'), 1600)]);
        s.ids = s.ids || [];
        s.ids.push({ id: uid('id'), type: fd.get('type'), number: fd.get('number'), issued: fd.get('issued'), expires: fd.get('expires'), front, back });
        commit('Added ID', `${s.fullName} · ${fd.get('type')}`); staffModal(s.id, 'photos');
      } catch (e) { toast('Could not read the image.'); }
    },
    exc: fd => {
      const type = fd.get('type'), s = staffById(fd.get('staffId'));
      const bad = t => { const h = document.getElementById('exc-help'); if (h) h.innerHTML = `<span style="color:var(--bad)">${esc(t)}</span>`; toast(t); };
      const isRestDay = d => s.restDay !== '' && s.restDay != null && Number(s.restDay) === U.dow(d);
      if (type === 'rest_moved' && !fd.get('to')) { bad('Choose the new day-off date.'); return; }
      const rec = { id: uid('x'), staffId: s.id, type, date: fd.get('date'), to: ['rest_moved', 'two_day_off', 'vacation'].includes(type) ? fd.get('to') : '', notes: fd.get('notes') };
      if (type === 'vacation') {
        if (!rec.to || rec.to < rec.date) { bad('Set the last day of the vacation (on or after the first day).'); return; }
        rec.pay = fd.get('vpay'); rec.place = (fd.get('vplace') || '').trim();
        if (rec.pay === 'sil') {
          const y = +rec.date.slice(0, 4), sil = P.silBalance(state, s, y); let need = 0;
          for (let x = rec.date; x <= rec.to; x = U.addDays(x, 1)) if (!isRestDay(x)) need++;
          if (need > sil.balance && !confirm(`This uses ${need} working days of service incentive leave, but ${s.nickname || s.fullName} has ${sil.balance} left for ${y}. Save anyway?`)) return;
        }
      }
      if (type === 'two_day_off') {
        if (!rec.to || rec.to <= rec.date) { bad('The second day off must be after the first.'); return; }
        rec.swap = fd.get('swap'); rec.exchangeDate = rec.swap === 'exchange' ? fd.get('exchangeDate') : '';
        if (rec.swap === 'exchange' && !rec.exchangeDate) { bad('Choose the date she works her day-off instead (the swap).'); return; }
        if (rec.swap === 'exchange' && !isRestDay(rec.exchangeDate) && !confirm(`${fmtDL(rec.exchangeDate)} is not ${s.fullName}'s usual day-off. Use it as the swap anyway?`)) return;
      }
      if (type === 'errand') {
        rec.from = fd.get('from'); rec.to = fd.get('until'); rec.paid = fd.get('paid'); rec.portion = fd.get('eportion');
        if (!rec.from || !rec.to || rec.to <= rec.from) { bad('"Back by" must be after "Out from".'); return; }
      }
      if (type === 'sick') rec.where = fd.get('where');
      if ((type === 'dayoff_out' || type === 'dayoff_home') && !E.dayStatus(state, s, rec.date).rest && !isRestDay(rec.date) && !confirm(`${fmtDL(rec.date)} is not ${s.fullName}'s day-off. Record it anyway?`)) return;
      if (type === 'rest_worked') {
        const rc = E.restCompOf(s);
        if (!isRestDay(rec.date)) { if (!confirm(`${fmtDL(rec.date)} is not ${s.fullName}'s usual rest day. Record it anyway?`)) return; }
        rec.portion = fd.get('portion'); rec.comp = fd.get('comp'); rec.initiated = fd.get('initiated'); rec.replDate = fd.get('replDate') || '';
        if (rec.comp === 'replacement') {
          const open = E.restLedger(state, s.id, todayStr()).filter(x => x.status === 'earned' || x.status === 'scheduled').length;
          if (rc.accumulate && open >= rc.maxDays) { toast(`${s.nickname || s.fullName} already has ${open} replacement day(s) — the most allowed. Choose premium pay, or use a banked day first.`); return; }
          const win = rc.accumulate ? rc.expiryDays : (state.settings.replacementWindowDays || 14), exp = U.addDays(rec.date, win);
          if (rec.replDate && (rec.replDate <= rec.date || rec.replDate > exp)) { toast(`The replacement day must be after ${fmtD(rec.date)} and by ${fmtD(exp)}.`); return; }
        } else rec.replDate = '';
      }
      // one day-off style per day: going out / staying home replace each other
      if (type === 'dayoff_out' || type === 'dayoff_home') state.exceptions = state.exceptions.filter(e => !(e.staffId === s.id && e.date === rec.date && (e.type === 'dayoff_out' || e.type === 'dayoff_home')));
      state.exceptions.push(rec);
      closeModal(); commit('Recorded exception', `${s.nickname || s.fullName} · ${EXC_TYPES[type][0]} · ${fmtD(rec.date)}${rec.to && type !== 'errand' ? ' – ' + fmtD(rec.to) : ''}`);
      toast('Saved. The schedule was updated.');
    },
    settings: fd => {
      const S = state.settings;
      S.householdName = fd.get('householdName'); S.employerName = (fd.get('employerName') || '').trim(); S.householdAddress = (fd.get('householdAddress') || '').trim(); S.paper = fd.get('paper'); S.rotation = fd.get('rotation'); S.rotationAnchor = fd.get('rotationAnchor');
      S.lightFactor = Number(fd.get('lightFactor')) || 1; S.heavyFactor = Number(fd.get('heavyFactor')) || 1.5;
      S.tolerance = (Number(fd.get('tolerance')) || 10) / 100; S.shadowEnabled = fd.get('shadowEnabled') === '1'; S.shadowDays = Number(fd.get('shadowDays')) || 0;
      S.childFree = [fd.get('cf0'), fd.get('cf1')]; S.quiet = [fd.get('q0'), fd.get('q1')];
      S.helperHours = { start: fd.get('h0'), end: fd.get('h1') }; S.driverHours = { start: fd.get('d0'), end: fd.get('d1') };
      S.dayRateDivisor = Math.max(1, Number(fd.get('dayRateDivisor')) || 26);
      S.replacementWindowDays = Math.max(1, Number(fd.get('replacementWindowDays')) || 14);
      commit('Changed settings'); toast('Settings saved. Future schedules re-generated.');
    },
    cats: fd => {
      state.categories.forEach(c => { c.name = fd.get('name_' + c.id) || c.name; c.color = fd.get('color_' + c.id) || c.color; });
      const n = (fd.get('newCat') || '').trim();
      if (n) state.categories.splice(state.categories.length - 1, 0, { id: uid('c'), name: n, color: '#888888', sort: state.categories.length });
      commit('Edited lead categories');
    },
    blocks: fd => {
      state.fixedBlocks.forEach(b => { b.name = fd.get('name_' + b.id); b.start = fd.get('start_' + b.id); b.end = fd.get('end_' + b.id); b.blocking = !!fd.get('blocking_' + b.id); b.protected = !!fd.get('protected_' + b.id); b.show = !!fd.get('show_' + b.id); });
      commit('Edited fixed blocks');
    },
    members: fd => {
      state.members.forEach(m => { m.name = fd.get('name_' + m.id); m.role = fd.get('role_' + m.id); m.birthday = fd.get('bd_' + m.id) || ''; m.birthYear = m.birthday ? m.birthday.slice(0, 4) : fd.get('by_' + m.id); m.notes = fd.get('notes_' + m.id); m.avoid = fd.get('avoid_' + m.id) || ''; });
      commit('Edited family members');
    },
    areas: fd => { state.areas = fd.get('areas').split('\n').map(x => x.trim()).filter(Boolean); commit('Edited areas'); },
    'meal-edit': fd => {
      const d = fd.get('d'), slot = fd.get('slot'), n = Number(fd.get('n')), items = [];
      for (let i = 0; i < n; i++) {
        if (fd.get('x_' + i)) continue;
        const rid = fd.get('r_' + i) || '', txt = (fd.get('t_' + i) || '').trim(); if (!rid && !txt) continue;
        items.push(rid ? { course: fd.get('c_' + i) || 'main', recipeId: rid } : { course: fd.get('c_' + i) || 'main', text: txt });
      }
      state.mealPlan[d] = state.mealPlan[d] || {};
      if (fd.get('none')) state.mealPlan[d][slot] = { none: true };
      else if (items.length) state.mealPlan[d][slot] = { items };
      else delete state.mealPlan[d][slot];
      if (!Object.keys(state.mealPlan[d]).length) delete state.mealPlan[d];
      closeModal(); commit('Saved meal', `${fmtD(d)} · ${(E.MEAL_SLOTS.find(x => x.id === slot) || {}).label} · ${fd.get('none') ? 'no meal' : items.map(itemName).join(', ') || 'rotation'}`);
    },
    'meal-auto': fd => {
      const opts = { weeks: Number(fd.get('weeks')) || 1, mode: fd.get('mode'), slots: fd.getAll('slots'), courses: { lunch: fd.getAll('c_lunch'), dinner: fd.getAll('c_dinner') }, weekendApp: !!fd.get('weekendApp') };
      if (opts.mode === 'all' && !confirm('Replace every planned meal in those weeks (from today on)?')) return;
      const n = autoAssignMenu(opts);
      closeModal(); commit('Auto-assigned menu', `${n} meal(s) filled from the recipe library`);
      toast(n ? `${n} meal(s) filled from the recipe library. Click any meal to change it.` : 'Nothing to fill — those meals are already planned.');
    },
    'meal-plan': fd => {
      const mon = U.mondayOf(ui.date), next = {};
      for (const [k, v] of fd.entries()) {
        const [kind, d, slot] = k.split('|'); if (!slot) continue;
        const val = String(v).trim(); if (!val) continue;
        const x = ((next[d] = next[d] || {})[slot] = next[d][slot] || {});
        if (kind === 'r') x.recipeId = val; else x.text = val;
      }
      for (let i = 0; i < 7; i++) { const d = U.addDays(mon, i); if (next[d]) state.mealPlan[d] = next[d]; else delete state.mealPlan[d]; }
      commit('Saved week menu', fmtD(mon)); toast('Menu saved. Cooking tasks updated with the dishes and recipe times.');
    },
    recipe: async fd => {
      const id = fd.get('id');
      const old = id ? recipeById(id) : null;
      let photo = old ? old.photo : (fd.get('photoData') || null); // an imported recipe's photo comes in the form
      try { const p = await readImage(fd.get('photo'), 1200); if (p) photo = p; } catch (e) { toast('Could not read the photo.'); }
      const r = {
        id: id || uid('r-'), name: fd.get('name').trim(), category: fd.get('category'), difficulty: fd.get('difficulty'),
        servings: Math.max(1, Number(fd.get('servings')) || 1), prepMin: Number(fd.get('prepMin')) || 0, cookMin: Number(fd.get('cookMin')) || 0,
        ingredients: fd.get('ingredients').split('\n').map(l => l.trim()).filter(Boolean).map(l => { const p = l.split('|').map(x => x.trim()); return p.length === 1 ? { qty: 0, unit: '', item: p[0], note: '' } : { qty: parseQty(p[0]), unit: p[1] || '', item: p[2] || '', note: p[3] || '' }; }),
        steps: fd.get('steps').split('\n').map(l => l.trim()).filter(Boolean), equipment: fd.get('equipment'),
        mealTypes: fd.getAll('mealTypes'),
        allergyTags: fd.get('allergyTags').split(',').map(x => x.trim()).filter(Boolean), kidNotes: fd.get('kidNotes'), storage: fd.get('storage'), safety: fd.get('safety'),
        video: fd.get('video').trim(), photo, sourceUrl: fd.get('sourceUrl') || (old && old.sourceUrl) || '',
      };
      if (id) state.recipes[state.recipes.findIndex(x => x.id === id)] = r; else state.recipes.push(r);
      commit(id ? 'Edited recipe' : 'Added recipe', r.name); recipeModal(r.id);
    },
    event: fd => {
      const id = fd.get('id'), st = fd.get('startTime') || '', et = fd.get('endTime') || '';
      const help = t => { const h = document.getElementById('ev-help'); if (h) h.innerHTML = `<span style="color:var(--bad)">${esc(t)}</span>`; toast(t); };
      const repeat = fd.get('repeat') || 'none', old = id ? state.events.find(x => x.id === id) : null;
      let date = fd.get('date'), end = fd.get('end') && fd.get('end') > date ? fd.get('end') : '', overrides = old && old.overrides ? JSON.parse(JSON.stringify(old.overrides)) : {};
      if (repeat === 'yearly') { // month and day only; the year is just where the series starts
        const mm = String(fd.get('ymonth')).padStart(2, '0'), dd = String(fd.get('yday')).padStart(2, '0');
        if (Number(dd) > new Date(Date.UTC(2024, Number(mm), 0)).getUTCDate()) { help('That day does not exist in that month.'); return; }
        const baseYear = old && old.repeat === 'yearly' ? old.date.slice(0, 4) : todayStr().slice(0, 4);
        date = baseYear + '-' + mm + '-' + dd; end = '';
        const ty = +todayStr().slice(0, 4), ny = E.annualDate(date, ty) >= todayStr() ? ty : ty + 1, ex = fd.get('exactDate'); // the next occasion
        if (!fd.get('sameDay')) {
          if (!ex) { help('Enter the actual celebration date, or tick "Celebrated on the same day".'); return; }
          if (ex < todayStr()) { help('The celebration date must be today or later.'); return; }
          overrides[ny] = { movedTo: ex, celebration: true };
        } else if (overrides[ny] && overrides[ny].celebration) delete overrides[ny];
      } else if (!date) { help('Choose the date.'); return; }
      if (!id && repeat !== 'yearly' && date < todayStr()) { help('A one-time event starts today or later (past days are a permanent record). For a yearly occasion like a birthday, choose "Every year" — the first date may be in the past.'); return; }
      if ((st && !et) || (!st && et)) { help('Give both a start and an end time, or leave both empty for the whole day.'); return; }
      if (st && et && !end && et <= st) { help('The end time must be after the start time.'); return; }
      const rec = { title: (fd.get('title') || '').trim(), category: fd.get('category') || 'family', repeat, overrides: repeat === 'yearly' ? overrides : undefined, type: fd.get('type'), date, end, startTime: st, endTime: et, location: fd.get('location'), place: fd.get('location') === 'out' ? (fd.get('place') || '').trim() : '', companions: fd.getAll('companions'), notes: (fd.get('notes') || '').trim(),
        skipMeals: fd.get('type') === 'family_out' ? fd.getAll('skipMeals') : [], approvedTasks: end && ['travel', 'family_out'].includes(fd.get('type')) ? fd.getAll('approve') : [] };
      if (id) Object.assign(state.events.find(x => x.id === id), rec); else state.events.push(Object.assign({ id: uid('e') }, rec));
      closeModal(); commit(id ? 'Edited event' : 'Planned event', `${rec.title || E.EVENT_TYPES[rec.type].label} · ${eventWhen(rec)}${repeat === 'yearly' ? ' · every year' : ''}${rec.companions.length ? ' · with ' + rec.companions.map(sName).join(', ') : ''}`);
      toast('Event saved. The schedule was updated.');
    },
    'no-school': fd => {
      const id = fd.get('id'), from = fd.get('from'), to = fd.get('to') && fd.get('to') > from ? fd.get('to') : '';
      const msg = t => { const m = document.getElementById('ns-msg'); if (m) m.innerHTML = `<div class="alert bad">${esc(t)}</div>`; else toast(t); };
      if (!from) { msg('Choose the date.'); return; }
      if (fd.get('to') && fd.get('to') < from) { msg('"Until" must be on or after "From".'); return; }
      const rec = { reason: fd.get('reason'), from, to, note: (fd.get('note') || '').trim() };
      if (!nsDays(rec)) { msg('Those dates fall on a weekend, which is never a school day.'); return; }
      state.noSchool = state.noSchool || [];
      const clash = state.noSchool.find(n => n.id !== id && n.from <= (to || from) && from <= (n.to || n.from));
      if (clash && !confirm(`This overlaps "${(E.NO_SCHOOL[clash.reason] || E.NO_SCHOOL.other)[1]}" (${fmtD(clash.from)}${clash.to ? ' – ' + fmtD(clash.to) : ''}). Save anyway?`)) return;
      if (id) Object.assign(state.noSchool.find(n => n.id === id), rec); else state.noSchool.push(Object.assign({ id: uid('ns') }, rec));
      closeModal(); commit(id ? 'Edited no-school day(s)' : 'No school', `${(E.NO_SCHOOL[rec.reason] || E.NO_SCHOOL.other)[1]} · ${fmtD(from)}${to ? ' – ' + fmtD(to) : ''}${rec.note ? ' · ' + rec.note : ''}`);
      toast('Saved. No school run those days — the driver does his own tasks.');
    },
    'repl-set': fd => {
      const e = state.exceptions.find(x => x.id === fd.get('id')), x = E.restLedger(state, e.staffId, todayStr()).find(y => y.id === e.id), d = fd.get('replDate');
      if (d > x.expires) { toast('That is after the replacement day expires (' + fmtD(x.expires) + ').'); return; }
      e.replDate = d; commit('Set replacement day', `${sName(e.staffId)} · off ${fmtD(d)} for working ${fmtD(e.date)}`);
      toast('Replacement day set. That day\'s tasks go to the other helper(s).');
    },
    vehicles: fd => {
      state.vehicles.forEach(v => {
        v.type = fd.get('type_' + v.id); v.name = fd.get('name_' + v.id); v.plate = fd.get('plate_' + v.id); v.regMonth = fd.get('reg_' + v.id) ? Number(fd.get('reg_' + v.id)) : '';
        v.insurance = fd.get('ins_' + v.id); v.pmsMonths = Number(fd.get('pms_' + v.id)) || ''; v.lastPms = fd.get('last_' + v.id);
      });
      commit('Edited vehicles');
    },
    // ---------- Phase 3 forms ----------
    biodata: async fd => {
      const sid = fd.get('sid'), s = staffById(sid), T = state.biodataTemplate, prev = latestBio(sid), data = {};
      for (const f of T.fields) {
        const n = 'f_' + f.id;
        if (f.type === 'yesno') data[f.id] = !!fd.get(n);
        else if (f.type === 'table') data[f.id] = Array.from({ length: Number(f.rows) || 3 }, (_, r) => (f.columns || []).map((c, ci) => (fd.get(`${n}_${r}_${ci}`) || '').trim()));
        else if (f.type === 'photo') { try { data[f.id] = (await readImage(fd.get(n), 1600)) || (prev && prev.data[f.id]) || ''; } catch (e) { data[f.id] = prev ? prev.data[f.id] : ''; } }
        else data[f.id] = (fd.get(n) || '').trim();
      }
      let signed = prev ? prev.signed : null;
      try { const x = await readDoc(fd.get('signed')); if (x) signed = x; } catch (e) { toast('That file is too big (8 MB max).'); return; }
      state.biodata.push({ id: uid('bio'), staffId: sid, templateVersion: T.version, version: prev ? prev.version + 1 : 1, data, signed, savedAt: new Date().toISOString() });
      applyBiodata(s); // biodata is the source: name, birthday, address, contacts, emergency contact and government numbers flow out from here
      ui.bioView = '';
      commit('Saved biodata', `${s.fullName} · v${prev ? prev.version + 1 : 1}`); staffModal(sid, 'biodata'); toast('Biodata saved as a new version.');
    },
    contract: async fd => {
      const sid = fd.get('sid'), id = fd.get('id'), type = fd.get('type'), T = state.contractTemplates[type], s = staffById(sid);
      let c = id ? state.contracts.find(x => x.id === id) : null;
      let signed = c ? c.signed : null;
      try { const x = await readDoc(fd.get('signed')); if (x) signed = x; } catch (e) { toast('That file is too big (8 MB max).'); return; }
      const status = fd.get('status') || (c ? c.status : 'draft');
      if (c && c.status !== 'draft' && !ui.contractEdit) { c.signed = signed; if (status !== c.status) { (c.history = c.history || []).push(`${todayStr()}: ${CONTRACT_STATUS[c.status][1]} → ${CONTRACT_STATUS[status][1]}`); c.status = status; } }
      else {
        const fields = {}; T.fields.forEach(f => { const v = fd.get('c_' + f.id); fields[f.id] = f.type === 'number' ? (v === '' || v == null ? '' : Number(v)) : (v || ''); });
        if (c && c.status !== 'draft') { // editing a signed contract → new version
          (c.history = c.history || []).push(`${todayStr()}: superseded by v${c.version + 1}`); c.status = 'superseded';
          c = { id: uid('ct'), staffId: sid, type, version: c.version + 1, templateVersion: T.version, fields, status, signed: null, history: [], createdAt: new Date().toISOString() };
          state.contracts.push(c);
        } else if (c) { c.fields = fields; c.status = status; c.signed = signed; }
        else { c = { id: uid('ct'), staffId: sid, type, version: 1, templateVersion: T.version, fields, status, signed, history: [], createdAt: new Date().toISOString() }; state.contracts.push(c); }
      }
      ui.contractEdit = false;
      if (c.status === 'signed') {
        if (type === 'regular') state.contracts.filter(x => x.staffId === sid && x.id !== c.id && x.status === 'signed' && x.type === 'provisional').forEach(x => { x.status = 'superseded'; (x.history = x.history || []).push(`${todayStr()}: superseded by the regular contract`); });
        const from = c.fields.startDate, amt = Number(c.fields.salary), cur = from && P.salaryOn(state, sid, from);
        if (from && amt && (!cur || P.monthlyOf(state, cur, P.payOf(s).schedule) !== amt)) { state.salaryHistory.push({ id: uid('sh'), staffId: sid, effectiveFrom: from, basis: 'monthly', rate: amt, reason: `${type === 'regular' ? 'Regular' : 'Provisional'} contract v${c.version}`, source: 'contract', contractId: c.id }); toast('Salary history updated from the signed contract.'); }
        // the kasambahay's details as they were when signed (from the biodata)
        if (!c.party) { const bx = bioDerived(s), bd = bx.birthDate || s.birthDate; c.party = { name: bx.fullName || s.fullName, civil: bx.civil || '', birthday: bd || '', age: bd ? Math.floor(U.daysBetween(bd, c.fields.startDate || todayStr()) / 365.25) : '', address: bx.address || s.address || '', phone: bx.phone || s.phone || '', biodataVersion: bx.version || 0 }; }
        if (c.fields.absenceRate) { s.pay = Object.assign({}, s.pay || {}, { absenceRule: 'fixed', absenceAmount: Number(c.fields.absenceRate) }); }
      }
      closeModal(); commit('Saved contract', `${s.fullName} · ${type} v${c.version} · ${CONTRACT_STATUS[c.status][1]}`); staffModal(sid, 'contracts');
    },
    template: async fd => {
      const k = fd.get('kind'), T = k === 'biodata' ? state.biodataTemplate : state.contractTemplates[k], n = Number(fd.get('n')), fields = [];
      const parseExtra = (f, x) => {
        if (k !== 'biodata') { f.default = f.type === 'number' ? (x === '' ? '' : Number(x)) : x; return f; }
        if (f.type === 'choice') f.options = x.split(',').map(y => y.trim()).filter(Boolean);
        if (f.type === 'table') { const [cols, rows] = x.split('|'); f.columns = (cols || '').split(',').map(y => y.trim()).filter(Boolean); f.rows = Number(rows) || 3; }
        return f;
      };
      for (let i = 0; i < n; i++) {
        if (fd.get('del_' + i)) continue;
        const old = T.fields.find(f => f.id === fd.get('id_' + i)) || {};
        fields.push(parseExtra(Object.assign({}, old, { label: fd.get('label_' + i).trim(), type: fd.get('type_' + i), section: k === 'biodata' ? fd.get('section_' + i).trim() : undefined }), (fd.get('extra_' + i) || '').trim()));
      }
      const nl = (fd.get('label_new') || '').trim();
      if (nl) fields.push(parseExtra({ id: uid('f'), label: nl, type: fd.get('type_new'), section: k === 'biodata' ? (fd.get('section_new') || 'Other').trim() : undefined }, (fd.get('extra_new') || '').trim()));
      try { const f = await readFile(fd.get('file'), 8); if (f) T.file = f; } catch (e) { toast('That file is too big (8 MB max).'); return; }
      T.name = fd.get('name'); T.fields = fields; T.version++;
      commit('Edited form template', `${T.name} v${T.version}`); templatesModal(k); toast('Template saved as version ' + T.version + '.');
    },
    'pay-settings': fd => {
      const s = staffById(fd.get('sid')), old = P.payOf(s);
      s.pay = {
        basis: old.basis, adjust: fd.get('adjust'), mode: fd.get('mode'), gcashName: fd.get('gcashName').trim(), gcashNumber: fd.get('gcashNumber').trim() || old.gcashNumber,
        absenceRule: fd.get('absenceRule'), absenceAmount: Number(fd.get('absenceAmount')) || 0, valeCapPct: Number(fd.get('valeCapPct')) || 30, contrib: fd.get('contrib'), sickPaid: fd.get('sickPaid') === '1',
        schedule: { type: fd.get('stype'), n: Number(fd.get('sn')) || 14, anchor: fd.get('sanchor') || old.schedule.anchor, weekday: Number(fd.get('swd')),
          days: fd.get('sdays').split(',').map(x => Number(x.trim())).filter(Boolean), list: fd.get('slist').split(',').map(x => x.trim()).filter(x => /^\d{4}-\d\d-\d\d$/.test(x)).sort() },
      };
      s.benefitsCfg = { thirteenth: fd.get('thirteenth') === '1', silDays: Number(fd.get('silDays')) || 0, birthdayGift: Number(fd.get('birthdayGift')) || 0 };
      commit('Changed pay settings', s.fullName); staffModal(s.id, 'pay'); toast('Pay settings saved.');
    },
    agreement: fd => {
      const staff = fd.getAll('staff');
      if (staff.length < 2) { toast('Choose at least two helpers to alternate.'); return; }
      if (!staff.includes(fd.get('first'))) { toast('The first turn must be one of the chosen helpers.'); return; }
      const start = fd.get('start') < todayStr() ? todayStr() : fd.get('start');
      // one agreement at a time per helper: end any running one
      (state.restAgreements || []).filter(a => !a.end && a.staff.some(id => staff.includes(id))).forEach(a => { a.end = U.addDays(start, -1); });
      state.restAgreements.push({ id: uid('ag'), type: 'alternating2', staff, days: fd.get('days').split(',').map(Number), first: fd.get('first'), start, end: '', goOut: fd.get('goOut') === '1' });
      commit('Rest-day agreement', `Alternating two-day off: ${staff.map(sName).join(' ⇄ ')} from ${fmtD(start)}`);
      const nh = noHelperDays(todayStr(), 28);
      toast(nh.length ? `Saved. Warning: no helper on ${nh.slice(0, 3).map(fmtDS).join(', ')}${nh.length > 3 ? '…' : ''}.` : 'Saved. The schedule follows the agreement.');
    },
    'task-hold': fd => {
      const t = state.tasks.find(x => x.id === fd.get('id'));
      t.onHold = true; t.holdUntil = fd.get('until') || ''; t.holdReason = (fd.get('reason') || '').trim();
      closeModal(); commit('Put task on hold', `${t.name}${t.holdUntil ? ' until ' + fmtD(t.holdUntil) : ''}${t.holdReason ? ' · ' + t.holdReason : ''}`);
    },
    'salary-add': fd => {
      const sid = fd.get('sid'), id = fd.get('id'), rate = Number(fd.get('rate')), from = fd.get('from'), S = state.settings;
      const msg = t => { const m = document.getElementById('sal-msg'); if (m) m.innerHTML = `<div class="alert bad">${esc(t)}</div>`; else toast(t); };
      if (!from) { msg('Choose the date the salary starts.'); return; }
      if (!(rate > 0)) { msg('Enter the amount.'); return; }
      const old = id ? state.salaryHistory.find(h => h.id === id) : null;
      const lockedBy = d0 => state.payRuns.some(r => r.staffId === sid && r.status === 'paid' && r.periodEnd >= d0);
      if (old && lockedBy(old.effectiveFrom) && (old.rate !== rate || old.effectiveFrom !== from || old.basis !== fd.get('basis'))) { msg('A paid pay run already used this salary. Add a new salary change from a later date instead.'); return; }
      if (!old && lockedBy(from) && !confirm('A paid pay run already covers this date. The change will apply to future pay runs only (corrections go in as adjustment lines). Continue?')) return;
      if (S.minWage && fd.get('basis') === 'monthly' && rate < Number(S.minWage) && !confirm(`₱${P.fmt(rate)} is below the regional minimum in Settings (₱${P.fmt(S.minWage)}). Save anyway?`)) return;
      const reason = (fd.get('reason') || '').trim() || (from > todayStr() ? 'Scheduled raise' : 'Salary change');
      if (old) Object.assign(old, { effectiveFrom: from, basis: fd.get('basis'), rate, reason });
      else { state.salaryHistory = state.salaryHistory.filter(h => !(h.staffId === sid && h.effectiveFrom === from)); state.salaryHistory.push({ id: uid('sh'), staffId: sid, effectiveFrom: from, basis: fd.get('basis'), rate, reason }); }
      closeModal(); commit(old ? 'Edited salary' : 'Salary change', `${sName(sid)} · ₱${P.fmt(rate)} from ${fmtD(from)}`); staffModal(sid, 'pay');
      toast(from > todayStr() ? `Saved. ₱${P.fmt(rate)} starts automatically on ${fmtD(from)}.` : 'Salary saved.');
    },
    'benefit-add': fd => {
      const sid = fd.get('sid'), sch = fd.get('schedule');
      state.benefits.push({ id: uid('bn'), staffId: sid, type: fd.get('type'), name: fd.get('name').trim(), amount: Number(fd.get('amount')), schedule: fd.get('type') === 'medical' ? 'once' : sch,
        date: sch === 'once' || fd.get('type') === 'medical' ? fd.get('date') : '', start: sch !== 'once' ? fd.get('date') : '', end: fd.get('end') || '', note: fd.get('note').trim() });
      commit('Added benefit', `${sName(sid)} · ${fd.get('name')}`); staffModal(sid, 'pay');
    },
    gov: fd => {
      const s = staffById(fd.get('sid')); s.gov = s.gov || {};
      Object.keys(P.AGENCIES).forEach(ag => { const g = P.govOf(s, ag); s.gov[ag] = { no: fd.get(ag + '_no').trim() || g.no, status: fd.get(ag + '_status'), registered: fd.get(ag + '_registered'), coverage: fd.get(ag + '_coverage'), enabled: fd.get(ag + '_enabled') === '1' }; });
      commit('Edited government numbers', s.fullName); staffModal(s.id, 'contrib');
    },
    'run-lines': fd => {
      const r = state.payRuns.find(x => x.id === fd.get('id')), reason = (fd.get('reason') || '').trim();
      const next = [];
      for (let i = 0; i < r.lines.length; i++) {
        const l = r.lines[i]; if (fd.get('del_' + i)) { if (l.auto && !reason) { toast('Give a reason for removing a computed line.'); return; } continue; }
        const amt = P.r2(fd.get('amt_' + i));
        if (amt !== l.amount) { if (l.auto && !reason) { toast('Give a reason for changing a computed line.'); return; } next.push(Object.assign({}, l, { amount: amt, reason: reason || l.reason, edited: true })); }
        else next.push(l);
      }
      const nd = (fd.get('ndesc') || '').trim(), na = Number(fd.get('namt'));
      if (nd && na) next.push({ id: uid('ln'), kind: fd.get('nkind'), code: 'manual', desc: nd, amount: P.r2(na), auto: false, reason });
      r.lines = next; commit('Edited pay run', `${sName(r.staffId)} · ${fmtD(r.payday)}${reason ? ' · ' + reason : ''}`); runModal(r.id);
    },
    'run-pay': async fd => {
      const r = state.payRuns.find(x => x.id === fd.get('id')), t = P.totals(r.lines), cash = Number(fd.get('cash')) || 0, gcash = Number(fd.get('gcash')) || 0;
      if (Math.abs(cash + gcash - t.net) > 0.01 && !confirm(`Cash + GCash = ${peso(cash + gcash)}, but net pay is ${peso(t.net)}. Record anyway?`)) return;
      let proof = null; try { proof = await readDoc(fd.get('proof')); } catch (e) { /* optional */ }
      r.payment = { date: fd.get('date'), mode: fd.get('mode'), cash, gcash, ref: fd.get('ref').trim(), proof, envelope: fd.get('envelope').trim() };
      r.status = 'paid'; r.paidAt = new Date().toISOString();
      r.lines.filter(l => l.code === 'vale').forEach(l => { const v = state.vales.find(x => x.id === l.ref); if (!v) return; (v.entries = v.entries || []).push({ date: r.payment.date, amount: l.amount, via: 'payroll', runId: r.id }); if (P.valeBalance(v) <= 0) v.status = 'paid'; });
      commit('Recorded payment', `${sName(r.staffId)} · ${peso(t.net)} · ${fmtD(r.payment.date)}`); runModal(r.id); toast('Paid and locked. Print the payslip for signing.');
    },
    'run-slip': async fd => {
      const r = state.payRuns.find(x => x.id === fd.get('id'));
      try { const f = await readDoc(fd.get('slip')); if (!f) return; r.signedSlip = f; commit('Uploaded signed payslip', `${sName(r.staffId)} · ${fmtD(r.payday)}`); runModal(r.id); } catch (e) { toast('That file is too big (8 MB max).'); }
    },
    'vale-new': async fd => {
      const sid = fd.get('sid'), s = staffById(sid), amount = Number(fd.get('amount')), sal = curSalary(sid, fd.get('date'));
      const limit = sal ? P.monthlyOf(state, sal, P.payOf(s).schedule) * (Number(state.settings.valeMaxMonths) || 1) : 0, open = P.valeBalanceOf(state, sid);
      if (limit && open + amount > limit && !confirm(`Vale balance would be ${peso(open + amount)}, more than the contract limit of ${peso(limit)} (one month's salary). Save anyway?`)) return;
      const ptype = fd.get('ptype'), plan = { type: ptype };
      if (ptype === 'installment') { plan.amount = Number(fd.get('pamount')); plan.start = fd.get('pdate') || P.periodFor(state, s, fd.get('date')).payday; if (!plan.amount) { toast('Enter the installment per payday.'); return; } }
      if (ptype === 'lump') { plan.date = fd.get('pdate'); if (!plan.date) { toast('Enter the lump-sum date.'); return; } }
      if (ptype === 'custom') { plan.items = fd.get('pitems').split('\n').map(l => l.split('|').map(x => x.trim())).filter(x => x[0] && x[1]).map(([date, amt]) => ({ date, amount: Number(amt) })); if (!plan.items.length) { toast('Add at least one "date | amount" line.'); return; } }
      let auth = null, proof = null;
      try { auth = await readDoc(fd.get('auth')); proof = await readDoc(fd.get('proof')); } catch (e) { toast('A file is too big (8 MB max).'); return; }
      state.vales.push({ id: uid('va'), staffId: sid, date: fd.get('date'), amount, via: fd.get('via'), ref: fd.get('ref').trim(), proof, reason: fd.get('reason').trim(), method: fd.get('method'), plan, authorization: auth, entries: [], status: 'active' });
      closeModal(); commit('Gave vale', `${s.fullName} · ${peso(amount)} · ${fmtD(fd.get('date'))}`);
      toast(['salary', 'mixed'].includes(fd.get('method')) && !auth ? 'Saved. Upload the signed authorization before deductions can start.' : 'Vale saved. Installments appear in the pay runs.');
    },
    'vale-auth': async fd => { const v = state.vales.find(x => x.id === fd.get('id')); try { const f = await readDoc(fd.get('auth')); if (!f) return; v.authorization = f; commit('Uploaded vale authorization', sName(v.staffId)); valeDetail(v.id); } catch (e) { toast('That file is too big (8 MB max).'); } },
    'vale-repay': fd => {
      const v = state.vales.find(x => x.id === fd.get('id')), amt = Number(fd.get('amount'));
      (v.entries = v.entries || []).push({ date: fd.get('date'), amount: Math.min(amt, P.valeBalance(v)), via: fd.get('via'), ref: fd.get('ref').trim() });
      if (P.valeBalance(v) <= 0) v.status = 'paid';
      commit('Vale repayment', `${sName(v.staffId)} · ${peso(amt)}`); valeDetail(v.id);
    },
    'contrib-pay': async fd => {
      const k = fd.get('k'), [sid, ag, m] = k.split('|'), c = P.contribution(state, staffById(sid), ag, m);
      let receipt = null; try { receipt = await readDoc(fd.get('receipt')); } catch (e) { toast('That file is too big (8 MB max).'); return; }
      state.contributions[k] = { paidOn: fd.get('paidOn'), channel: fd.get('channel').trim(), ref: fd.get('ref').trim(), receipt, ee: c.ee, er: c.er, basis: c.basis };
      closeModal(); commit('Contribution paid', `${sName(sid)} · ${P.AGENCIES[ag]} ${m}`);
    },
    ctables: fd => {
      state.contribTables.forEach(t => {
        t.from = fd.get('from_' + t.id) || t.from; t.eeRate = Number(fd.get('ee_' + t.id)) / 100; t.erRate = Number(fd.get('er_' + t.id)) / 100;
        t.floor = Number(fd.get('floor_' + t.id)) || 0; t.ceiling = Number(fd.get('ceil_' + t.id)) || 0; t.step = Number(fd.get('step_' + t.id)) || 0;
        if (t.agency === 'sss') { t.ecLow = Number(fd.get('ecl_' + t.id)) || 0; t.ecHigh = Number(fd.get('ech_' + t.id)) || 0; }
      });
      commit('Edited contribution tables');
    },
    employer: fd => {
      const S = state.settings; S.employerNos = S.employerNos || {}; S.contribDue = S.contribDue || {};
      Object.keys(P.AGENCIES).forEach(k => { S.employerNos[k] = fd.get('no_' + k).trim(); S.contribDue[k] = Number(fd.get('due_' + k)) || 0; });
      S.kasambahayEeThreshold = Number(fd.get('threshold')) || 0; commit('Edited household employer details');
    },
    // ---------- Phase 4 forms ----------
    incident: async fd => {
      const id = fd.get('id'), old = id ? state.incidents.find(x => x.id === id) : null;
      const i = Object.assign(old || { id: uid('in'), photos: [], createdAt: new Date().toISOString() }, {
        type: fd.get('type'), status: fd.get('status'), foundOn: fd.get('foundOn'), happenedOn: fd.get('happenedOn'), applianceId: fd.get('applianceId'), templateId: fd.get('templateId'),
        categoryId: fd.get('categoryId'), description: fd.get('description').trim(), explanation: fd.get('explanation').trim(), finding: fd.get('finding').trim(), action: fd.get('action'), cost: fd.get('cost'),
      });
      for (const file of fd.getAll('photos')) { try { const p = await readImage(file, 1600); if (p) i.photos.push(p); } catch (e) { toast('Could not read a photo.'); } }
      const date = i.happenedOn || i.foundOn, w = F4.whoWasAssigned(state, date, incTarget(i), { week: getWeek(date) });
      // keep a copy of who was assigned at the time of recording (the live lookup is shown too)
      i.snapshot = { date, categoryId: w.categoryId, leadId: w.leadId, mainIds: [...new Set(w.occurrences.map(o => o.mainId).filter(Boolean))], assistIds: [...new Set(w.occurrences.map(o => o.assistId).filter(Boolean))], fromRecord: w.fromRecord, at: new Date().toISOString() };
      if (!old) state.incidents.push(i);
      closeModal(); commit(old ? 'Edited incident' : 'Recorded incident', `${F4.INCIDENT_TYPES[i.type]} · ${incLabel(i)} · ${fmtD(date)}`);
    },
    appliance: async fd => {
      const id = fd.get('id'), a = id ? state.appliances.find(x => x.id === id) : { id: uid('ap'), photo: null };
      ['name', 'area', 'brand', 'model', 'purchased', 'warrantyUntil', 'condition', 'categoryId', 'notes'].forEach(k => { a[k] = (fd.get(k) || '').trim(); });
      try { const p = await readImage(fd.get('photo'), 1600); if (p) a.photo = p; } catch (e) { toast('Could not read the photo.'); }
      if (!id) state.appliances.push(a);
      closeModal(); commit(id ? 'Edited appliance' : 'Added appliance', a.name);
    },
    coaching: async fd => {
      const id = fd.get('id'), c = id ? state.coaching.find(x => x.id === id) : { id: uid('co'), createdAt: new Date().toISOString() }, rel = fd.get('related') || '';
      let related = { kind: '', ref: '', label: '' };
      if (rel) { const [kind, ...rest] = rel.split(':'), ref = rest.join(':'); related = { kind, ref, label: kind === 'incident' ? (i => i ? F4.INCIDENT_TYPES[i.type] + ' · ' + incLabel(i) : '')(state.incidents.find(x => x.id === ref)) : kind === 'handbook' ? '§' + ref + ' ' + ((hbSection(ref) || {}).title || '') : (c.related && c.related.label) || ref }; }
      Object.assign(c, { date: fd.get('date'), staffId: fd.get('staffId'), type: fd.get('type'), related, what: fd.get('what').trim(), plan: fd.get('plan').trim(), followUp: fd.get('followUp'), outcome: fd.get('outcome') });
      try { const f = await readDoc(fd.get('ack')); if (f) c.ack = f; } catch (e) { toast('That file is too big (8 MB max).'); return; }
      if (!id) { state.coaching.push(c); if (related.kind === 'incident') { const i = state.incidents.find(x => x.id === related.ref); if (i) i.coachingId = c.id; } }
      closeModal(); commit(id ? 'Edited coaching entry' : 'Coaching entry', `${sName(c.staffId)} · ${COACH_TYPES[c.type][1]}`);
    },
    lesson: fd => {
      const id = fd.get('id'), l = id ? state.lessons.find(x => x.id === id) : { id: uid('le'), completions: [] };
      Object.assign(l, { title: fd.get('title').trim(), objective: fd.get('objective').trim(), steps: fd.get('steps').split('\n').map(x => x.trim()).filter(Boolean), showMe: fd.get('showMe').split('\n').map(x => x.trim()).filter(Boolean), source: JSON.parse(fd.get('source') || '{}') });
      if (id) l.completions = state.staff.filter(s => fd.get('done_' + s.id)).map(s => ({ staffId: s.id, date: fd.get('done_' + s.id), by: 'Owner' }));
      if (!id) state.lessons.push(l);
      closeModal(); commit(id ? 'Edited lesson' : 'Added lesson', l.title);
    },
    course: async fd => {
      let certificate = null; try { certificate = await readDoc(fd.get('certificate')); } catch (e) { toast('That file is too big (8 MB max).'); return; }
      state.courses.push({ id: uid('cs'), staffId: fd.get('staffId'), course: fd.get('course').trim(), provider: fd.get('provider').trim(), schedule: fd.get('schedule').trim(), cost: Number(fd.get('cost')) || 0, completed: fd.get('completed'), certificate });
      commit('Added course', `${sName(fd.get('staffId'))} · ${fd.get('course')}`);
    },
    'hb-draft': fd => {
      const n = Number(fd.get('n')), secs = [];
      for (let i = 0; i < n; i++) { if (fd.get('del_' + i)) continue; const num = fd.get('num_' + i).trim(); if (num) secs.push({ num, title: fd.get('title_' + i).trim(), body: fd.get('body_' + i) }); }
      if (fd.get('num_new').trim() && fd.get('title_new').trim()) secs.push({ num: fd.get('num_new').trim(), title: fd.get('title_new').trim(), body: fd.get('body_new') });
      const dup = secs.map(s => s.num).find((x, i, a) => a.indexOf(x) !== i); if (dup) { toast('Section ' + dup + ' is listed twice.'); return; }
      state.handbook.draft.sections = F4.sortSections(secs); commit('Saved handbook draft', secs.length + ' sections'); toast('Draft saved.');
    },
    'hb-publish': fd => {
      const cur = latestHb(), v = { version: F4.nextVersion(cur && cur.version), publishedOn: todayStr(), sections: JSON.parse(JSON.stringify(state.handbook.draft.sections)), note: fd.get('note').trim() };
      state.handbook.versions.push(v); state.handbook.outline = false; ui.hbTab = 'versions';
      closeModal(); commit('Published handbook', 'v' + v.version); toast('Published v' + v.version + '. Export it to Word for signing.');
    },
    'hb-ack': async fd => {
      const cur = latestHb(), sid = fd.get('sid');
      let file = null; try { file = await readDoc(fd.get('file')); } catch (e) { toast('That file is too big (8 MB max).'); return; }
      if (!file && !confirm('No signed page attached. Record the acknowledgment anyway?')) return;
      state.handbookAcks = state.handbookAcks.filter(a => !(a.staffId === sid && a.version === cur.version));
      state.handbookAcks.push({ staffId: sid, version: cur.version, signedOn: fd.get('date'), file });
      commit('Handbook acknowledgment', `${sName(sid)} · v${cur.version}`);
    },
    'hb-export': fd => {
      const ver = fd.get('version'), hb = state.handbook, v = ver === 'draft' ? { version: (F4.nextVersion(latestHb() && latestHb().version)) + ' draft', publishedOn: '', sections: hb.draft.sections } : hb.versions.find(x => x.version === ver);
      const people = fd.getAll('staff').map(staffById).filter(Boolean);
      const blob = F4.handbookDocx(hb, v, { household: state.settings.householdName, addenda: people.map(addendumFor), signers: people.map(s => s.fullName), letter: fd.get('paper') === 'Letter' });
      downloadBlob(blob, `Handbook v${v.version.replace(/\s+/g, '-')}.docx`); closeModal(); toast('Word file downloaded.');
    },
    'payroll-policy': fd => {
      const S = state.settings;
      S.thirteenthDate = fd.get('thirteenthDate') || '12-15'; S.annualIncrease = Number(fd.get('annualIncrease')) || 0; S.salaryCap = Number(fd.get('salaryCap')) || 0;
      S.regIncentive = Number(fd.get('regIncentive')) || 0; S.valeMaxMonths = Number(fd.get('valeMaxMonths')) || 1; S.minWage = fd.get('minWage') ? Number(fd.get('minWage')) : '';
      commit('Changed payroll policy'); toast('Payroll policy saved.');
    },
    regularize: fd => {
      const s = staffById(fd.get('sid')), date = fd.get('date'), amt = Number(fd.get('salary'));
      s.status = 'regular'; s.regularizedOn = date;
      const cur = P.salaryOn(state, s.id, date);
      if (amt && (!cur || P.monthlyOf(state, cur, P.payOf(s).schedule) !== amt)) state.salaryHistory.push({ id: uid('sh'), staffId: s.id, effectiveFrom: date, basis: 'monthly', rate: amt, reason: 'Regularization' });
      s.benefitsCfg = Object.assign(P.benOf(s), { thirteenth: true, birthdayGift: Number(fd.get('birthdayGift')) || 0, silDays: Number(fd.get('silDays')) || 0 });
      if (fd.get('incentive') && Number(fd.get('incAmt'))) state.benefits.push({ id: uid('bn'), staffId: s.id, type: 'bonus', name: 'Regularization cash incentive (provisional contract)', amount: Number(fd.get('incAmt')), schedule: 'once', date, note: '' });
      if (fd.get('contract')) {
        state.contracts.filter(c => c.staffId === s.id && c.type === 'provisional' && ['signed', 'draft'].includes(c.status)).forEach(c => { c.status = 'superseded'; (c.history = c.history || []).push(`${todayStr()}: superseded at regularization`); });
        const T = state.contractTemplates.regular, fields = {}; T.fields.forEach(f => { fields[f.id] = f.default; });
        Object.assign(fields, { startDate: date, endDate: '', salary: amt || (cur ? P.monthlyOf(state, cur, P.payOf(s).schedule) : '') });
        state.contracts.push({ id: uid('ct'), staffId: s.id, type: 'regular', version: 1, templateVersion: T.version, fields, status: 'draft', signed: null, history: [], createdAt: new Date().toISOString() });
      }
      closeModal(); commit('Regularized staff', `${s.fullName} · effective ${fmtD(date)}`); staffModal(s.id, 'overview');
      toast('Regularized. ' + (fd.get('contract') ? 'A Regular contract draft is ready under Contracts.' : ''));
    },
    'backup-export': async (fd, form) => {
      if (fd.get('pw') !== fd.get('pw2')) { toast('The two passwords do not match.'); return; }
      const btn = document.querySelector('[form="bk-form"][type="submit"]'); if (btn) { btn.disabled = true; btn.textContent = 'Encrypting…'; }
      try {
        const copy = JSON.parse(JSON.stringify(state)); delete copy._persisted;
        const file = await encryptBackup(copy, fd.get('pw'));
        const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `home-manager-backup-${todayStr()}.mhmbackup`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        state.lastBackupAt = new Date().toISOString();
        closeModal(); commit('Downloaded encrypted backup'); toast('Backup downloaded. Move it off this device.');
      } catch (e) { console.error(e); toast('Could not create the backup.'); if (btn) { btn.disabled = false; btn.textContent = 'Encrypt and download'; } }
    },
    'backup-import': async fd => {
      try { const s = await decryptBackup(pendingImport.file, fd.get('pw')); restoreFrom(s, pendingImport.name); pendingImport = null; }
      catch (e) { toast('Wrong password, or the file is damaged.'); }
    },
  };

  const CHANGE = {
    'day-date': el => { if (el.value) { ui.date = el.value; render(); } },
    'task-cat': el => { ui.taskCat = el.value; render(); },
    'task-freqf': el => { ui.taskFreq = el.value; render(); },
    'task-prif': el => { ui.taskPri = el.value; render(); },
    'task-q': el => { ui.taskQ = el.value; render(); },
    'task-inactive': el => { ui.showInactive = el.checked; render(); },
    'show-exited': el => { ui.showExited = el.checked; render(); },
    'groc-day': el => { const s = new Set(groceryDays()); if (el.checked) s.add(el.dataset.d); else s.delete(el.dataset.d); ui.groceryDays = [...s].sort(); render(); },
    'groc-got': el => { const s = new Set(ui.groceryGot || []); if (el.checked) s.add(el.dataset.k); else s.delete(el.dataset.k); ui.groceryGot = [...s]; },
    'hb-read': el => { ui.hbRead = el.value; render(); },
    'meal-course': el => { // show only the recipes of the chosen course in that row
      const sel = document.querySelector(`#meal-edit-form select[name="r_${el.dataset.row}"]`); if (!sel) return;
      const cats = E.COURSE_CATS[el.value] || [];
      [...sel.options].forEach(o => { if (o.value) o.hidden = !cats.includes(o.dataset.cats) && !o.selected; });
    },
    'recipe-cat': el => { ui.recipeCat = el.value; render(); },
    'recipe-q': el => { ui.recipeQ = el.value; render(); },
    'recipe-serv': el => { const n = Math.max(1, Number(el.value) || 1); recipeModal(el.dataset.id, n); },
    'meal-cycle-on': el => { state.mealCycle.on = el.checked; commit(el.checked ? 'Turned on 4-week menu cycle' : 'Turned off 4-week menu cycle'); },
    'cal-staff': el => { ui.calStaff = el.value; render(); },
    'fp-through': el => finalPayModal(el.dataset.id, el.value),
    'lead-mode': () => leadModeUI(),
    'slip-all': el => document.querySelectorAll('.slip-pick').forEach(x => { x.checked = el.checked; }),
    'task-field': el => {
      const t = state.tasks.find(x => x.id === el.dataset.id), f = el.dataset.f, v = el.value;
      if (f === 'freq') { if (v === 'custom') return; t.freq = freqFromKey(v, t.freq); }
      else if (f === 'ws' || f === 'we') {
        const w = [...t.window]; w[f === 'ws' ? 0 : 1] = v;
        if (!v || w[1] <= w[0]) { toast('The latest finish must be after the earliest start.'); render(); return; }
        t.window = w;
      } else if (f === 'minutes') { const n = Math.round(Number(v)); if (!(n >= 5)) { toast('At least 5 minutes.'); render(); return; } t.minutes = n; if (t.assistMode === 'required') t.assistMinutes = n; }
      else if (f === 'assistMode') { t.assistMode = v; t.assistMinutes = v === 'required' ? t.minutes : v === 'optional' ? Math.round(t.minutes / 2) : 0; }
      else t[f] = v;
      commit('Edited task', `${t.name}: ${{ freq: 'frequency → ' + E.freqLabel(t.freq), ws: 'earliest start → ' + v, we: 'latest finish → ' + v, minutes: v + ' min', difficulty: v === 'H' ? 'Heavy' : 'Light', assistMode: 'assist → ' + v, priority: 'priority → ' + v }[f]}`);
    },
    'exc-type': () => excTypeUI(),
    'event-type': () => eventTypeUI(),
    'event-cat': el => { // a public holiday: everyone home, no school
      const f = document.getElementById('event-form'); if (!f) return;
      if (el.value === 'holiday') f.type.value = 'holiday'; else if (f.type.value === 'holiday') f.type.value = 'occasion';
      eventTypeUI();
    },
    'ev-approve': () => evApproveCount(),
    'mon-mode': el => { ui.monMode = el.value; render(); },
    // event planner: not held / moved, for one occasion (a yearly event: that year only)
    'ev-show': el => { ui.evShow = el.value; render(); },
    'ev-cancel': el => {
      const e = state.events.find(x => x.id === el.dataset.sid), y = el.dataset.y, name = e.title || E.EVENT_TYPES[e.type].label;
      if (e.repeat === 'yearly') { e.overrides = e.overrides || {}; if (el.checked) e.overrides[y] = { cancelled: true }; else delete e.overrides[y]; }
      else { e.cancelled = el.checked; if (el.checked) e.movedTo = ''; }
      commit(el.checked ? 'Event not held' : 'Event back on', `${name}${e.repeat === 'yearly' ? ' · ' + y : ''}`);
    },
    'ev-movechk': el => {
      const e = state.events.find(x => x.id === el.dataset.sid), y = el.dataset.y, inp = el.closest('.ev-ctl').querySelector('.ev-move');
      if (el.checked) { inp.style.display = ''; inp.focus(); return; } // pick the new date next
      if (e.repeat === 'yearly') { if (e.overrides && e.overrides[y]) delete e.overrides[y]; } else e.movedTo = '';
      commit('Event back to its date', `${e.title || E.EVENT_TYPES[e.type].label}${e.repeat === 'yearly' ? ' · ' + y : ''}`);
    },
    'ev-move': el => {
      const e = state.events.find(x => x.id === el.dataset.sid), y = el.dataset.y, v = el.value; if (!v) return;
      if (v < todayStr()) { toast('Move it to today or a later date.'); return; }
      if (e.repeat === 'yearly') { e.overrides = e.overrides || {}; e.overrides[y] = { movedTo: v }; } else { e.movedTo = v; e.cancelled = false; }
      commit('Event moved', `${e.title || E.EVENT_TYPES[e.type].label} → ${fmtD(v)}`); toast('Moved to ' + fmtD(v) + '. The schedule follows the new date.');
    },
    'task-who': el => {
      const t = state.tasks.find(x => x.id === el.dataset.id), v = el.value;
      if (v === 'manual') { el.value = t.assign && t.assign.staffId ? (t.assign.mode === 'fixed' ? 'fixed:' + t.assign.staffId : 'manual') : 'rotation'; taskModal(t.id); const f = document.getElementById('task-form'); if (f) { f.amode.value = 'manual'; f.auntil.focus(); } return; }
      t.assign = v === 'rotation' ? null : { mode: 'fixed', staffId: v.split(':')[1], from: '', until: '' };
      commit('Task assignment', `${t.name}: ${v === 'rotation' ? 'on rotation' : 'fixed to ' + sName(t.assign.staffId)}`);
    },
    'inc-who': el => { const f = el.form; document.getElementById('who-panel').innerHTML = whoPanel(f.happenedOn.value || f.foundOn.value, { applianceId: f.applianceId.value || undefined, templateId: f.templateId.value || undefined, categoryId: f.categoryId.value || undefined }); },
    'coach-staff': el => { ui.coachStaff = el.value; render(); },
    'skill-level': el => { state.skillLevels[el.dataset.k] = { level: Number(el.value), date: todayStr(), by: 'Owner' }; commit('Skill level', el.dataset.k + ' → ' + F4.LEVELS[Number(el.value)]); },
    'onb-done': el => { const x = state.onboarding[el.dataset.s].find(y => y.id === el.dataset.x); x.done = el.checked ? todayStr() : ''; commit('Onboarding', `${sName(el.dataset.s)} · ${x.item} · ${el.checked ? 'done' : 'not done'}`); },
    'course-ref': el => { if (!el.value) return; const [p, c] = el.value.split('|'); el.form.course.value = c; el.form.provider.value = p; },
    'lesson-src': el => lessonModal(null, el.value),
    'hb-import': el => {
      const f = el.files[0]; if (!f) return; el.value = '';
      const fr = new FileReader();
      fr.onload = async () => {
        try {
          const secs = await F4.importDocx(fr.result);
          if (secs.length < 2) { toast('No numbered sections found. Section headings should start with a number, like "4.3 Floors".'); return; }
          if (!confirm(`Found ${secs.length} sections in ${f.name}. Replace the current draft with them? Published versions are not changed.`)) return;
          state.handbook.draft = { sections: secs, basedOn: '', note: 'Imported from ' + f.name }; state.handbook.outline = false; ui.hbTab = 'sections';
          commit('Imported handbook from Word', `${f.name} · ${secs.length} sections`); toast('Imported. Review the sections, then publish.');
        } catch (e) { console.error(e); toast('Could not read that file. Save it as .docx (Word 2007 or later) and try again.'); }
      };
      fr.readAsArrayBuffer(f);
    },
    'r-from': el => { ui.rFrom = el.value; render(); },
    'r-to': el => { ui.rTo = el.value; render(); },
    'r-by': el => { ui.rBy = el.value; render(); },
    'cal-cat': el => { ui.calCat = el.value; render(); },
    photo: async el => {
      const s = staffById(el.dataset.id), file = el.files[0];
      try {
        const src = await readImage(file, 1600); if (!src) return;
        s.photos = s.photos || {}; s.photos[el.dataset.slot] = { src, date: todayStr() };
        commit('Added photo', `${s.fullName} · ${el.dataset.slot}`); staffModal(s.id, 'photos');
      } catch (e) { toast('Could not read the image.'); }
    },
    import: el => {
      const f = el.files[0]; if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        el.value = '';
        let s;
        try { s = JSON.parse(fr.result); } catch (e) { toast('That file is not a Home Manager backup.'); return; }
        if (s && s.format === 'mhm-backup' && s.encrypted) {
          if (!(window.crypto && crypto.subtle)) { toast('Decryption is not available in this browser window. Open the app with serve.ps1.'); return; }
          pendingImport = { file: s, name: f.name };
          modal('Restore encrypted backup', `<form data-form="backup-import" class="form" id="bi-form">
            <div class="full small">${esc(f.name)} · made ${esc((s.createdAt || '').slice(0, 10))}</div>
            <label class="field full">Backup password<input type="password" name="pw" required autocomplete="current-password"></label>
            <div class="full alert warn">⚠ Restoring replaces all data currently on this device.</div></form>`,
            `<button class="btn" data-act="close">Cancel</button><button class="btn primary" type="submit" form="bi-form">Unlock and restore</button>`);
        } else restoreFrom(s, f.name); // older unencrypted export
      };
      fr.readAsText(f);
    },
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const fn = ACT[el.dataset.act]; if (!fn) return;
    if (el.dataset.act !== 'modal-bg') e.preventDefault();
    fn(el.dataset, el, e);
  });
  document.addEventListener('submit', e => {
    const f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault(); FORMS[f.dataset.form](new FormData(f), f);
  });
  document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el && CHANGE[el.dataset.change]) CHANGE[el.dataset.change](el, e); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  const VIEWS = { today: vToday, day: vDay, week: vWeek, leads: vLeads, tasks: vTasks, staff: vStaff, attendance: vAttendance, settings: vSettings, meals: vMeals, month: vMonth, payroll: vPayroll, contrib: vContrib, planner: () => `<div class="head"><h1>Event planner</h1><span class="sub">Family occasions — once or every year</span></div>${eventsView()}`, account: vAccount, coaching: vCoaching, training: vTraining, handbook: vHandbook, reports: vReports };
  /** The household's own forms in formats/ become the templates' original files (works when opened through serve.ps1). */
  const FORMAT_FILES = { biodata: 'formats/biodata.docx', provisional: 'formats/contract Kasambahay provisional 2026.docx', regular: 'formats/contract Kasambahay 2026.docx' };
  async function attachFormats() {
    let changed = false;
    for (const [k, path] of Object.entries(FORMAT_FILES)) {
      const T = k === 'biodata' ? state.biodataTemplate : state.contractTemplates && state.contractTemplates[k];
      if (!T || T.file) continue;
      try {
        const res = await fetch(encodeURI(path)); if (!res.ok) continue;
        const blob = await res.blob();
        const data = await new Promise((ok, bad) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = bad; fr.readAsDataURL(blob); });
        T.file = { name: path.split('/').pop(), type: blob.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: blob.size, data, at: todayStr(), from: path };
        changed = true;
      } catch (e) { /* opened from file:// or the file is missing: upload it in Forms & templates instead */ }
    }
    // the handbook: imported once into the draft while it is still the starter outline
    if (state.handbook && state.handbook.outline && !state.handbook.versions.length) {
      try {
        const res = await fetch('formats/handbook.docx');
        if (res.ok) {
          const secs = await F4.importDocx(await res.arrayBuffer());
          if (secs.length >= 3) { state.handbook.draft = { sections: secs, basedOn: '', note: 'Imported from formats/handbook.docx' }; state.handbook.outline = false; changed = true; }
        }
      } catch (e) { /* no handbook file yet */ }
    }
    if (changed) { state.audit.unshift({ at: new Date().toISOString(), user: 'Owner', action: 'Attached forms from the formats folder', detail: Object.values(FORMAT_FILES).join(', ') }); persist(); render(); }
  }
  (async () => {
    state = await loadState();
    if (!state.startedOn) state.startedOn = todayStr();
    persist();
    render();
    attachFormats();
    // ask the browser not to clear this data automatically under storage pressure
    try { if (navigator.storage && navigator.storage.persist) state._persisted = await navigator.storage.persist(); } catch (e) { /* not supported */ }
  })();
})();
