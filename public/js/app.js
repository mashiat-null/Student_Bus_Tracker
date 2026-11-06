// ===============================
// ========= CONFIG ==============
// ===============================
const API_BASE = "http://localhost:3000/api";


// ===============================
// ========= GLOBAL STATE ========
// ===============================
let selectedBusId = null;
let busesData = [];
let notificationsData = [];
let unreadCount = 0;


// ===============================
// ========= ROUTER ==============
// ===============================
function showPage(hash) {
  const page = (hash || "#home").replace("#", "");

  document.querySelectorAll(".page").forEach(s => {
    s.classList.remove("active");
  });

  document.getElementById(`page-${page}`)?.classList.add("active");

  document.querySelectorAll("[data-link]").forEach(a => {
    a.classList.toggle("active", a.getAttribute("href") === `#${page}`);
  });

  if (page === "routes" && selectedBusId) {
    loadRouteStops();
  }
}

window.addEventListener("hashchange", () => showPage(location.hash));


// ===============================
// ========= HELPERS =============
// ===============================
function setBadge(statusText) {
  const badge = document.getElementById("liveBadge");
  if (!badge) return;

  const s = (statusText || "").toLowerCase();

  badge.classList.remove("badge-idle", "badge-run", "badge-stop");

  if (s.includes("run")) {
    badge.classList.add("badge-run");
    badge.textContent = "Running";
  } else if (s.includes("stop")) {
    badge.classList.add("badge-stop");
    badge.textContent = "Stopped";
  } else {
    badge.classList.add("badge-idle");
    badge.textContent = "Idle";
  }
}


// ===============================
// ========= LOAD DIRECTIONS =====
// ===============================
async function loadDirections() {
  const sel = document.getElementById("directionSelect");
  if (!sel) return;

  try {
    const res = await fetch(`${API_BASE}/directions`);
    const dirs = await res.json();

    sel.innerHTML = dirs.map(d =>
      `<option value="${d.direction_id}">${d.direction_name}</option>`
    ).join("");

    sel.value = dirs[0]?.direction_id || 1;
    sel.onchange = () => loadBuses();

    await loadBuses();
  } catch (e) {
    console.error("Directions load failed:", e);
  }
}


// ===============================
// ========= LOAD BUSES ==========
// ===============================
async function loadBuses() {
  const sel = document.getElementById("directionSelect");
  if (!sel) return;

  const directionId = sel.value;

  try {
    const res = await fetch(`${API_BASE}/directions/${directionId}/buses`);
    busesData = await res.json();

    document.getElementById("totalBuses").textContent = busesData.length;
    document.getElementById("activeBuses").textContent = busesData.length;

    // Bus List
    document.getElementById("busList").innerHTML = busesData.map(b =>
      `<div class="row busItem"
            data-bus-id="${b.bus_id}"
            style="cursor:pointer;padding:10px;border-bottom:1px solid #333;
            ${b.bus_id == selectedBusId
              ? 'background:#4f7cff20;border-left:4px solid #4f7cff;'
              : ''}">
        <span>${b.bus_name} → ${b.route_name}</span>
        <small style="opacity:0.7;">${b.status || 'No GPS'}</small>
      </div>`
    ).join("");

    // Dropdown
    const busSel = document.getElementById("busSelect");
    if (busSel) {
      busSel.innerHTML = busesData.map(b =>
        `<option value="${b.bus_id}"
          ${b.bus_id == selectedBusId ? 'selected' : ''}>
          ${b.bus_name} (${b.route_name})
        </option>`
      ).join("");
    }

  } catch (e) {
    console.error("Buses load failed:", e);
  }
}


// ===============================
// ========= LIVE TRACKING =======
// ===============================
async function loadLiveInfo() {
  if (!selectedBusId) return;

  try {
    const res = await fetch(`${API_BASE}/buses/${selectedBusId}`);
    const data = await res.json();

    document.getElementById("liveBusTitle").textContent =
      data.bus?.bus_name || "No bus";

    document.getElementById("liveStatus").textContent =
      data.location?.status || "No GPS";

    document.getElementById("liveLastUpdate").textContent =
      data.location?.last_update
        ? new Date(data.location.last_update).toLocaleTimeString()
        : "—";

    document.getElementById("liveEta").textContent =
      data.eta_minutes ? `${data.eta_minutes} min` : "—";

    document.getElementById("liveNextStop").textContent =
      data.next_stop || "—";

    setBadge(data.location?.status);
    loadBuses();

  } catch (e) {
    console.error("Live info failed:", e);
  }
}


