// Boot. There is one sign-in page for everyone (app.html#/login); it sends Super Admins here.
// The server decides access: /api/super/session returns 200 only for a SUPER_ADMIN session.
(() => {
  "use strict";
  const { $, esc } = SA;
  const LOGIN = "/app.html#/login?next=super";
  let shellReady = false;

  const toLogin = () => location.replace(LOGIN);
  const brand = `<div class="brand"><div class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20V4h6a5 5 0 0 1 0 10H7"/></svg></div><div class="brand-text"><b>Paynest</b><span>Control centre</span></div></div>`;
  function gate(html) {
    $("#app").hidden = true;
    const g = $("#gate");
    g.hidden = false;
    g.className = "gate";
    g.innerHTML = `<div class="gate-card">${brand}${html}</div>`;
  }

  // Signed in, but not as a platform operator (for example a merchant who opened this address).
  function showDenied(email) {
    gate(`<h1>No Super Admin access</h1>
      <p>You're signed in as ${esc(email)}, which isn't a platform operator account.</p>
      <div style="display:grid;gap:8px">
        <a class="btn primary" href="/app.html" style="justify-content:center">Go to your dashboard</a>
        <button type="button" class="btn" id="gate-out" style="justify-content:center">Sign out and use another account</button>
      </div>`);
    $("#gate-out").addEventListener("click", async () => {
      try { await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" }); } catch {}
      toLogin();
    });
  }

  function showUnreachable() {
    gate(`<h1>Can't reach Paynest</h1><p>The control centre couldn't load your session. Check your connection and try again.</p>
      <button type="button" class="btn primary" id="gate-retry" style="width:100%;justify-content:center">Try again</button>`);
    $("#gate-retry").addEventListener("click", () => location.reload());
  }

  // Session ended mid-use, or the operator signed out: back to the shared sign-in page.
  SA.signedOut = () => { SA.state.session = null; toLogin(); };

  async function boot() {
    const res = await fetch("/api/super/session?mode=all", { credentials: "same-origin" });
    if (res.status === 401) return toLogin();
    if (res.status === 403) {
      const me = await fetch("/api/auth/me", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null);
      return showDenied(me && me.user ? me.user.email : "this account");
    }
    if (!res.ok) return showUnreachable();
    SA.state.session = await res.json();
    $("#gate").hidden = true;
    $("#app").hidden = false;
    SA.chartDefaults();
    if (!shellReady) { SA.initShell(); shellReady = true; } else { SA.refreshMe(); SA.loadBell(); }
    SA.render();
  }

  boot().catch(showUnreachable);
})();
