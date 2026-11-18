const $ = id => document.getElementById(id);
const months = ['2026-11','2026-12','2027-01','2027-02','2027-03','2027-04','2027-05','2027-06'];
const dateText = new Intl.DateTimeFormat('cs', {dateStyle:'long',timeZone:'UTC'});
const monthText = new Intl.DateTimeFormat('cs', {month:'long',year:'numeric',timeZone:'UTC'});
const prague = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'});
const legacyKey = 'kalendar-rovnic-2026-11-v1';
const stateKey = 'skolni-kalendar-2026-27';
let tasks = {};
let currentDate;
let currentStep = 0;
let storage;
function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function dateISO(date) { return date.toISOString().slice(0,10); }
function openingDate(day) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() || 7));
  return dateISO(date);
}
function today() { return prague.format(new Date()); }
function canOpen(day) { return openingDate(day) <= today(); }
function displayDate(day) { return dateText.format(new Date(day + 'T00:00:00Z')); }
function daysInMonth() {
  return Object.keys(tasks).filter(day => day.startsWith($('monthSelect').value)).sort();
}
function progressKey(day) {
  const revision = tasks[day]?.revision;
  return revision ? day + ':' + revision : day;
}
function loadState() {
  const oldDone = readLocal(legacyKey, []);
  const oldDrafts = readLocal(legacyKey + '-drafts', {});
  return {
    drafts: Object.fromEntries(Object.entries(oldDrafts).map(([day,value]) => ['2026-11-' + day,value])),
    completed: Object.fromEntries(oldDone.map(day => ['2026-11-' + day,true])),
    ...readLocal(stateKey, {})
  };
}
function saveState() {
  try { localStorage.setItem(stateKey, JSON.stringify(storage)); }
  catch { $('storageNote').textContent = 'V tomto prohlížeči se odpovědi a pokrok nemusí uložit.'; }
}
function restoreShortenedMonday() {
  const day = '2026-11-16';
  if (tasks[day]?.revision !== 'obvody-b-6') return;
  const previous = day + ':obvody-b';
  const key = progressKey(day);
  if (storage.completed[key]) return;
  const retained = [0, 4, 6, 7, 11, 14];
  const oldStep = storage.steps?.[previous] ?? 0;
  const restored = storage.completed[previous] ? retained.length : retained.filter(index => index < oldStep).length;
  if (restored <= (storage.steps?.[key] ?? 0)) return;

  const drafts = [...(storage.drafts[key] ?? [])];
  const previousDrafts = storage.drafts[previous] ?? [];
  for (const [index, oldIndex] of retained.entries()) {
    if (index < restored && previousDrafts[oldIndex] !== undefined) drafts[index] = previousDrafts[oldIndex];
  }
  storage.drafts[key] = drafts;
  storage.steps ??= {};
  storage.steps[key] = restored;
  if (restored === retained.length) storage.completed[key] = true;
  saveState();
}
function render() {
  const month = $('monthSelect').value;
  const [year,number] = month.split('-').map(Number);
  $('month').textContent = monthText.format(new Date(Date.UTC(year,number-1,1)));
  const calendar = $('calendar');
  calendar.replaceChildren();
  for (const label of ['Po','Út','St','Čt','Pá','So','Ne']) {
    const heading = document.createElement('div');
    heading.className = 'weekday';
    heading.textContent = label;
    calendar.append(heading);
  }
  const offset = (new Date(Date.UTC(year,number-1,1)).getUTCDay() + 6) % 7;
  for (let i=0; i<offset; i++) calendar.append(document.createElement('div'));
  const last = new Date(Date.UTC(year,number,0)).getUTCDate();
  for (let day=1; day<=last; day++) {
    const key = month + '-' + String(day).padStart(2,'0');
    const task = tasks[key];
    const open = task && canOpen(key);
    const tile = document.createElement(open ? 'button' : 'div');
    const savedKey = progressKey(key);
    const done = open && storage.completed[savedKey];
    const best = done ? storage.attempts?.[savedKey]?.best : undefined;
    const hasRating = Number.isInteger(best) && best >= 0;
    tile.className = 'day' + (open ? ' active' : task ? ' locked' : '') + (done ? ' done' : '');
    if ((offset + day - 1) % 7 >= 5) tile.classList.add('weekend');
    if (hasRating) {
      const badge = document.createElement('span');
      badge.className = 'day-rating';
      badge.textContent = rating(best);
      badge.setAttribute('aria-hidden','true');
      const number = document.createElement('span');
      number.className = 'day-number';
      number.textContent = day;
      tile.append(badge,number);
    } else {
      tile.textContent = day;
    }
    if (task) {
      if (!hasRating) {
        const marker = document.createElement('span');
        marker.className = 'mark';
        marker.textContent = done ? '✓' : open ? '◆' : '🔒';
        marker.setAttribute('aria-hidden','true');
        tile.append(marker);
      }
      const status = done ? 'splněno' : open ? task.title : 'otevře se ' + displayDate(openingDate(key));
      const result = hasRating ? ', nejlepší pokus, počet chyb ' + best : '';
      tile.setAttribute('aria-label', displayDate(key) + ', ' + status + result);
      if (hasRating) tile.title = 'Nejlepší pokus · počet chyb: ' + best;
      if (open) tile.onclick = () => openDay(key);
      else tile.title = 'Otevře se ' + displayDate(openingDate(key));
    }
    calendar.append(tile);
  }
  const available = daysInMonth().filter(canOpen);
  const count = available.filter(day => storage.completed[progressKey(day)]).length;
  $('count').textContent = count + ' / ' + available.length;
  $('bar').max = available.length || 1;
  $('bar').value = count;
}
function showFlashcards(cards = []) {
  const panel = $('flashcards');
  panel.hidden = cards.length === 0;
  panel.open = false;
  if (!cards.length) return;
  let index = 0;
  let flipped = false;
  const deck = [...cards];
  const card = $('flashcard');
  function showCard() {
    card.textContent = deck[index][flipped ? 'back' : 'front'];
    card.setAttribute('aria-label', card.textContent + (flipped ? '. Zobrazit název.' : '. Zobrazit vzorec.'));
    $('flashcardCount').textContent = (index + 1) + ' / ' + cards.length;
    $('flashcardPrev').disabled = index === 0;
    $('flashcardNext').disabled = index === cards.length - 1;
  }
  card.onclick = () => { flipped = !flipped; showCard(); };
  $('flashcardPrev').onclick = () => { index--; flipped = false; showCard(); card.focus(); };
  $('flashcardNext').onclick = () => { index++; flipped = false; showCard(); card.focus(); };
  function shuffle() {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    index = 0;
    flipped = false;
    showCard();
  }
  $('flashcardShuffle').onclick = () => { shuffle(); card.focus(); };
  shuffle();
}
function openDay(day) {
  if (!canOpen(day)) return;
  currentDate = day;
  const task = tasks[day];
  showFlashcards(task.flashcards);
  $('workTitle').textContent = displayDate(day) + ' · ' + task.title;
  $('instructions').textContent = task.instructions || 'Odpovědi se ukládají během vyplňování.';
  const key = progressKey(day);
  const savedStep = storage.steps?.[key] ?? 0;
  const finished = storage.completed[key] && !storage.attempts?.[key]?.retrying;
  currentStep = task.mode === 'sequence' && !finished && Number.isInteger(savedStep)
    ? Math.max(0, Math.min(savedStep, task.questions.length - 1)) : 0;
  $('feedback').classList.toggle('success',Boolean(storage.completed[key]));
  $('feedback').textContent = storage.completed[key] ? '✓ Tento den už máš splněný.' : '';
  if (finished) {
    showCompletedQuiz(task);
  } else {
    renderQuestions(task);
  }
  $('work').showModal();
}
function attemptFor(key) {
  storage.attempts ??= {};
  return storage.attempts[key] ??= {errors:0};
}
function rating(errors) {
  return ['🏆','🌟','😄','🙂','😌','💪'][Math.min(errors,5)];
}
function showCompletedQuiz(task) {
  const attempt = storage.attempts?.[progressKey(currentDate)];
  $('questions').replaceChildren();
  $('check').hidden = true;
  $('retryQuiz').hidden = false;
  $('incorrectCount').hidden = true;
  $('questionProgress').hidden = false;
  $('questionProgress').textContent = 'Hotovo · ' + task.questions.length + ' z ' + task.questions.length;
  $('feedback').classList.add('success');
  $('feedback').textContent = attempt?.best === undefined
    ? '✓ Tento kvíz už máš splněný.'
    : rating(attempt.errors) + ' Chybných odpovědí v tomto pokusu: ' + attempt.errors +
      (attempt.best < attempt.errors ? ' · Nejlepší pokus: ' + attempt.best : '');
}
function showIncorrectCount() {
  const counter = $('incorrectCount');
  counter.textContent = 'Chybné odpovědi v tomto pokusu: ' + (storage.attempts?.[progressKey(currentDate)]?.errors ?? 0);
  counter.hidden = false;
}
function addIncorrect(count) {
  attemptFor(progressKey(currentDate)).errors += count;
  showIncorrectCount();
  saveState();
}
function finishQuiz(task) {
  const key = progressKey(currentDate);
  const attempt = attemptFor(key);
  attempt.best = Math.min(attempt.best ?? attempt.errors, attempt.errors);
  attempt.retrying = false;
  storage.completed[key] = true;
  saveState();
  showCompletedQuiz(task);
  $('questionProgress').focus();
  render();
}
$('retryQuiz').onclick = () => {
  const key = progressKey(currentDate);
  const attempt = attemptFor(key);
  attempt.errors = 0;
  attempt.retrying = true;
  storage.steps ??= {};
  storage.steps[key] = 0;
  storage.drafts[key] = [];
  currentStep = 0;
  $('feedback').textContent = '';
  $('feedback').classList.remove('success');
  saveState();
  renderQuestions(tasks[currentDate]);
  $('questions').querySelector('input')?.focus();
};
function gridShape(question) {
  const {rows = 10, columns = 10} = question.grid;
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1 || rows * columns > 100) {
    return {columns:10,total:100};
  }
  return {columns,total:rows * columns};
}
function enableGridPainting(grid) {
  let stroke;
  function paint(input) {
    if (!input || input.checked === stroke.checked) return;
    input.checked = stroke.checked;
    input.dispatchEvent(new Event('input',{bubbles:true}));
  }
  grid.addEventListener('pointerdown', event => {
    if (stroke || event.button !== 0 || !event.target.matches('input[type="checkbox"]')) return;
    event.preventDefault();
    stroke = {id:event.pointerId,checked:!event.target.checked,x:event.clientX,y:event.clientY};
    grid.setPointerCapture(event.pointerId);
    paint(event.target);
  });
  grid.addEventListener('pointermove', event => {
    if (stroke?.id !== event.pointerId) return;
    const dx = event.clientX - stroke.x, dy = event.clientY - stroke.y;
    const samples = Math.max(1,Math.ceil(Math.hypot(dx,dy) / 7));
    for (let i = 1; i <= samples; i++) {
      const cell = document.elementFromPoint(stroke.x + dx * i / samples, stroke.y + dy * i / samples);
      if (cell?.parentElement === grid && cell.matches('input[type="checkbox"]')) paint(cell);
    }
    stroke.x = event.clientX;
    stroke.y = event.clientY;
  });
  grid.addEventListener('lostpointercapture', event => {
    if (stroke?.id === event.pointerId) stroke = undefined;
  });
  grid.addEventListener('click', event => {
    if (event.detail > 0 && event.target.matches('input[type="checkbox"]')) event.preventDefault();
  });
}
function renderQuestions(task) {
  const day = currentDate;
  const sequence = task.mode === 'sequence';
  $('questionProgress').hidden = !sequence;
  $('questionProgress').textContent = sequence ? 'Otázka ' + (currentStep + 1) + ' z ' + task.questions.length : '';
  $('check').hidden = false;
  $('retryQuiz').hidden = true;
  showIncorrectCount();
  $('questions').replaceChildren();
  task.questions.forEach((question,index) => {
    if (sequence && index !== currentStep) return;
    const field = document.createElement('fieldset');
    field.className = 'question';
    const legend = document.createElement('legend');
    legend.textContent = (index+1) + '. ' + question.prompt;
    field.append(legend);
    const sideLayout = task.diagramLayout === 'side' && question.type === 'choice' && question.image;
    const content = sideLayout ? document.createElement('div') : field;
    if (sideLayout) {
      content.className = 'question-side';
      field.append(content);
    }
    if (question.image && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/i.test(question.image)) {
      const image = document.createElement('img');
      image.className = 'question-image';
      image.src = question.image;
      image.alt = question.imageAlt || 'Obrázek k úloze';
      content.append(image);
    }
    const draft = storage.drafts[progressKey(day)]?.[index];
    if (question.type === 'choice') {
      const options = document.createElement('div');
      options.className = 'options';
      question.options.forEach((option,i) => {
        const label = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'answer-' + index;
        radio.value = i;
        radio.checked = draft === String(i);
        radio.required = true;
        label.append(radio, String.fromCharCode(65+i) + ') ' + option);
        options.append(label);
      });
      if (sideLayout) content.prepend(options);
      else field.append(options);
    } else if (question.grid) {
      const grid = document.createElement('div');
      grid.className = 'percent-grid';
      const {columns,total} = gridShape(question);
      grid.style.setProperty('--grid-columns',columns);
      const marked = new Set((draft || '').split(','));
      const count = document.createElement('p');
      count.className = 'percent-grid-count';
      count.setAttribute('aria-live','polite');
      const updateCount = () => {
        count.textContent = 'Vybarveno: ' + grid.querySelectorAll('input:checked').length + ' z ' + total;
      };
      for (let cell = 0; cell < total; cell++) {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = 'answer-' + index;
        input.value = String(cell);
        input.checked = marked.has(input.value);
        input.setAttribute('aria-label','Řádek ' + (Math.floor(cell / columns) + 1) + ', sloupec ' + (cell % columns + 1));
        grid.append(input);
      }
      grid.addEventListener('input',updateCount);
      enableGridPainting(grid);
      field.append(grid,count);
      updateCount();
    } else if (question.parts) {
      const parts = document.createElement('div');
      parts.className = question.fractionLayout ? 'fraction-equation' : 'percent-parts';
      const saved = (draft || '').split('|');
      const inputs = question.parts.map((caption, part) => {
        const input = document.createElement('input');
        input.name = 'answer-' + index;
        input.inputMode = question.fractionLayout && part < 2 ? 'numeric' : 'decimal';
        input.autocomplete = 'off';
        input.required = true;
        input.value = saved[part] ?? '';
        input.setAttribute('aria-label',caption);
        return input;
      });
      if (question.fractionLayout && inputs.length === 4) {
        const element = (className, text = '') => {
          const span = document.createElement('span');
          span.className = className;
          span.textContent = text;
          return span;
        };
        const first = element('fraction');
        first.append(inputs[0],inputs[1]);
        const hundredths = element('fraction');
        hundredths.append(inputs[2],element('fraction-fixed','100'));
        const percentage = element('fraction-percent');
        percentage.append(inputs[3],element('fraction-sign','%'));
        parts.append(first,element('fraction-sign','='),hundredths,element('fraction-sign','='),percentage);
      } else {
        inputs.forEach((input, part) => {
          const label = document.createElement('label');
          label.textContent = question.parts[part];
          label.append(input);
          parts.append(label);
        });
      }
      field.append(parts);
    } else {
      const input = document.createElement('input');
      input.name = 'answer-' + index;
      input.value = draft ?? '';
      input.required = true;
      input.autocomplete = 'off';
      input.setAttribute('aria-label','Odpověď na otázku ' + (index+1));
      field.append(input);
    }
    $('questions').append(field);
  });
}
function answers() {
  const form = new FormData($('exerciseForm'));
  const task = tasks[currentDate];
  const read = (question, i) => {
    const fields = form.getAll('answer-' + i);
    if (question.grid) return fields.join(',');
    if (question.parts) return fields.join('|');
    return fields[0] ?? '';
  };
  if (task.mode === 'sequence') {
    const values = [...(storage.drafts[progressKey(currentDate)] ?? [])];
    values[currentStep] = read(task.questions[currentStep], currentStep);
    return values;
  }
  return task.questions.map(read);
}
function normalize(value) {
  const text = String(value).trim().toLocaleLowerCase('cs').replace(/\s+/g,' ');
  const number = text.replace(/^x\s*=\s*/,'').replace('−','-').replace(',','.');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(number) ? String(Number(number)) : text;
}
function isCorrect(question,value) {
  if (question.type === 'choice') return value === String(question.correct);
  if (question.grid) {
    const {total} = gridShape(question);
    const selected = new Set((value || '').split(',').filter(cell => /^\d{1,2}$/.test(cell) && Number(cell) < total));
    return question.answers.some(answer => Number(answer) === selected.size);
  }
  if (question.parts) {
    const actual = (value || '').split('|').map(normalize).join('|');
    return question.answers.some(answer => String(answer).split('|').map(normalize).join('|') === actual);
  }
  return question.answers.some(answer => normalize(answer) === normalize(value ?? ''));
}
function checkStep(task, values) {
  const key = progressKey(currentDate);
  const match = isCorrect(task.questions[currentStep], values[currentStep]);
  $('questions').firstElementChild.setAttribute('aria-invalid',String(!match));
  $('feedback').classList.toggle('success',match);
  if (!match) {
    addIncorrect(1);
    $('feedback').textContent = 'Zkus jinou odpověď.';
    return;
  }
  if (currentStep === task.questions.length - 1) {
    finishQuiz(task);
    return;
  } else {
    currentStep++;
    storage.steps ??= {};
    storage.steps[key] = currentStep;
    renderQuestions(task);
    $('feedback').textContent = '✓ Správně!';
    $('questionProgress').focus();
  }
  saveState();
}
$('questions').addEventListener('input', () => {
  storage.drafts[progressKey(currentDate)] = answers();
  saveState();
});
$('exerciseForm').onsubmit = event => {
  event.preventDefault();
  const values = answers();
  const task = tasks[currentDate];
  if (task.mode === 'sequence') {
    storage.drafts[progressKey(currentDate)] = values;
    checkStep(task, values);
    return;
  }
  const questions = task.questions;
  let correct = 0;
  for (const [i,question] of questions.entries()) {
    const match = isCorrect(question,values[i]);
    $('questions').children[i].setAttribute('aria-invalid',String(!match));
    if (match) correct++;
  }
  const done = correct === questions.length;
  $('feedback').classList.toggle('success',done);
  $('feedback').textContent = done ? '✓ Všechny odpovědi jsou správně.' : correct + ' z ' + questions.length + ' správně. Oprav zvýrazněné odpovědi.';
  if (done) {
    finishQuiz(task);
  } else {
    addIncorrect(questions.length - correct);
  }
};
for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => button.closest('dialog').close();
$('work').setAttribute('aria-labelledby','workTitle');
$('openReport').onclick = () => $('export').showModal();
$('reportForm').onsubmit = event => {
  event.preventDefault();
  const name = $('name').value.trim();
  if (!name) return $('name').focus();
  const days = daysInMonth().filter(canOpen);
  $('reportName').textContent = name + ' · ' + $('month').textContent;
  $('reportTotal').textContent = 'Splněné dny: ' + days.filter(day => storage.completed[progressKey(day)]).length + ' z ' + days.length;
  $('reportDays').replaceChildren();
  for (const day of days) {
    const row = $('reportDays').insertRow();
    for (const value of [displayDate(day),tasks[day].title,storage.completed[progressKey(day)] ? 'Splněno' : 'Nesplněno']) row.insertCell().textContent = value;
  }
  $('export').close();
  window.print();
};
async function refresh() {
  if (location.protocol === 'file:') {
    tasks = JSON.parse($('demoData').textContent);
    $('loadStatus').textContent = 'Zkušební úlohy. Zveřejněný kalendář načítá úlohy z webu.';
  } else {
    try {
      const response = await fetch('./ulohy.json', {cache:'no-store'});
      if (!response.ok) throw new Error('Úlohy se nepodařilo načíst');
      tasks = await response.json();
      $('loadStatus').textContent = navigator.onLine ? '' : 'Zobrazuje se poslední uložená verze.';
    } catch {
      $('loadStatus').textContent = 'Úlohy se nepodařilo načíst. Zkus se znovu připojit.';
    }
  }
  restoreShortenedMonday();
  render();
}
storage = loadState();
for (const month of months) {
  $('monthSelect').append(new Option(monthText.format(new Date(month + '-01T00:00:00Z')),month));
}
const currentMonth = today().slice(0,7);
$('monthSelect').value = months.includes(currentMonth) ? currentMonth : currentMonth < months[0] ? months[0] : months.at(-1);
$('monthSelect').onchange = render;
if (location.protocol === 'https:' || location.hostname === 'localhost') {
  for (const [rel,href] of [['manifest','./manifest.webmanifest'],['apple-touch-icon','./icon-192.png']]) {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    document.head.append(link);
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.error);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !$('work').open && !$('export').open) refresh();
});
refresh();