// ===============================
// ========= ROUTE STOPS =========
// ===============================
async function loadRouteStops() {
  const container = document.getElementById("routeDetails");

  if (!selectedBusId || !busesData.length) {
    container.innerHTML =
      "<div style='padding:20px;color:#888;'>Select a bus first</div>";
    return;
  }

  try {
    const bus = busesData.find(b => b.bus_id == selectedBusId);

    const res = await fetch(`${API_BASE}/routes/${bus.route_id}/stops`);
    const stops = await res.json();

    const safeStops = stops.map((stop, i) => ({
      order: stop.stop_order || i + 1,
      name: stop.stop_name,
      lat: Number(stop.lat || 0),
      lng: Number(stop.lng || 0)
    }));

    container.innerHTML = `
      <div style="font-weight:bold;padding:15px 0;
                  border-bottom:2px solid #4f7cff;font-size:1.1em;">
        🛣️ ${bus.route_name}
      </div>
      ${safeStops.map(stop => `
        <div style="padding:12px 0;border-bottom:1px solid #333;">
          <span style="font-weight:500;">
            ${stop.order}. ${stop.name}
          </span>
          <small style="opacity:0.6;">
            (${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)})
          </small>
        </div>
      `).join("")}
    `;
  } catch (e) {
    console.error("Routes error:", e);
    container.innerHTML =
      `<div style="color:#ff6b6b;padding:20px;">
        ❌ Route stops failed
      </div>`;
  }
}


// ===============================
// ========= NOTIFICATIONS =======
// ===============================
async function loadNotifications() {
  try {
    const res = await fetch(`${API_BASE}/notifications`);
    const data = await res.json();

    notificationsData = data.notifications;
    unreadCount = data.unreadCount;

    const badge = document.getElementById('unreadCount');
    const navBar = document.getElementById('notificationBar');

    if (badge) {
      badge.textContent = unreadCount;
      badge.className =
        unreadCount === 0
          ? 'notification-badge zero'
          : 'notification-badge';
    }

    if (navBar) {
      navBar.classList.toggle('unread', unreadCount > 0);
    }

    const listEl = document.getElementById('notificationsList');
    if (!listEl) return;

    listEl.innerHTML = notificationsData.length
      ? notificationsData.map(n => `
          <div class="row notification-item ${n.read ? '' : 'unread'}"
               data-notif-id="${n.id}">
            <div style="font-weight:600;
                        color:${n.read ? '#aaa' : '#4f7cff'}">
              ${n.title}
            </div>
            <div style="font-size:0.9em;opacity:0.8;margin:4px 0;">
              ${n.message}
            </div>
            <div style="font-size:0.8em;opacity:0.6;">
              ${n.time}
            </div>
          </div>
        `).join('')
      : '<div style="padding:20px;color:#666;">No notifications</div>';

  } catch (e) {
    console.error("Notifications failed:", e);
  }
}

const adminFab = document.getElementById('adminFab');

function updateAdminFab() {
  const hash = window.location.hash; // current page hash
  if (hash === '#notifications') {
    adminFab.style.display = 'flex'; // show only on notifications page
  } else {
    adminFab.style.display = 'none'; // hide on all other pages
  }
}

// Run on page load
window.addEventListener('load', updateAdminFab);

// Run whenever hash changes (page switch)
window.addEventListener('hashchange', updateAdminFab);



// ===============================
// ========= EVENT LISTENERS =====
// ===============================
document.addEventListener("DOMContentLoaded", () => {

  document.getElementById("refreshBtn")?.addEventListener("click", loadDirections);

  document.getElementById("busSelect")?.addEventListener("change", e => {
    selectedBusId = Number(e.target.value);
    loadLiveInfo();
    loadRouteStops();
    loadBuses();
  });

  document.getElementById("busList")?.addEventListener("click", e => {
    const item = e.target.closest(".busItem");
    if (!item) return;

    selectedBusId = Number(item.dataset.busId);

    document.getElementById("busSelect").value = selectedBusId;

    loadLiveInfo();
    loadRouteStops();
    loadBuses();
  });

});


// ===============================
// ========= AUTO REFRESH ========
// ===============================
setInterval(loadLiveInfo, 4000);
setInterval(loadNotifications, 30000);


// ===============================
// ========= START ===============
// ===============================
showPage(location.hash);
loadDirections();
loadNotifications();