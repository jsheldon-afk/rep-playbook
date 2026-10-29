/* Rep Playbook app. Pure logic first (window.RP), then the UI. */
(function () {
  "use strict";
  var C = window.CONFIG;

  // =====================================================================
  // PURE LOGIC
  // =====================================================================
  var L = {};

  L.toMin = function (s) { var p = String(s).split(":"); return Number(p[0]) * 60 + Number(p[1] || 0); };
  L.fmt = function (min) {
    min = ((min % 1440) + 1440) % 1440;
    var h = Math.floor(min / 60), m = min % 60, mer = h >= 12 ? "PM" : "AM";
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ":" + (m < 10 ? "0" : "") + m + " " + mer;
  };
  L.fmtRange = function (a, b) {
    var A = L.fmt(a), B = L.fmt(b);
    if (A.slice(-2) === B.slice(-2)) A = A.slice(0, -3);
    return A + "\u2013" + B;
  };
  L.dur = function (min) {
    var h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + " minutes";
    if (!m) return h + (h === 1 ? " hour" : " hours");
    return h + (h === 1 ? " hour " : " hours ") + m + " minutes";
  };
  L.local = function (etMin, zone) { return etMin + zone.offsetFromET * 60; };
  L.et = function (localMin, zone) { return localMin - zone.offsetFromET * 60; };
  function inWin(t, w) { return t >= L.toMin(w[0]) && t < L.toMin(w[1]); }

  var W = C.localWindows;
  // Is this zone a good target for this block type at this ET slot start?
  L.zoneOk = function (type, etMin, zone) {
    var t = L.local(etMin, zone);
    if (type === "mobile") return inWin(t, W.mobile);
    if (type === "restaurant" || type === "prime") {
      return inWin(t, W.restaurant) && !inWin(t, W.lunchRush) && t < L.toMin(W.dinnerStart);
    }
    if (type === "primeLocal") return inWin(t, W.restaurantPrime);
    if (type === "callbacks" || type === "sweep") return t >= L.toMin(W.callbackEarliest) && t < L.toMin(W.dinnerStart);
    return false;
  };
  L.zonesFor = function (type, etMin) {
    return C.zones.filter(function (z) { return L.zoneOk(type, etMin, z); });
  };

  // ---------- Day builder ----------
  var PRIORITY = { prep: 1, wrap: 1, leads: 1, break: 6, mobile: 2, restaurant: 3, prime: 5, lunch: 6, practice: 6, callbacks: 7, sweep: 7 };

  L.buildDay = function (opts) {
    var day = opts.day; // 1 = Mon ... 5 = Fri
    var items = opts.items || [];
    var step = C.slotMinutes, dayStart = L.toMin(C.dayStart), dayEnd = L.toMin(C.dayEnd);
    var template = (day === 4 || day === 5) ? C.thuFriDay : C.defaultDay;
    var slots = [];
    for (var t = dayStart; t < dayEnd; t += step) {
      var base = null;
      template.forEach(function (b) { if (t >= L.toMin(b.start) && t < L.toMin(b.end)) base = b.type; });
      slots.push({ start: t, end: t + step, base: base, type: base, fixed: null, moved: false });
    }
    // Fixed intervals
    var fixedList = [];
    items.forEach(function (it, idx) {
      var end = it.type === "callback" ? it.start + 15 : it.end;
      fixedList.push({ start: it.start, end: end, label: it.label, kind: it.type, idx: idx, item: it });
      if (it.type === "meeting" && L.isDemo(it)) {
        fixedList.push({ start: it.start - C.demoPrepMinutes, end: it.start, label: "Demo prep", kind: "prep", idx: idx });
      }
    });
    slots.forEach(function (s) {
      fixedList.forEach(function (f) {
        if (f.start < s.end && f.end > s.start && (!s.fixed || f.kind !== "prep")) s.fixed = f;
      });
      if (s.fixed) s.type = "fixed";
    });

    var notes = [];
    function free(s) { return !s.fixed; }
    function bestDial(s) {
      if (L.zonesFor("restaurant", s.start).length && s.start >= L.toMin("13:00")) return "restaurant";
      if (L.zonesFor("mobile", s.start).length) return "mobile";
      if (L.zonesFor("restaurant", s.start).length) return "restaurant";
      return "callbacks";
    }
    function lostSlots(type) { return slots.filter(function (s) { return s.base === type && s.fixed; }).length; }

    // Ensure `need` slots of `type` inside [w0,w1). Prefers one consecutive run.
    function ensure(type, need, w0, w1, donors, eligible) {
      var have = slots.filter(function (s) { return s.type === type && s.start >= w0 && s.start < w1; });
      if (have.length >= need) return true;
      // release partial leftovers so the block can move as a unit
      var orig = slots.filter(function (s) { return s.base === type; });
      var center = orig.length ? (orig[0].start + orig[orig.length - 1].end) / 2 : (w0 + w1) / 2;
      have.forEach(function (s) { s.type = bestDial(s); });
      var cand = function (s) { return free(s) && s.start >= w0 && s.start < w1 && donors.indexOf(s.type) >= 0 && (!eligible || eligible(s)); };
      var best = null;
      for (var i = 0; i + need <= slots.length; i++) {
        var run = slots.slice(i, i + need);
        if (!run.every(cand)) continue;
        var mid = (run[0].start + run[need - 1].end) / 2;
        var dist = Math.abs(mid - center);
        var rank = run.reduce(function (a, s) { return a + (PRIORITY[s.type] || 0); }, 0);
        if (!best || dist < best.dist || (dist === best.dist && rank < best.rank)) best = { i: i, dist: dist, rank: rank };
      }
      if (best) {
        for (var j = best.i; j < best.i + need; j++) { slots[j].type = type; slots[j].moved = true; }
        return true;
      }
      // fall back to the nearest single slots
      var singles = slots.filter(cand).sort(function (a, b) { return Math.abs(a.start - center) - Math.abs(b.start - center); });
      if (singles.length < need) return false;
      singles.slice(0, need).forEach(function (s) { s.type = type; s.moved = true; });
      return true;
    }

    var R = C.reflow, cbNeed = R.minCallbackMinutes / step, lunchNeed = R.lunchMinutes / step;
    var templateAt = function (type) { return template.filter(function (b) { return b.type === type; })[0]; };
    var cbOrig = templateAt("callbacks"), swOrig = templateAt("sweep"), luOrig = templateAt("lunch");

    if (lostSlots("callbacks")) {
      var cw0 = L.toMin(R.morningCallbackWindow[0]), cw1 = L.toMin(R.morningCallbackWindow[1]);
      var ok1 = ensure("callbacks", cbNeed, cw0, cw1, ["mobile", "restaurant"]) || ensure("callbacks", cbNeed, cw0, cw1, ["mobile", "restaurant", "prep"]);
      if (!ok1) notes.push("No room for morning callbacks before noon. Make your callbacks first thing after your meetings.");
    }
    if (lostSlots("sweep")) {
      var ok2 = ensure("sweep", cbNeed, L.toMin(R.afternoonSweepWindow[0]), L.toMin(R.afternoonSweepWindow[1]), ["mobile", "restaurant", "prime"]);
      if (!ok2) notes.push("No room for the afternoon callback sweep. Fit today's callbacks in wherever you can.");
    }
    if (lostSlots("lunch")) {
      var ok3 = ensure("lunch", lunchNeed, L.toMin(R.lunchWindow[0]), L.toMin(R.lunchWindow[1]), ["mobile", "restaurant"]);
      if (!ok3) notes.push("There's no free " + R.lunchMinutes + " minutes for lunch between 11:30 and 2:00. Eat when you can.");
    }
    // Breaks: each covered break moves to the nearest free calling slot in the afternoon.
    var bw0 = L.toMin(R.breakWindow[0]), bw1 = L.toMin(R.breakWindow[1]), lostBreaks = 0;
    slots.forEach(function (s) {
      if (s.base !== "break" || !s.fixed) return;
      var cand = slots.filter(function (x) {
        return free(x) && (x.type === "mobile" || x.type === "restaurant" || x.type === "prime") && x.start >= bw0 && x.start < bw1 &&
          !slots.some(function (y) { return y.type === "break" && Math.abs(y.start - x.start) < 60; });   // keep breaks an hour apart
      }).sort(function (a, b) { return Math.abs(a.start - s.start) - Math.abs(b.start - s.start) || (PRIORITY[a.type] - PRIORITY[b.type]); })[0];
      if (cand) { cand.type = "break"; cand.moved = true; } else lostBreaks++;
    });
    if (lostBreaks) notes.push("Meetings took " + (lostBreaks === 1 ? "one of your breaks" : "both of your breaks") + ". Step away for 15 minutes between meetings if you can.");
    // Cold call bot practice is required: if a meeting covers it, move it, nearest first.
    if (lostSlots("practice")) {
      var ok4 = ensure("practice", R.practiceMinutes / step, L.toMin(R.practiceWindow[0]), L.toMin(R.practiceWindow[1]), ["mobile", "restaurant"]);
      if (!ok4) notes.push("There's no free half hour for cold call bot practice today. Do it first thing tomorrow.");
    }
    if (lostSlots("leads") && lostSlots("leads") === slots.filter(function (s) { return s.base === "leads"; }).length) {
      notes.push("Your lead-cleaning time is taken. Clean today's leads before you log off.");
    }
    // Prime time: move displaced prime minutes onto mobile time where a zone's restaurant line is in its window.
    var primeLost = lostSlots("prime");
    if (primeLost) {
      var primeOrig = slots.filter(function (s) { return s.base === "prime"; });
      var pc = (primeOrig[0].start + primeOrig[primeOrig.length - 1].end) / 2;
      var donors = slots.filter(function (s) {
        return free(s) && s.type === "mobile" && L.zonesFor("restaurant", s.start).length;
      }).sort(function (a, b) { return Math.abs(a.start - pc) - Math.abs(b.start - pc); });
      var moved = donors.slice(0, primeLost);
      moved.forEach(function (s) {
        s.type = C.zones.some(function (z) { return L.zoneOk("primeLocal", s.start, z) && L.zoneOk("restaurant", s.start, z); }) ? "prime" : "restaurant";
        s.moved = true;
      });
      if (moved.length < primeLost) notes.push("Meetings took " + L.dur((primeLost - moved.length) * step) + " of restaurant prime time that couldn't be moved.");
    }
    // Any dialing slot where no zone is reachable becomes the best type for that time.
    slots.forEach(function (s) {
      if (free(s) && (s.type === "mobile" || s.type === "restaurant" || s.type === "prime") && !L.zonesFor(s.type, s.start).length) {
        s.type = bestDial(s); s.moved = true;
      }
    });
    if (lostSlots("prep") === slots.filter(function (s) { return s.base === "prep"; }).length && lostSlots("prep") > 0) {
      notes.push("Your prep time is taken. Build your callback list before your first meeting.");
    }
    if (lostSlots("wrap") && lostSlots("wrap") === slots.filter(function (s) { return s.base === "wrap"; }).length) {
      notes.push("Your wrap-up time is taken. Check today's dispositions and set tomorrow's reminders before you log off.");
    }

    return { slots: slots, notes: notes, fixedList: fixedList, template: template };
  };

  // Group slots into calendar blocks.
  // Group slots into calendar blocks. Same type in a row = one block, even when the
  // time zones being called change partway through; whoLine explains when each zone starts.
  L.blocks = function (plan) {
    var out = [];
    plan.slots.forEach(function (s) {
      // Mobile and restaurant time always merges; for other blocks, "(moved)" starts a new block.
      var key = s.fixed ? "fixed:" + s.fixed.kind + ":" + s.fixed.idx : s.type + ((s.type === "mobile" || s.type === "restaurant") ? "" : "|" + s.moved);
      var last = out[out.length - 1];
      var b;
      if (last && last.key === key && last.end === s.start) { b = last; b.end = s.end; b.moved = b.moved || s.moved; }
      else { b = { key: key, start: s.start, end: s.end, type: s.fixed ? "fixed" : s.type, fixed: s.fixed, moved: s.moved, base: s.base, zones: [], zoneRanges: {} }; out.push(b); }
      if (s.fixed) return;
      L.zonesFor(s.type === "prime" ? "prime" : s.type, s.start).forEach(function (z) {
        var r = b.zoneRanges[z.name];
        if (!r) { b.zoneRanges[z.name] = [s.start, s.end]; b.zones.push(z.name); }
        else r[1] = s.end;
      });
    });
    out.forEach(function (b) {
      b.zones = C.zones.map(function (z) { return z.name; }).filter(function (n) { return b.zones.indexOf(n) >= 0; });
    });
    return out;
  };

  L.whoLine = function (b) {
    var t = b.type, names = b.zones;
    if (!names.length) return "";
    var zs = C.zones.filter(function (z) { return names.indexOf(z.name) >= 0; });
    var parts = zs.map(function (z) {
      var r = (b.zoneRanges && b.zoneRanges[z.name]) || [b.start, b.end];
      var txt = z.name + " " + L.fmtRange(L.local(r[0], z), L.local(r[1], z)) + " local";
      if (r[0] > b.start && r[1] < b.end) txt += " (" + L.fmtRange(r[0], r[1]) + " ET)";
      else if (r[0] > b.start) txt += " (from " + L.fmt(r[0]) + " ET)";
      else if (r[1] < b.end) txt += " (until " + L.fmt(r[1]) + " ET)";
      return txt;
    });
    var what = t === "mobile" ? "mobiles" : (t === "restaurant" || t === "prime") ? "restaurants" : "owners";
    var lunchy = (t === "callbacks" || t === "sweep") ? zs.filter(function (z) { return inWin(L.local(b.start, z), W.lunchRush); }) : [];
    var extra = lunchy.length ? " (" + lunchy.map(function (z) { return z.name; }).join(", ") + ": mobiles only, it's lunch rush there)" : "";
    return "Calling " + names.join(" + ") + " " + what + ": " + parts.join("; ") + extra;
  };

  // ---------- Dials and expected meetings ----------
  L.estimate = function (plan, callbacksDue, dialTarget) {
    var rates = C.bookingRatePerDial;
    var blocks = L.blocks(plan).filter(function (b) { return b.type !== "fixed" && C.blockTypes[b.type] && C.blockTypes[b.type].dials; });
    var agreed = plan.fixedList.filter(function (f) { return f.kind === "callback"; }).length;
    blocks.forEach(function (b) { b.cap = (b.end - b.start) / 60 * C.dialsPerHour; b.used = 0; b.cbUsed = 0; });
    var capacity = blocks.reduce(function (a, b) { return a + b.cap; }, 0);
    var callbackFixedDials = agreed; // one dial each, at their fixed time
    var cbNeeded = Math.max(0, callbacksDue) * C.dialsPerCallbackToday;
    var target = Math.max(0, dialTarget);
    var remainingTarget = Math.max(0, target - callbackFixedDials);
    // 1) callback dials into callback blocks, in time order
    var cbLeft = Math.min(cbNeeded, remainingTarget);
    blocks.forEach(function (b) {
      if (b.type !== "callbacks" && b.type !== "sweep") return;
      var x = Math.min(cbLeft, b.cap); b.cbUsed = x; b.used = x; cbLeft -= x;
    });
    var cbPlaced = Math.min(cbNeeded, remainingTarget) - cbLeft;
    // callbacks that didn't fit in callback blocks go into other blocks
    blocks.forEach(function (b) {
      if (cbLeft <= 0) return;
      var x = Math.min(cbLeft, b.cap - b.used); b.cbUsed += x; b.used += x; cbLeft -= x; cbPlaced += x;
    });
    var cold = Math.max(0, remainingTarget - cbPlaced);
    var freeCap = blocks.reduce(function (a, b) { return a + (b.cap - b.used); }, 0);
    var coldPlaced = Math.min(cold, freeCap);
    blocks.forEach(function (b) {
      var share = freeCap ? (b.cap - b.used) / freeCap : 0;
      b.coldUsed = coldPlaced * share; b.used += b.coldUsed;
    });
    var rows = {};
    function add(label, dials, rate) {
      if (dials <= 0.0001) return;
      if (!rows[label]) rows[label] = { label: label, dials: 0, rate: rate, expected: 0 };
      rows[label].dials += dials; rows[label].expected += dials * rate;
    }
    if (callbackFixedDials && target > 0) add("Agreed callbacks", Math.min(callbackFixedDials, target), rates.agreedCallback);
    blocks.forEach(function (b) {
      add("Callbacks", b.cbUsed, rates.callback);
      var key = C.blockTypes[b.type].rate;
      var spare = b.type === "sweep" || b.type === "callbacks";
      var r = spare ? rates.mobileBlock : rates[key];
      var label = spare ? "Spare callback time (dial mobiles)" : C.blockTypes[b.type].label;
      if (b.type === "prime" && !b.zones.some(function (zn) {
        var z = C.zones.filter(function (q) { return q.name === zn; })[0];
        return L.zoneOk("primeLocal", b.start, z);
      })) { r = rates.restaurantBlock; }
      add(label, b.coldUsed, r);
    });
    var list = Object.keys(rows).map(function (k) { return rows[k]; });
    var dials = list.reduce(function (a, r) { return a + r.dials; }, 0);
    var expected = list.reduce(function (a, r) { return a + r.expected; }, 0);
    var maxDials = capacity + callbackFixedDials;
    return {
      capacity: Math.floor(maxDials), dials: dials, expected: expected, rows: list,
      overCapacity: target > maxDials + 0.5, avgRate: dials ? expected / dials : 0,
      callingMinutes: blocks.reduce(function (a, b) { return a + (b.end - b.start); }, 0)
    };
  };
  // ---------- Callbacks ----------
  L.addBusinessDays = function (date, n) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var added = 0;
    while (added < n) { d.setDate(d.getDate() + 1); var w = d.getDay(); if (w !== 0 && w !== 6) added++; }
    return d;
  };
  L.fmtDate = function (d) {
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };
  // n is 1-based callback number. Returns windows in local time and ET, clipped to the rep's day.
  L.callbackWindow = function (line, zone, n) {
    var pref, full;
    if (line === "mobile") { full = W.mobile; pref = n % 2 === 1 ? ["10:30", "12:00"] : ["12:00", "14:00"]; }
    else { full = W.restaurant; pref = n % 2 === 1 ? W.restaurantPrime : ["13:00", "15:30"]; }
    var d0 = L.toMin(C.dayStart), d1 = L.toMin(C.dayEnd);
    function clip(w) {
      var a = Math.max(L.et(L.toMin(w[0]), zone), d0), b = Math.min(L.et(L.toMin(w[1]), zone), d1);
      return b - a >= 30 ? { etStart: a, etEnd: b } : null;
    }
    var c = clip(pref), fallback = false;
    if (!c) { c = clip(full); fallback = true; }
    if (!c) return null;
    return {
      etStart: c.etStart, etEnd: c.etEnd, localStart: L.local(c.etStart, zone), localEnd: L.local(c.etEnd, zone),
      part: fallback ? (line === "mobile" ? "Midday" : "Afternoon") : line === "mobile" ? (n % 2 === 1 ? "Morning" : "Afternoon") : (n % 2 === 1 ? "Late afternoon" : "Early afternoon"),
      fallback: fallback
    };
  };
  L.windowText = function (w, zone) {
    if (!w) return "No good window inside your 9\u20136 day. Ask your manager.";
    var s = L.fmtRange(w.localStart, w.localEnd) + " " + zone.short;
    if (zone.offsetFromET !== 0) s += " (" + L.fmtRange(w.etStart, w.etEnd) + " ET)";
    return s;
  };

  // ---------- Calendar (pure helpers) ----------
  // Same word matching as the Demo Reminders script: lowercase, punctuation becomes spaces,
  // whole words only, plural "s" allowed ("Follow-Up:" matches "follow up").
  L.norm = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); };
  L.hasWord = function (text, words) {
    var t = " " + L.norm(text) + " ";
    return (words || []).some(function (w) { var n = L.norm(w); return n && new RegExp(" " + n + "s? ").test(t); });
  };
  // item: a My day item (calendar items carry .demo from their guest list) or a plain label.
  L.isDemo = function (item) {
    if (item && typeof item === "object") {
      if (item.demo != null) return item.demo;
      item = item.label;
    }
    return L.hasWord(item, C.demoTitleKeywords) || L.hasWord(item, C.followUpWords);
  };
  L.demoKind = function (item) {
    if (!L.isDemo(item)) return null;
    var label = typeof item === "object" ? item.label : item;
    return L.hasWord(label, C.followUpWords) ? "Follow-up" : "Demo";
  };
  // Guests outside the company who haven't declined (same as the reminders script).
  L.externalGuests = function (ev) {
    return (ev.attendees || []).filter(function (a) {
      if (a.self || a.resource || !a.email || a.responseStatus === "declined") return false;
      var e = a.email.toLowerCase();
      return !C.internalDomains.some(function (d) { return e.slice(-(d.length + 1)) === "@" + d.toLowerCase(); });
    });
  };
  // Date -> { ymd, weekday (0-6), min } in the rep's time zone.
  L.tzParts = function (date) {
    var f = new Intl.DateTimeFormat("en-US", { timeZone: C.repTimeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    var p = {}; f.formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
    var wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
    return { ymd: p.year + "-" + p.month + "-" + p.day, weekday: wd, min: Number(p.hour) * 60 + Number(p.minute) };
  };
  // Monday-Friday dates (YYYY-MM-DD, rep time zone) for the week to plan. Weekends plan next week.
  L.planWeek = function (now) {
    var t = L.tzParts(now);
    var base = new Date(Date.UTC(+t.ymd.slice(0, 4), +t.ymd.slice(5, 7) - 1, +t.ymd.slice(8, 10)));
    var shift = t.weekday === 0 ? 1 : t.weekday === 6 ? 2 : 1 - t.weekday;
    var out = {};
    for (var i = 0; i < 5; i++) {
      var d = new Date(base); d.setUTCDate(base.getUTCDate() + shift + i);
      out[i + 1] = d.toISOString().slice(0, 10);
    }
    return out;
  };
  // A Google Calendar event -> a My day item, or { skip: reason }.
  L.eventToItem = function (ev) {
    if (!ev || ev.status === "cancelled") return { skip: "cancelled" };
    if (ev.eventType === "workingLocation") return { skip: "location" };
    var me = (ev.attendees || []).filter(function (a) { return a.self; })[0];
    if (me && me.responseStatus === "declined") return { skip: "declined" };
    var titled = ev.summary || "";
    var isReminder = (C.callbackRules.reminderText || []).some(function (x) { return titled.toUpperCase().indexOf(String(x).toUpperCase()) >= 0; });
    var ownBlock = !isReminder && !L.externalGuests(ev).length && L.hasWord(titled, C.callBlockWords);
    if (((ev.description || "").indexOf(C.calendarBlockTag) >= 0 || ownBlock) && ev.start && ev.start.dateTime) {
      var ba = L.tzParts(new Date(ev.start.dateTime)), bb = L.tzParts(new Date(ev.end.dateTime));
      return { block: { date: ba.ymd, start: ba.min, end: bb.ymd === ba.ymd ? bb.min : 24 * 60, kind: L.blockKind(titled) } };
    }
    if (!ev.start || !ev.start.dateTime) {
      return { allDay: true, label: ev.summary || "All-day event", date: ev.start && ev.start.date, outOfOffice: ev.eventType === "outOfOffice" };
    }
    var a = L.tzParts(new Date(ev.start.dateTime)), b = L.tzParts(new Date(ev.end.dateTime));
    var end = b.ymd === a.ymd ? b.min : 24 * 60;
    if (end <= a.min) return { skip: "zero-length" };
    var label = ev.summary || (ev.eventType === "outOfOffice" ? "Out of office" : "Busy");
    var type = L.isCallbackEvent(ev, label) ? "callback" : "meeting";
    // Events marked "free" don't block time, except callbacks (Nooks marks its reminders free).
    if (ev.transparency === "transparent" && type !== "callback") return { skip: "free" };
    var demo = type === "meeting" && L.externalGuests(ev).length > 0 && !L.hasWord(label, C.skipWords);
    return { item: { id: ev.id, date: a.ymd, start: a.min, end: type === "callback" ? a.min + 15 : end, label: label, type: type, source: "calendar", demo: demo, link: ev.htmlLink || null } };
  };

  // Google Calendar "add event" link. ymd = YYYY-MM-DD, start/end = minutes in the rep's time zone.
  L.gcalLink = function (o) {
    function p(n) { return (n < 10 ? "0" : "") + n; }
    function f(min) { return o.ymd.replace(/-/g, "") + "T" + p(Math.floor(min / 60)) + p(min % 60) + "00"; }
    return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(o.title) +
      "&dates=" + f(o.start) + "/" + f(o.end) +
      "&details=" + encodeURIComponent(o.details || "") +
      "&ctz=" + encodeURIComponent(C.repTimeZone);
  };
  L.ymdLocal = function (d) {
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  };

  // Callback rules (config.callbackRules):
  //   "REMINDER - " anywhere in the title (Nooks reminders): always a callback.
  //   "Callback" / "Call Back": a callback when there are no outside guests.
  //   "Call": a callback only when nobody else is invited.
  L.isCallbackEvent = function (ev, label) {
    var R = C.callbackRules || {}, t = String(label || ev.summary || "");
    if ((R.reminderText || []).some(function (x) { return t.toUpperCase().indexOf(String(x).toUpperCase()) >= 0; })) return true;
    var others = (ev.attendees || []).filter(function (a) { return !a.self && !a.resource && a.responseStatus !== "declined"; });
    if (!L.externalGuests(ev).length && L.hasWord(t, R.callbackWords)) return true;
    if (!others.length && L.hasWord(t, R.callWords)) return true;
    return false;
  };

  // What kind of calling time a calendar block is, from its title.
  L.blockKind = function (label) {
    var t = L.norm(label);
    if (/\b(practice|bot|clean leads|leads|wrap up|prep)\b/.test(t) && !/\bcall/.test(t.replace(/cold call bot/, ""))) return "other";
    if (/\bmobile/.test(t)) return "mobile";
    if (/\brestaurant/.test(t)) return "restaurant";
    return "flex";   // callback blocks and a rep's own "Call block": any kind of call
  };
  // Tasks vs. calling time. cap = minutes of { mobile, restaurant, flex } calling time.
  L.taskCheck = function (o) {
    var dph = C.dialsPerHour, r = C.bookingRatePerDial;
    var capM = o.cap.mobile / 60 * dph, capR = o.cap.restaurant / 60 * dph, flex = o.cap.flex / 60 * dph;
    var mFit = Math.min(o.mobileTasks, capM), rFit = Math.min(o.restaurantTasks, capR);
    var mFlex = Math.min(o.mobileTasks - mFit, flex); flex -= mFlex;
    var rFlex = Math.min(o.restaurantTasks - rFit, flex); flex -= rFlex;
    var mDone = mFit + mFlex, rDone = rFit + rFlex;
    var spare = (capM - mFit) + (capR - rFit) + flex;
    return {
      mobile: { tasks: o.mobileTasks, capacity: Math.floor(capM), done: Math.floor(mDone), short: Math.ceil(o.mobileTasks - mDone) },
      restaurant: { tasks: o.restaurantTasks, capacity: Math.floor(capR), done: Math.floor(rDone), short: Math.ceil(o.restaurantTasks - rDone) },
      flexCapacity: Math.floor(o.cap.flex / 60 * dph),
      callbacks: o.callbacks,
      dials: Math.round(mDone + rDone + o.callbacks),
      idleMinutes: Math.floor(spare / dph * 60),
      expected: mDone * r.mobileBlock + rDone * r.restaurantBlock + o.callbacks * r.callback
    };
  };

  // ---------- Suggestions ----------
  // plan/est for today; week = { 1..5: { date, plan, est } }; day = 1-5
  L.suggest = function (opts) {
    var out = [], plan = opts.plan, est = opts.est, items = opts.items || [], day = opts.day;
    var p0 = L.toMin(C.protectedWindow[0]), p1 = L.toMin(C.protectedWindow[1]);
    // 1) Protect prime time
    items.forEach(function (it) {
      if (it.type !== "meeting" || L.isDemo(it)) return;
      if (it.start < p1 && it.end > p0) out.push({ kind: "prime", item: it, text: q2(it.label) + " (" + L.fmtRange(it.start, it.end) + ") sits in restaurant prime time. If you can, move it before 10:30 AM or to 5:45 PM." });
    });
    // 2) Demo spacing
    var sorted = items.slice().sort(function (a, b) { return a.start - b.start; });
    sorted.forEach(function (it, i) {
      if (!L.isDemo(it) || it.type !== "meeting") return;
      var prev = sorted.slice(0, i).filter(function (x) { return x.end > it.start - C.demoPrepMinutes && x.end <= it.start + 1; })[0];
      if (prev) out.push({ kind: "spacing", text: "No prep time before your " + L.fmt(it.start) + " " + (L.demoKind(it) === "Follow-up" ? "follow-up" : "demo") + ", " + q2(it.label) + ": " + q2(prev.label) + " ends at " + L.fmt(prev.end) + ". Leave " + C.demoPrepMinutes + " minutes between them if you can." });
    });
    return out;
  };
  function q2(s) { return "\u201c" + s + "\u201d"; }

  window.RP = L;
  if (typeof document === "undefined" || !document.getElementById("panel-how")) return;

  // =====================================================================
  // UI HELPERS
  // =====================================================================
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] == null) return;
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function q(s) { return "\u201c" + s + "\u201d"; }
  function pct(x, d) { return (x * 100).toFixed(d == null ? 0 : d) + "%"; }
  var SYS = ["Salesforce", "Salesloft", "Nooks", "You"];
  function tag(sys) { return el("span", { class: "tag sys-" + sys, text: sys }); }
  var R = {}; C.tempRejectReasons.forEach(function (r) { R[r.name] = r.name; });
  function reason(name) { if (!R[name]) console.warn("Unknown reason", name); return name; }

  // =====================================================================
  // TAB 1
  // =====================================================================
  function renderAutoBox() {
    var b = $("auto-box");
    b.appendChild(el("h2", { text: "Two things happen automatically" }));
    b.appendChild(el("ol", null, [
      el("li", { html: "You book a demo in Salesforce \u2192 <strong>every</strong> contact on that account is removed from their Salesloft cadences." }),
      el("li", { html: "You log " + q("Connected with DM") + " in Nooks (any sentiment) \u2192 <strong>only that one contact</strong> is removed from their cadence. Every other contact on the account (the restaurant line, another mobile, another owner) keeps getting called." })
    ]));
    b.appendChild(el("p", { text: "Everything else is up to you. If an owner's answer applies to the whole restaurant, you remove the other contacts yourself." }));
  }

  var FLOW = [
    { id: "1", sys: "Salesforce", title: "An account is assigned to you", body: ["Accounts are restaurants. Once one is on your name in Salesforce, it's yours to work."] },
    { id: "2", sys: "Salesloft", title: "Its contacts go into cadences", body: ["A cadence is a scheduled series of calls and emails to one contact. Owner mobiles go into the mobile cadence. The restaurant's main line goes into the restaurant cadence.", "One account can have several contacts in cadences at the same time."] },
    { id: "3", sys: "Nooks", title: "You call and log a disposition and a sentiment", body: ["Disposition = who you reached. Sentiment = what happened. What you do next depends on the outcome below.", "Decision-maker (DM): the owner, partner or GM who can say yes. Gatekeeper: anyone else who answers."] }
  ];
  var OUTCOMES = [
    { id: "3a", sys: "Salesforce", auto: true, title: "Demo booked", log: "Connected with DM \u203a Demo Scheduled",
      body: ["Book the demo in Salesforce.", "Automatic: every contact on the account leaves their cadence. You're done prospecting this account."] },
    { id: "3b", sys: "You", auto: true, title: "Owner said no", log: "Connected with DM \u203a Not Interested, Timing Not Right, Fully Booked or Using Competitor",
      body: ["Automatic: only that contact leaves their cadence. The others keep going.", "If the no applies to the whole restaurant, remove the other contacts from their Salesloft cadences yourself, then Temporarily Reject the account with the matching reason.", "If someone else could still say yes, leave that contact's cadence running."] },
    { id: "3c", sys: "Nooks", auto: true, title: "Owner talked but didn't decide", log: "Connected with DM \u203a Gave Callback Time, Send Info Via Email or Hung Up Before Pitch",
      body: ["Automatic: only that contact leaves their cadence, and Salesforce marks the account DM Connect.", "Make 5 callbacks with Nooks reminders (see the 5-callback rule). If you reach them, log that call and start over.", "After 5 unanswered callbacks, remove any other contacts still in cadences (unless one is worth working), then Temporarily Reject with " + q("DM Connect, Failed to Reconnect") + "."] },
    { id: "3d", sys: "Nooks", title: "Gatekeeper", log: "Gatekeeper \u203a the matching sentiment",
      body: ["Nothing is removed. The cadence keeps going.", "Get the owner's name, when they're in and a better number."] },
    { id: "3e", sys: "Nooks", title: "No answer or voicemail", log: "No Answer or Left Voicemail",
      body: ["Nothing is removed. The cadence keeps going."] },
    { id: "3f", sys: "Salesloft", title: "Bad number", log: "Bad Number \u203a Wrong Number or Not In Service",
      body: ["If the contact has another number, keep going. If not, remove the contact."] },
    { id: "3g", sys: "Salesforce", title: "Asked not to be called", log: "Gatekeeper or Connected with DM \u203a Asked Not to Be Called",
      body: ["Remove the contact from all cadences right away and mark them Do Not Call in Salesforce."] },
    { id: "3h", sys: "Salesforce", title: "Cadence ended, never reached the owner",
      body: ["If no other contacts are still in a cadence, Temporarily Reject with " + q("GK Connect, Unable to Reach DM") + " if someone picked up, or " + q("Unable to connect to a human") + " if no one did."] },
    { id: "3i", sys: "Salesforce", title: "Never sell to this restaurant", body: ["For example, it closed for good. Mark the account Does Not Qualify. This is permanent."] },
    { id: "3j", sys: "Salesloft", title: "Demo no-show", body: C.noShowStep }
  ];

  function flowNode(step) {
    var wrapper = el("div", { class: "flow-step", id: "flow-" + step.id });
    var detail = el("div", { class: "flow-detail", hidden: "" });
    if (step.log) detail.appendChild(el("p", { html: "<strong>Log it as:</strong> " + step.log }));
    step.body.forEach(function (t) { detail.appendChild(el("p", { text: t })); });
    var btn = el("button", { class: "flow-node", type: "button", "aria-expanded": "false" }, [
      tag(step.sys),
      el("span", null, [el("span", { class: "title", text: step.title }), step.auto ? el("span", { class: "auto-flag", text: "Automatic" }) : null]),
      el("span", { class: "chev", "aria-hidden": "true", text: "+" })
    ]);
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      btn.querySelector(".chev").textContent = open ? "+" : "\u2212";
      if (open) detail.setAttribute("hidden", ""); else detail.removeAttribute("hidden");
    });
    wrapper.appendChild(btn); wrapper.appendChild(detail);
    return wrapper;
  }
  function renderFlow() {
    var f = $("flow");
    FLOW.forEach(function (s, i) {
      f.appendChild(flowNode(s));
      f.appendChild(el("div", { class: "flow-arrow", "aria-hidden": "true" }));
    });
    var grid = el("div", { class: "flow-outcomes" });
    OUTCOMES.forEach(function (s) { grid.appendChild(flowNode(s)); });
    f.appendChild(grid);
    $("compare").appendChild(el("div", null, [
      el("h3", { text: "Temporarily Reject" }),
      el("p", { text: "You're done for now. The account comes off your name and goes back out in " + C.tempRejectRedistributionLabel + ", maybe to you, maybe to someone else." }),
      el("p", { html: "<strong>Example:</strong> the owner said they're too busy until after the holidays." })
    ]));
    $("compare").appendChild(el("div", { class: "dnq" }, [
      el("h3", { text: "Does Not Qualify" }),
      el("p", { text: "Never sell to this restaurant. It's removed for good. Not a stronger \u201cno\u201d." }),
      el("p", { html: "<strong>Example:</strong> the restaurant has closed permanently." })
    ]));
  }
  function highlightFlow(id) {
    document.querySelectorAll(".flow-highlight").forEach(function (n) { n.classList.remove("flow-highlight"); });
    var n = $("flow-" + id); if (!n) return;
    n.classList.add("flow-highlight");
    var btn = n.querySelector(".flow-node");
    if (btn.getAttribute("aria-expanded") !== "true") btn.click();
    n.scrollIntoView({ block: "center" });
    btn.focus({ preventScroll: true });
  }

  function countsPill(c) { return el("span", { class: "pill pill-" + c.replace(/\s/g, ""), text: c }); }
  function renderCheat() {
    var box = $("cheat");
    function table(list) {
      var tb = el("tbody");
      list.forEach(function (d) {
        var sents = d.sentiments.length ? d.sentiments : [null];
        sents.forEach(function (s, i) {
          var tr = el("tr");
          if (i === 0) {
            var td = el("td", { rowspan: String(sents.length) }, [el("div", { class: "sent-name", text: d.name }), el("div", { class: "hint", text: d.when })]);
            tr.appendChild(td);
          }
          if (s) {
            var info = C.sentiments[s] || { def: "" };
            tr.appendChild(el("td", null, [el("span", { class: "sent-name", text: s })]));
            tr.appendChild(el("td", { text: info.def }));
            tr.appendChild(el("td", null, [countsPill(info.counts || d.counts)]));
          } else {
            tr.appendChild(el("td", { text: "\u2014" })); tr.appendChild(el("td", { text: "No sentiment needed." }));
            tr.appendChild(el("td", null, [countsPill(d.counts)]));
          }
          tb.appendChild(tr);
        });
      });
      return el("div", { class: "table-scroll" }, [el("table", null, [
        el("thead", null, [el("tr", null, [el("th", { text: "Disposition" }), el("th", { text: "Sentiment" }), el("th", { text: "Use it when" }), el("th", { text: "Counts as" })])]), tb])]);
    }
    box.appendChild(table(C.dispositions.filter(function (d) { return d.prospecting; })));
    box.appendChild(el("div", { class: "note", html: "<strong>Two easy mix-ups.</strong> " + q("Refused to Engage / Hung Up") + " is for gatekeepers. " + q("Hung Up Before Pitch") + " is for owners. And " + q("Timing Not Right") + " means open but not now, while " + q("Not Interested") + " means no." }));
    var det = el("details", { class: "collapsible" }, [el("summary", { text: "Calls that aren't prospecting" })]);
    det.appendChild(table(C.dispositions.filter(function (d) { return !d.prospecting; })));
    box.appendChild(det);
  }

  function renderRejectTable() {
    var tb = el("tbody");
    C.tempRejectReasons.forEach(function (r) {
      tb.appendChild(el("tr", null, [el("td", null, [el("span", { class: "sent-name", text: r.name })]), el("td", { text: r.use }), el("td", { text: r.notConfuse })]));
    });
    tb.appendChild(el("tr", null, [el("td", null, [el("span", { class: "sent-name", text: "Does Not Qualify" }), el("div", { class: "hint", text: "Not a Temporarily Reject" })]), el("td", { text: "The restaurant should never be sold to, for example it closed for good. Permanent." }), el("td", { text: "Temp Closed, which is for restaurants that will reopen." })]));
    $("reject-table").appendChild(el("div", { class: "table-scroll" }, [el("table", null, [
      el("thead", null, [el("tr", null, [el("th", { text: "Reason" }), el("th", { text: "Use it when" }), el("th", { text: "Don't confuse it with" })])]), tb])]));
  }

  function renderCallbacks() {
    var box = $("callbacks");
    var s = C.callbackSpeedDemoRate;
    box.appendChild(el("div", { class: "stats" }, [
      el("div", { class: "stat" }, [el("div", { class: "big", text: C.callbackVsColdMultiple + "\u00d7" }), el("p", { text: "A callback is about " + C.callbackVsColdMultiple + " times more likely to book a demo than a first cold dial." })]),
      el("div", { class: "stat" }, [el("div", { class: "big", text: pct(s.withinOneDay) }), el("p", { text: "of callbacks made within a day book a demo. After 3 days it's about " + pct(s.overThreeDays) + "." })]),
      el("div", { class: "stat" }, [el("div", { class: "big", text: pct(C.callbacksNeverCalledShare) }), el("p", { text: "of callback requests last quarter never got a second call." })])
    ]));
    box.appendChild(el("p", { class: "lede", text: "Every owner you talked to who didn't book or say no gets " + C.callbackDials + " callbacks, on a mobile or a restaurant line." }));
    var tl = el("div", { class: "timeline" });
    C.followUpDays.forEach(function (d, i) {
      tl.appendChild(el("div", null, [el("strong", { text: "Callback " + (i + 1) }), el("span", { text: "Business day " + d + ", " + (i % 2 === 0 ? "earlier" : "later") + " in the day" })]));
    });
    box.appendChild(tl);
    box.appendChild(el("ul", { class: "rules" }, [
      el("li", { text: "If they gave you a time, callback 1 is at that time, in their time zone. Otherwise it's the next business day." }),
      el("li", { text: "Mobiles: " + L.fmtRange(L.toMin(W.mobile[0]), L.toMin(W.mobile[1])) + " their time. Restaurant lines: " + L.fmtRange(L.toMin(W.restaurant[0]), L.toMin(W.restaurant[1])) + " their time, " + L.fmtRange(L.toMin(W.restaurantPrime[0]), L.toMin(W.restaurantPrime[1])) + " is best. Never during lunch rush (" + L.fmtRange(L.toMin(W.lunchRush[0]), L.toMin(W.lunchRush[1])) + ") or after " + L.fmt(L.toMin(W.dinnerStart)) + "." }),
      el("li", { text: "If they asked for an email, send it the same day. Callback 1 is two business days later." }),
      el("li", { html: "No answer after " + C.callbackDials + " callbacks: Temporarily Reject with " + q("DM Connect, Failed to Reconnect") + "." })
    ]));
    box.appendChild(el("p", { class: "hint", text: "The simulator at the bottom of this page works out the exact dates and times for any callback." }));
  }

  // ---------- Wizard engine ----------
  function Wizard(root, tree, startId) {
    this.root = root; this.tree = tree; this.startId = startId;
    this.history = []; this.vars = {};
    this.go(startId);
  }
  Wizard.prototype.go = function (id) {
    this.current = id; this.render();
  };
  Wizard.prototype.choose = function (opt) {
    this.history.push({ id: this.current, label: opt.label, vars: JSON.parse(JSON.stringify(this.vars)) });
    if (opt.set) for (var k in opt.set) this.vars[k] = opt.set[k];
    var next = typeof opt.next === "function" ? opt.next(this.vars) : opt.next;
    this.go(next);
  };
  Wizard.prototype.back = function () {
    var h = this.history.pop(); if (!h) return;
    this.vars = h.vars; this.go(h.id);
  };
  Wizard.prototype.reset = function () { this.history = []; this.vars = {}; this.go(this.startId); };
  Wizard.prototype.render = function () {
    var self = this, node = this.tree[this.current], root = this.root;
    if (!node) { console.error("Missing wizard node", this.current); return; }
    root.innerHTML = "";
    if (this.history.length) {
      var trail = el("ol", { class: "wiz-trail", "aria-label": "Your answers so far" });
      this.history.forEach(function (h) { trail.appendChild(el("li", { text: h.label })); });
      root.appendChild(trail);
    }
    if (node.result) {
      var r = typeof node.result === "function" ? node.result(this.vars) : node.result;
      root.appendChild(el("h3", { class: "result-title", text: r.title }));
      if (r.log !== undefined) {
        root.appendChild(el("div", { class: "log-it" }, [el("span", { class: "label", text: "Log it in Nooks as" }), el("span", { class: "value", text: r.log || "Nothing new to log" })]));
      }
      if (r.auto) root.appendChild(el("div", { class: "auto-line", html: r.auto }));
      if (r.steps && r.steps.length) {
        root.appendChild(el("p", { html: "<strong>Do this next</strong>" }));
        var ol = el("ol", { class: "checklist" });
        r.steps.forEach(function (s) {
          var li = el("li");
          if (SYS.indexOf(s[0]) >= 0) { li.appendChild(tag(s[0])); li.appendChild(document.createTextNode(s[1])); }
          else li.appendChild(document.createTextNode(s));
          ol.appendChild(li);
        });
        root.appendChild(ol);
      }
      if (r.extra) root.appendChild(r.extra);
      var nav = el("div", { class: "wiz-nav" });
      if (r.restartLabel) nav.appendChild(el("button", { class: "btn btn-primary", type: "button", text: r.restartLabel, onclick: function () { self.reset(); } }));
      if (r.flow) nav.appendChild(el("button", { class: "btn", type: "button", text: "Show me in the flow", onclick: function () { highlightFlow(r.flow); } }));
      nav.appendChild(el("button", { class: "btn", type: "button", text: "Back", onclick: function () { self.back(); } }));
      nav.appendChild(el("button", { class: "btn" + (r.restartLabel ? "" : " btn-primary"), type: "button", text: "Start over", onclick: function () { self.reset(); } }));
      root.appendChild(nav);
    } else {
      var qs = typeof node.q === "function" ? node.q(this.vars) : node.q;
      root.appendChild(el("p", { class: "wiz-q", text: qs }));
      if (node.help) root.appendChild(el("p", { class: "wiz-help", text: node.help }));
      var opts = typeof node.options === "function" ? node.options(this.vars) : node.options;
      var grid = el("div", { class: "wiz-options" });
      opts.forEach(function (o) { grid.appendChild(el("button", { type: "button", text: o.label, onclick: function () { self.choose(o); } })); });
      root.appendChild(grid);
      var nav2 = el("div", { class: "wiz-nav" });
      nav2.appendChild(el("button", { class: "btn", type: "button", text: "Back", onclick: function () { self.back(); } }));
      if (!this.history.length) nav2.lastChild.setAttribute("disabled", "");
      nav2.appendChild(el("button", { class: "btn", type: "button", text: "Start over", onclick: function () { self.reset(); } }));
      root.appendChild(nav2);
    }
    if (this.rendered) {
      var focusTarget = root.querySelector(".wiz-q, .result-title");
      if (focusTarget) { focusTarget.setAttribute("tabindex", "-1"); focusTarget.focus({ preventScroll: false }); }
    }
    this.rendered = true;
  };

  // ---------- Simulator tree ----------
  var AUTO_ONE = "<strong>Automatic:</strong> only this contact left their cadence. Check the account in Salesloft for other contacts still being called (the restaurant line or another mobile).";
  var AUTO_ALL = "<strong>Automatic:</strong> every contact on the account left their cadence.";
  var DMC = "Connected with DM";
  function lg(d, s) { return s ? d + " \u203a " + s : d; }
  var rejectNoteTxt = "It goes back out in " + C.tempRejectRedistributionLabel + ". It might come back to you.";
  var noReasonFor = {
    "Not Interested": "DM Connect, Not Interested",
    "Timing Not Right": "DM Connect, Timing Not Right",
    "Fully Booked": "Fully Booked (Lilia, 4 Charles, etc.)",
    "Using Competitor": C.usingCompetitorReason
  };
  function zoneByName(n) { return C.zones.filter(function (z) { return z.name === n; })[0]; }

  function callbackPlan(v) {
    var zone = zoneByName(v.zone), done = v.count, n = done + 1;
    var days = v.kind === "email" ? C.emailFollowUpDays : C.followUpDays;
    var today = new Date();
    var rows = el("tbody");
    for (var i = 1; i <= C.callbackDials; i++) {
      var w = L.callbackWindow(v.line, zone, i);
      var when;
      if (i === 1 && v.kind === "callbackTime") when = "At the time they gave you";
      else if (done === 0) when = L.fmtDate(L.addBusinessDays(today, days[i - 1])) + " (business day " + days[i - 1] + ")";
      else when = "Business day " + days[i - 1] + " after your talk";
      var link = null;
      if (done === 0 && w && !(i === 1 && v.kind === "callbackTime")) {
        var line = v.line === "mobile" ? "mobile" : "restaurant line";
        link = addLink("+ Calendar", L.gcalLink({
          ymd: L.ymdLocal(L.addBusinessDays(today, days[i - 1])), start: w.etStart, end: w.etStart + 15,
          title: "Callback " + i + " of " + C.callbackDials + " (" + zone.name + ", " + line + ")",
          details: "Owner asked for a callback. Call their " + line + " between " + L.windowText(w, zone) + ".\nAdd the restaurant name to this title, and set the Nooks reminder too."
        }), "Add callback " + i + " to Google Calendar");
      }
      var tr = el("tr", null, [
        el("td", { text: "Callback " + i + (i <= done ? " (done)" : i === n ? " (next)" : "") }),
        el("td", { text: when }),
        el("td", { text: (i === 1 && v.kind === "callbackTime") ? "Their time, converted to ET" : (w ? w.part + ": " + L.windowText(w, zone) : "\u2014") }),
        el("td", null, [link])
      ]);
      if (i === n) tr.querySelectorAll("td").forEach(function (td) { td.className = "now"; });
      rows.appendChild(tr);
    }
    return el("div", { class: "table-scroll plan-table" }, [el("table", null, [el("thead", null, [el("tr", null, [el("th", { text: "Callback" }), el("th", { text: "When" }), el("th", { text: "Call between" }), el("th", { text: "" })])]), rows])]);
  }

  var SIM = {
    start: { q: "Who did you reach?", options: [
      { label: "Nobody", next: "nobody" },
      { label: "Wrong person, or the number doesn't work", next: "badnum" },
      { label: "A gatekeeper (host, server, manager)", next: "gk" },
      { label: "The owner or decision-maker", next: "dm" },
      { label: "The cadence ended", next: "ce" },
      { label: "They didn't show up to the demo", next: "r_noshow" },
      { label: "Something else about this restaurant", next: "special" },
      { label: "This wasn't a prospecting call", next: "nonpro" }
    ] },

    nobody: { q: "What happened?", options: [
      { label: "It rang out", set: { s: "No Answer", d: "No Answer" }, next: "r_nobody" },
      { label: "Busy signal", set: { s: "Busy Signal", d: "No Answer" }, next: "r_nobody" },
      { label: "I left a voicemail", set: { s: "Left Voicemail", d: "Left Voicemail" }, next: "r_nobody" }
    ] },
    r_nobody: { result: function (v) { return { title: "Keep the cadence going", log: lg(v.d, v.s), flow: "3e",
      steps: [["Salesloft", "Nothing else to do. The cadence keeps going."], ["You", "Next time, try this contact at a different time of day."]] }; } },

    badnum: { q: "Which one?", options: [
      { label: "Someone answered, but it's the wrong person or restaurant", set: { s: "Wrong Number" }, next: "badnum2" },
      { label: "The number doesn't work", set: { s: "Not In Service" }, next: "badnum2" }
    ] },
    badnum2: { q: "Does this contact have another number?", options: [
      { label: "Yes", next: "r_bad_yes" }, { label: "No", next: "r_bad_no" }
    ] },
    r_bad_yes: { result: function (v) { return { title: "Mark it and try the other number", log: lg("Bad Number", v.s), flow: "3f",
      steps: [["Salesloft", "Mark this number as bad on the contact."], ["Salesloft", "Keep the cadence going on the other number."]] }; } },
    r_bad_no: { result: function (v) { return { title: "Remove this contact", log: lg("Bad Number", v.s), flow: "3f",
      steps: [["Salesloft", "Mark the number bad and remove the contact from the cadence."], ["Salesloft", "Check the account for other contacts still in a cadence. If there are none, pick the right reason from the reject reasons list above."]] }; } },

    gk: { q: "What did you get from the gatekeeper?", options: [
      { label: "The owner's name, a better number, or when they're usually in", next: "r_gk_info" },
      { label: "A specific time to call the owner", next: "r_gk_time" },
      { label: "Nothing useful", next: "r_gk_none" },
      { label: "They blocked me or hung up", next: "r_gk_refused" },
      { label: "They asked us to stop calling", set: { d: "Gatekeeper" }, next: "r_dnc" }
    ] },
    r_gk_info: { result: { title: "Save what you learned", log: lg("Gatekeeper", "GK Gave DM Info"), flow: "3d",
      steps: [["Salesloft", "Add the owner's name or better number to the contact. A new owner cell can go into the mobile cadence."], ["Nooks", "If they told you when the owner is in, set a reminder for then (in ET: Central +1 hour, Pacific +3 hours)."], ["Salesloft", "The cadence keeps running."]] } },
    r_gk_time: { result: { title: "Call the owner at that time", log: lg("Gatekeeper", "Gave Callback Time"), flow: "3d",
      steps: [["Nooks", "Set a reminder for that exact time, converted to ET (Central +1 hour, Pacific +3 hours)."], ["You", "Ask for the owner by name when you call."], ["Salesloft", "The cadence keeps running."]] } },
    r_gk_none: { result: { title: "Keep the cadence going", log: lg("Gatekeeper", "DM Not Available"), flow: "3d",
      steps: [["Salesloft", "The cadence keeps running."], ["You", "Next time, ask for the owner's name and the best time to reach them."]] } },
    r_gk_refused: { result: { title: "Keep the cadence going", log: lg("Gatekeeper", "Refused to Engage / Hung Up"), flow: "3d",
      steps: [["Salesloft", "The cadence keeps running."], ["You", "Try a different time of day. Avoid lunch rush and dinner service in their time zone."]] } },
    r_dnc: { result: function (v) { return { title: "Stop calling this contact", log: lg(v.d || DMC, "Asked Not to Be Called"), flow: "3g",
      auto: v.d === "Gatekeeper" ? null : AUTO_ONE,
      steps: [["Salesloft", "Remove the contact from all cadences now."], ["Salesforce", "Mark them Do Not Call."], ["You", "If they spoke for the whole restaurant, tell your manager."]] }; } },

    dm: { q: "How did the call end?", options: [
      { label: "They booked a demo", next: "r_demo" },
      { label: "I gave the full pitch on the phone", next: "r_phonepitch" },
      { label: "I transferred them live to an AE", next: "r_transfer" },
      { label: "They said no", next: "dm_no" },
      { label: "They asked me to call back", set: { s: "Gave Callback Time" }, next: "dm_cbtime" },
      { label: "They want an email first", set: { s: "Send Info Via Email", kind: "email" }, next: "cb_line" },
      { label: "They hung up before I could pitch", set: { s: "Hung Up Before Pitch", kind: "later" }, next: "cb_line" },
      { label: "We couldn't understand each other", next: "dm_lang" },
      { label: "They asked us to stop calling", set: { d: DMC }, next: "r_dnc" }
    ] },
    r_demo: { result: { title: "Book it and confirm", log: lg(DMC, "Demo Scheduled"), flow: "3a", auto: AUTO_ALL,
      steps: [["Salesforce", "Book the demo."], ["You", "Send the invite and a confirmation."], ["Salesloft", "Within the hour, check that every contact on the account left their cadence. If not, remove them and tell your manager."]] } },
    r_phonepitch: { result: { title: "Phone pitch done", log: lg(DMC, "Phone Pitch"), flow: "3a", auto: AUTO_ONE,
      steps: C.phonePitchNextSteps.map(function (s) { return ["You", s]; }) } },
    r_transfer: { result: { title: "Live transfer done", log: lg(DMC, "Live Call Transfer"), flow: "3a", auto: AUTO_ONE,
      steps: C.liveTransferNextSteps.map(function (s) { return ["You", s]; }) } },

    dm_no: { q: "Why did they say no?", options: [
      { label: "Not interested", set: { s: "Not Interested" }, next: "dm_no_scope" },
      { label: "Not right now (busy season, opening, renovating)", set: { s: "Timing Not Right" }, next: "dm_no_scope" },
      { label: "They're already full", set: { s: "Fully Booked" }, next: "dm_no_scope" },
      { label: "They use a competitor", set: { s: "Using Competitor" }, next: "dm_no_scope" }
    ] },
    dm_no_scope: { q: "Does their answer apply to the whole restaurant?", help: "For example, they're the only owner, or they spoke for everyone.", options: [
      { label: "Yes", next: "r_no_whole" }, { label: "No", next: "dm_no_other" }, { label: "Not sure", next: "dm_no_other" }
    ] },
    dm_no_other: { q: "Is there another contact who could say yes (a partner, another owner, a GM)?", options: [
      { label: "Yes", next: "r_no_other" }, { label: "No", next: "r_no_whole" }
    ] },
    r_no_whole: { result: function (v) { return { title: "Close out the account", log: lg(DMC, v.s), flow: "3b", auto: AUTO_ONE,
      steps: [["Salesloft", "Remove every other contact on the account from their cadences."], ["Salesforce", "Temporarily Reject the account with " + q(reason(noReasonFor[v.s])) + ". " + rejectNoteTxt]] }; } },
    r_no_other: { result: function (v) { return { title: "Try the other contact", log: lg(DMC, v.s), flow: "3b", auto: AUTO_ONE,
      steps: [["Salesloft", "Keep the other contact's cadence running, or add them if they aren't in one."], ["You", "Use what this owner told you on your next call."]] }; } },

    dm_cbtime: { q: "Did they give you a specific time?", options: [
      { label: "Yes", set: { kind: "callbackTime" }, next: "cb_line" }, { label: "No, just \u201ccall me later\u201d", set: { kind: "later" }, next: "cb_line" }
    ] },
    cb_line: { q: "Which number will you call them back on?", options: [
      { label: "Their mobile", set: { line: "mobile" }, next: "cb_zone" }, { label: "The restaurant line", set: { line: "restaurant" }, next: "cb_zone" }
    ] },
    cb_zone: { q: "What time zone is the restaurant in?", options: function () {
      return C.zones.map(function (z) { return { label: z.name, set: { zone: z.name }, next: "cb_count" }; });
    } },
    cb_count: { q: "How many callbacks have you already made to them?", help: "Count only calls after the conversation you just picked.", options: function () {
      var o = []; for (var i = 0; i <= C.callbackDials; i++) o.push({ label: String(i), set: { count: i }, next: i >= C.callbackDials ? "cb_reached" : "r_cb_next" });
      return o;
    } },
    r_cb_next: { result: function (v) {
      var n = v.count + 1, zone = zoneByName(v.zone), w = L.callbackWindow(v.line, zone, n);
      var steps = [["Salesforce", "Check the account shows DM Connect. It's set automatically when you log " + q(DMC) + "."]];
      if (v.kind === "email" && v.count === 0) steps.push(["You", "Send the email today."]);
      if (n === 1 && v.kind === "callbackTime") steps.push(["Nooks", "Set a reminder for the exact time they gave you, converted to ET (Central +1 hour, Pacific +3 hours)."]);
      else steps.push(["Nooks", "Set a reminder for callback " + n + ": " + (w ? w.part.toLowerCase() + ", " + L.windowText(w, zone) : "ask your manager for a time") + "."]);
      if (w && w.fallback) steps.push(["You", "Their best window falls outside your 9\u20136 day, so this is the closest good time."]);
      steps.push(["You", "If you reach them, log that call and start over here."]);
      return { title: "Next up: callback " + n + " of " + C.callbackDials, log: v.count === 0 ? lg(DMC, v.s) : "Log each callback by what happened on it", flow: "3c", auto: v.count === 0 ? AUTO_ONE : null, steps: steps, extra: callbackPlan(v) };
    } },
    cb_reached: { q: "Did you reach them on any of those callbacks?", options: [
      { label: "Yes", next: "r_reached" }, { label: "No", next: "cb_other" }
    ] },
    r_reached: { result: { title: "Log that call instead", restartLabel: "Start over with that call", steps: ["Start over and pick what happened on the call where you reached them."] } },
    cb_other: { q: "Is another contact on this account still worth working?", options: [
      { label: "Yes", next: "r_cb_other" }, { label: "No", next: "r_cb_failed" }
    ] },
    r_cb_other: { result: { title: "Move on to the other contact", log: null, flow: "3c",
      steps: [["Salesloft", "Keep that contact's cadence running."], ["You", "This owner is done. Don't add more callbacks."]] } },
    r_cb_failed: { result: { title: "Close out the account", log: null, flow: "3c",
      steps: [["Salesloft", "Remove any other contacts still in cadences."], ["Salesforce", "Temporarily Reject the account with " + q(reason("DM Connect, Failed to Reconnect")) + ". " + rejectNoteTxt]] } },

    dm_lang: { q: "Is there another contact you could talk to?", options: [
      { label: "Yes", next: "r_lang_other" }, { label: "No", next: "r_lang_no" }
    ] },
    r_lang_other: { result: { title: "Try the other contact", log: lg(DMC, "Language Barrier"), flow: "3b", auto: AUTO_ONE,
      steps: [["Salesloft", "Keep the other contact's cadence running, or add them."]] } },
    r_lang_no: { result: { title: "Close out the account", log: lg(DMC, "Language Barrier"), flow: "3b", auto: AUTO_ONE,
      steps: [["Salesloft", "Remove any other contacts from their cadences."], ["Salesforce", "Temporarily Reject the account with " + q(reason("Language Barrier")) + ". " + rejectNoteTxt]] } },

    ce: { q: "Are other contacts on this account still in a cadence?", options: [
      { label: "Yes", next: "r_ce_keep" }, { label: "No", next: "ce_dm" }
    ] },
    r_ce_keep: { result: { title: "Keep working the other contacts", log: null, flow: "3h",
      steps: [["Salesloft", "Let their cadences run. Decide on the account once they finish."]] } },
    ce_dm: { q: "Did you ever talk to the owner?", options: [
      { label: "Yes", next: "ce_dm_yes" }, { label: "No", next: "ce_any" }
    ] },
    ce_dm_yes: { q: "What happened with the owner?", options: [
      { label: "They said no", next: "dm_no" },
      { label: "I made all 5 callbacks and never reached them again", next: "r_cb_failed" },
      { label: "I haven't finished the 5 callbacks", set: { s: "Gave Callback Time", kind: "later" }, next: "cb_line" }
    ] },
    ce_any: { q: "Did anyone pick up during the cadence?", help: "A host, server or manager counts.", options: [
      { label: "Yes", next: "r_ce_gk" }, { label: "No", next: "r_ce_human" }
    ] },
    r_ce_gk: { result: { title: "Close out the account", log: null, flow: "3h",
      steps: [["Salesforce", "Temporarily Reject the account with " + q(reason("GK Connect, Unable to Reach DM")) + ". " + rejectNoteTxt]] } },
    r_ce_human: { result: { title: "Close out the account", log: null, flow: "3h",
      steps: [["Salesforce", "Temporarily Reject the account with " + q(reason("Unable to connect to a human")) + ". " + rejectNoteTxt]] } },

    r_noshow: { result: { title: "Try to rebook", log: null, flow: "3j", steps: C.noShowStep.map(function (s) { return ["Salesloft", s]; }) } },

    special: { q: "What's going on with the restaurant?", options: [
      { label: "Closed for now, reopening later", next: "r_tempclosed" },
      { label: "Closed for good, or should never be sold to", next: "sp_perm" },
      { label: "They used to be a Seated partner", next: "r_churned" },
      { label: "They signed but never launched", next: "r_failedob" },
      { label: "They took a demo but didn't sign", next: "r_clheld" },
      { label: "They booked a demo that never happened", next: "r_cldnh" },
      { label: "They're always full", next: "r_full" }
    ] },
    sp_perm: { q: "Is it permanent? For example, closed for good.", options: [
      { label: "Yes, permanent", next: "r_dnq" }, { label: "No, or not sure", next: "r_dnq_no" }
    ] },
    r_dnq: { result: { title: "Mark it Does Not Qualify", log: null, flow: "3i",
      steps: [["Salesloft", "Remove every contact on the account from their cadences."], ["Salesforce", "Mark the account Does Not Qualify. This is permanent."]] } },
    r_dnq_no: { result: { title: "Don't use Does Not Qualify", log: null, flow: "3i",
      steps: [["Salesforce", "Temporarily Reject with the reason that fits (see the reject reasons list above). " + rejectNoteTxt], ["You", "If you're unsure, ask your manager."]] } },
    r_tempclosed: { result: { title: "Temporarily Reject it", log: null, flow: "3i",
      steps: [["Salesloft", "Remove every contact from their cadences."], ["Salesforce", "Temporarily Reject with " + q(reason("Temp Closed")) + ". " + rejectNoteTxt]] } },
    r_churned: { result: { title: "Temporarily Reject it", log: null,
      steps: [["Salesloft", "Remove every contact from their cadences."], ["Salesforce", "Temporarily Reject with " + q(reason("Churned Partner")) + "."]] } },
    r_failedob: { result: { title: "Temporarily Reject it", log: null,
      steps: [["Salesloft", "Remove every contact from their cadences."], ["Salesforce", "Temporarily Reject with " + q(reason("Failed OB")) + "."]] } },
    r_clheld: { result: { title: "Temporarily Reject it", log: null,
      steps: [["Salesforce", "Temporarily Reject with " + q(reason("CL Opportunity (Held Demo)")) + "."]] } },
    r_cldnh: { result: { title: "Rebook first, then reject", log: null, flow: "3j",
      steps: [["Salesloft", "If you haven't yet, try to rebook through the Missed Meeting cadence."], ["Salesforce", "If rebooking failed, Temporarily Reject with " + q(reason("CL Opportunity (Did Not Hold)")) + "."]] } },
    r_full: { result: { title: "Temporarily Reject it", log: null, flow: "3b",
      steps: [["Salesloft", "Remove every contact from their cadences."], ["Salesforce", "Temporarily Reject with " + q(reason("Fully Booked (Lilia, 4 Charles, etc.)")) + ". " + rejectNoteTxt]] } },

    nonpro: { q: "What kind of call was it?", options: [
      { label: "Following up on a deal that's already open", set: { d: "Existing Opportunity", s: "Existing Opp - Following Up" }, next: "r_nonpro" },
      { label: "Rescheduling a demo", set: { d: "Existing Opportunity", s: "Existing Opp - Rescheduling" }, next: "r_nonpro" },
      { label: "Partner paperwork", set: { d: "MIDS/Billing/TOS", s: "MIDS/Billing/TOS Completed" }, next: "r_nonpro" },
      { label: "A partner who's leaving", set: { d: "Churn Call", s: "" }, next: "r_nonpro" },
      { label: "Checking in with a partner", set: { d: "Partner Check In", s: "" }, next: "r_nonpro" },
      { label: "A colleague", set: { d: "Internal", s: "Internal" }, next: "r_nonpro" }
    ] },
    r_nonpro: { result: function (v) { return { title: "Log it and move on", log: lg(v.d, v.s),
      steps: ["These calls don't count toward your prospecting numbers."] }; } }
  };

  // =====================================================================
  // TAB 2
  // =====================================================================
  var STORE_KEY = "repPlaybook.v1";
  var state = { day: null, days: {}, cal: { connected: false } };
  var token = null, calMsg = null;
  function load() {
    try { var s = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); if (s && s.days) state = s; } catch (e) { /* storage blocked */ }
    if (!state.cal) state.cal = { connected: false };
    if (!state.day) { var w = new Date().getDay(); state.day = (w >= 1 && w <= 5) ? w : 1; }
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ } }
  function dayData(d) {
    d = d || state.day;
    if (!state.days[d]) state.days[d] = { items: [], callbacksDue: 0, mobileTasks: 0, restaurantTasks: 0 };
    var x = state.days[d];
    if (x.mobileTasks == null) x.mobileTasks = 0;
    if (x.restaurantTasks == null) x.restaurantTasks = 0;
    return state.days[d];
  }
  var DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];
  function calFresh() {
    if (!state.cal.connected || !state.cal.week) return false;
    return state.cal.week[1] === L.planWeek(new Date())[1];
  }
  function calItems(d) {
    d = d || state.day;
    if (!calFresh()) return [];
    var hidden = state.cal.hidden || [];
    return ((state.cal.items || {})[d] || []).map(function (it) { it.ignored = hidden.indexOf(it.id) >= 0; return it; });
  }
  // Every meeting on the day, including ones the rep chose to ignore.
  function listItems(d) { d = d || state.day; return dayData(d).items.concat(calItems(d)); }
  // Only the meetings that block time.
  function allItems(d) { return listItems(d).filter(function (it) { return !it.ignored; }); }
  // The real date of a weekday (1-5) in the week being planned.
  function dayYmd(d) { return calFresh() ? state.cal.week[d] : L.planWeek(new Date())[d]; }
  function blockOnCal(d, b) {
    if (!calFresh()) return false;
    return ((state.cal.blocks || {})[d] || []).some(function (x) { return x.start <= b.start && x.end >= b.end; });
  }
  function addLink(text, href, label) {
    return el("a", { class: "cal-add", href: href, target: "_blank", rel: "noopener", "aria-label": label, text: text });
  }
  function blockLinkEl(b) {
    var bt = C.blockTypes[b.type];
    if (blockOnCal(state.day, b)) return el("span", { class: "cal-add on", text: "\u2713 On calendar" });
    var who = L.whoLine(b);
    return addLink("+ Calendar", L.gcalLink({
      ymd: dayYmd(state.day), start: b.start, end: b.end,
      title: bt.dials ? "Calling: " + bt.label + (b.zones.length ? " (" + b.zones.join(" + ") + ")" : "") : bt.label,
      details: [who, bt.why, "", C.calendarBlockTag].join("\n")
    }), "Add " + bt.label + " " + L.fmtRange(b.start, b.end) + " to Google Calendar");
  }
  function setIgnored(it, on) {
    if (it.source === "calendar") {
      var h = (state.cal.hidden || []).filter(function (id) { return id !== it.id; });
      if (on) h.push(it.id);
      state.cal.hidden = h;
    }
    it.ignored = !!on;
  }
  // ymd (optional): the real date being planned. Calendar events only apply to dates in the loaded week.
  function planFor(d, ymd) {
    var dd = dayData(d);
    var useCal = !ymd || !calFresh() || state.cal.week[d] === ymd;
    var plan = L.buildDay({ day: d, items: useCal ? allItems(d) : dd.items, });
    var tasks = dd.mobileTasks + dd.restaurantTasks;
    return { plan: plan, est: L.estimate(plan, 0, tasks), target: tasks };
  }

  function renderDayToggle() {
    var box = $("day-toggle"); box.innerHTML = "";
    for (var d = 1; d <= 5; d++) (function (d) {
      var n = allItems(d).length;
      var label = DAYS[d];
      if (calFresh()) { var dt = state.cal.week[d]; label += " " + Number(dt.slice(5, 7)) + "/" + Number(dt.slice(8, 10)); }
      var b = el("button", { type: "button", "aria-pressed": String(state.day === d), onclick: function () { state.day = d; save(); renderDay(); } }, [label]);
      if (n) b.appendChild(el("span", { class: "badge", text: n + (n === 1 ? " meeting" : " meetings") }));
      box.appendChild(b);
    })(d);
  }

  function renderItems() {
    var ul = $("items"); ul.innerHTML = "";
    var dd = dayData();
    var rows = dd.items.map(function (it, i) { return { it: it, i: i }; }).concat(calItems().map(function (it) { return { it: it, cal: true }; }));
    rows.sort(function (a, b) { return a.it.start - b.it.start; }).forEach(function (o) {
      var it = o.it;
      var sel = el("select", { "aria-label": "How to treat " + it.label });
      sel.appendChild(el("option", { value: "meeting", text: "Meeting" }));
      sel.appendChild(el("option", { value: "callback", text: "Agreed callback" }));
      sel.appendChild(el("option", { value: "ignore", text: "Ignore (call during it)" }));
      sel.value = it.ignored ? "ignore" : it.type;
      if (it.origEnd == null) it.origEnd = it.end;
      sel.addEventListener("change", function () {
        if (sel.value === "ignore") { setIgnored(it, true); }
        else {
          setIgnored(it, false);
          it.type = sel.value;
          if (it.type === "callback") it.end = it.start + 15; else if (it.origEnd) it.end = it.origEnd;
        }
        save(); renderDay();
      });
      var t = it.type === "callback" ? L.fmt(it.start) : L.fmtRange(it.start, it.end);
      var del = o.cal ? el("span", { "aria-hidden": "true" }) :
        el("button", { class: "icon-btn", type: "button", "aria-label": "Remove " + it.label + " at " + t, title: "Remove", text: "\u00d7", onclick: function () { dd.items.splice(o.i, 1); save(); renderDay(); } });
      ul.appendChild(el("li", { class: it.ignored ? "ignored" : null }, [
        el("span", null, [el("strong", { text: t }), " " + it.label,
          L.demoKind(it) ? el("span", { class: "src-tag demo-tag", text: L.demoKind(it) }) : null,
          o.cal ? el("span", { class: "src-tag", text: "Calendar" }) : null,
          it.ignored ? el("span", { class: "hint", style: "display:block;margin:0", text: "Ignored: this time is calling time." }) : null]),
        sel,
        del
      ]));
    });
  }

  var LOCK = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5" width="8" height="6" rx="1" fill="currentColor"/><path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';

  function renderCalendar(plan) {
    var cal = $("calendar"); cal.innerHTML = "";
    var slotPx = 30, start = L.toMin(C.dayStart), end = L.toMin(C.dayEnd);
    var px = function (min) { return (min - start) / C.slotMinutes * slotPx; };
    cal.style.height = px(end) + "px";
    var hours = el("div", { class: "cal-hours", "aria-hidden": "true" });
    for (var t = start; t <= end; t += 60) hours.appendChild(el("div", { style: "top:" + px(t) + "px", text: L.fmt(t).replace(":00", "") }));
    cal.appendChild(hours);
    var list = el("ol", { style: "list-style:none;margin:0;padding:0", "aria-label": "Your day, " + C.repTimezoneLabel });
    L.blocks(plan).forEach(function (b) {
      var h = px(b.end) - px(b.start);
      var cls = "cal-block t-" + (b.type === "fixed" ? "fixed" : b.type);
      var li = el("li", { class: cls, style: "top:" + (px(b.start) + 1) + "px;height:" + (h - 2) + "px" });
      var title, why = "", who = "";
      if (b.type === "fixed") {
        var f = b.fixed;
        var dk = f.kind === "meeting" ? L.demoKind(f.item || f.label) : null;
        title = f.kind === "callback" ? "Agreed callback: " + f.label : (dk && !L.hasWord(f.label, [dk]) ? dk + ": " : "") + f.label;
        li.appendChild(el("div", { class: "b-title", html: LOCK + "<span></span>" }));
        li.lastChild.lastChild.textContent = title;
        var ft = f.kind === "callback" ? L.fmt(f.start) : L.fmtRange(f.start, f.end);
        li.lastChild.appendChild(el("span", { class: "b-time", text: ft }));
      } else {
        var bt = C.blockTypes[b.type];
        title = bt.label + (b.moved ? " (moved)" : "");
        why = bt.why; who = L.whoLine(b);
        var addEl = (bt.dials || b.type === "practice" || b.type === "leads") ? blockLinkEl(b) : null;
        li.appendChild(el("div", { class: "b-title" }, [addEl, title, el("span", { class: "b-time", text: L.fmtRange(b.start, b.end) })]));
        if (who && h >= 44) li.appendChild(el("div", { class: "b-who", text: who }));
        if (h >= 88) li.appendChild(el("div", { class: "b-why", text: why }));
        li.setAttribute("title", [title, L.fmtRange(b.start, b.end) + " ET", who, why].filter(Boolean).join("\n"));
      }
      list.appendChild(li);
    });
    cal.appendChild(list);
  }

  function renderLegend() {
    var lg = $("legend"); lg.innerHTML = "";
    ["prep", "practice", "callbacks", "mobile", "restaurant", "prime", "sweep", "lunch", "break", "leads", "wrap"].forEach(function (t) {
      lg.appendChild(el("span", null, [el("i", { class: "t-" + t }), C.blockTypes[t].label]));
    });
    lg.appendChild(el("span", null, [el("i", { class: "t-fixed" }), "Meetings and agreed callbacks (fixed)"]));
  }

  function describeChanges(plan, est) {
    var msgs = [];
    var blocksNow = L.blocks(plan);
    blocksNow.filter(function (b) { return b.moved && b.type !== "fixed"; }).forEach(function (b) {
      var w = L.whoLine(b), when = L.fmtRange(b.start, b.end), tail = w ? " " + w.charAt(0).toLowerCase() + w.slice(1) + "." : "";
      if (b.type === "prime" || b.type === "restaurant") msgs.push("Restaurant-line time your meetings covered moved to " + when + "." + (w ? " You're " + w.charAt(0).toLowerCase() + w.slice(1) + "." : ""));
      else msgs.push(C.blockTypes[b.type].label + " moved to " + when + "." + (w ? " You're " + w.charAt(0).toLowerCase() + w.slice(1) + "." : ""));
    });
    var lost = {};
    plan.slots.forEach(function (s) { if (s.fixed && s.base && C.blockTypes[s.base].dials) lost[s.base] = (lost[s.base] || 0) + C.slotMinutes; });
    var gained = {};
    plan.slots.forEach(function (s) { if (!s.fixed && s.moved) gained[s.type] = (gained[s.type] || 0) + C.slotMinutes; });
    plan.slots.forEach(function (s) { if (!s.fixed && s.moved && s.base && s.base !== s.type && C.blockTypes[s.base].dials) lost[s.base] = (lost[s.base] || 0) + C.slotMinutes; });
    Object.keys(lost).forEach(function (t) {
      var net = lost[t] - (gained[t] || 0);
      if (net > 0 && (t === "mobile" || t === "restaurant")) msgs.push("You lose " + L.dur(net) + " of " + C.blockTypes[t].label.toLowerCase() + " time today.");
    });
    plan.notes.forEach(function (n) { msgs.push(n); });
    msgs.push("You have " + L.dur(est.callingMinutes) + " of calling time today.");
    return msgs;
  }

  function callbackCount() {
    if (calFresh()) return allItems().filter(function (it) { return it.type === "callback"; }).length;
    return dayData().callbacksDue + dayData().items.filter(function (it) { return it.type === "callback" && !it.ignored; }).length;
  }
  // Minutes of calling time by kind: from blocks on the calendar, or from the plan if not connected.
  function capacity(cur) {
    var cap = { mobile: 0, restaurant: 0, flex: 0 };
    if (calFresh()) {
      ((state.cal.blocks || {})[state.day] || []).forEach(function (b) {
        var k = b.kind || "flex"; if (k === "other") return;
        cap[k] += Math.max(0, b.end - b.start);
      });
      return { cap: cap, source: "calendar" };
    }
    L.blocks(cur.plan).forEach(function (b) {
      var m = b.end - b.start;
      if (b.type === "mobile") cap.mobile += m;
      else if (b.type === "restaurant" || b.type === "prime") cap.restaurant += m;
      else if (b.type === "callbacks" || b.type === "sweep") cap.flex += m;
    });
    return { cap: cap, source: "plan" };
  }
  function renderTaskCheck(cur) {
    var dd = dayData(), box = $("task-check"); box.innerHTML = "";
    var cf = $("callback-field"); cf.innerHTML = "";
    var cbs = callbackCount();
    if (calFresh()) {
      cf.appendChild(el("span", { class: "label-like", style: "font-weight:600;font-size:0.93rem;display:block;margin:12px 0 4px", text: "Callback tasks" }));
      cf.appendChild(el("div", { class: "auto", text: String(cbs) }));
      cf.appendChild(el("p", { class: "hint", text: "From your calendar" }));
    } else {
      var inp = el("input", { type: "number", id: "callbacks-due", min: "0", max: "200", step: "1", value: String(dd.callbacksDue) });
      inp.addEventListener("input", function () { dd.callbacksDue = Math.max(0, Number(inp.value) || 0); save(); renderDay(); var n = $("callbacks-due"); if (n) { n.focus(); n.setSelectionRange && n.type === "text" && n.setSelectionRange(99, 99); } });
      cf.appendChild(el("label", { for: "callbacks-due", text: "Callback tasks" }));
      cf.appendChild(inp);
      cf.appendChild(el("p", { class: "hint", text: "Connect your calendar to count these automatically." }));
    }
    var c = capacity(cur);
    var chk = L.taskCheck({ mobileTasks: dd.mobileTasks, restaurantTasks: dd.restaurantTasks, callbacks: cbs, cap: c.cap });
    var total = dd.mobileTasks + dd.restaurantTasks + cbs;
    if (!total) { box.appendChild(el("p", { class: "hint", text: "Enter your call tasks to check them against " + (c.source === "calendar" ? "the calling time on your calendar." : "today's plan.") + " Team target: " + C.defaultDialTarget + " dials a day." })); return; }

    var src = c.source === "calendar" ? "Calling time on your calendar" : "Calling time in today's plan";
    function row(label, r, minutes) {
      return el("tr", null, [el("td", { text: label }), el("td", { class: "num", text: String(r.tasks) }), el("td", { class: "num", text: minutes ? L.dur(minutes) : "None" }),
        el("td", { class: "num", text: String(r.capacity) }),
        el("td", { class: r.short > 0 ? "bad" : "ok", text: r.short > 0 ? r.short + " won't fit" : "Fits" })]);
    }
    var tb = el("tbody", null, [row("Mobile", chk.mobile, c.cap.mobile), row("Restaurant", chk.restaurant, c.cap.restaurant)]);
    if (c.cap.flex) tb.appendChild(el("tr", null, [el("td", { text: "Callback and general call blocks" }), el("td", { class: "num", text: "\u2014" }), el("td", { class: "num", text: L.dur(c.cap.flex) }), el("td", { class: "num", text: String(chk.flexCapacity) }), el("td", { class: "hint", text: "Covers overflow from either" })]));
    tb.appendChild(el("tr", null, [el("td", { text: "Callbacks" }), el("td", { class: "num", text: String(cbs) }), el("td", { class: "num", text: "At their own times" }), el("td", { class: "num", text: String(cbs) }), el("td", { class: "ok", text: cbs ? "Fits" : "\u2014" })]));
    box.appendChild(el("div", { class: "table-scroll", style: "margin-top:14px" }, [el("table", { class: "check-table" }, [
      el("thead", null, [el("tr", null, [el("th", { text: "Call tasks" }), el("th", { class: "num", text: "Tasks" }), el("th", { class: "num", text: src }), el("th", { class: "num", text: "Can dial" }), el("th", { text: "" })])]), tb])]));

    var shortTotal = Math.max(0, chk.mobile.short) + Math.max(0, chk.restaurant.short);
    if (shortTotal > 0) {
      var needMin = Math.ceil(shortTotal / C.dialsPerHour * 60 / 15) * 15;
      var v = el("div", { class: "verdict short", text: "You won't get through " + shortTotal + " of your tasks. " + (c.source === "calendar"
        ? "Add about " + L.dur(needMin) + " of calling time to your calendar, then click Refresh."
        : "Today's plan only has room for about " + chk.dials + " dials. Move a meeting or carry the rest to tomorrow.") });
      box.appendChild(v);
      if (c.source === "calendar") {
        var want = [];
        if (chk.mobile.short > 0) want.push("mobile");
        if (chk.restaurant.short > 0) want.push("restaurant", "prime");
        var cands = L.blocks(cur.plan).filter(function (b) { return want.indexOf(b.type) >= 0 && !blockOnCal(state.day, b); });
        if (cands.length) {
          box.appendChild(el("p", { style: "margin:8px 0 0", text: "From today's plan:" }));
          var ul = el("ul", { class: "add-list" });
          cands.forEach(function (b) { ul.appendChild(el("li", null, [C.blockTypes[b.type].label + " " + L.fmtRange(b.start, b.end), blockLinkEl(b)])); });
          box.appendChild(ul);
        }
      }
    } else if (chk.idleMinutes >= 15) {
      var idle = L.dur(Math.floor(chk.idleMinutes / 5) * 5);
      box.appendChild(el("div", { class: "verdict idle", text: c.source === "calendar"
        ? "You'll have about " + idle + " of calling time on your calendar with nothing to call. Pull more call tasks, or use the time to clean leads."
        : "Today's plan has about " + idle + " more calling time than your tasks need. Only book the blocks you need, or pull more call tasks." }));
    } else {
      box.appendChild(el("div", { class: "verdict good", text: "Your " + (c.source === "calendar" ? "calendar" : "plan") + " fits today's call tasks." }));
    }
    if (c.source === "plan") box.appendChild(el("p", { class: "hint", text: "This assumes you follow today's plan. Connect your calendar to check against the calling blocks you've actually booked." }));

    var focusMin = Math.round(chk.dials / C.dialsPerHour * 60 / 5) * 5;
    box.appendChild(el("div", { class: "task-summary" }, [
      el("div", null, [el("div", { class: "big", text: chk.expected.toFixed(1) }), el("div", { class: "hint", text: "expected meetings" })]),
      el("div", null, [el("div", { class: "big", text: String(chk.dials) }), el("div", { class: "hint", text: "dials (team target " + C.defaultDialTarget + ")" })]),
      el("div", null, [el("div", { class: "big", text: L.dur(focusMin).replace(" hours", "h").replace(" hour", "h").replace(" minutes", "m") }), el("div", { class: "hint", text: "of focused dialing at " + C.dialsPerHour + " an hour" })])
    ]));
  }

  function renderToday(cur) {
    var box = $("today"); box.innerHTML = "";
    var tips = L.suggest({ plan: cur.plan, est: cur.est, items: allItems(), day: state.day });
    var allDay = calFresh() ? ((state.cal.allDay || {})[state.day] || []) : [];
    allDay.forEach(function (a) { tips.unshift({ text: (a.outOfOffice ? "You're marked out of office: " : "All-day event: ") + q(a.label) + ". If you're not calling today, ignore this plan." }); });
    var ignored = listItems().filter(function (it) { return it.ignored; }).map(function (it) {
      return "Ignoring " + q(it.label) + " (" + (it.type === "callback" ? L.fmt(it.start) : L.fmtRange(it.start, it.end)) + "). That time is calling time.";
    });
    var notes = ignored.concat(describeChanges(cur.plan, cur.est));
    box.appendChild(el("h3", { text: "Today" }));
    var ul = el("ul");
    tips.forEach(function (t) {
      var li = el("li", { class: "tip", text: t.text });
      if (t.item && t.item.link) { li.appendChild(document.createTextNode(" ")); li.appendChild(addLink("Open meeting", t.item.link, "Open " + t.item.label + " in Google Calendar")); }
      ul.appendChild(li);
    });
    notes.forEach(function (t) { ul.appendChild(el("li", { text: t })); });
    box.appendChild(ul);
  }

  // ---------- Google Calendar ----------
  function calStatus(text, isErr) { calMsg = text ? { text: text, err: !!isErr } : null; renderCalBox(); }
  function renderCalBox() {
    var box = $("cal-box"); if (!box) return; box.innerHTML = "";
    if (!C.googleClientId) {
      box.appendChild(el("p", { class: "hint", text: "Calendar connection isn't set up yet. Your manager adds it once (see the README). Until then, add your meetings below." }));
      return;
    }
    if (calMsg) box.appendChild(el("p", { class: "cal-status" + (calMsg.err ? " err" : ""), text: calMsg.text }));
    var actions = el("div", { class: "cal-actions" });
    if (state.cal.connected && calFresh()) {
      var w = state.cal.week, n = Object.keys(state.cal.items || {}).reduce(function (a, k) { return a + state.cal.items[k].length; }, 0);
      if (!calMsg) box.appendChild(el("p", { class: "cal-status", text: "Showing " + n + (n === 1 ? " meeting" : " meetings") + " from your Google Calendar for " + fmtYmd(w[1]) + "\u2013" + fmtYmd(w[5]) + ". Updated " + new Date(state.cal.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + "." }));
      actions.appendChild(el("button", { class: "btn", type: "button", text: "Refresh", onclick: function () { if (token) fetchWeek(); else connect(); } }));
      actions.appendChild(el("button", { class: "btn", type: "button", text: "Disconnect", onclick: disconnect }));
    } else {
      if (!calMsg) box.appendChild(el("p", { class: "hint", text: state.cal.connected ? "Reconnect to load this week's meetings." : "Pull this week's meetings in automatically. Read-only: the site can see your events but can't change them, and they stay in this browser." }));
      actions.appendChild(el("button", { class: "btn btn-primary", type: "button", text: state.cal.connected ? "Reconnect Google Calendar" : "Connect my Google Calendar", onclick: connect }));
    }
    box.appendChild(actions);
  }
  function fmtYmd(ymd) { return Number(ymd.slice(5, 7)) + "/" + Number(ymd.slice(8, 10)); }
  function loadGis(cb) {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return cb();
    var sc = document.createElement("script");
    sc.src = "https://accounts.google.com/gsi/client"; sc.async = true;
    sc.onload = cb;
    sc.onerror = function () { calStatus("Couldn't reach Google. Check your internet connection and try again.", true); };
    document.head.appendChild(sc);
  }
  function connect() {
    if (location.protocol === "file:") {
      calStatus("Google sign-in only works when the site is opened from a web address (GitHub Pages, or localhost for testing), not by double-clicking the file. See the README.", true);
      return;
    }
    calStatus("Opening Google sign-in\u2026");
    loadGis(function () {
      try {
        var client = window.google.accounts.oauth2.initTokenClient({
          client_id: C.googleClientId,
          scope: C.calendarScope,
          callback: function (resp) {
            if (resp.error) { calStatus("Google didn't give access: " + resp.error + ".", true); return; }
            token = resp.access_token; state.cal.connected = true; save(); fetchWeek();
          },
          error_callback: function (e) {
            calStatus(e && e.type === "popup_closed" ? "Sign-in was closed before it finished. Click Connect to try again." :
              e && e.type === "popup_failed_to_open" ? "Your browser blocked the sign-in pop-up. Allow pop-ups for this site and try again." :
              "Sign-in didn't work. Try again.", true);
          }
        });
        client.requestAccessToken({ prompt: state.cal.connected ? "" : "consent" });
      } catch (err) { calStatus("Sign-in didn't start. Check the client ID in config.js.", true); }
    });
  }
  function fetchWeek() {
    var week = L.planWeek(new Date());
    var from = new Date(week[1] + "T00:00:00Z"); from.setUTCDate(from.getUTCDate() - 1);
    var to = new Date(week[5] + "T00:00:00Z"); to.setUTCDate(to.getUTCDate() + 2);
    var url = "https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250" +
      "&timeMin=" + encodeURIComponent(from.toISOString()) + "&timeMax=" + encodeURIComponent(to.toISOString()) +
      "&fields=" + encodeURIComponent("items(id,summary,description,htmlLink,start,end,status,transparency,eventType,attendees(email,self,resource,responseStatus))");
    calStatus("Loading your meetings\u2026");
    fetch(url, { headers: { Authorization: "Bearer " + token } }).then(function (r) {
      if (r.status === 401) { token = null; throw new Error("Your Google sign-in expired. Click Reconnect."); }
      if (r.status === 403) throw new Error("Google blocked access. Your Workspace admin may need to allow this app (see the README).");
      if (!r.ok) throw new Error("Google Calendar didn't respond (" + r.status + "). Try again in a minute.");
      return r.json();
    }).then(function (data) {
      var byDate = {}; Object.keys(week).forEach(function (d) { byDate[week[d]] = +d; });
      var items = { 1: [], 2: [], 3: [], 4: [], 5: [] }, allDay = { 1: [], 2: [], 3: [], 4: [], 5: [] }, blocks = { 1: [], 2: [], 3: [], 4: [], 5: [] };
      (data.items || []).forEach(function (ev) {
        var r = L.eventToItem(ev);
        if (r.block) { if (byDate[r.block.date]) blocks[byDate[r.block.date]].push(r.block); }
        else if (r.item && byDate[r.item.date]) items[byDate[r.item.date]].push(r.item);
        else if (r.allDay && byDate[r.date]) allDay[byDate[r.date]].push({ label: r.label, outOfOffice: r.outOfOffice });
      });
      var keepHidden = (state.cal.hidden || []).filter(function (id) { return Object.keys(items).some(function (d) { return items[d].some(function (it) { return it.id === id; }); }); });
      state.cal = { connected: true, week: week, items: items, allDay: allDay, blocks: blocks, hidden: keepHidden, fetchedAt: Date.now() };
      save(); calMsg = null; renderDay();
    }).catch(function (err) { calStatus(err.message || "Couldn't load your calendar.", true); });
  }
  function disconnect() {
    try { if (token && window.google) window.google.accounts.oauth2.revoke(token, function () {}); } catch (e) { /* ignore */ }
    token = null; state.cal = { connected: false }; save(); calMsg = null; renderDay();
  }

  function renderDay() {
    renderDayToggle();
    var dd = dayData();
    if (document.activeElement !== $("mobile-tasks")) $("mobile-tasks").value = dd.mobileTasks || "";
    if (document.activeElement !== $("restaurant-tasks")) $("restaurant-tasks").value = dd.restaurantTasks || "";
    renderItems();
    var cur = planFor(state.day);
    renderCalendar(cur.plan);
    renderToday(cur);
    renderTaskCheck(cur);
    renderCalBox();
  }

  function initDay() {
    load();
    renderLegend();
    $("add-one").addEventListener("click", function () {
      var errs = $("add-errors"); errs.innerHTML = "";
      var s = $("add-start").value, e = $("add-end").value, label = $("add-label").value.trim(), type = $("add-type").value;
      if (!s) { errs.appendChild(el("li", { text: "Add a start time." })); return; }
      var start = L.toMin(s), end = type === "callback" ? start + 15 : (e ? L.toMin(e) : null);
      if (end == null) { errs.appendChild(el("li", { text: "Add an end time." })); return; }
      if (end <= start) { errs.appendChild(el("li", { text: "The end time is before the start time." })); return; }
      dayData().items.push({ start: start, end: end, label: label || (type === "callback" ? "Callback" : "Meeting"), type: type });
      save(); $("add-label").value = ""; renderDay();
    });
    $("mobile-tasks").addEventListener("input", function () { dayData().mobileTasks = Math.max(0, Number(this.value) || 0); save(); renderDay(); });
    $("restaurant-tasks").addEventListener("input", function () { dayData().restaurantTasks = Math.max(0, Number(this.value) || 0); save(); renderDay(); });
    $("clear-day").addEventListener("click", function () {
      if (!confirm("Clear the meetings you added and your call tasks for " + DAYS[state.day] + "?")) return;
      delete state.days[state.day]; save(); renderDay();
    });
    renderDay();
  }

  // =====================================================================
  // TABS + INIT
  // =====================================================================
  function showTab() {
    var day = location.hash === "#my-day";
    $("panel-how").hidden = day; $("panel-day").hidden = !day;
    $("tab-how").setAttribute("aria-current", day ? "false" : "page");
    $("tab-day").setAttribute("aria-current", day ? "page" : "false");
  }
  window.addEventListener("hashchange", function () { showTab(); window.scrollTo(0, 0); });

  renderAutoBox(); renderFlow(); renderCheat(); renderRejectTable(); renderCallbacks();
  new Wizard($("sim"), SIM, "start");
  initDay();
  showTab();
})();
