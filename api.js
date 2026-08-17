/**
 * Apps Script API client.
 *
 * All calls are POST with Content-Type: text/plain. That is deliberate — it keeps
 * the request a CORS "simple request" so the browser skips the preflight OPTIONS,
 * which Apps Script web apps cannot answer. Switching to application/json will
 * break the app from GitHub Pages with a CORS error. The body is still JSON.
 *
 * The server always replies HTTP 200; success/failure is in the payload
 * ({ok:true, data} / {ok:false, status, error}), because ContentService can't set
 * real status codes.
 */

var API = (function () {
  var token = localStorage.getItem(CONFIG.TOKEN_KEY) || null;

  function setToken(value) {
    token = value;
    if (value) localStorage.setItem(CONFIG.TOKEN_KEY, value);
    else localStorage.removeItem(CONFIG.TOKEN_KEY);
  }

  function getToken() {
    return token;
  }

  function call(action, payload) {
    var body = Object.assign({}, payload || {}, { action: action });
    if (token) body.token = token;

    if (!CONFIG.API_URL || CONFIG.API_URL.indexOf('PASTE_YOUR') === 0) {
      return Promise.reject(new ApiError(
        'API_URL is not set. Open frontend/config.js and paste your Apps Script /exec URL.', 0));
    }

    return fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    })
      .then(function (res) { return res.text(); })
      .then(function (text) {
        var json;
        try {
          json = JSON.parse(text);
        } catch (e) {
          // An HTML page rather than our JSON. Two causes, and they need opposite advice:
          // a misconfigured deployment (permanent, dev-facing) or an Apps Script blip
          // (transient, observed on the first call after an idle gap). Retrying is the
          // right advice for a user either way, so don't send them to a settings screen.
          // apiError() localises this sentinel — see 'network'.
          throw new ApiError('badresponse', 500);
        }

        if (!json.ok) {
          var err = new ApiError(json.error || 'Something went wrong.', json.status || 500);
          if (err.status === 401) handleExpiredSession();
          throw err;
        }
        return json.data;
      })
      .catch(function (err) {
        if (err instanceof ApiError) throw err;
        throw new ApiError('network', 0);
      });
  }

  function handleExpiredSession() {
    setToken(null);
    localStorage.removeItem(CONFIG.USER_KEY);
  }

  function ApiError(message, status) {
    this.message = message;
    this.status = status;
    this.name = 'ApiError';
  }
  ApiError.prototype = Object.create(Error.prototype);

  return {
    call: call,
    setToken: setToken,
    getToken: getToken,
    ApiError: ApiError,

    checkPhone:   function (phone) { return call('auth.checkPhone', { phone: phone }); },
    login:        function (phone, pin) { return call('auth.login', { phone: phone, pin: pin }); },

    listTasks:    function () { return call('tasks.list', {}); },
    getTask:      function (id) { return call('tasks.get', { id: id }); },
    createTask:   function (data) { return call('tasks.create', data); },
    updateTask:   function (data) { return call('tasks.update', data); },
    deleteTask:   function (id) { return call('tasks.delete', { id: id }); },

    createSubtask: function (data) { return call('subtasks.create', data); },
    updateSubtask: function (data) { return call('subtasks.update', data); },
    deleteSubtask: function (id) { return call('subtasks.delete', { id: id }); },

    addNote:      function (data) { return call('notes.create', data); },

    dueDigest:    function () { return call('reminders.due', {}); },

    master:       function () { return call('master.list', {}); },
    masterAdd:    function (data) { return call('master.add', data); },
    masterRemove: function (list, name) { return call('master.remove', { list: list, name: name }); },

    team:         function () { return call('team.list', {}); },
    teamSave:     function (data) { return call('team.save', data); },
    teamDelete:   function (id) { return call('team.delete', { id: id }); },
    resetPin:     function (id, pin) { return call('team.resetPin', { id: id, pin: pin }); },

    purgePreview: function () { return call('admin.purgePreview', {}); }
  };
})();
