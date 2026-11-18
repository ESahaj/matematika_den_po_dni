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
    const done = open && storage.completed[progressKey(key)];
    tile.className = 'day' + (open ? ' active' : task ? ' locked' : '') + (done ? ' done' : '');
    if ((offset + day - 1) % 7 >= 5) tile.classList.add('weekend');
    tile.textContent = day;
    if (task) {
      const marker = document.createElement('span');
      marker.className = 'mark';
      marker.textContent = done ? '✓' : open ? '◆' : '🔒';
      marker.setAttribute('aria-hidden','true');
      tile.append(marker);
      tile.setAttribute('aria-label', displayDate(key) + ', ' + (done ? 'splněno' : open ? task.title : 'otevře se ' + displayDate(openingDate(key))));
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
function openDay(day) {
  if (!canOpen(day)) return;
  currentDate = day;
  const task = tasks[day];
  $('workTitle').textContent = displayDate(day) + ' · ' + task.title;
  $('instructions').textContent = task.instructions || 'Odpovědi se ukládají během vyplňování.';
  const key = progressKey(day);
  const savedStep = storage.steps?.[key] ?? 0;
  currentStep = task.mode === 'sequence' && !storage.completed[key] && Number.isInteger(savedStep)
    ? Math.max(0, Math.min(savedStep, task.questions.length - 1)) : 0;
  $('feedback').classList.toggle('success',Boolean(storage.completed[key]));
  $('feedback').textContent = storage.completed[key] ? '✓ Tento den už máš splněný.' : '';
  renderQuestions(task);
  $('work').showModal();
}
function renderQuestions(task) {
  const day = currentDate;
  const sequence = task.mode === 'sequence';
  $('questionProgress').hidden = !sequence;
  $('questionProgress').textContent = sequence ? 'Otázka ' + (currentStep + 1) + ' z ' + task.questions.length : '';
  $('check').hidden = false;
  $('questions').replaceChildren();
  task.questions.forEach((question,index) => {
    if (sequence && index !== currentStep) return;
    const field = document.createElement('fieldset');
    field.className = 'question';
    const legend = document.createElement('legend');
    legend.textContent = (index+1) + '. ' + question.prompt;
    field.append(legend);
    if (question.image && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/i.test(question.image)) {
      const image = document.createElement('img');
      image.className = 'question-image';
      image.src = question.image;
      image.alt = question.imageAlt || 'Obrázek k úloze';
      field.append(image);
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
      field.append(options);
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
  if (task.mode === 'sequence') {
    const values = [...(storage.drafts[progressKey(currentDate)] ?? [])];
    values[currentStep] = form.get('answer-' + currentStep) ?? '';
    return values;
  }
  return task.questions.map((_,i) => form.get('answer-' + i) ?? '');
}
function normalize(value) {
  const text = String(value).trim().toLocaleLowerCase('cs').replace(/\s+/g,' ');
  const number = text.replace(/^x\s*=\s*/,'').replace('−','-').replace(',','.');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(number) ? String(Number(number)) : text;
}
function isCorrect(question,value) {
  return question.type === 'choice' ? value === String(question.correct)
    : question.answers.some(answer => normalize(answer) === normalize(value ?? ''));
}
function checkStep(task, values) {
  const key = progressKey(currentDate);
  const match = isCorrect(task.questions[currentStep], values[currentStep]);
  $('questions').firstElementChild.setAttribute('aria-invalid',String(!match));
  $('feedback').classList.toggle('success',match);
  if (!match) {
    $('feedback').textContent = 'Zkus jinou odpověď.';
    return;
  }
  if (currentStep === task.questions.length - 1) {
    storage.completed[key] = true;
    $('questions').replaceChildren();
    $('check').hidden = true;
    $('questionProgress').textContent = 'Hotovo · ' + task.questions.length + ' z ' + task.questions.length;
    $('feedback').textContent = '✓ Všechny otázky máš správně!';
    $('questionProgress').focus();
    render();
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
    storage.completed[progressKey(currentDate)] = true;
    saveState();
    render();
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
