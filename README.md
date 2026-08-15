# Task Manager

Mobile web task manager. Static frontend, served from GitHub Pages.

Tasks contain sub-tasks, each with its own assignee and due date. Task status is
derived from sub-task completion and is never set by hand. Three roles — Admin,
Supervisor, Employee — each seeing only what's relevant to them.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell and all styles |
| `app.js` | Screens, rendering, and app logic |
| `api.js` | Backend client |
| `config.js` | Backend endpoint URL |
| `polyfills.js` | Shims for older mobile browsers |

## Backend

The backend is a Google Apps Script web app over a Google Sheet. Point `API_URL`
in `config.js` at its `/exec` URL. The deployment must be set to **Execute as: Me**
and **Who has access: Anyone**, or every request returns a Google sign-in page
instead of JSON.

Requests are sent as `Content-Type: text/plain` on purpose — that keeps them
CORS-simple so the browser skips the preflight, which Apps Script cannot answer.
Changing it to `application/json` will break the app.

## Local preview

Open `index.html` directly, or serve the folder:

```
python -m http.server 8000
```

---

created by ai4work
