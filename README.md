# Rep Playbook

A two-tab site for Seated reps:

1. **How it works**: the operations flow, how to log calls, the reject reason finder, the 5-callback rule, and a "What do I do next?" simulator.
2. **My day**: a 9:00–6:00 ET calling plan built around your meetings, with expected meetings from your dial goal.

Plain HTML, CSS and JavaScript. No build step and no internet needed.

## Test it on your computer
1. Unzip the folder.
2. Double-click `index.html`. It opens in your browser.

Inputs on **My day** are saved in your browser only.

## Connect Google Calendar (one-time setup)
Reps can click **Connect my Google Calendar** on the My day tab to pull in the week's meetings. It's read-only, and events go straight from Google to the rep's browser; nothing is stored anywhere else. Until a client ID is added, the Google Calendar panel just shows a note and reps add meetings by hand instead.

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

## Publish on GitHub Pages
1. Create a repository and upload `index.html`, `styles.css`, `config.js`, `app.js` and this README to the root.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, then **Save**.
4. After a minute, the site is live at the address shown on that page.

GitHub Pages sites on free plans are public. This site contains no rep or customer data, only team-level rates.

## How the site spots demos
It uses the same rules as the Demo Reminders script. A calendar event with a guest from outside `internalDomains` (seatedapp.io) is a prospect meeting. If its title has a follow-up word it's a follow-up, otherwise a demo, and a skip word means it's neither. Demos and follow-ups get prep time and are never flagged as "move this out of prime time." Meetings typed into the site have no guest list, so the site looks for "demo," "intro" or a follow-up word in the title instead.

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
