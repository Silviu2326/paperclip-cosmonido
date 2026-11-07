/*
 * Paperclip web chat widget (pista F). No dependencies.
 *
 * Embed on any site:
 *   <script async src="https://<host>/api/p/<companyId>/widget.js"></script>
 *
 * The script reads its own URL to find the API base, so it works on any domain.
 * The session token lives in localStorage under a key scoped to the company.
 * Text is always set with textContent; the company color is validated before use.
 */
(function () {
  "use strict";

  var SCRIPT_PATTERN = /\/widget\.js(\?.*)?$/;
  var COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
  var DEFAULT_COLOR = "#2563eb";
  var POLL_MS = 3000;
  var MAX_MESSAGE_CHARS = 4000;
  var STORAGE_PREFIX = "paperclip-webchat:";

  var script = document.currentScript;
  if (!script || !SCRIPT_PATTERN.test(script.src || "")) {
    script = null;
    var candidates = document.getElementsByTagName("script");
    for (var i = candidates.length - 1; i >= 0; i -= 1) {
      if (candidates[i].src && SCRIPT_PATTERN.test(candidates[i].src)) {
        script = candidates[i];
        break;
      }
    }
  }
  if (!script) return;

  var BASE = script.src.replace(SCRIPT_PATTERN, "/");
  if (window.__paperclipWebchatLoaded) return;
  window.__paperclipWebchatLoaded = true;
  var STORAGE_KEY = STORAGE_PREFIX + BASE;

  var COPY = {
    en: {
      open: "Open chat",
      title: "Chat with us",
      close: "Close chat",
      details: "Share your details",
      detailsTitle: "Leave your details so we can follow up.",
      name: "Name",
      email: "Email",
      saveDetails: "Send details",
      skipDetails: "Not now",
      thanks: "Thanks, we have your details.",
      message: "Message",
      placeholder: "Write a message",
      send: "Send",
      sending: "Sending...",
      sent: "Sent",
      failed: "Not sent. Select to retry.",
      error: "Something went wrong. Please try again.",
      invalidEmail: "Please enter a valid email address.",
      tooMany: "You are sending messages too fast. Wait a minute and try again.",
      expired: "Your chat session ended. Send your message again.",
      empty: "Write a message first."
    },
    es: {
      open: "Abrir chat",
      title: "Chatea con nosotros",
      close: "Cerrar chat",
      details: "Compartir mis datos",
      detailsTitle: "Déjanos tus datos para poder volver a contactarte.",
      name: "Nombre",
      email: "Correo",
      saveDetails: "Enviar datos",
      skipDetails: "Ahora no",
      thanks: "Gracias, ya tenemos tus datos.",
      message: "Mensaje",
      placeholder: "Escribe un mensaje",
      send: "Enviar",
      sending: "Enviando...",
      sent: "Enviado",
      failed: "No enviado. Pulsa para reintentar.",
      error: "Algo salió mal. Inténtalo de nuevo.",
      invalidEmail: "Introduce un correo válido.",
      tooMany: "Estás enviando mensajes demasiado rápido. Espera un minuto.",
      expired: "Tu sesión de chat ha terminado. Vuelve a enviar tu mensaje.",
      empty: "Escribe un mensaje primero."
    }
  };
  var lang = String((document.documentElement && document.documentElement.lang) || navigator.language || "en")
    .slice(0, 2)
    .toLowerCase();
  var T = COPY[lang] || COPY.en;

  var state = {
    config: null,
    session: null,
    messages: [],
    seen: {},
    after: 0,
    open: false,
    polling: false,
    timer: null,
    ui: null
  };

  // ---------------------------------------------------------------- storage

  function readStore() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function writeStore(value) {
    try {
      if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      // Storage blocked (private mode, site data cleared): the session lives in memory only.
    }
  }

  function validSession(session) {
    return Boolean(session && session.token && session.sessionId && Date.parse(session.expiresAt) > Date.now());
  }

  // ---------------------------------------------------------------- network

  function api(path, options) {
    var init = { method: options.method || "GET", headers: {}, cache: "no-store", credentials: "omit" };
    if (options.session) init.headers.Authorization = "Bearer " + options.session.token;
    if (options.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    return fetch(BASE + path, init).then(function (response) {
      return response
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!response.ok) {
            var error = new Error("HTTP " + response.status);
            error.status = response.status;
            throw error;
          }
          return data;
        });
    });
  }

  function ensureSession() {
    if (validSession(state.session)) return Promise.resolve(state.session);
    return api("chat/session", { method: "POST", body: {} }).then(function (data) {
      state.session = {
        sessionId: data.sessionId,
        token: data.token,
        expiresAt: data.expiresAt,
        seq: 0,
        identified: false
      };
      state.after = 0;
      writeStore(state.session);
      return state.session;
    });
  }

  function expireSession() {
    state.session = null;
    state.after = 0;
    writeStore(null);
    addNotice(T.expired);
  }

  // ---------------------------------------------------------------- messages

  function addServerMessage(message) {
    if (state.seen[message.id]) return;
    state.seen[message.id] = true;
    state.messages.push({
      key: message.id,
      mine: message.direction === "inbound",
      body: message.body,
      status: message.direction === "inbound" ? "sent" : null
    });
  }

  function addNotice(text) {
    state.messages.push({ key: "notice-" + state.messages.length, notice: true, body: text, status: null });
    render();
  }

  function confirmLocal(bubble, serverId) {
    if (state.seen[serverId]) {
      // The poll already brought the stored copy; drop the local bubble.
      state.messages = state.messages.filter(function (item) {
        return item !== bubble;
      });
      return;
    }
    state.seen[serverId] = true;
    bubble.key = serverId;
    bubble.status = "sent";
  }

  function nextSeq(session) {
    session.seq += 1;
    writeStore(session);
    return session.seq;
  }

  function sendBubble(bubble) {
    bubble.status = "sending";
    render();
    ensureSession()
      .then(function (session) {
        if (bubble.sessionId !== session.sessionId) {
          bubble.sessionId = session.sessionId;
          bubble.seq = nextSeq(session);
        }
        return api("chat/" + session.sessionId + "/messages", {
          method: "POST",
          session: session,
          body: { body: bubble.body, seq: bubble.seq, website: "" }
        }).then(function (data) {
          confirmLocal(bubble, data.message.id);
          render();
        });
      })
      .catch(function (error) {
        if (error.status === 401) {
          expireSession();
          bubble.status = "failed";
          bubble.error = T.expired;
        } else {
          bubble.status = "failed";
          bubble.error = error.status === 429 ? T.tooMany : T.failed;
        }
        render();
      });
  }

  function sendFromForm(text) {
    var body = text.trim();
    if (!body) {
      setStatus(T.empty);
      return;
    }
    if (body.length > MAX_MESSAGE_CHARS) {
      setStatus(T.error);
      return;
    }
    setStatus("");
    var bubble = { key: "local-" + Date.now() + "-" + state.messages.length, mine: true, body: body, status: "sending", seq: 0, sessionId: null };
    state.messages.push(bubble);
    sendBubble(bubble);
  }

  // ---------------------------------------------------------------- polling

  function poll() {
    if (!state.session || state.polling) return Promise.resolve();
    state.polling = true;
    var session = state.session;
    return api("chat/" + session.sessionId + "/messages?after=" + state.after, { session: session })
      .then(function (page) {
        if (state.session !== session) return false;
        var before = state.messages.length;
        page.messages.forEach(addServerMessage);
        state.after = page.nextAfter;
        if (state.messages.length !== before) render();
        return page.hasMore;
      })
      .catch(function (error) {
        if (error.status === 401 && state.session === session) expireSession();
        return false;
      })
      .then(function (more) {
        state.polling = false;
        return more ? poll() : null;
      });
  }

  function startPolling() {
    stopPolling();
    state.timer = window.setInterval(poll, POLL_MS);
  }

  function stopPolling() {
    if (state.timer) window.clearInterval(state.timer);
    state.timer = null;
  }

  // ---------------------------------------------------------------- identification

  function identify(name, email) {
    setIdentifyStatus("");
    return ensureSession()
      .then(function (session) {
        return api("chat/" + session.sessionId + "/identify", {
          method: "POST",
          session: session,
          body: { name: name, email: email, website: "" }
        });
      })
      .then(function () {
        state.session.identified = true;
        writeStore(state.session);
        state.ui.identify.hidden = true;
        state.ui.thanks.hidden = false;
        state.ui.thanks.textContent = T.thanks;
      })
      .catch(function (error) {
        setIdentifyStatus(error.status === 400 ? T.invalidEmail : T.error);
      });
  }

  // ---------------------------------------------------------------- rendering

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function render() {
    var log = state.ui.log;
    while (log.firstChild) log.removeChild(log.firstChild);
    if (state.config.greeting) {
      log.appendChild(bubbleNode({ key: "greeting", mine: false, body: state.config.greeting, status: null }));
    }
    state.messages.forEach(function (message) {
      log.appendChild(bubbleNode(message));
    });
    log.scrollTop = log.scrollHeight;
  }

  function bubbleNode(message) {
    if (message.notice) return el("div", "pc-notice", message.body);
    var row = el("div", "pc-row " + (message.mine ? "pc-mine" : "pc-theirs"));
    row.appendChild(el("div", "pc-bubble", message.body));
    if (message.mine && message.status === "sending") row.appendChild(el("div", "pc-status", T.sending));
    if (message.mine && message.status === "sent") row.appendChild(el("div", "pc-status", T.sent));
    if (message.mine && message.status === "failed") {
      var retry = el("button", "pc-retry", message.error || T.failed);
      retry.type = "button";
      retry.addEventListener("click", function () {
        sendBubble(message);
      });
      row.appendChild(retry);
    }
    return row;
  }

  function setStatus(text) {
    state.ui.status.textContent = text;
  }

  function setIdentifyStatus(text) {
    state.ui.identifyStatus.textContent = text;
  }

  // ---------------------------------------------------------------- panel

  function openPanel() {
    state.open = true;
    state.ui.panel.hidden = false;
    state.ui.launcher.setAttribute("aria-expanded", "true");
    ensureSession()
      .then(function () {
        state.ui.thanks.hidden = !state.session.identified;
        state.ui.thanks.textContent = state.session.identified ? T.thanks : "";
        return poll();
      })
      .catch(function () {
        setStatus(T.error);
      });
    startPolling();
    state.ui.input.focus();
  }

  function closePanel() {
    state.open = false;
    state.ui.panel.hidden = true;
    state.ui.launcher.setAttribute("aria-expanded", "false");
    stopPolling();
    state.ui.launcher.focus();
  }

  function contrastText(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255;
    var g = parseInt(hex.slice(3, 5), 16) / 255;
    var b = parseInt(hex.slice(5, 7), 16) / 255;
    var luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.6 ? "#111827" : "#ffffff";
  }

  function buildUi(config) {
    var color = config.brandColor && COLOR_PATTERN.test(config.brandColor) ? config.brandColor : DEFAULT_COLOR;
    var host = el("div");
    host.setAttribute("data-paperclip-webchat", "");
    document.body.appendChild(host);
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

    var style = el("style");
    style.textContent = [
      ":host{all:initial}",
      ":host{--pc-brand:" + color + ";--pc-on-brand:" + contrastText(color) + "}",
      ".pc-launch{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;border:0;background:var(--pc-brand);color:var(--pc-on-brand);box-shadow:0 4px 16px rgba(0,0,0,.2);cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2147483000;font:inherit}",
      ".pc-launch svg{width:26px;height:26px;fill:currentColor}",
      ".pc-panel{position:fixed;right:20px;bottom:88px;width:min(360px,calc(100vw - 40px));height:min(520px,calc(100vh - 120px));display:flex;flex-direction:column;background:#ffffff;color:#111827;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.25);font:14px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;overflow:hidden;z-index:2147483000}",
      ".pc-panel[hidden],.pc-identify[hidden],.pc-thanks[hidden]{display:none}",
      ".pc-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;background:var(--pc-brand);color:var(--pc-on-brand)}",
      ".pc-title{font-weight:600;font-size:15px;margin:0}",
      ".pc-head button{background:transparent;border:1px solid currentColor;border-radius:6px;color:inherit;padding:4px 8px;cursor:pointer;font:inherit}",
      ".pc-identify{padding:10px 14px;border-bottom:1px solid #e5e7eb;display:flex;flex-direction:column;gap:8px}",
      ".pc-identify label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#374151}",
      ".pc-identify input{font:inherit;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px}",
      ".pc-row{display:flex;flex-direction:column;margin:6px 0;max-width:85%}",
      ".pc-mine{align-self:flex-end;align-items:flex-end}",
      ".pc-theirs{align-self:flex-start;align-items:flex-start}",
      ".pc-bubble{padding:8px 12px;border-radius:12px;white-space:pre-wrap;word-break:break-word;background:#f3f4f6}",
      ".pc-mine .pc-bubble{background:var(--pc-brand);color:var(--pc-on-brand)}",
      ".pc-status,.pc-notice{font-size:12px;color:#4b5563;margin-top:2px}",
      ".pc-notice{align-self:center;text-align:center;margin:6px 0}",
      ".pc-retry{margin-top:2px;background:none;border:0;color:#b91c1c;text-decoration:underline;cursor:pointer;font:inherit;font-size:12px;padding:0}",
      ".pc-log{flex:1;overflow-y:auto;padding:10px 14px;display:flex;flex-direction:column}",
      ".pc-composer{display:flex;gap:8px;padding:10px 14px;border-top:1px solid #e5e7eb}",
      ".pc-composer input{flex:1;font:inherit;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;min-width:0}",
      ".pc-button{font:inherit;padding:6px 12px;border-radius:8px;border:0;background:var(--pc-brand);color:var(--pc-on-brand);cursor:pointer}",
      ".pc-secondary{background:transparent;color:#374151;border:1px solid #d1d5db}",
      ".pc-row-actions{display:flex;gap:8px;justify-content:flex-end}",
      ".pc-status-line{font-size:12px;color:#b91c1c;min-height:0}",
      ".pc-off{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}",
      ".pc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}",
      ":focus-visible{outline:3px solid #f59e0b;outline-offset:2px}"
    ].join("");
    root.appendChild(style);

    var launcher = el("button", "pc-launch");
    launcher.type = "button";
    launcher.setAttribute("aria-label", T.open);
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-controls", "pc-panel");
    launcher.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z"/></svg>';

    var panel = el("section", "pc-panel");
    panel.id = "pc-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", config.name ? config.name : T.title);

    var head = el("div", "pc-head");
    var titleWrap = el("div");
    if (config.logoUrl) {
      var logo = el("img");
      logo.alt = "";
      logo.width = 24;
      logo.height = 24;
      logo.src = new URL(config.logoUrl, script.src).href;
      logo.style.borderRadius = "4px";
      logo.style.verticalAlign = "middle";
      logo.style.marginRight = "8px";
      titleWrap.appendChild(logo);
    }
    titleWrap.appendChild(el("span", "pc-title", config.name || T.title));
    head.appendChild(titleWrap);
    var headActions = el("div", "pc-row-actions");
    var detailsToggle = el("button", null, T.details);
    detailsToggle.type = "button";
    detailsToggle.setAttribute("aria-expanded", "false");
    var closeButton = el("button", null, T.close);
    closeButton.type = "button";
    headActions.appendChild(detailsToggle);
    headActions.appendChild(closeButton);
    head.appendChild(headActions);
    panel.appendChild(head);

    var identifyForm = el("form", "pc-identify");
    identifyForm.hidden = true;
    var nameLabel = el("label");
    nameLabel.appendChild(el("span", null, T.name));
    var nameInput = el("input");
    nameInput.type = "text";
    nameInput.name = "name";
    nameInput.maxLength = 200;
    nameInput.autocomplete = "name";
    nameLabel.appendChild(nameInput);
    var emailLabel = el("label");
    emailLabel.appendChild(el("span", null, T.email));
    var emailInput = el("input");
    emailInput.type = "email";
    emailInput.name = "email";
    emailInput.required = true;
    emailInput.maxLength = 320;
    emailInput.autocomplete = "email";
    emailLabel.appendChild(emailInput);
    var identifyActions = el("div", "pc-row-actions");
    var skipButton = el("button", "pc-button pc-secondary", T.skipDetails);
    skipButton.type = "button";
    var saveButton = el("button", "pc-button", T.saveDetails);
    saveButton.type = "submit";
    identifyActions.appendChild(skipButton);
    identifyActions.appendChild(saveButton);
    var identifyStatus = el("div", "pc-status-line");
    identifyStatus.setAttribute("role", "status");
    identifyForm.appendChild(el("p", null, T.detailsTitle));
    identifyForm.appendChild(nameLabel);
    identifyForm.appendChild(emailLabel);
    identifyForm.appendChild(identifyStatus);
    identifyForm.appendChild(identifyActions);
    panel.appendChild(identifyForm);

    var thanks = el("p", "pc-thanks");
    thanks.hidden = true;
    thanks.setAttribute("role", "status");
    thanks.style.margin = "8px 14px 0";
    panel.appendChild(thanks);

    var log = el("div", "pc-log");
    log.setAttribute("role", "log");
    log.setAttribute("aria-live", "polite");
    log.tabIndex = 0;
    log.setAttribute("aria-label", T.title);
    panel.appendChild(log);

    var status = el("div", "pc-status-line");
    status.setAttribute("role", "status");
    status.style.padding = "0 14px";
    panel.appendChild(status);

    var composer = el("form", "pc-composer");
    var honeypot = el("input", "pc-off");
    honeypot.type = "text";
    honeypot.name = "website";
    honeypot.tabIndex = -1;
    honeypot.autocomplete = "off";
    honeypot.setAttribute("aria-hidden", "true");
    var input = el("input");
    input.type = "text";
    input.maxLength = MAX_MESSAGE_CHARS;
    input.placeholder = T.placeholder;
    input.setAttribute("aria-label", T.message);
    input.autocomplete = "off";
    var send = el("button", "pc-button", T.send);
    send.type = "submit";
    composer.appendChild(honeypot);
    composer.appendChild(input);
    composer.appendChild(send);
    panel.appendChild(composer);

    root.appendChild(launcher);
    root.appendChild(panel);

    state.ui = {
      launcher: launcher,
      panel: panel,
      log: log,
      input: input,
      status: status,
      identify: identifyForm,
      identifyStatus: identifyStatus,
      thanks: thanks,
      honeypot: honeypot
    };

    launcher.addEventListener("click", function () {
      if (state.open) closePanel();
      else openPanel();
    });
    closeButton.addEventListener("click", closePanel);
    panel.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.open) {
        event.stopPropagation();
        closePanel();
      }
    });
    detailsToggle.addEventListener("click", function () {
      var expanded = identifyForm.hidden;
      identifyForm.hidden = !expanded;
      detailsToggle.setAttribute("aria-expanded", String(expanded));
      if (expanded) nameInput.focus();
    });
    skipButton.addEventListener("click", function () {
      identifyForm.hidden = true;
      detailsToggle.setAttribute("aria-expanded", "false");
      input.focus();
    });
    identifyForm.addEventListener("submit", function (event) {
      event.preventDefault();
      identify(nameInput.value.trim(), emailInput.value.trim());
    });
    composer.addEventListener("submit", function (event) {
      event.preventDefault();
      if (honeypot.value) {
        input.value = "";
        return;
      }
      var text = input.value;
      input.value = "";
      sendFromForm(text);
    });

    render();
  }

  function start() {
    fetch(BASE + "chat/config", { cache: "no-store", credentials: "omit" })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (config) {
        if (!config || !config.enabled) return;
        state.config = config;
        var stored = readStore();
        if (validSession(stored)) state.session = stored;
        buildUi(config);
      })
      .catch(function () {
        // The site works without the chat: nothing is rendered when the config cannot be read.
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
