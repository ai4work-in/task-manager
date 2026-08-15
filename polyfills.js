/**
 * Small compatibility shims for older mobile browsers (older Android WebView,
 * UC Browser, iOS Safari 9/10) that the team may actually be running.
 *
 * Loaded before api.js/app.js. Only patches what's missing.
 *
 * Promise and fetch are NOT shimmed — a real polyfill for those is large, and a
 * browser missing them is old enough that the app can't work anyway. We detect
 * them and show a plain upgrade message instead of failing with a blank screen.
 */

(function () {
  'use strict';

  if (typeof Object.assign !== 'function') {
    Object.defineProperty(Object, 'assign', {
      writable: true,
      configurable: true,
      value: function (target) {
        if (target === null || target === undefined) {
          throw new TypeError('Cannot convert undefined or null to object');
        }
        var to = Object(target);
        for (var i = 1; i < arguments.length; i++) {
          var src = arguments[i];
          if (src === null || src === undefined) continue;
          for (var key in src) {
            if (Object.prototype.hasOwnProperty.call(src, key)) to[key] = src[key];
          }
        }
        return to;
      }
    });
  }

  if (!Array.prototype.find) {
    Object.defineProperty(Array.prototype, 'find', {
      writable: true,
      configurable: true,
      value: function (predicate, thisArg) {
        for (var i = 0; i < this.length; i++) {
          if (predicate.call(thisArg, this[i], i, this)) return this[i];
        }
        return undefined;
      }
    });
  }

  if (!Array.prototype.includes) {
    Object.defineProperty(Array.prototype, 'includes', {
      writable: true,
      configurable: true,
      value: function (needle) {
        return this.indexOf(needle) !== -1;
      }
    });
  }

  if (!String.prototype.includes) {
    String.prototype.includes = function (needle) {
      return this.indexOf(needle) !== -1;
    };
  }

  if (!String.prototype.startsWith) {
    String.prototype.startsWith = function (needle, pos) {
      return this.substr(pos || 0, needle.length) === needle;
    };
  }

  if (!String.prototype.trim) {
    String.prototype.trim = function () {
      return this.replace(/^[\s﻿\xA0]+|[\s﻿\xA0]+$/g, '');
    };
  }

  // Hard requirements. Fail loudly and legibly rather than with a blank screen.
  if (typeof Promise === 'undefined' || typeof fetch === 'undefined') {
    window.__TM_UNSUPPORTED__ = true;
    document.addEventListener('DOMContentLoaded', function () {
      var app = document.getElementById('app');
      if (!app) return;
      app.innerHTML =
        '<div style="padding:40px 26px; font-family:Arial,sans-serif; text-align:center; color:#1A1A1A;">' +
        '<div style="font-size:17px; font-weight:700; margin-bottom:10px;">Browser update zaroori hai</div>' +
        '<div style="font-size:13.5px; color:#7C8592; line-height:1.6;">' +
        'Yeh browser bahut purana hai. Chrome ya Safari update karke dobara try karein.' +
        '<br><br>This browser is too old to run the app. Please update Chrome or Safari and try again.' +
        '</div></div>';
    });
  }
})();
