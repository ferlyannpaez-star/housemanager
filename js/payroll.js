/* Montalban Home Manager — payroll, vale, contributions and benefits (spec §5.8.4–5.10).
   Pure logic, no DOM. Amounts in pesos, rounded to centavos. Rates and rules are data (Settings), not law. */
(function (root) {
  'use strict';
  const E = root.MHM.Engine, U = E.util;
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const pad = n => String(n).padStart(2, '0');
  const dim = d => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).getUTCDate();
  const ym = d => d.slice(0, 7);

  // ---------- pay settings (per staff member) ----------
  const PAY_DEFAULTS = {
    basis: 'monthly',                                   // monthly · semiMonthly · weekly · daily · custom (amount per pay period)
    schedule: { type: 'everyN', n: 14, anchor: '2026-11-20', days: [15, 30], weekday: 5, list: [] }, // contract: every two weeks
    adjust: 'before',                                   // payday on the rest day: pay the day before / after / same day
    mode: 'cash', gcashName: '', gcashNumber: '',
    absenceRule: 'dayRate', absenceAmount: 0,           // contract: "absences beyond the day-off — ₱___ per day"
    valeCapPct: 30,                                     // warn when vale deductions exceed this % of net pay
    contrib: 'shared',                                  // shared per table · employer pays all
    sickPaid: false,
  };
  const BEN_DEFAULTS = { thirteenth: true, silDays: 5, birthdayGift: 0 };
  function payOf(st) {
    const p = st.pay || {};
    return Object.assign({}, PAY_DEFAULTS, p, { schedule: Object.assign({}, PAY_DEFAULTS.schedule, p.schedule || {}) });
  }
  const benOf = st => Object.assign({}, BEN_DEFAULTS, st.benefitsCfg || {});

  // ---------- salary history ----------
  const history = (state, sid) => (state.salaryHistory || []).filter(h => h.staffId === sid).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  function salaryOn(state, sid, d) {
    let cur = null;
    for (const h of history(state, sid)) if (h.effectiveFrom <= d) cur = h;
    return cur;
  }
  /** Monthly equivalent of a salary entry (used for day rate, contributions, 13th month). */
  function monthlyOf(state, h, sch) {
    if (!h) return 0;
    const div = Number(state.settings.dayRateDivisor) || 26, rate = Number(h.rate) || 0;
    switch (h.basis) {
      case 'semiMonthly': return rate * 2;
      case 'weekly': return rate * 52 / 12;
      case 'daily': return rate * div;
      case 'custom': return rate * periodsPerYear(sch) / 12;
      default: return rate;
    }
  }
  function dayRate(state, st, d) {
    const h = salaryOn(state, st.id, d); if (!h) return 0;
    if (h.basis === 'daily') return Number(h.rate) || 0;
    return monthlyOf(state, h, payOf(st).schedule) / (Number(state.settings.dayRateDivisor) || 26);
  }

  // ---------- pay periods and paydays ----------
  function periodsPerYear(sch) {
    switch (sch.type) {
      case 'everyN': return Math.round(365 / (Number(sch.n) || 14));
      case 'weekday': return 52;
      case 'fixedDays': return 12 * Math.max(1, (sch.days || []).length);
      default: return 26;
    }
  }
  const fixedDaysOf = (sch, month) => [...new Set((sch.days || [15, 30]).map(Number).map(x => Math.min(x, dim(month + '-01'))))].sort((a, b) => a - b).map(x => month + '-' + pad(x));
  /** The pay period containing date d: { start, end, payday }. */
  function periodFor(state, st, d) {
    const p = payOf(st), sch = p.schedule;
    let start, end;
    if (sch.type === 'weekday') {
      end = d; while (U.dow(end) !== Number(sch.weekday)) end = U.addDays(end, 1);
      start = U.addDays(end, -6);
    } else if (sch.type === 'fixedDays') {
      const m = ym(d), ends = [...fixedDaysOf(sch, U.addMonths(m + '-01', -1).slice(0, 7)), ...fixedDaysOf(sch, m), ...fixedDaysOf(sch, U.addMonths(m + '-01', 1).slice(0, 7))];
      const i = ends.findIndex(x => x >= d); end = ends[i]; start = U.addDays(ends[i - 1], 1);
    } else if (sch.type === 'list' && (sch.list || []).length) {
      const L = [...sch.list].sort(), i = L.findIndex(x => x >= d);
      end = i >= 0 ? L[i] : U.addDays(L[L.length - 1], 14 * Math.ceil(U.daysBetween(L[L.length - 1], d) / 14));
      start = i > 0 ? U.addDays(L[i - 1], 1) : U.addDays(end, -13);
    } else {
      const n = Number(sch.n) || 14, a = sch.anchor || '2026-01-02';
      const k = Math.ceil(U.daysBetween(a, d) / n);
      end = U.addDays(a, k * n); start = U.addDays(end, -(n - 1));
    }
    let payday = end;
    if (st.restDay !== '' && st.restDay != null && U.dow(end) === Number(st.restDay) && p.adjust !== 'same') payday = U.addDays(end, p.adjust === 'after' ? 1 : -1);
    return { start, end, payday };
  }
  const nextPeriod = (state, st, per) => periodFor(state, st, U.addDays(per.end, 1));
  const prevPeriod = (state, st, per) => periodFor(state, st, U.addDays(per.start, -1));
  /** Suggested next period to pay: after the last pay run, else the one containing today. */
  function nextDue(state, st, today) {
    const runs = (state.payRuns || []).filter(r => r.staffId === st.id).sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    if (runs.length) return periodFor(state, st, U.addDays(runs[runs.length - 1].periodEnd, 1));
    return periodFor(state, st, [today, st.hireDate || today].sort()[1]);
  }

  // ---------- basic pay ----------
  const employed = (st, d) => (!st.hireDate || st.hireDate <= d) && (!st.exitDate || d <= st.exitDate);
  /** Basic pay for a period: the standard per-period amount, split by days when the salary changes or the person
      starts or leaves inside the period (spec §5.9.1). Returns { amount, parts:[{rate, basis, days, amount}] }. */
  function basicPay(state, st, start, end, clipFrom, clipTo) {
    const sch = payOf(st).schedule, periodDays = U.daysBetween(start, end) + 1, groups = [];
    for (let d = clipFrom && clipFrom > start ? clipFrom : start; d <= (clipTo && clipTo < end ? clipTo : end); d = U.addDays(d, 1)) {
      if (!employed(st, d)) continue;
      const h = salaryOn(state, st.id, d); if (!h) continue;
      const last = groups[groups.length - 1];
      if (last && last.h === h) last.days++; else groups.push({ h, days: 1, from: d });
    }
    const parts = groups.map(g => {
      let amount;
      if (g.h.basis === 'daily') {
        let worked = 0;
        for (let i = 0, d = g.from; i < g.days; i++, d = U.addDays(d, 1)) { const s = E.dayStatus(state, st, d); worked += s.working ? (s.half ? 0.5 : 1) : 0; }
        amount = worked * Number(g.h.rate); return { rate: Number(g.h.rate), basis: 'daily', days: worked, from: g.from, amount: r2(amount), daily: true };
      }
      const std = g.h.basis === 'custom' ? Number(g.h.rate) : monthlyOf(state, g.h, sch) * 12 / periodsPerYear(sch);
      amount = std * g.days / periodDays;
      return { rate: Number(g.h.rate), basis: g.h.basis, monthly: monthlyOf(state, g.h, sch), std: r2(std), days: g.days, periodDays, from: g.from, amount: r2(amount) };
    });
    return { amount: r2(parts.reduce((a, x) => a + x.amount, 0)), parts };
  }

  // ---------- vale (cash advances) ----------
  const valePaid = (v, exceptRun) => (v.entries || []).filter(e => !exceptRun || e.runId !== exceptRun).reduce((a, e) => a + Number(e.amount), 0);
  const valeBalance = (v, exceptRun) => v.status === 'writtenOff' ? 0 : r2(Number(v.amount) - valePaid(v, exceptRun));
  const valeBalanceOf = (state, sid) => r2((state.vales || []).filter(v => v.staffId === sid && v.status !== 'writtenOff').reduce((a, v) => a + Math.max(0, valeBalance(v)), 0));
  /** Amount of a vale due at payday `p` (previous payday `prev`), capped by the balance left. */
  function valeDue(v, p, prev, runId) {
    if (v.status === 'writtenOff' || !['salary', 'mixed'].includes(v.method)) return 0;
    const bal = valeBalance(v, runId); if (bal <= 0) return 0;
    const plan = v.plan || {};
    let due = 0;
    if (plan.type === 'installment') { if ((plan.start || v.date) <= p) due = Number(plan.amount) || 0; }
    else if (plan.type === 'lump') { const d = plan.date || v.date; if (d <= p && d > prev) due = bal; }
    else if (plan.type === 'custom') (plan.items || []).forEach(x => { if (x.date <= p && x.date > prev) due += Number(x.amount) || 0; });
    return r2(Math.min(due, bal));
  }

  // ---------- contributions (spec §5.10; rate tables are editable data) ----------
  const AGENCIES = { sss: 'SSS', philhealth: 'PhilHealth', pagibig: 'Pag-IBIG' };
  function tableFor(state, agency, month) {
    return (state.contribTables || []).filter(t => t.agency === agency && t.from <= month + '-01').sort((a, b) => b.from.localeCompare(a.from))[0] || null;
  }
  const govOf = (st, agency) => Object.assign({ enabled: true, no: '', status: 'not registered', registered: '', coverage: '' }, (st.gov || {})[agency] || {});
  /** Monthly contribution for one agency: basis, employee and employer shares. */
  function contribution(state, st, agency, month) {
    const t = tableFor(state, agency, month), g = govOf(st, agency);
    if (!t || !g.enabled) return null;
    const cov = (g.coverage || st.hireDate || '0000-00-00').slice(0, 7);
    if (month < cov || (st.exitDate && month > ym(st.exitDate))) return null;
    const lastDay = month + '-' + pad(dim(month + '-01'));
    const h = salaryOn(state, st.id, st.exitDate && st.exitDate < lastDay ? st.exitDate : lastDay); if (!h) return null;
    const monthly = monthlyOf(state, h, payOf(st).schedule);
    let basis = Math.min(Math.max(monthly, Number(t.floor) || 0), Number(t.ceiling) || Infinity);
    if (t.step) basis = Math.min(Math.max(Math.round(basis / t.step) * t.step, Number(t.floor) || 0), Number(t.ceiling) || Infinity);
    let ee = basis * (monthly <= (Number(t.lowCut) || -1) ? Number(t.lowEeRate) : Number(t.eeRate));
    let er = basis * Number(t.erRate) + (t.ecLow ? (basis < (Number(t.ecCut) || 15000) ? Number(t.ecLow) : Number(t.ecHigh)) : 0);
    let note = '';
    const S = state.settings;
    if (payOf(st).contrib === 'employer') { er += ee; ee = 0; note = 'Employer pays all (pay setting)'; }
    else if (monthly < (Number(S.kasambahayEeThreshold) || 0)) { er += ee; ee = 0; note = 'Employer pays all: salary below ₱' + Number(S.kasambahayEeThreshold).toLocaleString() + ' (RA 10361)'; }
    const dueDay = (S.contribDue || {})[agency];
    const nm = U.addMonths(month + '-01', 1);
    const due = nm.slice(0, 8) + pad(!dueDay || dueDay > dim(nm) ? dim(nm) : dueDay);
    return { agency, month, monthly: r2(monthly), basis: r2(basis), ee: r2(ee), er: r2(er), total: r2(ee + er), due, note, tableFrom: t.from };
  }
  function contribStatus(state, st, agency, month, today) {
    const c = contribution(state, st, agency, month); if (!c) return null;
    const rec = (state.contributions || {})[st.id + '|' + agency + '|' + month];
    let status = 'Due';
    if (rec && rec.paidOn) status = rec.paidOn > c.due ? 'Paid late' : 'Paid';
    else if (today > c.due) status = 'Late';
    return Object.assign({}, c, { rec: rec || null, status });
  }

  // ---------- benefits ----------
  function thirteenth(state, st, year, until) {
    const from = [year + '-01-01', st.hireDate || year + '-01-01'].sort()[1];
    let to = until || year + '-12-31'; if (st.exitDate && st.exitDate < to) to = st.exitDate;
    if (from > to) return { amount: 0, earned: 0, from, to };
    let earned = 0;
    for (let d = from; d <= to; d = U.addDays(d, 1)) { const h = salaryOn(state, st.id, d); if (h) earned += monthlyOf(state, h, payOf(st).schedule) * 12 / 365; }
    const unpaid = absenceDays(state, st, from, to).reduce((a, x) => a + x.days * dayRate(state, st, x.date), 0);
    earned = Math.max(0, earned - unpaid);
    return { amount: r2(earned / 12), earned: r2(earned), from, to };
  }
  function silBalance(state, st, year) {
    const b = benOf(st), elig = st.hireDate ? U.addMonths(st.hireDate, 12) : null;
    const entitled = elig && elig <= year + '-12-31' ? Number(b.silDays) || 0 : 0;
    let used = (state.exceptions || []).filter(e => e.staffId === st.id && e.type === 'paid_leave' && e.date.startsWith(String(year))).length;
    // vacation days paid from service incentive leave (working days only)
    (state.exceptions || []).filter(e => e.staffId === st.id && e.type === 'vacation' && e.pay === 'sil').forEach(e => {
      for (let x = e.date; x <= (e.to || e.date); x = U.addDays(x, 1))
        if (x.startsWith(String(year)) && !(st.restDay !== '' && st.restDay != null && Number(st.restDay) === U.dow(x))) used++;
    });
    return { year, eligibleFrom: elig, entitled, used, balance: entitled - used };
  }

  // ---------- attendance effects ----------
  function absenceDays(state, st, start, end) {
    const pay = payOf(st), out = [];
    (state.exceptions || []).forEach(e => {
      if (e.staffId !== st.id) return;
      // two-day off: the extra (non-rest) day is unpaid only when agreed so
      if (e.type === 'two_day_off' && e.swap === 'unpaid') {
        [e.date, e.to].filter(x => x && x >= start && x <= end && !(st.restDay !== '' && st.restDay != null && Number(st.restDay) === U.dow(x))).forEach(x => out.push({ date: x, type: 'two_day_off', days: 1, id: e.id }));
        return;
      }
      // vacation (e.g. weeks in the province): unpaid days are deducted, except her weekly rest days
      if (e.type === 'vacation') {
        if (e.pay !== 'unpaid') return;
        for (let x = [e.date, start].sort()[1]; x <= [e.to || e.date, end].sort()[0]; x = U.addDays(x, 1))
          if (!(st.restDay !== '' && st.restDay != null && Number(st.restDay) === U.dow(x))) out.push({ date: x, type: 'vacation', days: 1, id: e.id });
        return;
      }
      if (e.date < start || e.date > end) return;
      let days = { dayoff_unpaid: 1, absent_unauthorized: 1, half_am: 0.5, half_pm: 0.5, sick: pay.sickPaid ? 0 : 1 }[e.type];
      if (e.type === 'errand' && e.paid === 'unpaid') days = e.portion === 'whole' ? 1 : 0.5; // contract: ½ day or whole day only
      if (days) out.push({ date: e.date, type: e.type, days, id: e.id });
    });
    return out;
  }
  const ABS_LABEL = { dayoff_unpaid: 'Day-off without pay', absent_unauthorized: 'Unauthorized absence', half_am: 'Half day (AM off)', half_pm: 'Half day (PM off)', sick: 'Sick leave (unpaid)', errand: 'Errand (unpaid)', vacation: 'Vacation day (unpaid)', two_day_off: 'Extra day of a two-day off (unpaid)' };

  /** Build a pay run's computed lines for one person and period. Manual lines are kept by the caller. */
  function buildRun(state, st, start, runId) {
    const per = periodFor(state, st, start), S = state.settings, pay = payOf(st), ben = benOf(st);
    const lines = [], warnings = [];
    const L = (kind, code, desc, amount, extra) => lines.push(Object.assign({ id: code + ':' + lines.length, kind, code, desc, amount: r2(amount), auto: true }, extra || {}));
    const dr = dayRate(state, st, per.end);
    // basic
    const bp = basicPay(state, st, per.start, per.end);
    bp.parts.forEach(x => {
      const desc = x.daily ? `Basic pay — ${x.days} day(s) worked × ₱${fmt(x.rate)}`
        : x.days === x.periodDays ? `Basic pay — ${x.basis === 'custom' ? 'per-period amount' : '₱' + fmt(x.monthly) + '/month'} (${periodsPerYear(pay.schedule)} pay periods a year)`
          : `Basic pay — ₱${fmt(x.monthly)}/month × ${x.days} of ${x.periodDays} days (from ${x.from})`;
      L('basic', 'basic', desc, x.amount, { qty: x.days, rate: x.std || x.rate });
    });
    if (!bp.parts.length) warnings.push('No salary on record for this period. Add one under Pay & Vale → Salary history.');
    const daily = bp.parts.some(x => x.daily);
    // additions
    (state.exceptions || []).filter(e => e.staffId === st.id && e.type === 'rest_worked' && (e.comp || 'pay') === 'pay' && e.date >= per.start && e.date <= per.end).forEach(e => {
      const k = e.portion === 'half' ? 0.5 : 1, pct = E.restCompOf(st).premiumPct;
      L('add', 'restday', `Worked on rest day ${e.date} (${k === 1 ? 'whole' : 'half'} day) — ${pct}% of day rate ₱${fmt(dr)}`, dr * k * pct / 100, { ref: e.id });
    });
    (state.benefits || []).filter(b => b.staffId === st.id).forEach(b => {
      if (b.schedule === 'perPayday' && (!b.start || b.start <= per.payday) && (!b.end || per.payday <= b.end)) L('add', 'allow', `${b.name} (every payday)`, b.amount, { ref: b.id });
      else if (b.schedule === 'monthly' && (!b.start || b.start <= per.payday) && (!b.end || per.payday <= b.end)) {
        const prev = prevPeriod(state, st, per);
        if (ym(prev.payday) !== ym(per.payday)) L('add', 'allow', `${b.name} (monthly, ${ym(per.payday)})`, b.amount, { ref: b.id });
      } else if (b.schedule === 'once' && b.date >= per.start && b.date <= per.end && b.type !== 'medical') L('add', b.type === 'bonus' ? 'bonus' : 'other', `${b.name} (${b.date})`, b.amount, { ref: b.id });
    });
    if (Number(ben.birthdayGift) > 0 && st.birthDate) {
      for (let d = per.start; d <= per.end; d = U.addDays(d, 1)) if (d.slice(5) === st.birthDate.slice(5)) L('add', 'bonus', `Birthday cash gift (${d})`, ben.birthdayGift);
    }
    if (ben.thirteenth) {
      for (const y of new Set([per.start.slice(0, 4), per.end.slice(0, 4)])) {
        const d13 = y + '-' + (S.thirteenthDate || '12-15');
        if (d13 >= per.start && d13 <= per.end) { const t = thirteenth(state, st, +y); L('add', '13th', `13th month pay ${y} — basic earned ₱${fmt(t.earned)} ÷ 12 (${t.from} to ${t.to})`, t.amount); }
      }
    }
    // deductions: unpaid absences
    if (!daily) absenceDays(state, st, per.start, per.end).forEach(a => {
      const each = pay.absenceRule === 'fixed' ? Number(pay.absenceAmount) || 0 : dr;
      L('ded', 'absence', `${ABS_LABEL[a.type]} ${a.date} — ${a.days} × ₱${fmt(each)}${pay.absenceRule === 'fixed' ? ' (contract rate)' : ' (day rate)'}`, a.days * each, { ref: a.id });
    });
    // deductions: employee share of contributions, in the first run whose payday falls in the month
    const prev = prevPeriod(state, st, per);
    if (ym(prev.payday) !== ym(per.payday)) Object.keys(AGENCIES).forEach(ag => {
      const c = contribution(state, st, ag, ym(per.payday));
      if (c && c.ee > 0) L('ded', 'contrib', `${AGENCIES[ag]} employee share (${ym(per.payday)}, basis ₱${fmt(c.basis)})`, c.ee, { ref: ag });
    });
    // deductions: vale installments due this payday
    const grossBeforeVale = lines.reduce((a, l) => a + (l.kind === 'ded' ? -l.amount : l.amount), 0);
    let valeTotal = 0;
    (state.vales || []).filter(v => v.staffId === st.id && v.date <= per.payday).forEach(v => {
      const due = valeDue(v, per.payday, prev.payday, runId); if (!due) return;
      if (!v.authorization) { warnings.push(`Vale of ₱${fmt(v.amount)} (${v.date}): ₱${fmt(due)} is due, but there is no signed authorization for salary deduction on file, so it is not deducted. Upload it on the vale.`); return; }
      valeTotal += due;
      L('ded', 'vale', `Vale ${v.date} (₱${fmt(v.amount)}) — ${v.plan.type === 'installment' ? 'installment' : v.plan.type === 'lump' ? 'lump sum' : 'scheduled'}; balance after ₱${fmt(valeBalance(v, runId) - due)}`, due, { ref: v.id });
    });
    if (valeTotal && grossBeforeVale > 0 && valeTotal > grossBeforeVale * (Number(pay.valeCapPct) || 30) / 100)
      warnings.push(`Vale deductions (₱${fmt(valeTotal)}) are over ${pay.valeCapPct}% of pay before vale (₱${fmt(grossBeforeVale)}). Consider a smaller installment.`);
    if (S.minWage && bp.parts.some(x => (x.monthly || 0) > 0 && x.monthly < Number(S.minWage))) warnings.push(`Salary is below the regional minimum set in Settings (₱${fmt(S.minWage)}/month).`);
    return { period: per, lines, warnings, dayRate: r2(dr), divisor: Number(S.dayRateDivisor) || 26 };
  }
  function totals(lines) {
    const sum = k => r2(lines.filter(l => l.kind === k).reduce((a, l) => a + Number(l.amount), 0));
    const basic = sum('basic'), add = sum('add'), ded = sum('ded');
    return { basic, add, gross: r2(basic + add), ded, net: r2(basic + add - ded) };
  }

  // ---------- regularization, raises, final pay ----------
  function regReminder(st, today) {
    if (st.status !== 'provisional' || !st.hireDate || st.exitDate) return null;
    const due = E.regularizationDue(st), left = U.daysBetween(today, due);
    if (left > 30) return null;
    return { due, left, stage: left <= 7 ? 7 : left <= 14 ? 14 : 30 };
  }
  /** Contract: ₱500 a year from the last increase, up to the cap; after that, DOLE minimum-wage increases. */
  function raiseDue(state, st, today) {
    const S = state.settings, inc = Number(S.annualIncrease) || 0; if (!inc || st.status !== 'regular' || st.exitDate) return null;
    const h = history(state, st.id); if (!h.length) return null;
    const last = h[h.length - 1], next = U.addMonths(last.effectiveFrom, 12), monthly = monthlyOf(state, last, payOf(st).schedule);
    if (U.daysBetween(today, next) > 30) return null;
    const cap = Number(S.salaryCap) || Infinity;
    return { date: next, from: monthly, to: Math.min(monthly + inc, cap), capped: monthly >= cap };
  }
  /** Final pay on exit. paidThrough: salary already paid up to this date (default: end of the last paid pay run). */
  function finalPay(state, st, lastDay, paidThrough) {
    const runs = (state.payRuns || []).filter(r => r.staffId === st.id && r.status === 'paid').sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    const from = paidThrough ? U.addDays(paidThrough, 1) : runs.length ? U.addDays(runs[runs.length - 1].periodEnd, 1) : (st.hireDate || lastDay);
    const tmp = Object.assign({}, st, { exitDate: lastDay });
    const lines = [];
    if (from <= lastDay) {
      let amt = 0;
      for (let p = periodFor(state, tmp, from); p.start <= lastDay; p = nextPeriod(state, tmp, p)) amt += basicPay(state, tmp, p.start, p.end, from, lastDay).amount; // pro-rated against each full period
      lines.push({ kind: 'add', desc: `Unpaid salary ${from} to ${lastDay}`, amount: r2(amt) });
      const abs = absenceDays(state, tmp, from, lastDay).reduce((a, x) => a + x.days, 0);
      if (abs) lines.push({ kind: 'ded', desc: `Unpaid absences in that time (${abs} day(s))`, amount: r2(abs * dayRate(state, tmp, lastDay)) });
    }
    const y = +lastDay.slice(0, 4), paid13 = runs.some(r => r.lines.some(l => l.code === '13th' && l.desc.includes(String(y))));
    if (benOf(st).thirteenth && !paid13) { const t = thirteenth(state, tmp, y, lastDay); lines.push({ kind: 'add', desc: `Pro-rated 13th month ${y} (₱${fmt(t.earned)} ÷ 12)`, amount: t.amount }); }
    const sil = silBalance(state, tmp, y);
    if (sil.balance > 0) lines.push({ kind: 'add', desc: `Unused service incentive leave (${sil.balance} day(s))`, amount: r2(sil.balance * dayRate(state, tmp, lastDay)) });
    const vb = valeBalanceOf(state, st.id);
    if (vb > 0) lines.push({ kind: 'ded', desc: 'Remaining vale balance', amount: vb });
    return { lines, total: r2(lines.reduce((a, l) => a + (l.kind === 'ded' ? -l.amount : l.amount), 0)) };
  }

  const fmt = n => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  root.MHM.Payroll = {
    PAY_DEFAULTS, BEN_DEFAULTS, AGENCIES, ABS_LABEL, payOf, benOf, history, salaryOn, monthlyOf, dayRate, periodsPerYear, periodFor, nextPeriod, prevPeriod, nextDue,
    basicPay, valeBalance, valeBalanceOf, valeDue, tableFor, govOf, contribution, contribStatus, thirteenth, silBalance, absenceDays,
    buildRun, totals, regReminder, raiseDue, finalPay, fmt, r2,
  };
})(typeof window !== 'undefined' ? window : globalThis);
