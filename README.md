# Rep Playbook

Right now only the **My day** tab is live. It plans today and the next business day (on Fridays, Monday), so reps can set up tomorrow before they log off. The **How it works** tab is hidden while it's being finished; set `showHowItWorks: true` in `config.js` to bring it back.

A two-tab site for Seated reps:

1. **How it works**: the operations flow, how to log calls, the reject reason finder, the 5-callback rule, and a "What do I do next?" simulator.
2. **My day**: a 9:00–6:00 ET calling plan built around your meetings, with expected meetings from your dial goal.

Plain HTML, CSS and JavaScript. No build step and no internet needed.

## Test it on your computer
1. Unzip the folder.
2. Double-click `index.html`. It opens in your browser.

Inputs on **My day** are saved in your browser only.

## Connect Google Calendar (one-time setup)
Reps can click **Connect my Google Calendar** on the My day tab to pull in the week's meetings. It's read-only, and events go straight from Google to the rep's browser; nothing is stored anywhere else. The My day tab requires the calendar connection: until a rep connects, it only shows the Connect button.

Google renames its console menus from time to time; if a label below doesn't match exactly, look for the closest one.

1. Go to console.cloud.google.com, signed in with your Seated account, and create a project (for example "Rep Playbook").
2. Open **APIs & Services → Library**, search for **Google Calendar API**, and click **Enable**.
3. Open the **OAuth consent screen** (also called **Google Auth Platform**):
   - Audience / user type: **Internal** (only Seated accounts can sign in, and Google doesn't need to review the app).
   - App name: Rep Playbook. Support email: yours.
   - Data access / scopes: add `https://www.googleapis.com/auth/calendar.events.readonly`.
4. Open **Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized JavaScript origins: your GitHub Pages address (for example `https://your-username.github.io`), plus `http://localhost:8000` for testing on your computer. No redirect URIs are needed.
5. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`) into `googleClientId` in `config.js`. The client ID isn't a secret; it's safe in a public repo.

If reps see "Google blocked access," your Google Workspace admin may need to allow the app under **Security → Access and data control → API controls**.

### Testing the calendar on your computer
Google sign-in doesn't work when you double-click `index.html` (the address starts with `file://`). Instead, open Terminal in the folder and run:

```
python3 -m http.server 8000
```

Then go to `http://localhost:8000` in your browser. Everything else on the site works fine by double-clicking.

## Manager dashboard
`dashboard.html` shows managers what each rep is set up to do: cold dials and callbacks against 120 and 10, calling time booked and how much of it they'll use, RGA share, expected meetings, demos, and who hasn't opened their plan. It also shows two-week averages per rep. It never stores meeting titles or prospect names.

How it works: each rep's page sends a one-line summary of their day to a small Apps Script attached to a Google Sheet. The script checks the rep's Google sign-in, so only Seated accounts can send numbers and only managers listed in the sheet can read them.

Setup (about 15 minutes):
1. In Google Cloud, open **Data access** for the Rep Playbook app and add the scope `.../auth/userinfo.email` (non-sensitive). Reps approve it once the next time they connect.
2. Create a blank Google Sheet called "Rep Playbook Data". Open **Extensions > Apps Script**, delete the sample code and paste in `apps-script/Code.gs`. Save.
3. In the function menu at the top, pick **setup** and click **Run**. Approve the permissions. This creates the Managers, Reps and Daily tabs and adds you as a manager.
4. Add other managers' emails to the **Managers** tab, and every rep's email and name to the **Reps** tab (used for names and for "hasn't opened their plan").
5. Click **Deploy > New deployment**, choose **Web app**, set **Execute as: Me** and **Who has access: Anyone**, and click **Deploy**. ("Anyone" lets the site reach it; the script itself checks every sign-in.)
6. Copy the **Web app URL** into `dashboardEndpoint` in `config.js`, and upload `config.js`, `app.js`, `dashboard.html` and `dashboard.js`.
7. Managers open `https://jsheldon-afk.github.io/rep-playbook/dashboard.html` and sign in.

Tell reps before you turn it on. Their page shows a line saying their daily numbers are shared with their manager.

If you change `Code.gs` later, use **Deploy > Manage deployments > Edit > New version** so the URL stays the same.

## Publish on GitHub Pages
1. Create a repository and upload `index.html`, `styles.css`, `config.js`, `app.js` and this README to the root.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, then **Save**.
4. After a minute, the site is live at the address shown on that page.

GitHub Pages sites on free plans are public. This site contains no rep or customer data, only team-level rates.

## How the site spots demos
It uses the same rules as the Demo Reminders script. A calendar event with a guest from outside `internalDomains` (seatedapp.io) is a prospect meeting. If its title has a follow-up word it's a follow-up, otherwise a demo, and a skip word means it's neither. Demos and follow-ups get prep time and are never flagged as "move this out of prime time." 

## How the site spots callbacks
A calendar event counts as a callback (it blocks 15 minutes and counts toward callback dials) when:
- its title contains "REMINDER - " (Nooks callback reminders, which Nooks marks as "free"), or
- its title contains "Callback" or "Call Back" and no outside guests are invited, or
- its title contains "Call" and nobody else is invited (so a "Team call" with colleagues stays a meeting).

Callbacks count even when the event is marked "free." Other events marked free are ignored, since they don't block time.

Calling time a rep blocks on their own calendar ("Call block", "Power hour", "Dial session", "Prospecting") is checked first. It isn't a meeting or a callback; the site treats it like its own calling blocks. Those words are in `callBlockWords`.

Change the callback words in `callbackRules` in `config.js`.

## The daily goal and plan
Every block is tagged RGA (revenue generating: calling, rebooks, demos and follow-ups with prospects) or non-RGA (prep, practice, internal meetings, lead cleaning, lunch, breaks, demo prep and wrap-up), and the page shows the split for the day. Demos and follow-ups get 10 minutes of prep before and a 10-minute wrap-up after (log it in Salesforce, send the follow-up email). Clicking a block shows what to do and tips; edit those in `blockTypes` and `meetingGuides` in `config.js`. Calling blocks added with + Calendar are marked "free" so prospects can still be booked over them.

The goal is "120 and 10": 120 cold dials and 10 callbacks a day (`goalColdDials`, `goalCallbacks` in `config.js`). The My day tab shows whether each rep's tasks, calendar and callbacks get them there.

Non-calling time is: meetings (from the calendar), demo prep (10 minutes before each demo), day organization prep (9:00), cold call bot practice (30 minutes, every rep, every day, 9:30 by default), a 45-minute lunch (12:30), two 15-minute breaks (2:45 and 5:00) and cleaning leads (5:15). If a meeting covers bot practice, the site moves it to the nearest free half hour. Times and lengths are in the `defaultDay`, `thuFriDay` and `reflow` settings in `config.js`.

## Changing numbers, names or times
Everything lives in `config.js`: time zones, calling windows, booking rates, dispositions, sentiments, reject reasons and the daily templates. Edit the values there; no other file needs to change. Keep disposition, sentiment and reject-reason names spelled exactly as they appear in Nooks and Salesforce.

## To confirm (manager checklist)
- [ ] The three time zones (default Eastern, Central, Pacific): `zones`
- [ ] Realistic dialing pace: `dialsPerHour` (default 35)
- [ ] Using Competitor's reject reason (default "DM Connect, Not Interested"): `usingCompetitorReason`
- [ ] What Phone Pitch and Live Call Transfer mean, and the next steps after each: `phonePitch*`, `liveTransfer*`
- [ ] The meanings of CL Opportunity (Held Demo), CL Opportunity (Did Not Hold), Churned Partner and Failed OB: `tempRejectReasons`
- [ ] The no-show process: `noShowStep`
- [ ] That booking a demo in Salesforce removes every contact on the account from cadences, that "Connected with DM" removes only that contact, and that DM Connect is set automatically
- [ ] Google Calendar client ID: `googleClientId`
- [ ] Follow-up and skip words, copied from the Settings tab of the Demo Reminders sheet: `followUpWords`, `skipWords`
- [ ] Lunch rush is set to 11:30 AM–1:00 PM local (call data shows 1 PM restaurant-line calls book well): `localWindows.lunchRush`
