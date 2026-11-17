/* Montalban Home Manager — seed data (Appendix A catalog + household defaults).
   Minutes, difficulty and windows are starting estimates; adjust in the Task Library. */
(function (root) {
  'use strict';

  const SCHOOL_RUN = 'School run: drop-off, waits at school, brings the children home';
  // [category, name, freq, window, minutes, difficulty, assist, handbookRef, flags]
  // freq: D daily · SD school days · EOD0/EOD1 every other day (offset) · PWn n×/week (PWn@d,d fixed weekdays, 0=Sun)
  //       W weekly (W@d fixed day) · 2W · M · M3 · M6 · Y · AN as needed
  // assist: - none · O optional · R required
  // flags: E essential · S standard · M can move · C children must not be in area · N noisy (quiet hours)
  //        T low foot traffic · L needs ladder · D driver may assist
  const CATALOG = [
    // Cooking Lead (meals) and Kitchen Lead (serving, clean-up, pantry) — separate lead areas since 16 Nov 2026
    ['cooking', 'Early prep + cook breakfast (per menu)', 'D', '05:00-06:30', 60, 'L', '-', '§2.1, §4.2', 'E'],
    ['kitchen', 'Serve breakfast + breakfast clean-up', 'D', '07:00-08:00', 45, 'L', 'O', '§4.4', 'E'],
    // School days: 3 children bring a packed lunch + snacks (decided 13 Nov 2026)
    ['cooking', "Cook children's packed lunch (per menu)", 'SD', '05:00-06:30', 30, 'L', '-', '§4.2, §9', 'E'],
    ['cooking', "Pack children's lunch boxes + snacks + drinks", 'SD', '06:00-06:50', 25, 'L', '-', '§4.2', 'E'],
    ['cooking', 'Cook lunch (per menu)', 'D', '11:00-12:00', 60, 'L', '-', '§9', 'E'],
    ['kitchen', 'Lunch clean-up (dishes air-dried, counters, table)', 'D', '12:30-13:00', 30, 'L', '-', '§4.4', 'E'],
    ['cooking', 'Cook dinner (per menu)', 'D', '16:30-18:00', 75, 'L', 'O', '§9', 'E'],
    ['kitchen', 'Dinner clean-up', 'D', '18:45-19:45', 45, 'L', 'O', '§4.4', 'E'],
    ['kitchen', 'Microwave nightly cleaning', 'D', '19:15-20:00', 15, 'L', '-', '§4.4', 'E'],
    ['kitchen', 'Food waste to compost; wash container; new liner', 'D', '19:15-20:00', 10, 'L', '-', '§5.2', 'E'],
    ['kitchen', 'Leftovers stored, labeled; kitchen left dry', 'D', '19:15-20:00', 10, 'L', '-', '§4.4, §9.2', 'E'],
    ['kitchen', 'Pantry check (low stock, expiry)', 'W@5', '09:00-16:00', 30, 'L', '-', '§8.1', 'S'],
    ['kitchen', 'Disinfect water bottles', 'W', '09:00-16:00', 20, 'L', '-', '§8.1, §11.5', 'S'],
    ['kitchen', 'Fridge defrost, declutter, wipe, door seals', '2W', '09:00-15:00', 90, 'H', 'O', '§8.2', 'M'],
    ['kitchen', 'Kitchen light deep clean (cabinet doors, backsplash, appliance fronts)', '2W', '09:00-16:00', 60, 'L', '-', '§8.2', 'M'],
    ['kitchen', 'Pantry deep clean + reorganize', 'M', '09:00-16:00', 90, 'H', 'O', '§8.3', 'M'],
    ['kitchen', 'Range hood filter cleaning', 'M', '09:00-16:00', 45, 'L', '-', '§8.3', 'M'],
    ['kitchen', 'Small appliances (rice cooker, kettle, toaster)', 'M', '09:00-16:00', 45, 'L', '-', '§8.3', 'M'],
    // Floors & Outdoor Lead
    ['floors', 'Sweep front & back parking, main door, roadside', 'D', '08:00-10:00', 30, 'L', '-', '§4.3', 'ED'],
    ['floors', 'Sweep lanai / outdoor sitting areas', 'D', '08:00-10:00', 15, 'L', '-', '§4.3', 'E'],
    ['floors', 'Sweep 1st floor, 2nd floor, roof deck', 'D', '08:00-11:00', 45, 'L', '-', '§4.3', 'E'],
    ['floors', 'Mop main indoor floors (children not in area)', 'D', '08:00-16:30', 45, 'H', '-', '§4.1, §4.3', 'EC'],
    ['floors', 'Utility area & canal daily clean', 'D', '08:00-16:00', 20, 'L', '-', '§4.6', 'E'],
    ['floors', 'Indoor dusting (furniture, shelves, décor)', 'PW2', '08:00-16:30', 45, 'L', '-', '§8.1', 'SC'],
    ['floors', 'Vacuum sofas and upholstery', 'W', '08:00-16:30', 30, 'L', '-', '§8.1', 'SN'],
    ['floors', 'Clean glass: reachable outside windows, interior glass, mirrors', 'W', '08:00-16:00', 60, 'H', 'O', '§8.1', 'S'],
    ['floors', 'Disinfect door handles, light switches, remotes', 'W', '08:00-16:00', 20, 'L', '-', '§8.1', 'S'],
    ['floors', 'Deep clean outside service areas (lanai, utility, canal, main door, shoe area)', 'W', '08:00-15:00', 120, 'H', 'R', '§4.6, §8.1', 'S'],
    ['floors', 'Window tracks and frames (reachable)', '2W', '08:00-16:00', 60, 'L', '-', '§8.2', 'M'],
    ['floors', 'Floor wax: all floors and stairs (announce "slippery")', '2W', '08:30-15:00', 180, 'H', 'R', '§4.3, §8.2', 'MTCN'],
    ['floors', 'Walls & vertical surfaces check and clean', 'M', '08:00-16:00', 90, 'H', 'O', '§4.6', 'M'],
    ['floors', 'Baseboards, corners, behind furniture', 'M', '08:00-16:00', 90, 'H', 'R', '§8.3', 'M'],
    ['floors', 'Deep vacuum sofas and chairs', 'M', '08:00-16:30', 45, 'L', '-', '§8.3', 'MN'],
    ['floors', 'Wash & disinfect all main trash bins', 'M', '08:00-15:00', 45, 'H', '-', '§5.3, §8.3', 'MD'],
    ['floors', 'Clean outdoor light fixtures (ladder)', 'Y', '08:00-15:00', 60, 'H', 'R', '§8.5', 'ML'],
    ['floors', 'Deep clean sofas/upholstery (or supervise service)', 'M6', '08:00-16:00', 120, 'H', 'R', '§8.5', 'M'],
    // Bathroom Lead
    ['bathroom', 'Quick clean all CRs (toilets, sinks, counters dry, shower, drain)', 'EOD0', '08:30-16:00', 60, 'H', '-', '§4.5', 'E'],
    ['bathroom', 'Empty bathroom trash; spot-dry floors', 'D', '08:30-10:00', 10, 'L', '-', '§4.5, §5.2', 'E'],
    ['bathroom', "Maids' room & CR cleaning", 'W', '08:30-16:00', 45, 'L', '-', '§8.1', 'S'],
    ['bathroom', 'Deep descale tiles, grout, showerheads', 'M', '08:30-15:00', 120, 'H', 'R', '§8.3', 'M'],
    // Laundry Lead
    ['laundry', 'Pre-soak regular clothes (OxyClean + borax)', 'EOD0', '19:15-19:45', 15, 'L', '-', '§7.2', 'E'],
    ['laundry', 'Wash regular clothes (4 tbsp soap, measured); hang; wipe machine', 'EOD1', '08:30-09:30', 60, 'H', 'O', '§7.2, §7.5.3', 'EN'],
    ['laundry', 'Bring in dry clothes; fold and store (iron first if needed)', 'EOD1', '15:00-16:30', 45, 'L', 'O', '§7.1', 'E'],
    ['laundry', 'Handwash delicates & school uniforms', 'PW3', '09:30-11:00', 45, 'H', '-', '§7.5.2', 'S'],
    ['laundry', 'Soak towels & bathroom textiles', 'W@2', '19:15-19:45', 10, 'L', '-', '§7.3', 'S'],
    ['laundry', 'Wash towels', 'W@3', '08:30-11:00', 45, 'H', '-', '§7.3', 'SN'],
    ['laundry', 'Strip beds, change linens, soak linens', 'W@0', '18:30-19:45', 30, 'L', 'O', '§7.4', 'S'],
    ['laundry', 'Wash bed linens', 'W@1', '08:30-11:00', 60, 'H', '-', '§7.4', 'SN'],
    ['laundry', 'Ironing', 'PW2@3,0', '14:00-16:30', 120, 'L', '-', '§8.1', 'S'],
    ['laundry', 'Handwash rags; dry fully', 'D', '14:00-15:00', 15, 'L', '-', '§10.4', 'E'],
    ['laundry', 'Special items (blankets, mattress protectors, heavy linen)', '2W', '08:30-11:00', 90, 'H', 'O', '§7.5.1', 'M'],
    ['laundry', 'Wash curtains and heavy linens', 'M6', '08:30-15:00', 180, 'H', 'R', '§8.4', 'M'],
    // Toys Lead
    ['toys', 'Evening toy pick-up; remove unsafe/broken toys', 'D', '19:30-20:00', 15, 'L', '-', '§6.1', 'E'],
    ['toys', 'Toy area tidy and sort sets (Lego, puzzles, board games)', 'PW2', '09:00-16:00', 45, 'L', '-', '§6.2', 'S'],
    ['toys', 'Wipe toy surfaces + spot disinfection; check sets complete', '2W', '09:00-16:00', 60, 'L', '-', '§6.2', 'M'],
    ['toys', 'Monthly toy deep clean, empty boxes/shelves, sort outgrown', 'M', '09:00-16:00', 180, 'H', 'R', '§6.3', 'M'],
    // Closet & Bedroom Lead
    ['closet', 'Prepare children for school (uniforms, bags, water bottles)', 'SD', '06:00-07:00', 45, 'L', 'O', '§2.1, §4.2', 'E'],
    ['closet', 'Make beds', 'D', '08:00-10:00', 20, 'L', '-', '§4.7', 'E'],
    ['closet', 'Pick up clutter in living areas & bedrooms; tidy cables', 'D', '08:00-10:00', 20, 'L', '-', '§4.7', 'E'],
    ['closet', 'Clean & polish school shoes', 'EOD0', '19:00-20:00', 20, 'L', '-', '§7.6.5', 'E'],
    ['closet', 'Closet check; refold/reorganize', 'W', '09:00-16:00', 60, 'L', '-', '§7.6.2', 'S'],
    ['closet', 'Wipe cabinets, shelves, drawers, open storage', 'W', '09:00-16:00', 30, 'L', '-', '§7.6.2', 'S'],
    ['closet', 'Wash rubber shoes; dry fully', 'M', '09:00-14:00', 30, 'L', '-', '§7.6.5', 'M'],
    ['closet', 'Vacuum mattresses', 'M', '09:00-16:00', 45, 'L', '-', '§8.3', 'MN'],
    ['closet', 'Rotate/flip mattresses', 'M3', '09:00-16:00', 30, 'H', 'R', '§8.4', 'M'],
    ['closet', 'Declutter wardrobes; outgrown clothes to box; report to employer', 'M6', '09:00-16:00', 180, 'L', 'O', '§7.6.3, §8.4', 'M'],
    ['closet', 'Cabinet & drawer decluttering (one room/area at a time)', 'M3', '09:00-16:00', 120, 'L', '-', '§8.4', 'M'],
    // Pets: fish and turtles (decided 13 Nov 2026; add more animals in the Task Library)
    ['pets', 'Feed fish (small pinch; scoop out uneaten food after 5 min)', 'D', '07:30-09:00', 5, 'L', '-', '§15', 'E'],
    ['pets', 'Feed turtles (pellets / greens as instructed)', 'D', '07:30-09:00', 10, 'L', '-', '§15', 'E'],
    ['pets', 'Tank check: filters running, heater / basking lamp, water level, top up treated water', 'D', '07:30-09:00', 5, 'L', '-', '§15', 'E'],
    ['pets', 'Fish tank partial water change (about 25%) + wipe glass', 'W', '09:00-16:00', 30, 'L', '-', '§15', 'S'],
    ['pets', 'Turtle tank partial water change; scrub basking area', 'W', '09:00-16:00', 30, 'H', '-', '§15', 'S'],
    ['pets', 'Rinse filter media in old tank water (fish and turtle tanks)', 'M', '09:00-16:00', 30, 'L', '-', '§15', 'M'],
    ['pets', 'Turtle tank full clean (turtles to holding tub; scrub tank, décor, filter)', 'M', '09:00-15:00', 90, 'H', 'O', '§15', 'M'],
    // Driver
    // leaves 07:10, stays at school, brings the children home about 18:00 (16 Nov 2026) — replaces separate drop-off and pick-up
    ['driver', SCHOOL_RUN, 'SD', '07:10-18:00', 650, 'L', '-', '§16', 'E'],
    ['driver', 'Family/employer trips', 'AN', '08:00-17:00', 60, 'L', '-', '§16', 'S'],
    ['driver', 'Vehicle daily check (tires, oil, water, lights, fuel)', 'D', '06:30-07:00', 15, 'L', '-', '§16', 'E'],
    ['driver', 'Wash & clean car(s) inside and out', 'W', '09:00-15:00', 60, 'H', '-', '§16', 'S'],
    ['driver', 'Clean motorcycle(s)', 'W', '09:00-15:00', 30, 'L', '-', '§16', 'S'],
    ['driver', 'Sweep back parking (car area)', 'D', '08:00-09:00', 15, 'L', '-', '§4.3', 'E'],
  ];

  // Starter instructions for a few tasks (placeholders for the employer to replace with handbook wording).
  const INSTRUCTIONS = {
    'Mop main indoor floors (children not in area)': [
      'Check that the children are out of the area.',
      'Sweep first; pick up small items from the floor.',
      'Mix floor cleaner in the bucket as labeled.',
      'Mop from the far corner toward the door; wring the mop well.',
      'Put up the "wet floor" sign until dry. Rinse and hang the mop.'],
    'Wash regular clothes (4 tbsp soap, measured); hang; wipe machine': [
      'Load the pre-soaked clothes; do not overload.',
      'Measure 4 tbsp soap. No extra.',
      'Run the normal cycle; hang clothes right away.',
      'Wipe the drum, seal and soap tray; leave the door open to dry.'],
    'Floor wax: all floors and stairs (announce "slippery")': [
      'Tell the household: floors will be slippery today.',
      'Sweep and mop; let floors dry fully.',
      'Apply wax in thin coats, one section at a time, working toward the exit.',
      'Keep everyone off until dry. Stairs last.'],
    'Quick clean all CRs (toilets, sinks, counters dry, shower, drain)': [
      'Spray toilet, sink and shower; let it sit.',
      'Scrub toilet bowl, seat and base.',
      'Wipe sink and counters; dry them.',
      'Clear the drain; rinse the shower; spot-dry the floor.'],
    'Pre-soak regular clothes (OxyClean + borax)': [
      'Sort out whites, colors and delicates.',
      'Fill the basin; add measured OxyClean and borax; dissolve.',
      'Soak overnight, covered. Wash the next morning.'],
    'Feed turtles (pellets / greens as instructed)': [
      'Give only the amount on the feeding card; remove leftovers after 15 minutes.',
      'Wash hands with soap right after. Turtles can carry Salmonella.',
      'Children wash hands too if they touch the turtles or the water.'],
    'Turtle tank partial water change; scrub basking area': [
      'Use the turtle-only bucket, sponge and brush. Never clean in the kitchen sink.',
      'Remove about a third of the water; scrub the basking area.',
      'Refill with treated (dechlorinated) water at room temperature.',
      'Wash hands and the bucket afterwards; wipe the floor around the tank.'],
    'Turtle tank full clean (turtles to holding tub; scrub tank, décor, filter)': [
      'Move the turtles to the holding tub with some tank water.',
      'Do this in the utility area or outside — never in the kitchen sink.',
      'Rinse filter media in old tank water (not tap water) to keep the good bacteria.',
      'Scrub the tank and décor; refill with treated water; check heater and lamp before returning the turtles.',
      'Wash hands with soap; disinfect the bucket and the area used.'],
    'Fish tank partial water change (about 25%) + wipe glass': [
      'Unplug the heater first.',
      'Siphon about a quarter of the water, vacuuming the gravel.',
      'Refill with treated water close to tank temperature; plug the heater back in.',
      'Use the fish-only bucket; no soap on anything that goes in the tank.'],
  };

  const FLAG_MAP = { C: 'children', N: 'noisy', T: 'lowTraffic', L: 'ladder' };
  // Driving jobs nobody else can do; on the driver's day off they are skipped. His other tasks go to the helpers.
  const DRIVER_ONLY = [SCHOOL_RUN, 'Family/employer trips', 'Vehicle daily check (tires, oil, water, lights, fuel)'];
  const START_AT = { [SCHOOL_RUN]: '07:10' }; // set start times (the school run leaves at 07:10)
  // Cooking tasks that take the dish (and cooking time) from the weekly menu
  const MEAL_TASKS = {
    'Early prep + cook breakfast (per menu)': 'breakfast',
    "Cook children's packed lunch (per menu)": 'baon',
    'Cook lunch (per menu)': 'lunch',
    'Cook dinner (per menu)': 'dinner',
  };

  // Sample recipe from spec §5.7
  const RECIPES = [{
    id: 'r-adobo', name: 'Chicken Adobo', category: 'ulam', mealTypes: ['lunch', 'dinner'], servings: 6, prepMin: 15, cookMin: 45, difficulty: 'beginner',
    ingredients: [
      { qty: 1, unit: 'kg', item: 'chicken', note: 'cut; drumsticks/thighs' },
      { qty: 0.5, unit: 'cup', item: 'soy sauce', note: '' },
      { qty: 0.33, unit: 'cup', item: 'cane vinegar', note: '' },
      { qty: 1, unit: 'head', item: 'garlic', note: 'whole head, crushed' },
      { qty: 1, unit: 'tsp', item: 'whole peppercorns', note: '' },
      { qty: 3, unit: 'pc', item: 'dried bay leaves', note: '' },
      { qty: 1, unit: 'cup', item: 'water', note: '' },
      { qty: 1, unit: 'tbsp', item: 'cooking oil', note: '' },
      { qty: 1, unit: 'tsp', item: 'brown sugar', note: 'optional' },
    ],
    equipment: 'Stainless steel pot with lid, tongs, measuring cups (stainless steel cookware only, §9.1)',
    steps: [
      'Wash hands (§9.2). Rinse chicken and drain.',
      'Heat oil in the stainless steel pot on medium. Sauté half of the garlic until light golden.',
      'Add chicken; brown lightly on all sides (about 5 minutes).',
      'Add soy sauce, water, peppercorns and bay leaves. Bring to a boil.',
      'Pour in vinegar. Do not stir for 3–5 minutes so the sour taste mellows.',
      'Cover, lower the heat, and simmer 30–35 minutes until the chicken is tender. Stir now and then.',
      'Uncover; add the rest of the garlic and sugar (optional). Simmer 5 more minutes to thicken the sauce.',
      'Taste. Remove bay leaves before serving to the children.',
    ],
    kidNotes: 'Remove bay leaves before serving to the children.',
    allergyTags: ['soy'],
    storage: 'Cool, put in a covered container, label with the date, refrigerate (§9.2). Reheat once only.',
    safety: 'Never leave the stove unattended (§9.1).',
    video: '', photo: null,
  }];

  // ---------- Phase 3: forms built from the household's own documents (formats/) ----------
  // [section, id, label, type, options/columns, rows]
  const BIODATA_FIELDS = [
    ['Personal data', 'entryDate', 'Entry date', 'date'],
    ['Personal data', 'lastName', 'Last name', 'text'], ['Personal data', 'firstName', 'First name', 'text'], ['Personal data', 'middleName', 'Middle name', 'text'],
    ['Personal data', 'cityAddress', 'City address', 'textarea'], ['Personal data', 'provAddress', 'Provincial address', 'textarea'],
    ['Personal data', 'globe', 'Contact number — Globe / TM', 'text'], ['Personal data', 'sun', 'Contact number — Sun', 'text'],
    ['Personal data', 'smart', 'Contact number — Smart', 'text'], ['Personal data', 'landline', 'Landline', 'text'],
    ['Personal data', 'email', 'Email address', 'text'], ['Personal data', 'fb', 'FB account name(s)', 'text'],
    ['Personal data', 'birthday', 'Birthday', 'date'], ['Personal data', 'birthplace', 'Place of birth', 'text'],
    ['Personal data', 'gender', 'Gender', 'choice', ['Female', 'Male']], ['Personal data', 'civil', 'Civil status', 'choice', ['Single', 'Married', 'Widowed', 'Separated']],
    ['Personal data', 'heightWeight', 'Height and weight', 'text'],
    ['Personal data', 'idType', 'Available ID', 'text'], ['Personal data', 'idNumber', 'ID number', 'text'], ['Personal data', 'idIssued', 'Date issued', 'date'],
    ['Personal data', 'tin', 'TIN', 'text'], ['Personal data', 'sss', 'SSS number', 'text'], ['Personal data', 'philhealth', 'PhilHealth number', 'text'], ['Personal data', 'pagibig', 'Pag-IBIG number', 'text'],
    ['Family background', 'spouse', 'Name of spouse (last, given, middle)', 'text'], ['Family background', 'children', 'Number of children', 'number'],
    ['Family background', 'father', "Father's name (last, given, middle)", 'text'], ['Family background', 'mother', "Mother's maiden name (last, given, middle)", 'text'],
    ['Family background', 'siblings', 'Number of siblings', 'number'],
    ['Educational background', 'elementary', 'Elementary (name of school)', 'text'], ['Educational background', 'highschool', 'High school', 'text'],
    ['Educational background', 'vocational', 'Vocational', 'text'], ['Educational background', 'attainment', 'Highest educational attainment', 'text'],
    ['Persons to contact in case of emergency', 'emergency', 'Emergency contacts', 'table', ['Name', 'Address', 'Relationship', 'Cell number', 'Landline'], 3],
    ['Photo', 'photo', 'Photo', 'photo'],
    ['Certification', 'certified', 'Signed the certification ("true and correct… misrepresentation… dismissal")', 'yesno'], ['Certification', 'signedDate', 'Date signed', 'date'],
  ].map(([section, id, label, type, x, rows]) => ({ section, id, label, type, options: type === 'choice' ? x : undefined, columns: type === 'table' ? x : undefined, rows: rows || undefined }));

  // Contract fields (spec §5.8.4) with defaults taken from the household's DOLE Form BK-1 contracts
  const C = (id, label, type, prov, reg) => ({ id, label, type, prov: prov == null ? '' : prov, reg: reg === undefined ? (prov == null ? '' : prov) : reg });
  const CONTRACT_FIELDS = [
    C('startDate', 'Start date (Mula sa)', 'date'), C('endDate', 'End date (Hanggang sa) — provisional: start + 6 months', 'date'),
    C('position', 'Position / type of work', 'text', 'Kasambahay'),
    C('location', 'Place of work', 'text'),
    C('duties', 'Duties (Mga tungkulin at gawain)', 'textarea', 'Mag-alaga ng mga bata. Magluto ng pagkain, maglinis ng bahay at maglaba ng mga damit. Iba pang mga naaakop na gawain na gustong ipagawa ng employer.'),
    C('hours', 'Working hours', 'text', 'Stay-in'),
    C('salary', 'Monthly salary (₱) — a raise needs a new signed contract', 'number'),
    C('payMode', 'Payment mode', 'choice', 'Cash'), C('payday', 'Payday schedule', 'text', 'Every two weeks'),
    C('deductions', 'Allowed deductions', 'textarea', 'Vale (not more than one month\'s salary). Absences beyond the day-off — ₱___ per day. Other debts.'),
    C('absenceRate', 'Absence deduction per day (₱)', 'number'),
    C('restDay', 'Day-off', 'textarea', 'One (1) day-off per week, not more than 24 hours. Saturday day-off: leave 7:00 PM Friday, back Saturday evening. Sunday day-off: leave 7:00 PM Saturday, back Sunday evening. If the employer asks the helper to skip a day-off, one day\'s salary is paid for it.'),
    C('benefits', 'Benefits', 'textarea', 'Basic toiletries (shampoo/conditioner, soap, feminine napkins). Medical assistance when sick or hurt on duty. Mandatory check-up after starting work and an annual check-up.',
      'Basic toiletries (shampoo/conditioner, soap, feminine napkins). 13th month pay given at Christmas. Cash gift on her birthday. Medical assistance when sick or hurt on duty. Mandatory annual check-up.'),
    C('leave', 'Leave entitlements', 'textarea', 'Weekly day-off as above. Long holidays (Christmas, Holy Week): day-offs agreed or drawn by raffle so the house is never left without a helper.',
      'Weekly day-off as above. Service incentive leave as required by law. Long holidays (Christmas, Holy Week): day-offs agreed or drawn by raffle.'),
    C('vale', 'Vale / advance policy', 'textarea', 'Vale must not exceed one month\'s salary. Paid on the agreed date in cash or by salary deduction.'),
    C('notice', 'Notice period', 'text', '1 month (if not seeking a regular contract)', '3 months'),
    C('incentive', 'Regularization cash incentive (₱)', 'number', 3000, ''),
    C('increase', 'Salary increase', 'textarea', '', '₱500 a year from the date of the last increase. Total salary not more than ₱10,000; after that, increases follow the DOLE-approved minimum wage increase.'),
    C('special', 'Special terms', 'textarea', 'Provisional for 6 months. If regularized: ₱3,000 cash incentive and a new contract with new benefits. If the employer paid the fare from the province, the 6 months must be completed or the fare repaid.',
      'If the contract term ends and the helper keeps working, the contract renews automatically. Pro-rated 13th month if 3 months\' notice is given; goodwill bonus possible for long service (5+ years).'),
  ];
  const CONTRACT_TEMPLATES = {
    provisional: { name: 'Kontrata sa Paglilingkod sa Tahanan (Provisional) — Form BK-1', version: 1, file: null,
      fields: CONTRACT_FIELDS.filter(f => f.id !== 'increase').map(f => ({ id: f.id, label: f.label, type: f.type, default: f.prov })) },
    regular: { name: 'Kontrata sa Paglilingkod sa Tahanan (Regular) — Form BK-1', version: 1, file: null,
      fields: CONTRACT_FIELDS.filter(f => f.id !== 'incentive').map(f => ({ id: f.id, label: f.label, type: f.type, default: f.reg })) },
  };
  // SAMPLE contribution tables — verify current rates with SSS, PhilHealth and Pag-IBIG before relying on them (spec §7)
  const CONTRIB_TABLES = [
    { id: 'ct-sss-2025', agency: 'sss', from: '2025-01-01', eeRate: 0.05, erRate: 0.10, floor: 5000, ceiling: 35000, step: 500, ecLow: 10, ecHigh: 30, ecCut: 15000, note: 'SSS 2025: 15% of monthly salary credit (MSC ₱5,000–₱35,000, in ₱500 steps); employer 10% + EC, employee 5%.' },
    { id: 'ct-ph-2025', agency: 'philhealth', from: '2025-01-01', eeRate: 0.025, erRate: 0.025, floor: 10000, ceiling: 100000, note: 'PhilHealth 2025: 5% premium on ₱10,000–₱100,000, shared equally.' },
    { id: 'ct-hdmf-2024', agency: 'pagibig', from: '2024-02-01', eeRate: 0.02, erRate: 0.02, floor: 0, ceiling: 10000, lowCut: 1500, lowEeRate: 0.01, note: 'Pag-IBIG from Feb 2024: 2% each on up to ₱10,000 (employee 1% if ₱1,500 or less).' },
  ];

  // Philippine public holidays on weekdays (weekends are never school days), for the school calendar.
  // 2026: Proclamation No. 1006 (3 Sep 2025) · 2027: Proclamation No. 1427 (8 Sep 2026). Eid'l Fitr / Eid'l Adha are
  // proclaimed separately each year — add them when announced. R = regular holiday, S = special non-working day.
  const PH_HOLIDAYS = [
    ['2026-11-02', 'S', "All Souls' Day"], ['2026-11-30', 'R', 'Bonifacio Day'], ['2026-12-08', 'S', 'Feast of the Immaculate Conception'],
    ['2026-12-24', 'S', 'Christmas Eve'], ['2026-12-25', 'R', 'Christmas Day'], ['2026-12-30', 'R', 'Rizal Day'], ['2026-12-31', 'S', 'Last Day of the Year'],
    ['2027-01-01', 'R', "New Year's Day"], ['2027-03-25', 'R', 'Maundy Thursday'], ['2027-03-26', 'R', 'Good Friday'], ['2027-04-09', 'R', 'Araw ng Kagitingan'],
    ['2027-08-30', 'R', 'National Heroes Day'], ['2027-11-01', 'S', "All Saints' Day"], ['2027-11-02', 'S', "All Souls' Day"], ['2027-11-30', 'R', 'Bonifacio Day'],
    ['2027-12-08', 'S', 'Feast of the Immaculate Conception'], ['2027-12-24', 'S', 'Christmas Eve'], ['2027-12-30', 'R', 'Rizal Day'], ['2027-12-31', 'S', 'Last Day of the Year'],
  ];
  const holidayEntries = (fromDate) => PH_HOLIDAYS.filter(([d]) => !fromDate || d >= fromDate)
    .map(([d, k, name]) => ({ id: 'ph-' + d, reason: 'holiday', from: d, to: '', note: name + (k === 'R' ? ' (regular holiday)' : ' (special non-working day)'), source: 'proclamation' }));

  // Default 4-week menu rotation (16 Nov 2026): everyday Filipino family dishes, as free text — replace any dish in the
  // Menu planner, or save your own week as a cycle week. A planned dish for a date always wins over the rotation.
  const MENU = {
    breakfast: ['Tapsilog (beef tapa, garlic rice, egg)', 'Champorado with tuyo', 'Pandesal, cheese and scrambled eggs', 'Arroz caldo with egg',
      'Daing na bangus, garlic rice and egg', 'Hotdog, garlic rice and egg', 'Pancakes and fruit', 'Longsilog (longganisa, garlic rice, egg)',
      'Lugaw with egg and tokwa', 'Corned beef, garlic rice and egg', 'Oatmeal with banana', 'French toast and fruit', 'Tocilog (tocino, garlic rice, egg)', 'Pandesal with ham and egg'],
    ulam: ['Chicken tinola', 'Pork sinigang', 'Beef kare-kare', 'Chicken curry', 'Ginataang kalabasa at sitaw with pork', 'Fried chicken and chop suey', 'Paksiw na isda',
      'Pork giniling with peas and carrots', 'Bistek Tagalog', 'Chicken inasal with atchara', 'Sarciadong isda', 'Pork adobo', 'Beef with broccoli', 'Ginisang ampalaya with egg',
      'Fish escabeche', 'Chicken sopas', 'Beef nilaga', 'Pork humba', 'Tortang talong and ginisang monggo', 'Ginataang manok', 'Fish fillet with tartar sauce and vegetables',
      'Pancit bihon', 'Lumpiang shanghai and pinakbet', 'Chicken afritada', 'Pork menudo', 'Spaghetti (Filipino-style) and fried chicken', 'Picadillo', 'Chicken adobo'],
    snack: ['Turon', 'Banana cue', 'Kamote cue', 'Puto', 'Maruya', 'Fresh fruit (mango, banana or papaya)', 'Tuna sandwich', 'Pancit canton', 'Suman',
      'Biko', 'Ginataang bilo-bilo', 'Cheese pandesal', 'Yogurt and fruit', 'Lumpiang togue'],
    baon: ['Chicken adobo with rice', 'Pork giniling with rice', 'Fried chicken with rice', 'Spaghetti', 'Chicken nuggets, rice and vegetables', 'Pork tocino with rice',
      'Tuna sandwich and fruit', 'Embutido with rice', 'Lumpiang shanghai with rice', 'Chicken pastel with rice'],
  };
  function defaultMenuCycle() {
    const weeks = [{}, {}, {}, {}]; let school = 0;
    for (let w = 0; w < 4; w++) for (let i = 0; i < 7; i++) { // i: 0 = Monday … 6 = Sunday
      const k = w * 7 + i, wd = (i + 1) % 7, day = {}, rice = { course: 'carbs', recipeId: 'rb-steamed-rice', text: 'Steamed white rice' };
      // courses since 16 Nov 2026: main + carbs (no AM/PM snack slots); free text is matched to library recipes for groceries
      day.breakfast = { items: [{ course: 'main', text: MENU.breakfast[k % MENU.breakfast.length] }] };
      day.lunch = { items: [{ course: 'main', text: MENU.ulam[k % MENU.ulam.length] }, rice] };
      day.dinner = { items: [{ course: 'main', text: MENU.ulam[(k + 11) % MENU.ulam.length] }, rice] };
      if (i < 5) day.baon = { items: [{ course: 'main', text: MENU.baon[school++ % MENU.baon.length] }] };
      weeks[w][wd] = day;
    }
    return { on: true, weeks, source: 'default' };
  }

  function parseFreq(code) {
    if (code === 'D') return { type: 'daily' };
    if (code === 'SD') return { type: 'schoolDays' };
    if (code.startsWith('EOD')) return { type: 'eod', offset: Number(code.slice(3)) || 0 };
    if (code.startsWith('PW')) {
      const [n, days] = code.slice(2).split('@');
      return { type: 'perWeek', n: Number(n), days: days ? days.split(',').map(Number) : null };
    }
    if (code.startsWith('W')) { const d = code.split('@')[1]; return { type: 'weekly', day: d != null ? Number(d) : null }; }
    if (code === '2W') return { type: 'biweekly' };
    if (code === 'M') return { type: 'monthly' };
    if (code === 'M3') return { type: 'months', n: 3 };
    if (code === 'M6') return { type: 'months', n: 6 };
    if (code === 'Y') return { type: 'yearly' };
    return { type: 'asNeeded' };
  }

  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }

  function buildTasks() {
    const used = new Set();
    return CATALOG.map(([cat, name, freq, win, min, diff, assist, ref, flags]) => {
      let id = 't-' + cat + '-' + slug(name);
      while (used.has(id)) id += 'x';
      used.add(id);
      const [ws, we] = win.split('-');
      const priority = flags.includes('E') ? 'essential' : flags.includes('M') ? 'canMove' : 'standard';
      return {
        id, name, categoryId: cat, areaIds: [], freq: parseFreq(freq), preferredDays: [],
        window: [ws, we], minutes: min, difficulty: diff,
        assistMode: assist === 'R' ? 'required' : assist === 'O' ? 'optional' : 'none',
        assistMinutes: assist === 'R' ? min : assist === 'O' ? Math.round(min / 2) : 0,
        driverMayAssist: false, // the driver doesn't assist (16 Nov 2026): rotation and assisting are for the helpers only
        driverOnly: DRIVER_ONLY.includes(name), startAt: START_AT[name] || '',
        priority, constraints: [...flags].filter(f => FLAG_MAP[f]).map(f => FLAG_MAP[f]),
        eligible: cat === 'driver' ? 'driver' : 'helpers',
        instructions: INSTRUCTIONS[name] || [], handbookRef: ref, checklist: [], active: true,
        mealSlot: MEAL_TASKS[name] || '',
      };
    });
  }

  function create() {
    return {
      version: 1,
      _rev: 1,
      decisions: 18, // bump when the owner's §9 answers change defaults that saved data should adopt (see app.js upgrade)
      settings: {
        householdName: 'Montalban Household',
        lightFactor: 1, heavyFactor: 1.5, tolerance: 0.10,
        rotation: 'biweekly', rotationAnchor: '2026-09-01', // every 2 weeks, changing on a Monday (decided 13 Nov 2026)
        dayRateDivisor: 26, // daily rate = monthly salary ÷ 26, same for all staff (decided 13 Nov 2026; used by payroll, Phase 3)
        shadowEnabled: true, shadowDays: 14,
        childFree: ['08:00', '16:30'], quiet: ['06:00', '20:00'],
        helperHours: { start: '05:00', end: '20:00' },
        driverHours: { start: '06:30', end: '18:00' }, // live-out driver
        paper: 'A4',
        replacementWindowDays: 14, // a replacement day for a rest day worked must be used within this many days (spec §5.6)
        // Phase 3 — payroll policy (from the household contracts; editable in Settings)
        thirteenthDate: '12-15',   // 13th month is added to the pay run covering this date ("ibibigay sa Pasko"; law: by 24 Dec)
        annualIncrease: 500, salaryCap: 10000, regIncentive: 3000, valeMaxMonths: 1,
        kasambahayEeThreshold: 5000, // RA 10361: below this monthly wage the employer pays the employee share too
        contribDue: { sss: 0, philhealth: 0, pagibig: 15 }, // day of the following month (0 = last day) — set to your agencies' due dates
        employerNos: { sss: '', philhealth: '', pagibig: '' },
        minWage: '',                // regional minimum for kasambahay (₱/month) — enter the current rate to get warnings
      },
      members: [
        { id: 'm1', name: 'Parent 1 (Wife)', role: 'parent', birthYear: '', notes: 'Out 08:00–17:00 (full-time job)' },
        { id: 'm2', name: 'Parent 2 (Husband)', role: 'parent', birthYear: '', notes: 'Out 08:00–17:00 (business)' },
        { id: 'm3', name: 'Child 1', role: 'child', birthYear: '2015', notes: 'School Mon–Fri 08:00–17:00' },
        { id: 'm4', name: 'Child 2', role: 'child', birthYear: '2017', notes: 'School Mon–Fri 08:00–17:00' },
        { id: 'm5', name: 'Child 3', role: 'child', birthYear: '2019', notes: 'School Mon–Fri 08:00–17:00' },
      ],
      areas: ['Front Parking (motorcycles)', 'Back Parking (cars)', 'Main Door area', 'Lanai', 'Roadside', '1st Floor', '2nd Floor',
        'Roof Deck', 'Kitchen', 'Dining', 'Pantry', 'Utility Area', 'Canal Area', 'Shoe Area',
        'CR 1', 'CR 2', 'CR 3', "Maids' Room & CR",
        'Master bedroom', 'Bedroom 2', 'Bedroom 3', 'Closets', 'Toy Areas', 'Living Room', 'Fish & turtle tanks'],
      fixedBlocks: [
        { id: 'fb-prep', name: 'Early prep', start: '05:00', end: '06:00', blocking: false, protected: false, show: false },
        { id: 'fb-school', name: 'Children school prep', start: '06:00', end: '07:00', blocking: false, protected: false, show: false },
        { id: 'fb-bfast', name: 'Staff breakfast', start: '07:00', end: '07:30', blocking: false, protected: false, show: true },
        { id: 'fb-break1', name: 'Short break', start: '10:00', end: '10:15', blocking: false, protected: false, show: true },
        { id: 'fb-lunch', name: 'Staff lunch', start: '12:00', end: '12:30', blocking: true, protected: false, show: true },
        { id: 'fb-rest', name: 'Rest period (protected)', start: '13:00', end: '14:00', blocking: true, protected: true, show: true },
        { id: 'fb-break2', name: 'Short break', start: '15:30', end: '15:45', blocking: false, protected: false, show: true },
        { id: 'fb-dinner', name: 'Staff dinner', start: '18:00', end: '18:30', blocking: true, protected: false, show: true },
      ],
      categories: [
        { id: 'cooking', name: 'Cooking', color: '#b5452f', sort: 0 },
        { id: 'kitchen', name: 'Kitchen', color: '#d9822b', sort: 1 },
        { id: 'floors', name: 'Floors & Outdoor', color: '#3f8f5f', sort: 2 },
        { id: 'laundry', name: 'Laundry', color: '#3a7bc8', sort: 3 },
        { id: 'bathroom', name: 'Bathroom', color: '#2aa3a3', sort: 4 },
        { id: 'toys', name: 'Toys', color: '#c2559b', sort: 5 },
        { id: 'closet', name: 'Closet & Bedroom', color: '#8a64c9', sort: 6 },
        { id: 'pets', name: 'Pets', color: '#7a9a2e', sort: 7 },
        { id: 'driver', name: 'Driver', color: '#6b7280', sort: 8, fixed: true },
      ],
      staff: [
        { id: 's_a', fullName: 'Helper A', nickname: '', role: 'helper', status: 'provisional', hireDate: '2026-09-01', restDay: 0, shadow: 'auto', arrangement: 'live-in', birthDate: '', phone: '', emergency: '', notes: 'Sample record — rename to the real helper.', photos: {}, ids: [] },
        { id: 's_b', fullName: 'Helper B', nickname: '', role: 'helper', status: 'provisional', hireDate: '2026-09-15', restDay: 6, shadow: 'auto', arrangement: 'live-in', birthDate: '', phone: '', emergency: '', notes: 'Sample record — rename to the real helper.', photos: {}, ids: [] },
        { id: 's_d', fullName: 'Driver', nickname: '', role: 'driver', status: 'regular', hireDate: '2025-06-01', restDay: 0, shadow: 'off', arrangement: 'live-out', birthDate: '', phone: '', emergency: '', notes: 'Sample record — rename to the real driver.', photos: {}, ids: [] },
      ],
      tasks: buildTasks(),
      recipes: JSON.parse(JSON.stringify([...RECIPES, ...((root.MHM && root.MHM.RECIPE_BOOK) || [])])), // Chicken Adobo + the starter recipe book
      mealPlan: {},                                   // { 'YYYY-MM-DD': { slot: { recipeId | text } } }
      mealCycle: defaultMenuCycle(),                  // 4-week menu rotation: weeks[i][weekday][slot] (default Filipino menu, on)
      events: [],                                     // { id, type, date, end, notes }
      vehicles: [ // sample records — replace with the real plate numbers and dates
        { id: 'v1', type: 'Car', name: 'Car 1', plate: '', regMonth: 3, insurance: '2027-02-15', pmsMonths: 6, lastPms: '2026-08-10' },
        { id: 'v2', type: 'Motorcycle', name: 'Motorcycle 1', plate: '', regMonth: 7, insurance: '2027-06-30', pmsMonths: 4, lastPms: '2026-10-05' },
      ],
      // Phase 3 — personnel and payroll. Salaries are SAMPLE amounts: replace them with the real ones.
      salaryHistory: [
        { id: 'sh-a', staffId: 's_a', effectiveFrom: '2026-09-01', basis: 'monthly', rate: 6500, reason: 'Starting salary (sample)' },
        { id: 'sh-b', staffId: 's_b', effectiveFrom: '2026-09-15', basis: 'monthly', rate: 6500, reason: 'Starting salary (sample)' },
        { id: 'sh-d', staffId: 's_d', effectiveFrom: '2025-06-01', basis: 'monthly', rate: 12000, reason: 'Starting salary (sample)' },
      ],
      payRuns: [], vales: [], benefits: [], contributions: {},
      contribTables: JSON.parse(JSON.stringify(CONTRIB_TABLES)),
      biodataTemplate: { name: 'Bio-Data (household form)', version: 1, file: null, fields: JSON.parse(JSON.stringify(BIODATA_FIELDS)) },
      biodata: [],
      contractTemplates: JSON.parse(JSON.stringify(CONTRACT_TEMPLATES)),
      contracts: [],
      // Phase 4 — accountability, coaching, training, handbook. Appliances are a SAMPLE list: edit to match the house.
      appliances: [
        ['Washing machine', 'Utility Area', 'laundry'], ['Flat iron', 'Utility Area', 'laundry'], ['Refrigerator', 'Kitchen', 'kitchen'], ['Microwave', 'Kitchen', 'kitchen'],
        ['Rice cooker', 'Kitchen', 'kitchen'], ['Gas range and range hood', 'Kitchen', 'kitchen'], ['Electric kettle', 'Kitchen', 'kitchen'], ['Vacuum cleaner', '1st Floor', 'floors'],
        ['Floor polisher', '1st Floor', 'floors'], ['Aquarium filter and heater', 'Fish & turtle tanks', 'pets'], ['Car 1', 'Back Parking (cars)', 'driver'], ['Motorcycle 1', 'Front Parking (motorcycles)', 'driver'],
      ].map(([name, area, categoryId], i) => ({ id: 'ap' + (i + 1), name, area, categoryId, brand: '', model: '', purchased: '', warrantyUntil: '', condition: 'Good', photo: null, notes: '' })),
      incidents: [], coaching: [], skillLevels: {}, lessons: [], onboarding: {}, courses: [], handbookAcks: [],
      handbook: root.MHM && root.MHM.Phase4 ? root.MHM.Phase4.seedHandbook() : null,
      noSchool: holidayEntries(''), // school calendar exceptions: { id, reason: holiday|suspension|sick|vacation|other, from, to, note }
      restAgreements: [],   // standing day-off agreements, e.g. alternating two-day off between helpers
      exceptions: [],
      leadOverrides: [],
      occOverrides: {},
      oneOffs: [],
      marks: {},
      history: {},
      audit: [],
    };
  }

  root.MHM = root.MHM || {};
  root.MHM.Seed = { create, parseFreq, holidayEntries, PH_HOLIDAYS, defaultMenuCycle };
})(typeof window !== 'undefined' ? window : globalThis);
