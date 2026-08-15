/**
 * Deployment config.
 *
 * Set API_URL to the Apps Script web app /exec URL after deploying:
 *   Apps Script editor -> Deploy -> New deployment -> Web app
 *   Execute as:      Me
 *   Who has access:  Anyone
 * Copy the /exec URL it gives you and paste it below.
 *
 * Re-deploy (New deployment, not "test deployment") every time backend code
 * changes, or the frontend keeps hitting the old version.
 */
var CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxb_iepwj4bCzkLdaneKLuiClgtexucZf6vqF0bSgRup8OtOJ64oVjHO-ferZZXOdc/exec',

  // Local storage keys.
  TOKEN_KEY: 'tm_token',
  USER_KEY: 'tm_user',
  DUE_SEEN_KEY: 'tm_due_seen'
};
