/*
 * Rep Playbook configuration.
 * Everything the site shows or calculates lives here, so a manager can update it
 * without touching app.js. Keep names spelled EXACTLY as they appear in Nooks and Salesforce.
 *
 * Source for every rate below: Seated calls library, Jul 31 - Oct 28 2026,
 * team-level, cold prospecting calls (existing-opp, billing and internal calls removed).
 */
window.CONFIG = {
  // ---------- Time ----------
  repTimezoneLabel: "Eastern Time (ET)",
  // TO CONFIRM: our three calling time zones. offsetFromET: hours behind Eastern.
  zones: [
    { name: "Eastern", short: "ET", offsetFromET: 0 },
    { name: "Central", short: "CT", offsetFromET: -1 },
    { name: "Pacific", short: "PT", offsetFromET: -3 }
  ],
  dayStart: "09:00",
  dayEnd: "18:00",
  slotMinutes: 15,

  // Best windows in the RESTAURANT'S local time.
  localWindows: {
    mobile: ["10:30", "14:00"],          // owners' cells
    restaurant: ["13:00", "17:00"],      // main restaurant line
    restaurantPrime: ["15:30", "17:00"], // best restaurant-line window of the day
    lunchRush: ["11:30", "13:00"],       // never call restaurant lines in this window (data: 1 PM restaurant dials book well)
    dinnerStart: "17:00",                // never call restaurant lines after this
    callbackEarliest: "09:00"            // don't call owners before this local time
  },

  // ---------- Google Calendar ----------
  // Paste the OAuth client ID from Google Cloud here (see README). Leave "" to hide the feature.
  googleClientId: "660445438110-v7njmd3pkaooh5ighga54gkn7ie64c4o.apps.googleusercontent.com",
  calendarScope: "https://www.googleapis.com/auth/calendar.events.readonly",
  repTimeZone: "America/New_York",
  // How meetings are recognized as demos. Same rules as the Demo Reminders script:
  // a calendar event with a guest from outside these domains is a prospect meeting.
  internalDomains: ["seatedapp.io"],
  // Copy these from the Settings tab of the Demo Reminders sheet so both tools agree.
  followUpWords: ["follow up", "f/u", "reconnect", "second call", "next steps","order form"], // TO CONFIRM: "Follow-up words" row
  skipWords: [],                                                   // TO CONFIRM: "Skip words" row
  // Pasted or typed meetings have no guest list, so titles with these words count as demos.
  demoTitleKeywords: ["demo", "intro"],
  // Meetings in this ET window get a "move it if you can" suggestion (demos excluded).
  protectedWindow: ["15:30", "17:00"],

  // ---------- Dialing ----------
  dialsPerHour: 45,        // TO CONFIRM: realistic power-dialer pace for your reps
  defaultDialTarget: 120,
  dialsPerCallbackToday: 1,
  demoPrepMinutes: 10,

  // Share of dials that book a demo, by block. Source: calls library, Jul 31 - Oct 28 2026.
  bookingRatePerDial: {
    callback: 0.041,            // any callback dial
    agreedCallback: 0.067,      // first callback dial (owner picked the time)
    missedMeetingRebook: 0.030,
    mobileBlock: 0.012,
    restaurantBlock: 0.010,
    restaurantPrime: 0.0115
  },

  // ---------- Callback facts ----------
  callbackSpeedDemoRate: { withinOneDay: 0.18, oneToThreeDays: 0.14, overThreeDays: 0.10, never: 0 },
  callbackVsColdMultiple: 5,
  firstCallbackDemoRate: 0.067,
  firstColdDialDemoRate: 0.014,
  callbacksNeverCalledShare: 0.37,
  callbackFirstTryPickupShare: 0.56,
  callbackDials: 5,
  followUpDays: [1, 2, 4, 6, 9],      // business days after the conversation
  emailFollowUpDays: [2, 3, 5, 7, 10], // when they asked for an email first

  // ---------- Accounts ----------
  tempRejectRedistributionLabel: "about 4 months",
  usingCompetitorReason: "DM Connect, Not Interested", // TO CONFIRM
  noShowStep: [
    "Move the contact to the Missed Meeting cadence and try to rebook.",
    "If rebooking fails, Temporarily Reject the account with \u201cCL Opportunity (Did Not Hold)\u201d."
  ],
  phonePitchMeaning: "You gave the full pitch on this call instead of a separate demo.", // TO CONFIRM
  phonePitchNextSteps: [
    "Log the call in Salesforce the same way you would a held demo.",
    "Ask your manager what comes next for this account."
  ], // TO CONFIRM
  liveTransferMeaning: "You handed the owner live to an AE for a demo on the spot.", // TO CONFIRM
  liveTransferNextSteps: [
    "Make sure the AE has the owner on the line before you hang up.",
    "Add a note in Salesforce with what the owner told you."
  ], // TO CONFIRM

  // ---------- Logging reference (exact Nooks names) ----------
  // counts: how the call shows up in reporting.
  dispositions: [
    { name: "No Answer", counts: "No Answer", prospecting: true,
      when: "Nobody picked up.",
      sentiments: ["No Answer", "Busy Signal"] },
    { name: "Left Voicemail", counts: "No Answer", prospecting: true,
      when: "You left a message.",
      sentiments: ["Left Voicemail"] },
    { name: "Bad Number", counts: "No Answer", prospecting: true,
      when: "The number doesn't reach this contact.",
      sentiments: ["Wrong Number", "Not In Service"] },
    { name: "Gatekeeper", counts: "Connect", prospecting: true,
      when: "Anyone who isn't the decision-maker answered.",
      sentiments: ["GK Gave DM Info", "Gave Callback Time", "DM Not Available", "Refused to Engage / Hung Up", "Asked Not to Be Called"] },
    { name: "Connected with DM", counts: "Connect", prospecting: true,
      when: "You spoke with the owner, partner or GM. Salesforce marks the account DM Connect.",
      sentiments: ["Demo Scheduled", "Phone Pitch", "Live Call Transfer", "Gave Callback Time", "Send Info Via Email", "Not Interested", "Timing Not Right", "Fully Booked", "Using Competitor", "Hung Up Before Pitch", "Language Barrier", "Asked Not to Be Called"] },
    { name: "Existing Opportunity", counts: "Connect", prospecting: false,
      when: "A call about a demo or deal that's already in motion.",
      sentiments: ["Existing Opp - Following Up", "Existing Opp - Rescheduling"] },
    { name: "MIDS/Billing/TOS", counts: "Connect", prospecting: false,
      when: "A partner paperwork call.",
      sentiments: ["MIDS/Billing/TOS Completed"] },
    { name: "Churn Call", counts: "Connect", prospecting: false,
      when: "A call with a partner who is leaving or has left.", sentiments: [] },
    { name: "Partner Check In", counts: "Connect", prospecting: false,
      when: "A check-in with a current partner.", sentiments: [] },
    { name: "Internal", counts: "Excluded", prospecting: false,
      when: "A call to a colleague. Doesn't count toward your numbers.",
      sentiments: ["Internal"] }
  ],

  // Sentiment definitions. counts overrides the disposition when the sentiment is a Meeting.
  sentiments: {
    "No Answer": { def: "It rang out." },
    "Busy Signal": { def: "The line was busy." },
    "Left Voicemail": { def: "You left a message." },
    "Wrong Number": { def: "Someone answered, but it isn't this contact or this restaurant." },
    "Not In Service": { def: "The number is disconnected or doesn't work." },
    "GK Gave DM Info": { def: "The gatekeeper gave you the owner's name, a better number or when they're in." },
    "Gave Callback Time": { def: "You got a specific time to call back, from a gatekeeper (about the owner) or from the owner." },
    "DM Not Available": { def: "The owner isn't there and you got nothing useful." },
    "Refused to Engage / Hung Up": { def: "A GATEKEEPER blocked you or hung up. Never use it for the owner." },
    "Asked Not to Be Called": { def: "Anyone asked us to stop calling." },
    "Demo Scheduled": { def: "The owner booked a demo.", counts: "Meeting" },
    "Phone Pitch": { def: "TO CONFIRM: you gave the full pitch on this call instead of a separate demo.", counts: "Meeting" },
    "Live Call Transfer": { def: "TO CONFIRM: you handed the owner live to an AE for a demo on the spot.", counts: "Meeting" },
    "Send Info Via Email": { def: "The owner wants an email before talking more." },
    "Not Interested": { def: "The owner said no to Seated." },
    "Timing Not Right": { def: "The owner is open, just not now (busy season, opening, renovating)." },
    "Fully Booked": { def: "They don't need more diners. They're already full." },
    "Using Competitor": { def: "They already use a competing product and won't switch." },
    "Hung Up Before Pitch": { def: "The OWNER hung up before you got through the value prop." },
    "Language Barrier": { def: "You couldn't have the conversation." },
    "Existing Opp - Following Up": { def: "Following up on a deal that's already open." },
    "Existing Opp - Rescheduling": { def: "Moving a demo that's already booked." },
    "MIDS/Billing/TOS Completed": { def: "The paperwork got done." },
    "Internal": { def: "A call to a colleague." }
  },

  // Temporarily Reject reasons, exact Salesforce picklist values.
  tempRejectReasons: [
    { name: "DM Connect, Not Interested", use: "You talked to the owner and they said no, for the whole restaurant. Also use it for Using Competitor.", notConfuse: "Timing Not Right. \u201cNo\u201d is about Seated; \u201cnot now\u201d is about timing." },
    { name: "DM Connect, Timing Not Right", use: "You talked to the owner. They're open, just not now.", notConfuse: "Not Interested. Only use this when they gave a timing reason." },
    { name: "DM Connect, Failed to Reconnect", use: "You talked to the owner once, then made all 5 callbacks with no answer.", notConfuse: "GK Connect, Unable to Reach DM. You must have spoken to the owner at least once." },
    { name: "GK Connect, Unable to Reach DM", use: "The cadence ended. Gatekeepers picked up, but you never reached the owner.", notConfuse: "Unable to connect to a human. Use this if anyone answered." },
    { name: "Unable to connect to a human", use: "The cadence ended with only no answers, voicemails or bad numbers.", notConfuse: "GK Connect, Unable to Reach DM. One real conversation with staff moves it there." },
    { name: "CL Opportunity (Held Demo)", use: "TO CONFIRM: they took the demo but didn't sign, and the opportunity was closed lost.", notConfuse: "DM Connect, Not Interested, which is a no before any demo." },
    { name: "CL Opportunity (Did Not Hold)", use: "TO CONFIRM: a demo was booked but never happened and couldn't be rebooked.", notConfuse: "A fresh no-show. Try the Missed Meeting rebook first." },
    { name: "Temp Closed", use: "The restaurant is closed for now (renovation, seasonal) and plans to reopen.", notConfuse: "Does Not Qualify. Closed for good is Does Not Qualify." },
    { name: "Language Barrier", use: "You couldn't have the conversation, and there's no other contact to try.", notConfuse: "Unable to connect to a human. You did reach someone." },
    { name: "Churned Partner", use: "TO CONFIRM: they used to be a Seated partner and left.", notConfuse: "DM Connect, Not Interested. This is about their history, not today's call." },
    { name: "Failed OB", use: "TO CONFIRM: they signed but onboarding failed and they never launched.", notConfuse: "Churned Partner. They never went live, so they didn't churn." },
    { name: "Fully Booked (Lilia, 4 Charles, etc.)", use: "Always full. More diners isn't a fit right now.", notConfuse: "DM Connect, Not Interested. Use this when capacity is clearly the reason." }
  ],

  // ---------- Daily templates (times in ET) ----------
  // type: prep | callbacks | mobile | restaurant | prime | sweep | lunch | wrap
  defaultDay: [
    { start: "09:00", end: "09:30", type: "prep" },
    { start: "09:30", end: "10:30", type: "callbacks" },
    { start: "10:30", end: "12:30", type: "mobile" },
    { start: "12:30", end: "13:00", type: "lunch" },
    { start: "13:00", end: "14:00", type: "restaurant" },
    { start: "14:00", end: "15:00", type: "mobile" },
    { start: "15:00", end: "15:30", type: "sweep" },
    { start: "15:30", end: "17:00", type: "prime" },
    { start: "17:00", end: "17:45", type: "restaurant" },
    { start: "17:45", end: "18:00", type: "wrap" }
  ],
  // Thursday and Friday: restaurant lines book best, so 2:00-2:30 becomes a restaurant block.
  thuFriDay: [
    { start: "09:00", end: "09:30", type: "prep" },
    { start: "09:30", end: "10:30", type: "callbacks" },
    { start: "10:30", end: "12:30", type: "mobile" },
    { start: "12:30", end: "13:00", type: "lunch" },
    { start: "13:00", end: "14:30", type: "restaurant" },
    { start: "14:30", end: "15:00", type: "mobile" },
    { start: "15:00", end: "15:30", type: "sweep" },
    { start: "15:30", end: "17:00", type: "prime" },
    { start: "17:00", end: "17:45", type: "restaurant" },
    { start: "17:45", end: "18:00", type: "wrap" }
  ],

  blockTypes: {
    prep:       { label: "Prep", dials: false, why: "No dialing. Build today's callback list and load your lists sorted by time zone." },
    callbacks:  { label: "Callbacks + Missed Meeting rebooks", dials: true, rate: "missedMeetingRebook", why: "Callbacks booked within a day convert at 18%. Do them before any new dial." },
    mobile:     { label: "Mobile block", dials: true, rate: "mobileBlock", why: "Owners pick up their cells late morning to early afternoon. Fresh mobiles first." },
    restaurant: { label: "Restaurant block", dials: true, rate: "restaurantBlock", why: "Restaurant lines work in the afternoon, after the lunch rush." },
    prime:      { label: "Restaurant prime time", dials: true, rate: "restaurantPrime", why: "The best restaurant-line window of the day." },
    sweep:      { label: "Callback sweep", dials: true, rate: "callback", why: "Call back everyone who asked today. Same-day follow-up converts best." },
    lunch:      { label: "Lunch", dials: false, why: "Restaurants are mid-rush. Take your break." },
    wrap:       { label: "Wrap-up", dials: false, why: "Check every call has the right disposition and sentiment. Set tomorrow's Nooks reminders." }
  },

  // Rules for moving blocks around meetings (times in ET, "HH:MM").
  reflow: {
    morningCallbackWindow: ["09:00", "12:00"],
    afternoonSweepWindow: ["14:30", "17:00"],
    lunchWindow: ["11:30", "14:00"],
    minCallbackMinutes: 30,
    lunchMinutes: 30
  }
};
