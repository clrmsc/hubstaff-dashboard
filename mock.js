// Fake data so the UI works without any Hubstaff credentials.
// Shape matches what hubstaff.js getDashboard() returns.

// Generic demo people — used only when USE_MOCK=true. Real names/projects come
// from the Hubstaff API at runtime and are never stored in this repo.
const PEOPLE = [
  ["Alex Morgan", "Website"],
  ["Jordan Lee", "Mobile App"],
  ["Sam Carter", "Dashboard"],
  ["Taylor Reed", "Platform"],
  ["Chris Bailey", "Marketing Site"],
  ["Robin Shaw", "Analytics"],
  ["Jamie Fox", "Internal Tools"],
  ["Pat Quinn", "Infrastructure"],
];

function rng(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function getMockDashboard() {
  const minute = Math.floor(Date.now() / 60000);
  const todayIdx = (new Date().getDay() + 6) % 7; // 0 = Mon

  const people = PEOPLE.map(([name, project], i) => {
    const online = rng(minute + i * 7) > 0.25;

    const week = Array.from({ length: 7 }, (_, d) => {
      if (d > todayIdx) return { activity: 0, hours: 0, future: true };
      const worked = rng(i * 100 + d * 13) > 0.15;
      return {
        activity: worked ? Math.round(rng(i * 31 + d * 17) * 55 + 30) : 0,
        hours: worked ? +(rng(i * 53 + d * 19) * 8).toFixed(2) : 0,
        future: false,
      };
    });

    const today = week[todayIdx] || { activity: 0, hours: 0 };
    if (!online) today.hours = today.hours; // offline can still have earlier hours
    const weekHours = +week.reduce((s, d) => s + d.hours, 0).toFixed(2);
    const active = week.filter((d) => d.hours > 0);
    const weekActivity = active.length
      ? Math.round(active.reduce((s, d) => s + d.activity, 0) / active.length)
      : 0;

    return {
      id: i + 1,
      name,
      avatar: null,
      online,
      project,
      lastActive: online ? new Date().toISOString() : null,
      today: { activity: today.activity, hours: today.hours },
      weekTotal: { activity: weekActivity, hours: weekHours },
      week,
    };
  });

  return { source: "mock", updatedAt: new Date().toISOString(), people };
}
