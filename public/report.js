const rowsEl = document.getElementById("rows");
const updatedEl = document.getElementById("updated");
const monthLabelEl = document.getElementById("month-label");
const summaryEl = document.getElementById("summary");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const sortHoursBtn = document.getElementById("sort-hours");
const sortActivityBtn = document.getElementById("sort-activity");

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(month, delta) {
  let [y, m] = month.split("-").map(Number);
  m += delta;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}
function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
function fmtHours(h) {
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}
function pillClass(a) {
  if (!a) return "red";
  if (a > 50) return "green";
  return "orange";
}

// Default to the previous (last completed) month — e.g. in October it opens September.
// Use the ‹ › arrows to switch to the current month or further back.
let state = { month: shiftMonth(thisMonth(), -1), sort: "hours", data: null };

function sortPeople(people) {
  const arr = [...people];
  if (state.sort === "activity") arr.sort((a, b) => b.activity - a.activity || b.hours - a.hours);
  else arr.sort((a, b) => b.hours - a.hours || b.activity - a.activity);
  return arr;
}

function render() {
  monthLabelEl.textContent = monthLabel(state.month);
  // disable "next" when we're at or beyond the current month
  nextBtn.disabled = state.month >= thisMonth();

  const d = state.data;
  if (!d) return;
  const people = sortPeople(d.people || []);

  // summary
  const totalHours = people.reduce((s, p) => s + p.hours, 0);
  const avgAct = people.length
    ? Math.round(people.reduce((s, p) => s + p.activity * p.hours, 0) / (totalHours || 1))
    : 0;
  summaryEl.innerHTML = "";
  summaryEl.append(
    tile(people.length, "people"),
    tile(fmtHours(totalHours), "total hours"),
    tile(avgAct + "%", "avg activity")
  );

  rowsEl.innerHTML = "";
  if (!people.length) {
    rowsEl.innerHTML = '<div class="empty">No tracked time this month</div>';
  } else {
    const maxH = Math.max(...people.map((p) => p.hours), 1);
    people.forEach((p, i) => rowsEl.appendChild(row(p, i + 1, maxH)));
  }

  const t = new Date(d.updatedAt || Date.now());
  updatedEl.textContent =
    "Updated " + t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
    (d.source === "mock" ? " · demo data" : "") + (d.stale ? " · stale" : "");
}

function tile(value, label) {
  const el = document.createElement("div");
  el.className = "tile";
  el.innerHTML = `<div class="tval"></div><div class="tlab"></div>`;
  el.querySelector(".tval").textContent = value;
  el.querySelector(".tlab").textContent = label;
  return el;
}

function row(p, rank, maxH) {
  const r = document.createElement("div");
  r.className = "row rrow";

  const rk = document.createElement("div");
  rk.className = "col-rank rank";
  rk.textContent = rank;

  const member = document.createElement("div");
  member.className = "member";
  const info = document.createElement("div");
  info.className = "info";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = p.name;
  info.appendChild(name);
  if (p.project) {
    const proj = document.createElement("div");
    proj.className = "proj";
    proj.textContent = p.project;
    info.appendChild(proj);
  }
  member.appendChild(info);

  // hours cell with a proportional bar
  const hoursCell = document.createElement("div");
  hoursCell.className = "col-num hours-cell";
  const hv = document.createElement("div");
  hv.className = "hval";
  hv.textContent = fmtHours(p.hours);
  const bar = document.createElement("div");
  bar.className = "hbar";
  const fill = document.createElement("i");
  fill.style.width = Math.max(2, (p.hours / maxH) * 100) + "%";
  bar.appendChild(fill);
  hoursCell.append(hv, bar);

  const actCell = document.createElement("div");
  actCell.className = "col-num";
  const pill = document.createElement("span");
  pill.className = "pill " + pillClass(p.activity);
  pill.textContent = p.activity + "%";
  actCell.appendChild(pill);

  const daysCell = document.createElement("div");
  daysCell.className = "col-num days";
  daysCell.textContent = p.days;

  r.append(rk, member, hoursCell, actCell, daysCell);
  return r;
}

async function load() {
  rowsEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const res = await fetch(`/api/report?month=${state.month}`, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    state.data = await res.json();
    render();
  } catch (err) {
    rowsEl.innerHTML = '<div class="empty">Cannot load report</div>';
    updatedEl.textContent = "Connection error";
  }
}

prevBtn.onclick = () => { state.month = shiftMonth(state.month, -1); load(); };
nextBtn.onclick = () => { if (state.month < thisMonth()) { state.month = shiftMonth(state.month, 1); load(); } };
sortHoursBtn.onclick = () => { state.sort = "hours"; sortHoursBtn.classList.add("active"); sortActivityBtn.classList.remove("active"); render(); };
sortActivityBtn.onclick = () => { state.sort = "activity"; sortActivityBtn.classList.add("active"); sortHoursBtn.classList.remove("active"); render(); };

load();
