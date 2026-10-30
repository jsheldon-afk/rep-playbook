/**
 * Rep Playbook: stores each rep's daily numbers for the manager dashboard.
 *
 * Setup (once, by the sheet owner):
 *   1. Create a blank Google Sheet called "Rep Playbook Data".
 *   2. Extensions > Apps Script. Delete the sample code, paste this file in, save.
 *   3. Pick "setup" in the function menu at the top and click Run. Approve the permissions.
 *      This creates the Managers, Reps and Daily tabs and adds you as the first manager.
 *      Managers  column A: manager emails
 *      Reps      column A: rep email, column B: rep name (optional, used for names and
 *                "hasn't connected today")
 *   4. Deploy > New deployment > type "Web app".
 *        Execute as: Me
 *        Who has access: Anyone
 *      ("Anyone" is needed so the site can reach it. Every request is checked against the
 *       sender's Google sign-in, so only Seated accounts can write, and only managers can read.)
 *   5. Copy the Web app URL into dashboardEndpoint in config.js.
 *
 * What's stored: one row per rep per day with counts and minutes. No meeting titles,
 * no prospect names, no calendar details.
 */

const DOMAIN = 'seatedapp.io';
const CLIENT_ID = '660445438110-v7njmd3pkaooh5ighga54gkn7ie64c4o.apps.googleusercontent.com';
const DAILY = 'Daily';
const COLS = ['key', 'date', 'email', 'updated', 'mobileTasks', 'restaurantTasks', 'callbacks', 'coldPlanned',
  'goalCold', 'goalCallbacks', 'onTrack', 'bookedMinutes', 'mobileMinutes', 'restaurantMinutes', 'flexMinutes',
  'utilization', 'expectedMeetings', 'rgaMinutes', 'nonRgaMinutes', 'demos', 'followUps', 'internalMeetings',
  'ignored', 'shortTasks', 'idleMinutes'];

function setup() {
  const ss = SpreadsheetApp.getActive();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  let m = ss.getSheetByName('Managers');
  if (!m) { m = ss.insertSheet('Managers'); m.getRange(1, 1).setValue('Manager email').setFontWeight('bold'); }
  const me = Session.getActiveUser().getEmail();
  if (me && listCol_(m).indexOf(me.toLowerCase()) < 0) m.appendRow([me]);
  let r = ss.getSheetByName('Reps');
  if (!r) { r = ss.insertSheet('Reps'); r.getRange(1, 1, 1, 2).setValues([['Rep email', 'Name']]).setFontWeight('bold'); }
  dailySheet_();
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=x', { muteHttpExceptions: true });   // asks for the network permission now
}

function ss_() {
  return SpreadsheetApp.getActive() || SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const email = whoIs_(body.token);
    if (!email) return out_({ ok: false, error: 'Sign in with your Seated Google account.' });
    if (body.action === 'report') return out_(report_(email, body.day || {}));
    if (body.action === 'dashboard') return out_(dashboard_(email, Number(body.days) || 14));
    return out_({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

// Confirms the Google access token belongs to our app and to a Seated account. Returns the email.
function whoIs_(token) {
  if (!token) return null;
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  const info = JSON.parse(r.getContentText());
  const email = String(info.email || '').toLowerCase();
  if (info.aud !== CLIENT_ID && info.azp !== CLIENT_ID) return null;
  if (String(info.email_verified) !== 'true') return null;
  return email.endsWith('@' + DOMAIN) ? email : null;
}

function report_(email, day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day.date || ''))) return { ok: false, error: 'Missing date.' };
  const sh = dailySheet_();
  const key = email + '|' + day.date;
  const row = COLS.map(function (c) {
    if (c === 'key') return key;
    if (c === 'email') return email;
    if (c === 'updated') return new Date();
    const v = day[c];
    return typeof v === 'number' || typeof v === 'boolean' ? v : String(v == null ? '' : v).slice(0, 40);
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const keys = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
    const i = keys.indexOf(key);
    if (i >= 0) sh.getRange(i + 2, 1, 1, COLS.length).setValues([row]);
    else sh.appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function dashboard_(email, days) {
  const ss = ss_();
  const managers = listCol_(ss.getSheetByName('Managers'));
  if (managers.indexOf(email) < 0) return { ok: false, error: email + ' is not on the Managers tab.' };
  const reps = {};
  const repSheet = ss.getSheetByName('Reps');
  if (repSheet && repSheet.getLastRow() > 1) {
    repSheet.getRange(2, 1, repSheet.getLastRow() - 1, 2).getValues().forEach(function (r) {
      if (r[0]) reps[String(r[0]).trim().toLowerCase()] = String(r[1] || '').trim();
    });
  }
  const sh = dailySheet_();
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceYmd = Utilities.formatDate(since, 'America/New_York', 'yyyy-MM-dd');
  const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, COLS.length).getValues() : [];
  const out = rows.map(function (r) {
    const o = {};
    COLS.forEach(function (c, i) {
      if (c === 'date') o.date = r[i] instanceof Date ? Utilities.formatDate(r[i], 'America/New_York', 'yyyy-MM-dd') : String(r[i]).slice(0, 10);
      else o[c] = r[i] instanceof Date ? r[i].toISOString() : r[i];
    });
    o.name = reps[o.email] || String(o.email).split('@')[0];
    return o;
  }).filter(function (o) { return o.date >= sinceYmd; });
  return { ok: true, rows: out, roster: reps, today: Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd') };
}

function dailySheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(DAILY);
  if (!sh) {
    sh = ss.insertSheet(DAILY);
    sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('B:B').setNumberFormat('@');   // keep dates as plain text
  }
  return sh;
}

function listCol_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).trim().toLowerCase(); }).filter(String);
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
