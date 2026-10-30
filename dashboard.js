/* Rep Playbook manager dashboard. Reads the daily numbers reps' pages send to the Apps Script. */
(function () {
  "use strict";
  var C = window.CONFIG, token = null, data = null, selected = null;
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] == null) return;
      if (k === "class") e.className = attrs[k]; else if (k === "text") e.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function dur(min) {
    min = Math.round(min || 0);
    var h = Math.floor(min / 60), m = min % 60;
    return h ? h + "h" + (m ? " " + m + "m" : "") : m + "m";
  }
  function fmtDate(ymd) {
    var d = new Date(ymd + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  function num(v) { return Number(v) || 0; }

  function auth(msg, isErr) {
    var box = $("d-auth"); box.innerHTML = "";
    box.appendChild(el("h3", { text: "Sign in" }));
    if (!C.dashboardEndpoint || !C.googleClientId) {
      box.appendChild(el("p", { class: "hint", text: "The dashboard isn't set up yet. See \u201cManager dashboard\u201d in the README." }));
      return;
    }
    if (msg) box.appendChild(el("p", { class: "cal-status" + (isErr ? " err" : ""), text: msg }));
    box.appendChild(el("p", { class: "hint", text: "Sign in with your Seated Google account. Only managers on the dashboard's list can see team numbers." }));
    box.appendChild(el("button", { class: "btn btn-primary", type: "button", text: token ? "Refresh" : "Sign in with Google", onclick: signIn }));
  }
  function signIn() {
    if (location.protocol === "file:") { auth("Open the dashboard from its web address, not by double-clicking the file.", true); return; }
    var go = function () {
      window.google.accounts.oauth2.initTokenClient({
        client_id: C.googleClientId, scope: "email",
        callback: function (r) { if (r.error) { auth("Google didn't sign you in: " + r.error, true); return; } token = r.access_token; load(); },
        error_callback: function () { auth("Sign-in didn't finish. Try again, and allow pop-ups for this site.", true); }
      }).requestAccessToken({ prompt: "" });
    };
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return go();
    var s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.onload = go;
    s.onerror = function () { auth("Couldn't reach Google. Check your connection.", true); };
    document.head.appendChild(s);
  }
  function load() {
    auth("Loading team numbers\u2026");
    fetch(C.dashboardEndpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "dashboard", token: token, days: 14 }) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) { auth(res.error || "Couldn't load the dashboard.", true); return; }
        data = res; selected = res.today; auth("Signed in. Updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + ".");
        $("d-main").hidden = false; render();
      })
      .catch(function () { auth("Couldn't reach the dashboard. Try again in a minute.", true); });
  }

  function render() {
    var rows = data.rows;
    // date buttons: today plus every date with data, newest first
    var dates = rows.map(function (r) { return r.date; }).concat([data.today]).filter(function (d, i, a) { return a.indexOf(d) === i; }).sort().reverse().slice(0, 10);
    var dbox = $("d-dates"); dbox.innerHTML = "";
    dates.forEach(function (d) {
      dbox.appendChild(el("button", { type: "button", "aria-pressed": String(d === selected), onclick: function () { selected = d; render(); } }, [d === data.today ? "Today" : fmtDate(d)]));
    });
    var day = rows.filter(function (r) { return r.date === selected; });
    day.sort(function (a, b) { return (a.onTrack === true || a.onTrack === "TRUE") - (b.onTrack === true || b.onTrack === "TRUE") || num(a.coldPlanned) - num(b.coldPlanned); });
    var onTrack = function (r) { return r.onTrack === true || String(r.onTrack).toUpperCase() === "TRUE"; };

    // summary
    var s = $("d-summary"); s.innerHTML = "";
    var nOn = day.filter(onTrack).length;
    var exp = day.reduce(function (a, r) { return a + num(r.expectedMeetings); }, 0);
    var demos = day.reduce(function (a, r) { return a + num(r.demos) + num(r.followUps); }, 0);
    [[nOn + " of " + day.length, "reps set up for " + C.goalColdDials + " and " + C.goalCallbacks],
     [exp.toFixed(1), "expected meetings booked"],
     [String(demos), "demos and follow-ups on calendars"]].forEach(function (x) {
      s.appendChild(el("div", { class: "stat" }, [el("div", { class: "big", text: x[0] }), el("p", { text: x[1] })]));
    });

    // day table
    $("d-day-title").textContent = selected === data.today ? "Today" : fmtDate(selected);
    var t = $("d-day"); t.innerHTML = "";
    var head = ["Rep", "Status", "Cold set up", "Callbacks", "Calling time booked", "Using", "RGA", "Expected meetings", "Demos / F-ups", "Tasks (mobile / rest.)", "Issue", "Updated"];
    t.appendChild(el("thead", null, [el("tr", null, head.map(function (h, i) { return el("th", { class: i > 1 && i < 10 ? "num" : null, text: h }); }))]));
    var tb = el("tbody");
    day.forEach(function (r) {
      var ok = onTrack(r), cold = num(r.coldPlanned), cb = num(r.callbacks);
      var rga = num(r.rgaMinutes) / Math.max(1, num(r.rgaMinutes) + num(r.nonRgaMinutes));
      var issue = num(r.shortTasks) > 0 ? num(r.shortTasks) + " tasks won't fit" : num(r.idleMinutes) >= 15 ? dur(r.idleMinutes) + " booked, nothing to call" : num(r.bookedMinutes) === 0 ? "No calling time booked" : "";
      var upd = r.updated ? new Date(r.updated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
      tb.appendChild(el("tr", null, [
        el("td", { text: r.name }),
        el("td", { class: ok ? "ok" : "bad", text: ok ? "On track" : "Behind" }),
        el("td", { class: "num" + (cold < num(r.goalCold || C.goalColdDials) ? " bad" : ""), text: cold + " / " + (r.goalCold || C.goalColdDials) }),
        el("td", { class: "num" + (cb < num(r.goalCallbacks || C.goalCallbacks) ? " bad" : ""), text: cb + " / " + (r.goalCallbacks || C.goalCallbacks) }),
        el("td", { class: "num", text: dur(r.bookedMinutes) }),
        el("td", { class: "num", text: num(r.utilization) + "%" }),
        el("td", { class: "num", text: Math.round(rga * 100) + "%" }),
        el("td", { class: "num", text: num(r.expectedMeetings).toFixed(1) }),
        el("td", { class: "num", text: num(r.demos) + " / " + num(r.followUps) }),
        el("td", { class: "num", text: num(r.mobileTasks) + " / " + num(r.restaurantTasks) }),
        el("td", { class: issue ? "bad" : null, text: issue }),
        el("td", { class: "hint", text: upd })
      ]));
    });
    if (!day.length) tb.appendChild(el("tr", null, [el("td", { colspan: String(head.length), class: "hint", text: "No reps have opened their plan for this day yet." })]));
    t.appendChild(tb);

    var reported = day.map(function (r) { return r.email; });
    var missing = Object.keys(data.roster || {}).filter(function (e) { return reported.indexOf(e) < 0; });
    $("d-missing").textContent = missing.length ? "Haven't opened their plan " + (selected === data.today ? "today" : "this day") + ": " + missing.map(function (e) { return data.roster[e] || e.split("@")[0]; }).join(", ") + "." : "";

    // two-week averages
    var by = {};
    rows.forEach(function (r) { (by[r.email] = by[r.email] || []).push(r); });
    var w = $("d-week"); w.innerHTML = "";
    var wh = ["Rep", "Days used", "Days on track", "Avg cold set up", "Avg callbacks", "Avg calling time", "Avg RGA", "Avg expected meetings"];
    w.appendChild(el("thead", null, [el("tr", null, wh.map(function (h, i) { return el("th", { class: i ? "num" : null, text: h }); }))]));
    var wb = el("tbody");
    Object.keys(by).map(function (e) {
      var rs = by[e], n = rs.length, avg = function (f) { return rs.reduce(function (a, r) { return a + f(r); }, 0) / n; };
      return { name: rs[0].name, n: n, on: rs.filter(onTrack).length, cold: avg(function (r) { return num(r.coldPlanned); }), cb: avg(function (r) { return num(r.callbacks); }),
        time: avg(function (r) { return num(r.bookedMinutes); }), rga: avg(function (r) { return num(r.rgaMinutes) / Math.max(1, num(r.rgaMinutes) + num(r.nonRgaMinutes)); }), exp: avg(function (r) { return num(r.expectedMeetings); }) };
    }).sort(function (a, b) { return a.on / a.n - b.on / b.n || a.cold - b.cold; }).forEach(function (x) {
      wb.appendChild(el("tr", null, [el("td", { text: x.name }), el("td", { class: "num", text: String(x.n) }), el("td", { class: "num" + (x.on < x.n / 2 ? " bad" : ""), text: x.on + " of " + x.n }),
        el("td", { class: "num" + (x.cold < C.goalColdDials ? " bad" : ""), text: String(Math.round(x.cold)) }), el("td", { class: "num" + (x.cb < C.goalCallbacks ? " bad" : ""), text: x.cb.toFixed(1) }),
        el("td", { class: "num", text: dur(x.time) }), el("td", { class: "num", text: Math.round(x.rga * 100) + "%" }), el("td", { class: "num", text: x.exp.toFixed(1) })]));
    });
    if (!Object.keys(by).length) wb.appendChild(el("tr", null, [el("td", { colspan: String(wh.length), class: "hint", text: "No data yet." })]));
    w.appendChild(wb);
  }

  auth();
})();
