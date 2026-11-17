/* Montalban Home Manager — scheduling engine.
   Pure logic, no DOM. Implements spec §5.4: lead assignment, occurrence assignment,
   balancing, rotation, absences and time placement. Port to TypeScript later as-is. */
(function (root) {
  'use strict';

  // ---------- date / time helpers (dates are 'YYYY-MM-DD' strings, times are minutes from midnight) ----------
  const DAY_MS = 86400000;
  const EPOCH = '2026-01-05'; // a Monday; anchors every-other-day and every-2-weeks cycles
  const pad = n => String(n).padStart(2, '0');
  const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const fmtDate = t => { const d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  const addDays = (s, n) => fmtDate(parseDate(s) + n * DAY_MS);
  const dow = s => new Date(parseDate(s)).getUTCDay();
  const mondayOf = s => addDays(s, -((dow(s) + 6) % 7));
  const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / DAY_MS);
  const toMin = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); };
  const fmtMin = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  const monthStart = s => s.slice(0, 8) + '01';
  const nextMonth = s => { let [y, m] = s.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return y + '-' + pad(m) + '-01'; };
  const monthIndex = s => { const [y, m] = s.split('-').map(Number); return y * 12 + m - 1; };
  function addMonths(s, n) {
    let [y, m, d] = s.split('-').map(Number);
    m += n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return y + '-' + pad(m) + '-' + pad(Math.min(d, last));
  }
  const hash = str => { let h = 7; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); };
  // School calendar: Monday–Friday are school days unless a no-school entry covers the date (16 Nov 2026)
  const NO_SCHOOL = { holiday: ['🇵🇭', 'Public holiday'], suspension: ['🌧️', 'Class suspension'], sick: ['🤒', 'Everyone sick at home'], vacation: ['🏖️', 'School vacation'], other: ['🏫', 'No school'] };
  const noSchoolOn = (state, d) => (state.noSchool || []).find(x => x.from <= d && d <= (x.to || x.from)) || null;
  const isSchoolDay = (state, d) => { const w = dow(d); return w >= 1 && w <= 5 && !noSchoolOn(state, d) && !(state.noSchoolDates || []).includes(d) && !eventsOn(state, d).some(e => e.type === 'holiday'); };
  /** A lead-area id if the household has it, else a fallback (e.g. Cooking → Kitchen in older data). */
  const catOr = (state, id, fallback) => (state.categories || []).some(c => c.id === id) ? id : fallback;
  const addFlag = (o, f) => { if (!o.flags.includes(f)) o.flags.push(f); };

  // ---------- frequency ----------
  function perWeek(f) {
    switch (f.type) {
      case 'daily': return 7; case 'schoolDays': return 5; case 'eod': return 3.5;
      case 'perWeek': return f.n; case 'weekly': return 1; case 'biweekly': return 0.5;
      case 'monthly': return 12 / 52; case 'months': return 12 / 52 / f.n; case 'yearly': return 1 / 52;
      default: return 0;
    }
  }
  function badge(f) {
    switch (f.type) {
      case 'daily': case 'schoolDays': return 'D'; case 'eod': return 'EOD'; case 'perWeek': return f.n + '×W';
      case 'weekly': return 'W'; case 'biweekly': return '2W'; case 'monthly': return 'M';
      case 'months': return f.n === 3 ? 'Q' : f.n === 6 ? '6M' : f.n + 'M'; case 'yearly': return 'Y';
      default: return 'AN';
    }
  }
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function freqLabel(f) {
    switch (f.type) {
      case 'daily': return 'Daily'; case 'schoolDays': return 'School days';
      case 'eod': return 'Every other day' + (f.offset ? ' (alt.)' : '');
      case 'perWeek': return f.n + '×/week' + (f.days && f.days.length ? ' (' + f.days.map(d => WD[d]).join(', ') + ')' : '');
      case 'weekly': return 'Weekly' + (f.day != null ? ' (' + WD[f.day] + ')' : '');
      case 'biweekly': return 'Every 2 weeks'; case 'monthly': return 'Monthly';
      case 'months': return 'Every ' + f.n + ' months'; case 'yearly': return 'Yearly' + (f.month ? ' (month ' + f.month + ')' : '');
      default: return 'As needed';
    }
  }
  const assistMinutesOf = t => t.assistMode === 'none' ? 0 : (Number(t.assistMinutes) || (t.assistMode === 'required' ? t.minutes : Math.round(t.minutes / 2)));
  const factorOf = (S, diff) => diff === 'H' ? Number(S.heavyFactor) : Number(S.lightFactor);

  // ---------- staff status ----------
  const isActive = (st, d) => st.active !== false && st.status !== 'applicant' && (!st.hireDate || st.hireDate <= d) && (!st.exitDate || d <= st.exitDate);
  function inShadow(st, d, S) {
    if (st.role !== 'helper' || st.shadow === 'off') return false;
    if (st.shadow === 'on') return true;
    if (S.shadowEnabled === false || st.status !== 'provisional' || !st.hireDate) return false;
    return daysBetween(st.hireDate, d) < (Number(S.shadowDays) || 14);
  }
  const isMainEligible = (st, d, S) => st.role === 'helper' && isActive(st, d) && !inShadow(st, d, S);

  const EXC_LABEL = {
    dayoff_unpaid: 'Day-off (unpaid)', dayoff_paid: 'Day-off (paid)', absent_unauthorized: 'Unauthorized absence', paid_leave: 'Paid leave',
    sick: 'Sick leave', half_am: 'Half day — AM off', half_pm: 'Half day — PM off',
  };
  const LEAVE_EVE = '19:00'; // day-off going out: leaves 7 PM the evening before (household contract)
  /** Standing rest-day agreement (alternating two-day off): on the agreed days of a week, the helper whose turn it is
      is off both days and the other(s) work, even on their usual rest day. Returns { mode: 'off' | 'on', ag } or null. */
  function agreementFor(state, st, d) {
    for (const ag of state.restAgreements || []) {
      if (ag.active === false || !(ag.staff || []).includes(st.id) || d < ag.start || (ag.end && d > ag.end) || !(ag.days || []).includes(dow(d))) continue;
      const k = Math.floor(daysBetween(mondayOf(ag.start), mondayOf(d)) / 7), first = Math.max(0, ag.staff.indexOf(ag.first));
      return { mode: ag.staff[(first + k) % ag.staff.length] === st.id ? 'off' : 'on', ag };
    }
    return null;
  }
  /** Is d a day off for st (rest day, moved rest day, replacement day or 2-day off)? Light check, no recursion. */
  function offInfo(state, st, d) {
    const ex = (state.exceptions || []).filter(e => e.staffId === st.id);
    if (ex.some(e => e.type === 'vacation' && e.date <= d && d <= (e.to || e.date))) return { off: true, out: true };
    const two = ex.find(e => e.type === 'two_day_off' && (e.date === d || e.to === d));
    if (two) return { off: true, out: true, two };
    const agr = agreementFor(state, st, d);
    if (agr && !ex.some(e => e.type === 'rest_worked' && e.date === d)) return agr.mode === 'off' ? { off: true, out: agr.ag.goOut !== false } : { off: false };
    if (ex.some(e => e.type === 'two_day_off' && e.swap === 'exchange' && e.exchangeDate === d)) return { off: false };
    if (ex.some(e => e.type === 'rest_moved' && e.to === d)) return { off: true, rest: true };
    if (ex.some(e => e.type === 'rest_worked' && e.comp === 'replacement' && e.replDate === d && e.portion !== 'half')) return { off: true, rest: true };
    const isRest = st.restDay !== '' && st.restDay != null && Number(st.restDay) === dow(d) && !ex.some(e => (e.type === 'rest_moved' || e.type === 'rest_worked') && e.date === d);
    return { off: isRest, rest: isRest };
  }
  /** Day-off "style": going out (leaves the evening before) or staying home. Per-day choice wins over the staff default. */
  function goesOut(state, st, d) {
    const ex = (state.exceptions || []).filter(e => e.staffId === st.id && e.date === d);
    if (ex.some(e => e.type === 'dayoff_home')) return false;
    if (ex.some(e => e.type === 'dayoff_out')) return true;
    return st.dayoffStyle === 'out';
  }
  /** Working status of one staff member on one date. blocks = times on a working day when the person is away. */
  function dayStatus(state, st, d) {
    if (!isActive(st, d)) return { working: false, label: st.exitDate && d > st.exitDate ? 'Exited' : 'Not active' };
    const ex = (state.exceptions || []).filter(e => e.staffId === st.id);
    const vac = ex.find(e => e.type === 'vacation' && e.date <= d && d <= (e.to || e.date));
    if (vac) return { working: false, label: 'On vacation' + (vac.place ? ' (' + vac.place + ')' : ''), absence: true, vacation: true, away: true };
    const two = ex.find(e => e.type === 'two_day_off' && (e.date === d || e.to === d));
    if (two) return { working: false, label: 'Two-day off (out)', rest: true, away: true };
    if (ex.some(e => e.type === 'rest_moved' && e.to === d)) return { working: false, label: 'Rest day (moved)', rest: true, away: goesOut(state, st, d) };
    const repl = ex.find(e => e.type === 'rest_worked' && e.comp === 'replacement' && e.replDate === d);
    if (repl && repl.portion !== 'half') return { working: false, label: 'Replacement day off', rest: true, away: goesOut(state, st, d) };
    const restMovedAway = ex.some(e => e.type === 'rest_moved' && e.date === d);
    let worked = ex.find(e => e.type === 'rest_worked' && e.date === d) || ex.find(e => e.type === 'two_day_off' && e.swap === 'exchange' && e.exchangeDate === d);
    const agr = !worked && !ex.some(e => (e.type === 'dayoff_paid' || e.type === 'dayoff_unpaid' || e.type === 'paid_leave' || e.type === 'sick') && e.date === d) ? agreementFor(state, st, d) : null;
    if (agr && agr.mode === 'off') return { working: false, label: 'Two-day off (agreement)' + (agr.ag.goOut !== false ? ' — out' : ' — resting at home'), rest: true, away: agr.ag.goOut !== false, agreement: true };
    if (agr && agr.mode === 'on') worked = { agreement: true }; // on duty this weekend under the agreement, even on her usual day-off
    if (st.restDay !== '' && st.restDay != null && Number(st.restDay) === dow(d) && !restMovedAway && !worked) {
      const out = goesOut(state, st, d);
      return { working: false, label: out ? 'Day-off (out)' : 'Day-off (resting at home)', rest: true, away: out };
    }
    const hours = st.role === 'driver' ? state.settings.driverHours : state.settings.helperHours;
    let start = toMin(hours.start), end = toMin(hours.end), label = worked ? (worked.agreement ? 'Working (2-day-off agreement: the other helper is off)' : 'Working on rest day') : 'Working', half = false;
    const blocks = [], notes = [];
    // going with the family to an event: away for the event's hours (or the whole day)
    for (const ev of eventsOn(state, d).filter(x => (x.companions || []).includes(st.id))) {
      const lbl = (EVENT_TYPES[ev.type] || { label: 'event' }).label.replace(/ \(.*\)$/, '');
      const f = ev.startTime && d === ev.date ? toMin(ev.startTime) : 0, t = ev.endTime && d === (ev.end || ev.date) ? toMin(ev.endTime) : 1440;
      if (!ev.startTime || !ev.endTime || (f <= start && t >= end)) return { working: false, label: 'With the family — ' + lbl, away: true, withFamily: true };
      blocks.push([f, t]); notes.push('with the family ' + fmtMin(f) + '–' + fmtMin(Math.min(t, 1439)) + ' (' + lbl + ')');
    }
    // the evening before a day-off spent out: leaves at 7 PM
    const tm = addDays(d, 1), nx = offInfo(state, st, tm);
    if (nx.off && (nx.out || goesOut(state, st, tm)) && st.role !== 'driver') { const lv = toMin(LEAVE_EVE); if (lv < end) { blocks.push([lv, end]); notes.push('leaves ' + LEAVE_EVE + ' (day-off tomorrow)'); } }
    // errands on a working day
    ex.filter(e => e.type === 'errand' && e.date === d && e.from && e.to).forEach(e => { blocks.push([toMin(e.from), toMin(e.to)]); notes.push('out ' + e.from + '–' + e.to + ' (errand)'); });
    if (notes.length) label += ' · ' + notes.join(', ');
    if (worked && worked.portion === 'half') { end = Math.min(end, 720); half = true; label = 'Rest day — works AM only'; }
    if (repl) { end = Math.min(end, 720); half = true; label = 'Replacement half day (PM off)'; }
    const e = ex.find(x => x.date === d && EXC_LABEL[x.type]);
    if (e) {
      if (!e.type.startsWith('half')) return { working: false, label: EXC_LABEL[e.type] + (e.type === 'sick' ? (e.where === 'away' ? ' — away' : ' — resting in the house') : ''), absence: true, inHouse: e.type === 'sick' && e.where !== 'away' };
      half = true; label = EXC_LABEL[e.type];
      if (e.type === 'half_pm') end = Math.min(end, 720); else start = Math.max(start, 720);
    }
    return { working: true, label, start, end, half, blocks, shadow: inShadow(st, d, state.settings) };
  }
  /** Free minutes in a window, minus the person's away blocks: is there a gap of at least `minutes`? */
  function freeGap(av, ws, we, minutes) {
    let s = Math.max(ws, av.start), e = Math.min(we, av.end);
    if (e - s < minutes) return false;
    const bl = (av.blocks || []).filter(b => b[0] < e && b[1] > s).sort((a, b) => a[0] - b[0]);
    for (const b of bl) { if (b[0] - s >= minutes) return true; s = Math.max(s, b[1]); }
    return e - s >= minutes;
  }

  // ---------- rest-day compensation (spec §5.6) ----------
  // premium 100%: the household contracts pay one extra day's salary when the employer asks a helper to skip the day-off
  const restCompOf = st => Object.assign({ premiumPct: 100, accumulate: false, maxDays: 2, expiryDays: 60 }, st.restComp || {});
  /** Ledger of rest days worked: earned / scheduled / used / expired / paid. A replacement day must be used within
      the window (settings.replacementWindowDays, default 14) unless the helper may accumulate (then expiryDays). */
  function restLedger(state, staffId, today) {
    const st = state.staff.find(s => s.id === staffId); if (!st) return [];
    const rc = restCompOf(st), win = rc.accumulate ? Number(rc.expiryDays) || 60 : Number(state.settings.replacementWindowDays) || 14;
    return (state.exceptions || []).filter(e => e.staffId === staffId && e.type === 'rest_worked').sort((a, b) => a.date.localeCompare(b.date)).map(e => {
      const expires = addDays(e.date, win);
      let status;
      if (e.comp === 'none') status = 'nopay';          // helper's own choice, no extra pay
      else if (e.comp === 'outside') status = 'outside'; // paid by someone outside the app
      else if (e.comp !== 'replacement') status = 'paid';
      else if (e.replDate) status = e.replDate <= today ? 'used' : 'scheduled';
      else status = today > expires ? 'expired' : 'earned';
      const daysLeft = status === 'earned' ? daysBetween(today, expires) : null;
      return { id: e.id, date: e.date, portion: e.portion || 'whole', comp: e.comp || 'pay', replDate: e.replDate || '', expires, status, daysLeft, warn: daysLeft != null && daysLeft <= 3 };
    });
  }

  // ---------- meals (spec §5.7) ----------
  // AM and PM snack slots were removed on 16 Nov 2026 (snack recipes stay in the library)
  const MEAL_SLOTS = [
    { id: 'breakfast', label: 'Breakfast', ws: '05:00', we: '06:30' },
    { id: 'baon', label: 'Packed lunch / baon', ws: '05:00', we: '06:30', school: true },
    { id: 'lunch', label: 'Lunch', ws: '11:00', we: '12:00' },
    { id: 'dinner', label: 'Dinner', ws: '16:30', we: '18:00' },
    { id: 'staff', label: 'Staff meals', info: true },
  ];
  /** A meal can have several dishes, each with a course. Recipes of these categories fit each course. */
  const COURSES = [['appetizer', 'Appetizer'], ['soup', 'Soup'], ['main', 'Main course'], ['vegetable', 'Vegetable side'], ['carbs', 'Carbs (rice, noodles, bread)']];
  const COURSE_CATS = { appetizer: ['appetizer', 'snack'], soup: ['soup'], main: ['ulam', 'breakfast', 'baon'], vegetable: ['vegetable'], carbs: ['carbs'] };
  const cycleWeek = d => ((Math.floor(daysBetween(EPOCH, mondayOf(d)) / 7) % 4) + 4) % 4;
  /** Dishes for a date and meal: [{course, recipeId?, text?, fromCycle?}] — the week's plan first, then the 4-week rotation.
      Older single-dish entries ({recipeId | text}) count as the main course. A plan entry with none:true means "no meal". */
  function mealItems(state, d, slot) {
    const norm = (x, cyc) => {
      if (!x) return null;
      if (x.none) return [];
      const list = Array.isArray(x.items) ? x.items : (x.recipeId || x.text) ? [x] : null;
      return list ? list.filter(i => i && (i.recipeId || i.text)).map(i => Object.assign({ course: i.course || 'main' }, i, cyc ? { fromCycle: true } : {})) : null;
    };
    const p = norm(state.mealPlan && state.mealPlan[d] && state.mealPlan[d][slot]);
    if (p && (p.length || (state.mealPlan[d][slot] || {}).none)) return p;
    const c = state.mealCycle;
    if (c && c.on && c.weeks) { const w = c.weeks[cycleWeek(d)]; return norm(w && w[dow(d)] && w[dow(d)][slot], true) || []; }
    return [];
  }
  /** The meal as one entry (its main dish) plus all its dishes in .items — for older callers. */
  function mealOn(state, d, slot) {
    const it = mealItems(state, d, slot); if (!it.length) return null;
    return Object.assign({}, it.find(i => i.course === 'main') || it[0], { items: it });
  }
  const recipeMinutes = r => (Number(r.prepMin) || 0) + (Number(r.cookMin) || 0);
  /** Which kind of meal a menu slot is; a recipe ticked for that kind can be chosen there (untagged recipes fit anywhere). */
  const MEAL_KIND = { breakfast: ['breakfast'], amSnack: ['snack'], pmSnack: ['snack'], baon: ['lunch', 'dinner'], lunch: ['lunch'], dinner: ['dinner'], staff: ['breakfast', 'lunch', 'dinner', 'snack'] };
  const recipeFits = (r, slot) => !(r.mealTypes || []).length || (MEAL_KIND[slot] || []).some(k => r.mealTypes.includes(k));
  /** Put the planned dish on a cooking occurrence: name, recipe link and minutes from the recipe. */
  function applyMeal(state, o, slot) {
    const it = mealItems(state, o.date, slot); if (!it.length) return;
    const recs = it.map(i => i.recipeId ? (state.recipes || []).find(x => x.id === i.recipeId) : null);
    o.mealSlot = slot; o.menu = it.map((i, k) => recs[k] ? recs[k].name : i.text).join(', ');
    o.name = o.name.replace(/\s*\(per menu\)\s*$/, '') + ' — ' + o.menu;
    const withR = recs.filter(Boolean);
    if (withR.length) {
      o.recipeId = withR[0].id; o.recipeIds = withR.map(r => r.id);
      // dishes cook side by side: the longest recipe plus 10 minutes for each extra dish (max 3 hours)
      const mins = Math.min(180, Math.max(...withR.map(recipeMinutes)) + 10 * (it.length - 1));
      if (mins > 0) { o.minutes = mins; if (o.we - o.ws < mins) o.ws = Math.max(0, o.we - mins); }
    }
  }

  // ---------- event mode (spec §5.4.5, Handbook §12.2) ----------
  // when: 'each' every event day · 'first' first day · 'next' the day after the event ends
  const EVENT_TYPES = {
    guests: { label: 'Guests', icon: '🧑‍🤝‍🧑', tasks: [
      ['floors', 'Guest prep: tidy living & dining; fresh towels and soap in the guest CR', 'each', '08:00-12:00', 45, 'L', 'none'],
      ['kitchen', 'Extra dishes and kitchen reset after guests', 'each', '19:00-20:00', 30, 'L', 'none']] },
    party: { label: 'Party', icon: '🎉', tasks: [
      ['floors', 'Party prep: deep tidy and set up the party area', 'first', '08:00-14:00', 120, 'H', 'required'],
      ['cooking', 'Party food prep support (per menu)', 'first', '09:00-15:00', 90, 'L', 'none'],
      ['floors', 'Party clean-up: dishes, trash out, floors, return furniture', 'next', '08:00-12:00', 120, 'H', 'required']] },
    occasion: { label: 'Family occasion (reminder only)', icon: '🎂', noPause: true, tasks: [] },
    holiday: { label: 'Holiday (everyone home, no school)', icon: '🏖️', holiday: true, tasks: [] },
    family_out: { label: 'Family out (helpers by themselves)', icon: '🚗', noPause: true, tasks: [] },
    travel: { label: 'Travel (family away for days)', icon: '🧳', away: true, tasks: [
      ['kitchen', 'Before the trip: clear perishables, take out trash', 'first', '06:00-09:00', 30, 'L', 'none'],
      ['floors', 'House check: doors, windows, gas, unplug unused appliances', 'each', '08:00-10:00', 20, 'L', 'none']] },
    sickness: { label: 'Sickness', icon: '🤒', tasks: [
      ['bathroom', 'Sick-room care: disinfect handles, switches and the CR the sick person uses', 'each', '09:00-16:00', 30, 'L', 'none'],
      ['laundry', "Wash the sick person's linens and towels separately", 'each', '08:30-11:00', 45, 'H', 'none']] },
  };
  /** Event planner: a planned event happens once or every year (same month and day). Each occurrence can be marked
      not held (cancelled) or moved to another date: once-only events keep it on the event, yearly ones per year. */
  const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const annualDate = (d, y) => (d.slice(5) === '02-29' && !leap(y) ? y + '-02-28' : y + '-' + d.slice(5));
  function eventInstances(state, from, to, opts) {
    const out = [], all = opts && opts.includeCancelled;
    for (const e of state.events || []) {
      const span = e.end && e.end > e.date ? daysBetween(e.date, e.end) : 0;
      const make = (date, year) => {
        const ov = e.repeat === 'yearly' ? (e.overrides || {})[year] || null : (e.cancelled || e.movedTo ? { cancelled: e.cancelled, movedTo: e.movedTo } : null);
        if (ov && ov.cancelled && !all) return;
        const d0 = ov && ov.movedTo ? ov.movedTo : date, end = span ? addDays(d0, span) : '';
        if ((end || d0) < from || d0 > to) return;
        out.push(Object.assign({}, e, { id: e.repeat === 'yearly' ? e.id + '#' + year : e.id, seriesId: e.id, year, date: d0, end, originalDate: date,
          moved: !!(ov && ov.movedTo), cancelled: !!(ov && ov.cancelled) }));
      };
      if (e.repeat === 'yearly') { const y0 = +e.date.slice(0, 4); for (let y = Math.max(y0, +from.slice(0, 4) - 1); y <= +to.slice(0, 4); y++) make(annualDate(e.date, y), y); }
      else make(e.date, +e.date.slice(0, 4));
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  const eventsOn = (state, d) => eventInstances(state, d, d).filter(e => e.date <= d && d <= (e.end || e.date));
  /** When the family (with the children) is away from the house on d: { all: true } or { from, to } in minutes, else null.
      From Travel, Family out, and any event held outside the house. */
  function familyAway(state, d) {
    let win = null;
    for (const e of eventsOn(state, d)) {
      const def = EVENT_TYPES[e.type] || {};
      const out = def.away || e.type === 'family_out' || e.location === 'out';
      if (!out) continue;
      if (def.away || !e.startTime || !e.endTime) return { all: true };
      // times apply on the first day (start) and last day (end) of a multi-day event; days in between are whole days
      const first = d === e.date, last = d === (e.end || e.date);
      const f = first ? toMin(e.startTime) : 0, t = last ? toMin(e.endTime) : 1440;
      if (f === 0 && t === 1440) return { all: true };
      win = win ? { from: Math.min(win.from, f), to: Math.max(win.to, t) } : { from: f, to: t };
    }
    return win;
  }

  /** Seasonal heavy cleaning worth doing while the family is away for days (even if not yet due), best first.
      Prefers jobs that need the children away, are noisy or need low foot traffic, then the rarest and longest. */
  function suggestDeepClean(state) {
    const rare = { biweekly: 1, monthly: 2, months: 3, yearly: 4 };
    return state.tasks.filter(t => t.active && rare[t.freq.type] && t.categoryId !== 'driver' && (t.difficulty === 'H' || Number(t.minutes) >= 45 || (t.constraints || []).length))
      .map(t => ({ t, score: (t.constraints || []).filter(c => ['children', 'noisy', 'lowTraffic'].includes(c)).length * 100 + rare[t.freq.type] * 10 + Number(t.minutes) / 10 }))
      .sort((a, b) => b.score - a.score).map(x => x.t);
  }
  /** Months (1–12) of `year` in which a quarterly / semi-annual / yearly / monthly task falls (same rule as the scheduler). */
  function monthsFor(t, year) {
    const f = t.freq, h = hash(t.id), out = [];
    for (let m = 1; m <= 12; m++) {
      const ms = year + '-' + pad(m) + '-01';
      if (f.type === 'monthly') out.push(m);
      else if (f.type === 'months' && monthIndex(ms) % f.n === h % f.n) out.push(m);
      else if (f.type === 'yearly' && m === (Number(f.month) || (h % 12) + 1)) out.push(m);
    }
    return out;
  }
  const fits = (av, ws, we, minutes) => !!av && av.working && freeGap(av, ws, we, minutes);

  // ---------- rotation periods ----------
  function periodStartOf(S, d) {
    if (S.rotation === 'weekly') return mondayOf(d);
    if (S.rotation === 'biweekly') { const w = Math.floor(daysBetween(EPOCH, mondayOf(d)) / 7); return addDays(EPOCH, Math.floor(w / 2) * 14); }
    return monthStart(d);
  }
  function nextPeriodStart(S, ps) {
    if (S.rotation === 'weekly') return addDays(ps, 7);
    if (S.rotation === 'biweekly') return addDays(ps, 14);
    return nextMonth(ps);
  }

  function categoryLoads(state) {
    const S = state.settings, L = {};
    state.categories.forEach(c => { L[c.id] = 0; });
    state.tasks.forEach(t => { if (t.active && L[t.categoryId] != null) L[t.categoryId] += perWeek(t.freq) * t.minutes * factorOf(S, t.difficulty); });
    return L;
  }

  /** Step 1: split categories into balanced groups (heaviest first), then give each group to the helper
      who led it least recently, so leads rotate and everyone leads everything over time. */
  function assignLeads(cats, loads, elig, lastLed) {
    const leads = {};
    if (!elig.length) return leads;
    const sorted = [...cats].sort((a, b) => loads[b.id] - loads[a.id] || (a.sort || 0) - (b.sort || 0));
    const groups = elig.map(() => ({ cats: [], load: 0 }));
    for (const c of sorted) {
      let g = groups[0];
      for (const x of groups) if (x.load < g.load) g = x;
      g.cats.push(c.id); g.load += loads[c.id];
    }
    groups.sort((a, b) => b.load - a.load);
    const free = [...elig];
    for (const g of groups) {
      if (!g.cats.length || !free.length) continue;
      let best = free[0], bestScore = Infinity;
      for (const h of free) {
        const led = lastLed[h.id] || {};
        const score = Math.max(-1, ...g.cats.map(c => led[c] != null ? led[c] : -1));
        if (score < bestScore) { best = h; bestScore = score; }
      }
      free.splice(free.indexOf(best), 1);
      g.cats.forEach(c => { leads[c] = best.id; });
    }
    return leads;
  }

  const ovFrom = o => o.from || o.periodStart;
  const ovUntil = (S, o) => o.until || (o.periodStart ? addDays(nextPeriodStart(S, o.periodStart), -1) : ovFrom(o));
  /** Who does a task by its own setting: rotation (null) · fixed staff · manual staff until a date. */
  function taskAssignee(t, d) {
    const a = t && t.assign; if (!a || !a.staffId) return null;
    if (a.mode === 'fixed') return { staffId: a.staffId, mode: 'fixed' };
    if (a.mode === 'manual' && (!a.from || a.from <= d) && (!a.until || d <= a.until)) return { staffId: a.staffId, mode: 'manual' };
    return null;
  }
  let leadCache = { key: null, plan: null };
  /** Lead plan from the rotation anchor up to `until`. A period is split into segments whenever the set of
      helpers who can lead changes (hire, end of shadow mode, exit), so a new helper joins mid-period. */
  function leadPlan(state, until) {
    const S = state.settings;
    const cats = state.categories.filter(c => c.id !== 'driver' && c.active !== false);
    const helpers = state.staff.filter(s => s.role === 'helper');
    const drivers = state.staff.filter(s => s.role === 'driver'); // can lead an area only by fixed assignment or manual override
    const key = JSON.stringify([until, S.rotation, S.rotationAnchor, S.shadowEnabled, S.shadowDays, S.heavyFactor, S.lightFactor,
      cats.map(c => [c.id, c.sort || '', c.assign || null]), helpers.map(h => [h.id, h.hireDate, h.exitDate, h.status, h.shadow, h.active]),
      drivers.map(h => [h.id, h.hireDate, h.exitDate, h.active]),
      state.leadOverrides, state.tasks.map(t => [t.categoryId, t.minutes, t.difficulty, t.active, t.freq.type, t.freq.n])]);
    if (leadCache.key === key) return leadCache.plan;

    const loads = categoryLoads(state);
    const eligibleOn = d => helpers.filter(h => isMainEligible(h, d, S))
      .sort((a, b) => (a.hireDate || '').localeCompare(b.hireDate || '') || a.id.localeCompare(b.id));
    const changes = new Set();
    helpers.forEach(h => {
      if (h.hireDate) { changes.add(h.hireDate); changes.add(addDays(h.hireDate, Number(S.shadowDays) || 14)); }
      if (h.exitDate) changes.add(addDays(h.exitDate, 1));
    });
    drivers.forEach(h => { if (h.hireDate) changes.add(h.hireDate); if (h.exitDate) changes.add(addDays(h.exitDate, 1)); });
    // manual overrides run from a date until a date (older ones cover one rotation period)
    const ovs = (state.leadOverrides || []).map(o => ({ o, from: ovFrom(o), until: ovUntil(S, o) }));
    ovs.forEach(x => { changes.add(x.from); changes.add(addDays(x.until, 1)); });
    let anchor = S.rotationAnchor || helpers.map(h => h.hireDate).filter(Boolean).sort()[0] || until;
    if (anchor > until) anchor = until;

    const segments = [], lastLed = {}, counts = {}, lastPeriod = {};
    let ps = periodStartOf(S, anchor), ord = 0;
    while (ps <= until) {
      const next = nextPeriodStart(S, ps), pe = addDays(next, -1);
      const starts = [ps, ...[...changes].filter(d => d > ps && d <= pe).sort()];
      const ledThisPeriod = new Set();
      starts.forEach((s, i) => {
        const e = i + 1 < starts.length ? addDays(starts[i + 1], -1) : pe;
        const elig = eligibleOn(s);
        // fixed areas always go to their helper (while that helper can lead); the rest rotate
        const canLead = id => elig.some(h => h.id === id) || drivers.some(dr => dr.id === id && isActive(dr, s));
        const fixed = cats.filter(c => c.assign && c.assign.mode === 'fixed' && canLead(c.assign.staffId));
        const leads = assignLeads(cats.filter(c => !fixed.includes(c)), loads, elig, lastLed);
        const source = {};
        Object.keys(leads).forEach(c => { source[c] = 'auto'; });
        fixed.forEach(c => { leads[c.id] = c.assign.staffId; source[c.id] = 'fixed'; });
        ovs.forEach(({ o, from, until: to }) => {
          if (from <= s && s <= to && canLead(o.staffId) && cats.some(c => c.id === o.categoryId)) {
            leads[o.categoryId] = o.staffId; source[o.categoryId] = 'override';
          }
        });
        ord++;
        Object.entries(leads).forEach(([c, sid]) => { (lastLed[sid] = lastLed[sid] || {})[c] = ord; ledThisPeriod.add(sid + '|' + c); });
        segments.push({ start: s, end: e, periodStart: ps, periodEnd: pe, leads, source });
      });
      ledThisPeriod.forEach(k => {
        const [sid, c] = k.split('|');
        counts[sid] = counts[sid] || {}; counts[sid][c] = (counts[sid][c] || 0) + 1;
        (lastPeriod[sid] = lastPeriod[sid] || {})[c] = ps;
      });
      ps = next;
    }
    const plan = { segments, counts, lastPeriod };
    leadCache = { key, plan };
    return plan;
  }
  function leadsOn(plan, d) {
    for (let i = plan.segments.length - 1; i >= 0; i--) { const s = plan.segments[i]; if (s.start <= d && d <= s.end) return s; }
    return { leads: {}, source: {}, start: d, end: d, periodStart: d, periodEnd: d };
  }

  // ---------- occurrences ----------
  function windowFor(state, t, d) {
    const S = state.settings, flags = [];
    let ws = toMin(t.window[0]), we = toMin(t.window[1]);
    const cons = t.constraints || [];
    if (cons.includes('children')) {
      const fa = familyAway(state, d);
      if (isSchoolDay(state, d)) { ws = Math.max(ws, toMin(S.childFree[0])); we = Math.min(we, toMin(S.childFree[1])); }
      else if (fa && fa.all) { /* the family is away all day: no limit */ }
      else if (fa && Math.min(we, fa.to) - Math.max(ws, fa.from) >= Number(t.minutes)) { ws = Math.max(ws, fa.from); we = Math.min(we, fa.to); } // while the family is out
      else flags.push('checkChildren');
    }
    if (cons.includes('noisy')) { ws = Math.max(ws, toMin(S.quiet[0])); we = Math.min(we, toMin(S.quiet[1])); }
    if (cons.includes('lowTraffic')) flags.push('slippery');
    return { ws, we, flags };
  }
  function makeOcc(state, t, d, key) {
    const w = windowFor(state, t, d);
    const o = {
      key, templateId: t.pseudo ? null : t.id, name: t.name, categoryId: t.categoryId, date: d, ws: w.ws, we: w.we,
      minutes: Number(t.minutes), assistMinutes: assistMinutesOf(t), difficulty: t.difficulty, assistMode: t.assistMode,
      driverMayAssist: false, // the driver never assists: rotation and assisting are for the helpers only (16 Nov 2026)
      driverOnly: !!t.driverOnly, priority: t.priority, constraints: t.constraints || [], badge: t.badge || badge(t.freq),
      handbookRef: t.handbookRef || '', mainId: null, assistId: null, leadId: null, start: null, end: null,
      flags: [...w.flags], source: t.source || 'auto', locked: false,
    };
    // a set start time (e.g. the school run leaves at 07:10): placed exactly then, and the person is busy until it ends
    if (t.startAt && /^\d\d:\d\d$/.test(t.startAt)) { o.fixedStart = toMin(t.startAt); o.ws = Math.min(o.ws, o.fixedStart); o.we = Math.max(o.we, o.fixedStart + o.minutes); }
    if (t.mealSlot) applyMeal(state, o, t.mealSlot);
    return o;
  }
  /** A generated task that is not in the Task Library (meal prep from the menu, event tasks). */
  const pseudoTask = (id, cat, name, win, minutes, diff, assist, extra) => Object.assign({
    id, pseudo: true, name, categoryId: cat, window: win.split('-'), minutes, difficulty: diff, assistMode: assist,
    assistMinutes: assist === 'required' ? minutes : 0, priority: 'essential', constraints: [], freq: { type: 'daily' }, handbookRef: '',
  }, extra || {});

  function computeLoads(occs, S) {
    const L = {};
    const add = (sid, d, pts, min, heavy) => {
      const x = ((L[sid] = L[sid] || {})[d] = L[sid][d] || { pts: 0, min: 0, heavy: 0, tasks: 0 });
      x.pts += pts; x.min += min; x.heavy += heavy; x.tasks++;
    };
    for (const o of occs) {
      if (o.skipped) continue;
      const f = factorOf(S, o.difficulty), h = o.difficulty === 'H' ? 1 : 0;
      if (o.mainId) add(o.mainId, o.date, o.minutes * f, o.minutes, h);
      if (o.assistId && o.assistMinutes) add(o.assistId, o.date, o.assistMinutes * f, o.assistMinutes, h);
    }
    return L;
  }
  const loadOf = (L, sid, d) => (L[sid] && L[sid][d]) ? L[sid][d].pts : 0;

  /**
   * Generate one week (Monday–Sunday). opts.today: dates before it that already have a history snapshot are
   * returned unchanged (permanent record); opts.history: { date: [occurrences] }.
   */
  function generateWeek(state, monday, opts) {
    opts = opts || {};
    const t0 = Date.now();
    const S = state.settings;
    const today = opts.today || '0000-00-00';
    const history = opts.history || {};
    monday = mondayOf(monday);
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(monday, i));
    const sunday = days[6];
    const plan = leadPlan(state, sunday);
    const staff = state.staff;
    const helpers = staff.filter(s => s.role === 'helper');
    const drivers = staff.filter(s => s.role === 'driver');
    const tasksById = {}; state.tasks.forEach(t => { tasksById[t.id] = t; });

    const status = {}; days.forEach(d => { status[d] = {}; staff.forEach(s => { status[d][s.id] = dayStatus(state, s, d); }); });
    const leadsByDay = {}; days.forEach(d => { leadsByDay[d] = leadsOn(plan, d); });
    const frozenDays = new Set(days.filter(d => d < today && history[d]));
    const mainHelpers = d => helpers.filter(h => isMainEligible(h, d, S) && status[d][h.id].working);
    const workingHelpers = d => helpers.filter(h => isActive(h, d) && status[d][h.id].working);
    const leadFor = (t, d) => t.categoryId === 'driver' ? (drivers.find(x => status[d][x.id].working) || {}).id : leadsByDay[d].leads[t.categoryId];

    let occs = [];
    const frozenKeys = new Set();
    frozenDays.forEach(d => history[d].forEach(o => { occs.push(Object.assign({}, o, { frozen: true, flags: [...(o.flags || [])] })); frozenKeys.add(o.key); }));

    const live = days.filter(d => !frozenDays.has(d));
    const active = state.tasks.filter(t => t.active && t.freq.type !== 'asNeeded');
    /** Is the family eating this meal at home? 'staff' = cook only for the staff, 'skip' = not needed, null = normal. */
    function familyMeal(d, slot, o) {
      const ev = evDays[d].find(e => e.type === 'family_out' && (e.skipMeals || []).includes(slot));
      const fa = famAway[d];
      const out = !!ev || (fa && (fa.all || (o.ws >= fa.from && o.we <= fa.to)));
      if (!out) return null;
      return ['breakfast', 'lunch', 'dinner'].includes(slot) ? 'staff' : 'skip';
    }
    const dayLoad = {}; days.forEach(d => { dayLoad[d] = 0; });
    const bigHeavy = {}; days.forEach(d => { bigHeavy[d] = new Set(); });
    const evDays = {}; days.forEach(d => { evDays[d] = eventsOn(state, d); });
    const pausing = d => evDays[d].filter(e => !(EVENT_TYPES[e.type] || {}).noPause); // events that pause Can-move tasks
    const famAway = {}; days.forEach(d => { famAway[d] = familyAway(state, d); });
    // a helper on vacation (e.g. weeks in the province): essential daily tasks first, other daily tasks spread out
    const vacDay = {}; days.forEach(d => { vacDay[d] = helpers.some(h => (state.exceptions || []).some(e => e.staffId === h.id && e.type === 'vacation' && e.date <= d && d <= (e.to || e.date))); });
    // heavy cleaning approved by the employer for a family trip: done early, so the regular one soon after is skipped
    const weekEvents = eventInstances(state, addDays(monday, -60), addDays(sunday, 7)); // this week's planned events (yearly ones expanded)
    const doneEarly = (t, d) => weekEvents.some(e => (e.approvedTasks || []).includes(t.id) && e.date <= d && d <= addDays(e.end || e.date, 45));
    const add = (t, d, key, force) => {
      if (frozenKeys.has(key)) return;
      const o = makeOcc(state, t, d, key);
      // driver off: driving jobs can't be done that day; his other tasks (sweeping, pets…) go to the helpers below
      if (t.categoryId === 'driver' && t.driverOnly && !drivers.some(x => status[d][x.id].working)) { o.skipped = true; o.skipReason = 'Driver off — needs the driver'; addFlag(o, 'driverOff'); occs.push(o); return; }
      if (t.onHold && (!t.holdUntil || d <= t.holdUntil)) { o.skipped = true; o.skipReason = 'On hold' + (t.holdUntil ? ' until ' + t.holdUntil : '') + (t.holdReason ? ' — ' + t.holdReason : ''); addFlag(o, 'onHold'); occs.push(o); return; }
      if (force) { addFlag(o, 'early'); occs.push(o); dayLoad[d] += o.minutes * factorOf(S, o.difficulty); return; }
      // Event mode: Can-move tasks pause on event days; when the family is out, family cooking becomes a simple staff meal
      const fa = famAway[d], daily = ['daily', 'schoolDays', 'eod'].includes(t.freq.type);
      const famMeal = t.mealSlot ? familyMeal(d, t.mealSlot, o) : null;
      const pause = t.priority === 'canMove' && pausing(d).length ? 'Paused — event: ' + pausing(d).map(e => (EVENT_TYPES[e.type] || { label: e.type }).label).join(', ')
        : famMeal === 'skip' ? 'Not needed — the family is out'
          : fa && fa.all && !t.mealSlot && t.freq.type === 'schoolDays' ? 'Paused — family away'
            : !t.pseudo && doneEarly(t, d) ? 'Done early while the family was away'
              : vacDay[d] && t.priority === 'canMove' ? 'Paused — a helper is on vacation'
                : vacDay[d] && daily && t.priority !== 'essential' && ((daysBetween(EPOCH, d) + hash(t.id)) % 3) !== 0 ? 'Spread out — a helper is on vacation (about twice a week)' : '';
      if (pause) { o.skipped = true; o.skipReason = pause; addFlag(o, 'eventPaused'); occs.push(o); return; }
      if (famMeal === 'staff') { // cooking only for the staff
        o.name = 'Cook simple meal for staff (family out) — ' + (MEAL_SLOTS.find(x => x.id === t.mealSlot) || { label: '' }).label.toLowerCase();
        o.minutes = Math.max(15, Math.round(Number(t.minutes) * 0.4)); delete o.recipeId; o.menu = ''; addFlag(o, 'staffMeal');
      }
      occs.push(o);
      dayLoad[d] += o.minutes * factorOf(S, o.difficulty);
      if (o.difficulty === 'H' && o.minutes >= 90) bigHeavy[d].add(leadFor(t, d));
    };

    // Phase A — fixed-day tasks
    const chooseDay = [];
    for (const t of active) {
      const f = t.freq;
      if (f.type === 'daily') live.forEach(d => add(t, d, t.id + '@' + d));
      else if (f.type === 'schoolDays') live.filter(d => isSchoolDay(state, d)).forEach(d => add(t, d, t.id + '@' + d));
      else if (f.type === 'eod') live.filter(d => ((daysBetween(EPOCH, d) % 2) + 2) % 2 === (f.offset || 0)).forEach(d => add(t, d, t.id + '@' + d));
      else if (f.type === 'perWeek' && f.days && f.days.length) live.filter(d => f.days.includes(dow(d))).forEach(d => add(t, d, t.id + '@' + d));
      else if ((f.type === 'weekly' || f.type === 'biweekly') && f.day != null) {
        const wk = Math.floor(daysBetween(EPOCH, monday) / 7);
        if (f.type === 'biweekly' && ((wk % 2) + 2) % 2 !== hash(t.id) % 2) continue;
        live.filter(d => dow(d) === Number(f.day)).forEach(d => add(t, d, t.id + '@' + monday));
      } else chooseDay.push(t);
    }

    // Time the driver is away on a driving job with a set start (e.g. the school run: drop-off 07:10, waits at school,
    // home with the children about 18:00). Nothing else is given to him then; those tasks go to a helper.
    const reserved = {}; days.forEach(d => { reserved[d] = {}; });
    const reserveFrom = list => list.forEach(o => {
      if (o.frozen || o.skipped || o.categoryId !== 'driver' || !o.driverOnly || o.fixedStart == null) return;
      const dr = drivers.find(x => status[o.date][x.id].working); if (!dr) return;
      (reserved[o.date][dr.id] = reserved[o.date][dr.id] || []).push({ key: o.key, s: o.fixedStart, e: o.fixedStart + o.minutes });
    });
    reserveFrom(occs);
    /** Like fits(), but also keeps clear of the person's reserved driving time (other than this task's own). */
    const fitsR = (sid, d, ws, we, minutes, key) => {
      const av = status[d][sid]; if (!fits(av, ws, we, minutes)) return false;
      const r = (reserved[d][sid] || []).filter(x => x.key !== key); if (!r.length) return true;
      return freeGap(Object.assign({}, av, { blocks: [...(av.blocks || []), ...r.map(x => [x.s, x.e])] }), ws, we, minutes);
    };

    // Phase B — tasks whose day is chosen: lowest household load, lead working, child/traffic rules, spread out
    const order = { perWeek: 0, weekly: 1, biweekly: 2, monthly: 3, months: 4, yearly: 5 };
    chooseDay.sort((a, b) => order[a.freq.type] - order[b.freq.type] || b.minutes * factorOf(S, b.difficulty) - a.minutes * factorOf(S, a.difficulty));
    const pick = (t, cands, n) => {
      const chosen = [];
      for (let k = 0; k < n; k++) {
        let best = null, bestScore = Infinity;
        for (const d of cands) {
          if (chosen.includes(d)) continue;
          // load per available helper, so solo days (other helper's rest day) are avoided for periodic work
          let score = t.categoryId === 'driver' ? dayLoad[d] : dayLoad[d] / Math.max(mainHelpers(d).length, 0.5);
          const w = windowFor(state, t, d), lead = leadFor(t, d);
          if (!lead || !fitsR(lead, d, w.ws, w.we, t.minutes)) score += 1e6;
          if ((t.constraints || []).includes('children') && !isSchoolDay(state, d)) score += 5e5;
          if ((t.constraints || []).includes('lowTraffic') && !isSchoolDay(state, d)) score += 5e5;
          if (t.preferredDays && t.preferredDays.length && !t.preferredDays.includes(dow(d))) score += 2e5;
          if (t.difficulty === 'H' && t.minutes >= 90 && bigHeavy[d].has(lead)) score += 3000;
          for (const c of chosen) if (Math.abs(daysBetween(c, d)) <= 1) score += 4000;
          if (score < bestScore) { best = d; bestScore = score; }
        }
        if (best) chosen.push(best);
      }
      return chosen;
    };
    const monthsInWeek = [...new Set([monthStart(monday), monthStart(sunday)])];
    for (const t of chooseDay) {
      const f = t.freq, h = hash(t.id);
      let cands = live, n = 1, keyBase = t.id + '@' + monday;
      if (f.type === 'perWeek') n = f.n;
      else if (f.type === 'weekly') n = 1;
      else if (f.type === 'biweekly') { const wk = Math.floor(daysBetween(EPOCH, monday) / 7); if (((wk % 2) + 2) % 2 !== h % 2) continue; }
      else {
        let found = null;
        for (const ms of monthsInWeek) {
          const qualifies = f.type === 'monthly' ? true
            : f.type === 'months' ? monthIndex(ms) % f.n === h % f.n
              : Number(ms.slice(5, 7)) === (Number(f.month) || (h % 12) + 1);
          if (!qualifies) continue;
          const wkIdx = f.type === 'monthly' ? h % 4 : (h >> 3) % 4;
          const anchor = addDays(ms, 7 * wkIdx);
          if (mondayOf(anchor) === monday) found = ms;
        }
        if (!found) continue;
        cands = live.filter(d => monthStart(d) === found);
        keyBase = t.id + '@' + found;
      }
      if (t.priority === 'canMove') cands = cands.filter(d => !pausing(d).length && !vacDay[d]); // moves off event and vacation days
      const chosen = pick(t, cands, n);
      chosen.sort().forEach((d, i) => add(t, d, n > 1 ? keyBase + '#' + i : keyBase));
    }

    // Menu items with no cooking task in the library (e.g. snacks): a prep task from the recipe
    const slotTask = {}; active.forEach(t => { if (t.mealSlot) slotTask[t.mealSlot] = t; });
    for (const d of live) {
      for (const sl of MEAL_SLOTS) {
        if (sl.info || slotTask[sl.id] || (sl.school && !isSchoolDay(state, d))) continue;
        const m = mealOn(state, d, sl.id), r = m && m.recipeId && (state.recipes || []).find(x => x.id === m.recipeId);
        if (!r) continue;
        add(pseudoTask('meal-' + sl.id, catOr(state, 'cooking', 'kitchen'), 'Prepare ' + sl.label.toLowerCase(), sl.ws + '-' + sl.we, recipeMinutes(r) || 20, 'L', 'none',
          { mealSlot: sl.id, badge: 'Menu', handbookRef: '§9' }), d, 'meal-' + sl.id + '@' + d);
      }
    }
    // Event tasks
    for (const d of live) {
      weekEvents.forEach(e => {
        const def = EVENT_TYPES[e.type]; if (!def) return;
        const end = e.end || e.date;
        def.tasks.forEach((x, i) => {
          const on = x[2] === 'each' ? e.date <= d && d <= end : x[2] === 'first' ? d === e.date : d === addDays(end, 1);
          if (on) add(pseudoTask('event-' + e.type + '-' + i, catOr(state, x[0], 'kitchen'), x[1], x[3], x[4], x[5], x[6], { badge: 'Event', source: 'event' }), d, 'event:' + e.id + ':' + i + '@' + d);
        });
      });
    }
    // Heavy cleaning the employer approved for a family trip: spread over the trip's days (excluding the first day)
    weekEvents.filter(e => (e.approvedTasks || []).length).forEach(e => {
      const tripDays = []; for (let x = e.end ? addDays(e.date, 1) : e.date; x <= (e.end || e.date); x = addDays(x, 1)) tripDays.push(x);
      if (!tripDays.length) tripDays.push(e.date);
      e.approvedTasks.forEach((tid, i) => {
        const t = tasksById[tid], d = tripDays[i % tripDays.length];
        if (t && live.includes(d)) add(t, d, 'evx:' + e.id + ':' + tid + '@' + d, true);
      });
    });

    // Overrides (locked): move / skip / re-assign / fixed time; moved-in occurrences from other weeks
    const ov = state.occOverrides || {};
    const applyOv = (o, x) => {
      if (x.date && x.date !== o.date) {
        const t = tasksById[o.templateId];
        if (t) { const w = windowFor(state, t, x.date); o.ws = w.ws; o.we = w.we; o.flags = w.flags; }
        o.date = x.date; addFlag(o, 'moved');
      }
      if (x.skip) { o.skipped = true; o.skipReason = x.reason || ''; }
      if (x.mainId !== undefined) { o.mainId = x.mainId || null; o.mainLocked = true; }
      if (x.assistId !== undefined) { o.assistId = x.assistId || null; o.assistLocked = true; }
      if (x.start) o.fixedStart = toMin(x.start);
      o.locked = true; o.source = 'override'; o.overrideReason = x.reason || '';
    };
    occs.forEach(o => { if (!o.frozen && ov[o.key]) applyOv(o, ov[o.key]); });
    Object.entries(ov).forEach(([key, x]) => {
      if (!x.date || x.date < monday || x.date > sunday || frozenDays.has(x.date) || occs.some(o => o.key === key)) return;
      const t = tasksById[key.split('@')[0]];
      if (!t) return;
      const o = makeOcc(state, t, x.date, key); applyOv(o, x); occs.push(o);
    });
    occs = occs.filter(o => o.frozen || (o.date >= monday && o.date <= sunday && !frozenDays.has(o.date)));
    (state.oneOffs || []).filter(x => x.date >= monday && x.date <= sunday && !frozenDays.has(x.date)).forEach(x => {
      const st = x.start ? toMin(x.start) : 480;
      occs.push({
        key: 'oneoff:' + x.id, templateId: null, oneOffId: x.id, name: x.name, categoryId: x.categoryId || '', date: x.date,
        ws: st, we: x.start ? st + Number(x.minutes) : 1200, minutes: Number(x.minutes) || 30,
        assistMinutes: x.assistId ? Number(x.minutes) || 30 : 0, difficulty: x.difficulty || 'L', assistMode: x.assistId ? 'required' : 'none',
        driverMayAssist: false, priority: 'essential', constraints: [], badge: '1×', handbookRef: '', notes: x.notes || '',
        mainId: x.mainId || null, assistId: x.assistId || null, mainLocked: !!x.mainId, assistLocked: true,
        fixedStart: x.start ? st : null, start: null, end: null, flags: [], source: 'one-off', locked: true,
      });
    });

    // Step 2 + Step 5 — main and assistant for each occurrence (absences re-assign)
    let L = computeLoads(occs, S);
    const bump = (sid, d, pts) => { L[sid] = L[sid] || {}; L[sid][d] = L[sid][d] || { pts: 0, min: 0, heavy: 0, tasks: 0 }; L[sid][d].pts += pts; };
    const work = occs.filter(o => !o.frozen && !o.skipped);
    work.sort((a, b) => (b.fixedStart != null) - (a.fixedStart != null) || b.minutes - a.minutes);
    for (const o of work) {
      const d = o.date, f = factorOf(S, o.difficulty);
      // the task's own setting (Task Library): fixed to one person, or manually assigned until a date
      const ta = !o.mainLocked && o.templateId ? taskAssignee(tasksById[o.templateId], d) : null;
      if (ta) {
        if (fitsR(ta.staffId, d, o.ws, o.we, o.minutes, o.key)) {
          o.mainId = ta.staffId; o.mainLocked = true; o.assignedBy = ta.mode; addFlag(o, ta.mode === 'fixed' ? 'fixedTask' : 'manualTask');
          bump(o.mainId, d, o.minutes * f);
        } else addFlag(o, 'assigneeOff'); // that person is off: assigned the usual way below
      }
      if (!o.mainLocked) {
        if (o.categoryId === 'driver') {
          const dr = drivers.find(x => fitsR(x.id, d, o.ws, o.we, o.minutes, o.key));
          o.mainId = dr ? dr.id : null;
          if (!dr && !o.driverOnly) { // driver off or out of hours: a helper does it (least loaded)
            const c = mainHelpers(d).filter(h => fits(status[d][h.id], o.ws, o.we, o.minutes)).sort((a, b) => loadOf(L, a.id, d) - loadOf(L, b.id, d))[0];
            if (c) { o.mainId = c.id; addFlag(o, 'driverOff'); }
          }
        } else {
          const lead = leadsByDay[d].leads[o.categoryId];
          o.leadId = lead || null;
          if (lead && fitsR(lead, d, o.ws, o.we, o.minutes, o.key)) o.mainId = lead;
          else {
            const c = mainHelpers(d).filter(h => h.id !== lead && fits(status[d][h.id], o.ws, o.we, o.minutes))
              .sort((a, b) => loadOf(L, a.id, d) - loadOf(L, b.id, d))[0];
            if (c) { o.mainId = c.id; if (lead) addFlag(o, 'reassigned'); }
          }
        }
        // nobody is free inside the task's window (e.g. a window outside the helpers' hours): give it to the least-loaded
        // helper anyway; time placement then puts it at the nearest free time, flagged amber, with the reason
        if (!o.mainId && !o.driverOnly) {
          const c = mainHelpers(d).sort((a, b) => loadOf(L, a.id, d) - loadOf(L, b.id, d))[0];
          if (c) { o.mainId = c.id; addFlag(o, 'outsideWindow'); o.whyNot = 'No helper is free inside its time window (' + fmtMin(o.ws) + '–' + fmtMin(o.we) + '), so ' + (c.nickname || c.fullName) + ' does it at the nearest free time. Check the window in the Task Library.'; }
        }
        if (o.mainId) bump(o.mainId, d, o.minutes * f);
        else { addFlag(o, 'unassigned'); o.whyNot = o.driverOnly ? 'Needs the driver, who is not available.' : 'No helper is working this day.'; }
      }
      if (!o.assistLocked && o.mainId && o.categoryId !== 'driver') { // assistants are helpers only — never the driver
        const pool = workingHelpers(d).filter(h => h.id !== o.mainId && fits(status[d][h.id], o.ws, o.we, o.assistMinutes || o.minutes))
          .sort((a, b) => loadOf(L, a.id, d) - loadOf(L, b.id, d));
        const shadowPool = pool.filter(h => status[d][h.id].shadow);
        if (o.assistMode === 'required') {
          if (pool[0]) o.assistId = pool[0].id; else addFlag(o, 'noAssistant');
        } else if (o.assistMode === 'optional' && shadowPool.length) o.assistId = shadowPool[0].id; // shadow mode: learn by assisting
        if (o.assistId) bump(o.assistId, d, o.assistMinutes * f);
      }
    }

    // Step 3 — balance load per working day across helpers who can lead
    const warnings = [];
    const pool = helpers.filter(h => days.some(d => isMainEligible(h, d, S) && status[d][h.id].working));
    const workDays = {};
    pool.forEach(h => { workDays[h.id] = days.reduce((n, d) => n + (status[d][h.id].working ? (status[d][h.id].half ? 0.5 : 1) : 0), 0); });
    const capacity = (sid, d) => { const av = status[d][sid]; return av.working ? (av.end - av.start - 120) * 0.85 : 0; };
    const weekPts = sid => days.reduce((s, d) => s + loadOf(L, sid, d), 0);
    const tol = Number(S.tolerance) || 0.1;
    let balanced = pool.length < 2;
    if (pool.length >= 2) {
      for (let iter = 0; iter < 600; iter++) {
        L = computeLoads(occs, S);
        const per = {}; pool.forEach(h => { per[h.id] = weekPts(h.id) / Math.max(workDays[h.id], 0.5); });
        const avg = pool.reduce((s, h) => s + per[h.id], 0) / pool.length;
        if (pool.every(h => Math.abs(per[h.id] - avg) <= tol * avg)) { balanced = true; break; }
        const hi = pool.reduce((a, b) => per[b.id] > per[a.id] ? b : a);
        const lo = pool.reduce((a, b) => per[b.id] < per[a.id] ? b : a);
        const gap = per[hi.id] - per[lo.id];
        let best = null, bestGap = gap;
        for (const lightOnly of [true, false]) {
          for (const o of occs) {
            if (o.frozen || o.skipped || o.locked || o.mainLocked || o.mainId !== hi.id || o.categoryId === 'driver') continue;
            if (lightOnly && o.difficulty !== 'L') continue;
            const d = o.date;
            if (!isMainEligible(lo, d, S) || !fits(status[d][lo.id], o.ws, o.we, o.minutes)) continue;
            const f = factorOf(S, o.difficulty);
            const swap = o.assistId === lo.id;
            const delta = o.minutes * f - (swap ? o.assistMinutes * f : 0);
            const loMin = (L[lo.id] && L[lo.id][d] ? L[lo.id][d].min : 0) + o.minutes - (swap ? o.assistMinutes : 0);
            if (loMin > capacity(lo.id, d)) continue;
            const newGap = Math.abs((per[hi.id] - delta / workDays[hi.id]) - (per[lo.id] + delta / workDays[lo.id]));
            if (newGap < bestGap - 0.01) { best = o; bestGap = newGap; }
          }
          if (best) break;
        }
        if (!best) break;
        if (best.assistId === lo.id) best.assistId = hi.id;
        best.mainId = lo.id; best.delegated = true; addFlag(best, 'delegated');
      }
      if (!balanced) warnings.push({ type: 'balance', text: 'Load balance target (±' + Math.round(tol * 100) + '%) could not be met this week.' });
    }

    // Optional assistants when the main is over the day's load target
    L = computeLoads(occs, S);
    for (const o of occs) {
      if (o.frozen || o.skipped || o.locked || o.assistId || o.assistMode !== 'optional' || !o.mainId || o.categoryId === 'driver') continue;
      const d = o.date, hs = mainHelpers(d);
      if (hs.length < 2) continue;
      const avg = hs.reduce((s, h) => s + loadOf(L, h.id, d), 0) / hs.length;
      if (loadOf(L, o.mainId, d) <= avg * (1 + tol)) continue;
      const a = hs.filter(h => h.id !== o.mainId && loadOf(L, h.id, d) < avg && fits(status[d][h.id], o.ws, o.we, o.assistMinutes))
        .sort((x, y) => loadOf(L, x.id, d) - loadOf(L, y.id, d))[0];
      if (a) { o.assistId = a.id; bump(a.id, d, o.assistMinutes * factorOf(S, o.difficulty)); }
    }

    // §5.4.4 — place in time
    const blocks = (state.fixedBlocks || []).filter(b => b.blocking).map(b => ({ s: toMin(b.start), e: toMin(b.end), p: !!b.protected }));
    for (const d of live) {
      const list = occs.filter(o => o.date === d && !o.frozen && !o.skipped && o.mainId);
      const busy = {}; staff.forEach(s => { busy[s.id] = []; });
      const free = (sid, s, e, loose) => {
        const av = status[d][sid];
        if (!av || !av.working || s < av.start || e > av.end) return false;
        for (const b of av.blocks || []) if (s < b[1] && e > b[0]) return false; // away (errand, leaving for a day-off)
        for (const b of blocks) if (s < b.e && e > b.s && (b.p || !loose)) return false;
        if (!loose) for (const iv of busy[sid]) if (s < iv[1] && e > iv[0]) return false;
        return true;
      };
      const find = (o, sid, aid, from, to, loose) => {
        for (let s = Math.ceil(from / 5) * 5; s + o.minutes <= to; s += 5) {
          if (!free(sid, s, s + o.minutes, loose)) continue;
          if (aid && !free(aid, s, s + o.assistMinutes, loose)) continue;
          return s;
        }
        return null;
      };
      const slack = o => (o.we - o.ws) - o.minutes;
      const big = o => o.assistMode === 'required' && o.minutes >= 120 ? 0 : 1; // long two-person jobs need both people free
      list.sort((a, b) => (b.fixedStart != null) - (a.fixedStart != null) || big(a) - big(b) || (slack(a) <= 30 ? 0 : 1) - (slack(b) <= 30 ? 0 : 1)
        || a.we - b.we || slack(a) - slack(b) || (b.difficulty === 'H') - (a.difficulty === 'H') || b.minutes - a.minutes);
      for (const o of list) {
        let s = null;
        if (o.fixedStart != null) {
          s = o.fixedStart;
          if (o.driverOnly) { // a driving job (the school run): his breaks happen while waiting, so only his hours and other tasks count
            const av = status[d][o.mainId], clash = !av || !av.working || s < av.start || s + o.minutes > av.end || busy[o.mainId].some(iv => s < iv[1] && s + o.minutes > iv[0]);
            if (clash) addFlag(o, 'conflict');
          } else if (!free(o.mainId, s, s + o.minutes) || (o.assistId && !free(o.assistId, s, s + o.assistMinutes))) addFlag(o, 'conflict');
        } else {
          s = find(o, o.mainId, o.assistId, o.ws, o.we);
          if (s == null && o.assistId && !o.assistLocked) {
            if (o.assistMode !== 'required') { const s2 = find(o, o.mainId, null, o.ws, o.we); if (s2 != null) { o.assistId = null; s = s2; } }
            else {
              for (const h of workingHelpers(d)) {
                if (h.id === o.mainId) continue;
                const s2 = find(o, o.mainId, h.id, o.ws, o.we);
                if (s2 != null) { o.assistId = h.id; s = s2; break; }
              }
            }
          }
          if (s == null && !o.locked && !o.mainLocked && o.categoryId !== 'driver') {
            for (const h of mainHelpers(d)) {
              if (h.id === o.mainId || h.id === o.assistId) continue;
              const s3 = find(o, h.id, o.assistId, o.ws, o.we);
              if (s3 != null) { o.mainId = h.id; o.delegated = true; addFlag(o, 'delegated'); s = s3; break; }
            }
          }
          // Fallbacks (flagged amber): first later in the day without overlap, then overlapping inside the window
          const av = status[d][o.mainId];
          const dayEnd = av && av.working ? Math.min(av.end, toMin(S.quiet[1])) : o.we;
          if (s == null && !o.constraints.includes('children') && slack(o) >= 30) { // tight tasks (meals) stay in their window
            s = find(o, o.mainId, null, o.we - o.minutes + 5, dayEnd);
            if (s != null) { addFlag(o, 'conflict'); addFlag(o, 'outsideWindow'); }
          }
          if (s == null) { s = find(o, o.mainId, null, o.ws, o.we, true); if (s != null) addFlag(o, 'conflict'); }
          if (s == null && !o.constraints.includes('children')) {
            s = find(o, o.mainId, null, o.ws, av && av.working ? av.end : o.we, true);
            if (s != null) { addFlag(o, 'conflict'); addFlag(o, 'outsideWindow'); }
          }
          if (s == null && av && av.working) { // last resort: anywhere in the person's working day (children rule still kept on school days)
            let from = av.start, to = av.end;
            if (o.constraints.includes('children') && isSchoolDay(state, d)) { from = Math.max(from, toMin(S.childFree[0])); to = Math.min(to, toMin(S.childFree[1])); }
            if (o.ws >= to) { for (let x = Math.floor((to - o.minutes) / 5) * 5; x >= from && s == null; x -= 5) if (free(o.mainId, x, x + o.minutes, true)) s = x; } // window after the day: as late as possible
            else s = find(o, o.mainId, null, Math.max(from, Math.min(o.ws, to - o.minutes)), to, true) ?? find(o, o.mainId, null, from, to, true);
            if (s != null) {
              addFlag(o, 'conflict'); addFlag(o, 'outsideWindow');
              const who = (staff.find(x => x.id === o.mainId) || {}), nm = who.nickname || who.fullName || 'the helper';
              o.whyNot = o.whyNot || ('Its time window (' + fmtMin(o.ws) + '–' + fmtMin(o.we) + ') ' + (o.we <= o.ws ? 'is empty after the "children not in the area" rule (school days ' + S.childFree[0] + '–' + S.childFree[1] + ')' : 'has no free time in ' + nm + "'s day (" + fmtMin(av.start) + '–' + fmtMin(av.end) + ')') + ', so it was put at the nearest free time. Widen or move the window in the Task Library.');
            }
          }
          if (s == null) {
            addFlag(o, 'unplaced');
            o.whyNot = !av || !av.working ? 'The assigned person is not working this day.' : o.minutes > (av.end - av.start) ? 'It takes ' + o.minutes + ' minutes, longer than the whole working day.' : 'There is no free time left in the day for its ' + o.minutes + ' minutes.';
            continue;
          }
          if (o.assistId && !free(o.assistId, s, s + o.assistMinutes)) {
            if (o.assistMode === 'required') addFlag(o, 'conflict'); else o.assistId = null;
          }
        }
        o.start = s; o.end = s + o.minutes;
        busy[o.mainId].push([s, o.end]);
        if (o.assistId) busy[o.assistId].push([s, s + o.assistMinutes]);
      }
    }

    // Summary
    L = computeLoads(occs, S);
    const weekLoads = {}, perWorkingDay = {};
    staff.forEach(s => {
      const pts = days.reduce((a, d) => a + loadOf(L, s.id, d), 0);
      const min = days.reduce((a, d) => a + (L[s.id] && L[s.id][d] ? L[s.id][d].min : 0), 0);
      const heavy = days.reduce((a, d) => a + (L[s.id] && L[s.id][d] ? L[s.id][d].heavy : 0), 0);
      const wd = days.reduce((n, d) => n + (status[d][s.id].working ? (status[d][s.id].half ? 0.5 : 1) : 0), 0);
      weekLoads[s.id] = { pts, min, heavy, workDays: wd };
      perWorkingDay[s.id] = wd ? pts / wd : 0;
    });
    // re-check balance after time placement (placement may hand a task to the other helper to avoid a clash)
    if (pool.length >= 2) {
      const avgP = pool.reduce((a, h) => a + perWorkingDay[h.id], 0) / pool.length;
      balanced = pool.every(h => Math.abs(perWorkingDay[h.id] - avgP) <= tol * avgP + 1e-6);
      if (!balanced && !warnings.some(w => w.type === 'balance')) warnings.push({ type: 'balance', text: 'Load balance target (±' + Math.round(tol * 100) + '%) could not be met this week.' });
    }
    const notes = {}; days.forEach(d => { notes[d] = []; });
    days.forEach(d => evDays[d].forEach(e => {
      const def = EVENT_TYPES[e.type] || { label: e.type }, staffName = id => { const s = staff.find(x => x.id === id); return s ? (s.nickname || s.fullName) : id; };
      const when = e.startTime && e.endTime ? ' ' + (e.date === d ? e.startTime : '') + '–' + ((e.end || e.date) === d ? e.endTime : '') : '';
      const where = e.location === 'out' ? ' · outside' + (e.place ? ' (' + e.place + ')' : '') : e.location === 'home' ? ' · in the house' : '';
      const comp = (e.companions || []).length ? ' · coming along: ' + e.companions.map(staffName).join(', ') : '';
      const eff = def.holiday ? ' No school; the children are home all day.' : '';
      const fa = famAway[d], alone = fa ? (fa.all ? ' The family is away all day: helpers by themselves; family cooking paused.' : ' Family away ' + fmtMin(fa.from) + '–' + fmtMin(fa.to) + ': helpers by themselves.') : '';
      notes[d].push((def.icon ? def.icon + ' ' : '') + 'Event: ' + (e.title ? e.title + ' (' + def.label + ')' : def.label) + (e.moved ? ' — moved here' : '') + when + where + comp + (e.notes ? ' — ' + e.notes : '') + '.' + (def.noPause ? '' : ' Can-move tasks paused.') + eff + alone);
    }));
    // no school on a weekday: children home, no school run — the driver is free for his own tasks
    days.forEach(d => {
      const ns = noSchoolOn(state, d), w = dow(d);
      if (!ns || w < 1 || w > 5) return;
      const k = NO_SCHOOL[ns.reason] || NO_SCHOOL.other;
      notes[d].unshift(k[0] + ' No school — ' + k[1].toLowerCase() + (ns.note ? ' (' + ns.note + ')' : '') + '. The children are home: no school run or packed lunch, mopping and dusting wait until they are out of the area, and the driver does his own tasks.');
    });
    // nobody to do the house work: allowed, but the family needs a warning to adjust
    const noHelper = days.filter(d => helpers.some(h => isActive(h, d)) && !helpers.some(h => isActive(h, d) && status[d][h.id].working));
    noHelper.forEach(d => notes[d].unshift('No helper is available today (' + helpers.filter(h => isActive(h, d)).map(h => (h.nickname || h.fullName) + ': ' + status[d][h.id].label.toLowerCase()).join(', ') + '). The family will need to cover cooking, the children and the essentials.'));
    if (noHelper.length) warnings.push({ type: 'noHelper', text: 'No helper available on ' + noHelper.map(d => WD[dow(d)] + ' ' + Number(d.slice(8))).join(', ') + ' — the family needs to adjust.' });
    occs.forEach(o => { if (!o.skipped && o.flags.includes('slippery')) notes[o.date].push('Floors waxed today — slippery. ' + (o.start != null ? fmtMin(o.start) + '–' + fmtMin(o.end) : '')); });
    const count = f => occs.filter(o => !o.skipped && o.flags.includes(f)).length;
    if (count('unassigned')) warnings.push({ type: 'unassigned', text: count('unassigned') + ' task(s) have nobody available.' });
    const late = count('outsideWindow'), overlap = count('conflict') - late;
    if (overlap > 0) warnings.push({ type: 'conflict', text: overlap + ' task(s) overlap other work (amber).' });
    if (late) warnings.push({ type: 'conflict', text: late + ' task(s) moved past their latest finish time because the day is full (amber).' });
    if (count('noAssistant')) warnings.push({ type: 'noAssistant', text: count('noAssistant') + ' two-person task(s) have no assistant available.' });
    if (count('unplaced')) warnings.push({ type: 'unplaced', text: count('unplaced') + ' task(s) could not be placed in the day.' });
    occs.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? 9999) - (b.start ?? 9999));
    return { monday, days, occurrences: occs, leadsByDay, status, loads: L, weekLoads, perWorkingDay, balanced, warnings, notes, events: evDays, noHelper, ms: Date.now() - t0 };
  }

  function regularizationDue(st) { return st.hireDate ? addMonths(st.hireDate, 6) : null; }

  root.MHM = root.MHM || {};
  root.MHM.Engine = {
    generateWeek, leadPlan, leadsOn, dayStatus, inShadow, isActive, isMainEligible, periodStartOf, nextPeriodStart,
    categoryLoads, regularizationDue, perWeek, badge, freqLabel, assistMinutesOf, factorOf, isSchoolDay, NO_SCHOOL, noSchoolOn,
    taskAssignee, ovFrom, ovUntil, agreementFor, familyAway, suggestDeepClean, eventInstances, annualDate,
    MEAL_SLOTS, mealOn, mealItems, COURSES, COURSE_CATS, recipeMinutes, recipeFits, MEAL_KIND, cycleWeek, EVENT_TYPES, eventsOn, restLedger, restCompOf, monthsFor,
    util: { addDays, dow, mondayOf, daysBetween, toMin, fmtMin, monthStart, nextMonth, addMonths, parseDate, fmtDate, EPOCH },
  };
})(typeof window !== 'undefined' ? window : globalThis);
