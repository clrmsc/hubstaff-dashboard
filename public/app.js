const REFRESH_MS = 60_000;

const rowsEl = document.getElementById("rows");
const updatedEl = document.getElementById("updated");
const statusDot = document.getElementById("status-dot");

function fmtHours(h) {
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

function todayIndex() {
  return (new Date().getDay() + 6) % 7; // 0 = Mon
}

function barEl(day, isToday, maxActivity) {
  const wrap = document.createElement("div");
  wrap.className = "bar" + (isToday ? " today" : "") + (day.activity >= 60 ? " high" : "");
  const fill = document.createElement("i");
  const pct = day.hours > 0 ? Math.max(8, (day.activity / (maxActivity || 100)) * 100) : 0;
  fill.style.height = pct + "%";
  fill.title = `${day.activity}% · ${fmtHours(day.hours)}`;
  wrap.appendChild(fill);
  return wrap;
}

function statCell(stat) {
  const cell = document.createElement("div");
  cell.className = "stat";
  const big = document.createElement("div");
  big.className = "big";
  big.textContent = `${stat.activity}%`;
  const sub = document.createElement("div");
  sub.className = "sub";
  sub.textContent = fmtHours(stat.hours);
  cell.append(big, sub);
  return cell;
}

function renderRow(p, tIdx) {
  const row = document.createElement("div");
  row.className = "row" + (p.online ? "" : " offline");

  // member: dot + name (+ project)
  const member = document.createElement("div");
  member.className = "member";
  const dot = document.createElement("span");
  dot.className = "dot" + (p.online ? " on" : "");
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
  member.append(dot, info);

  // bars
  const bars = document.createElement("div");
  bars.className = "bars";
  const maxAct = Math.max(100, ...p.week.map((d) => d.activity));
  p.week.forEach((d, i) => bars.appendChild(barEl(d, i === tIdx, maxAct)));

  row.append(member, statCell(p.today), statCell(p.weekTotal), bars);
  return row;
}

function sortPeople(people) {
  return [...people].sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1; // online first
    return b.weekTotal.hours - a.weekTotal.hours; // then by hours desc
  });
}

async function refresh() {
  try {
    const res = await fetch("/api/dashboard", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    const tIdx = todayIndex();
    rowsEl.innerHTML = "";
    const sorted = sortPeople(data.people || []);
    if (!sorted.length) {
      rowsEl.innerHTML = '<div class="empty">No members</div>';
    } else {
      for (const p of sorted) rowsEl.appendChild(renderRow(p, tIdx));
    }

    const t = new Date(data.updatedAt || Date.now());
    updatedEl.textContent =
      "Updated " + t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
      (data.source === "mock" ? " · demo data" : "") +
      (data.stale ? " · stale" : "");
    statusDot.className = "conn" + (data.error ? " bad" : "");
  } catch (err) {
    statusDot.className = "conn bad";
    updatedEl.textContent = "Connection error";
    if (!rowsEl.children.length || rowsEl.querySelector(".empty")) {
      rowsEl.innerHTML = '<div class="empty">Cannot reach server</div>';
    }
  }
}

refresh();
setInterval(refresh, REFRESH_MS);
