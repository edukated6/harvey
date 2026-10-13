// forProducers account page (account.html): sign in with an emailed code, then
// manage the plan (Stripe checkout and billing portal), the team and the
// profile. Talks to the forproducers-api Worker (forProducers repo, server/).
// The session token is kept in localStorage and sent as a bearer token.
(function () {
  'use strict';

  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var API = LOCAL ? 'http://localhost:8787' : 'https://forproducers-api.harvey-analytics-worker.workers.dev';
  var TOKEN_KEY = 'forProducers.accountToken';
  var PLAN_NAMES = { free: 'Free', pro: 'Pro', team: 'Team' };
  var ROLE_NAMES = { producer: 'Producer', sales: 'Sales', follower: 'Follower' };

  var params = new URLSearchParams(location.search);
  var inviteToken = params.get('invite');
  var email = '';
  var account = null;
  var team = null;

  function $(id) { return document.getElementById(id); }
  function show(id, on) { $(id).hidden = !on; }

  function token() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function setToken(t) {
    try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  // Calls the API; resolves { ok, status, data, res }
  async function api(path, options) {
    options = options || {};
    var headers = {};
    if (options.body) headers['Content-Type'] = 'application/json';
    if (options.auth !== false && token()) headers.Authorization = 'Bearer ' + token();
    var res;
    try {
      res = await fetch(API + path, { method: options.method || 'GET', headers: headers, body: options.body ? JSON.stringify(options.body) : undefined });
    } catch (e) {
      return { ok: false, status: 0, data: { error: 'Can’t reach forProducers right now. Check your connection and try again.' } };
    }
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401 && options.auth !== false) { setToken(null); render(); }
    return { ok: res.ok, status: res.status, data: data || {}, res: res };
  }

  function message(text, kind) {
    var box = $('pageMsg');
    box.textContent = text || '';
    box.className = 'acct-msg' + (kind ? ' ' + kind : '');
    box.hidden = !text;
  }

  function errorText(r, fallback) {
    if (r.status === 429) return 'Too many tries. Wait a minute, then try again.';
    return (r.data && (r.data.error || r.data.message)) || fallback || 'Something went wrong. Please try again.';
  }

  function formatDate(ms) {
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // ---------- Sign in ----------
  async function sendCode(e) {
    if (e) e.preventDefault();
    $('emailError').textContent = '';
    var value = $('email').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { $('emailError').textContent = 'Enter a valid email address.'; return; }
    $('sendCodeBtn').disabled = true;
    var r = await api('/api/auth/email-otp/send-verification-otp', { method: 'POST', body: { email: value, type: 'sign-in' }, auth: false });
    $('sendCodeBtn').disabled = false;
    if (!r.ok) { $('emailError').textContent = errorText(r); return; }
    email = value;
    $('codeSub').textContent = 'We sent a code to ' + email + '. It expires in 10 minutes.';
    show('emailForm', false);
    show('codeForm', true);
    $('code').value = '';
    $('code').focus();
  }

  async function signIn(e) {
    if (e) e.preventDefault();
    if ($('signInBtn').disabled) return;
    $('codeError').textContent = '';
    var otp = $('code').value.replace(/\D/g, '');
    if (otp.length !== 6) { $('codeError').textContent = 'Enter the 6-digit code from the email.'; return; }
    $('signInBtn').disabled = true;
    var r = await api('/api/auth/sign-in/email-otp', { method: 'POST', body: { email: email, otp: otp }, auth: false });
    $('signInBtn').disabled = false;
    var t = r.res && r.res.headers.get('set-auth-token');
    if (!r.ok || !t) { $('codeError').textContent = r.ok ? 'Sign-in didn’t finish. Please try again.' : 'That code didn’t work. Check it, or send a new one.'; return; }
    setToken(t);
    show('codeForm', false);
    show('emailForm', true);
    await render();
  }

  async function signOut() {
    await api('/api/auth/sign-out', { method: 'POST', body: {} });
    setToken(null);
    account = null;
    message('');
    render();
  }

  // ---------- Dashboard ----------
  async function render() {
    var signedIn = !!token();
    show('signInCard', !signedIn);
    show('dashboard', false);
    $('lede').textContent = signedIn ? 'Loading your account…' : 'Sign in with the email you use in the app.';
    await renderInvite();
    if (!signedIn) return;

    var r = await api('/v1/account');
    if (!r.ok) { if (r.status !== 401) message(errorText(r), 'bad'); return; }
    account = r.data;
    $('lede').textContent = 'Signed in as ' + account.user.email + '.';
    show('dashboard', true);
    renderPlan();
    renderProfile();
    await renderTeam();
  }

  function renderPlan() {
    var plan = account.plan;
    var sub = account.subscription;
    var badge = $('planBadge');
    badge.textContent = PLAN_NAMES[plan];
    badge.className = 'plan-badge ' + plan;
    var text;
    if (sub) {
      var when = sub.renewsAt ? formatDate(sub.renewsAt) : null;
      text = 'You have ' + PLAN_NAMES[sub.plan] + '. ' + (sub.cancelAtPeriodEnd ? (when ? 'It ends on ' + when + ', then your account returns to Free.' : 'It ends at the end of this billing period.') : (when ? 'It renews on ' + when + '.' : ''));
      if (sub.status === 'past_due') text += ' Your last payment didn’t go through. Update your card in Manage billing.';
    } else if (plan === 'team' && account.team) {
      text = 'You’re on Team through ' + account.team.name + '.';
    } else {
      text = 'You’re on the Free plan.';
    }
    $('planText').textContent = text;
    show('planOptions', !sub);
    show('billingActions', !!account.hasBilling);
  }

  async function checkout(plan) {
    $('planError').textContent = '';
    var r = await api('/v1/checkout', { method: 'POST', body: { plan: plan } });
    if (r.ok && r.data.url) { location.href = r.data.url; return; }
    $('planError').textContent = errorText(r);
  }

  async function portal() {
    $('planError').textContent = '';
    var r = await api('/v1/portal', { method: 'POST' });
    if (r.ok && r.data.url) { location.href = r.data.url; return; }
    $('planError').textContent = errorText(r);
  }

  function renderProfile() {
    $('profileEmail').textContent = account.user.email;
    $('nameInput').value = account.user.name || '';
  }

  async function saveName(e) {
    e.preventDefault();
    $('nameError').textContent = '';
    var r = await api('/v1/me', { method: 'PATCH', body: { name: $('nameInput').value } });
    $('nameError').textContent = r.ok ? 'Saved.' : errorText(r);
  }

  // ---------- Team ----------
  async function renderTeam() {
    var r = await api('/v1/team');
    if (!r.ok) { $('teamError').textContent = errorText(r); show('teamCard', true); return; }
    team = r.data;
    var hasTeam = !!team.team;
    show('teamCard', hasTeam || team.canCreate);
    show('createTeamForm', !hasTeam && team.canCreate);
    show('teamBody', hasTeam);
    $('teamError').textContent = '';
    if (!hasTeam) {
      $('teamTitle').textContent = 'Team';
      $('teamText').textContent = 'Name your team, then invite producers, sales reps and followers.';
      return;
    }
    var owner = team.me.owner;
    $('teamTitle').textContent = team.team.name;
    $('teamText').textContent = (owner ? 'You own this team.' : 'You’re on this team as ' + ROLE_NAMES[team.me.role] + '.') +
      (team.team.active ? '' : ' The team’s subscription has ended, so members are on their own plans. Everything is kept until it resubscribes.');
    $('seatText').textContent = team.seats.used + ' of ' + team.seats.limit + ' seats used' + (team.seats.pending ? ' · ' + team.seats.pending + ' invited' : '') + ' · followers are free';
    show('ownerTools', owner);
    show('leaveActions', !owner);
    if (owner) $('renameInput').value = team.team.name;

    var list = $('memberList');
    list.textContent = '';
    team.members.forEach(function (m) {
      var row = document.createElement('div');
      row.className = 'acct-row';
      var who = document.createElement('div');
      who.className = 'who';
      var b = document.createElement('b');
      b.textContent = (m.name || m.email) + (m.owner ? ' (owner)' : '');
      var small = document.createElement('small');
      small.textContent = m.name ? m.email : '';
      who.appendChild(b);
      who.appendChild(small);
      row.appendChild(who);
      var right = document.createElement('div');
      right.className = 'member-controls';
      if (owner) {
        var select = document.createElement('select');
        select.setAttribute('aria-label', 'Role for ' + m.email);
        ['producer', 'sales', 'follower'].forEach(function (role) {
          if (m.owner && role === 'follower') return;
          var o = document.createElement('option');
          o.value = role;
          o.textContent = ROLE_NAMES[role];
          if (role === m.role) o.selected = true;
          select.appendChild(o);
        });
        select.addEventListener('change', function () { teamCall('/v1/team/members/' + encodeURIComponent(m.id), 'PATCH', { role: select.value }); });
        right.appendChild(select);
        if (!m.owner) {
          var remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'btn';
          remove.textContent = 'Remove';
          remove.addEventListener('click', function () {
            if (confirm('Remove ' + m.email + ' from the team?')) teamCall('/v1/team/members/' + encodeURIComponent(m.id), 'DELETE');
          });
          right.appendChild(remove);
        }
      } else {
        var role = document.createElement('span');
        role.textContent = ROLE_NAMES[m.role];
        right.appendChild(role);
      }
      row.appendChild(right);
      list.appendChild(row);
    });

    var pending = $('pendingList');
    pending.textContent = '';
    (team.invites || []).forEach(function (inv) {
      var row = document.createElement('div');
      row.className = 'acct-row';
      var who = document.createElement('div');
      who.className = 'who';
      var b = document.createElement('b');
      b.textContent = inv.email;
      var small = document.createElement('small');
      small.textContent = 'Invited as ' + ROLE_NAMES[inv.role] + ' · expires ' + formatDate(inv.expires_at);
      who.appendChild(b);
      who.appendChild(small);
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn';
      cancel.textContent = 'Cancel invite';
      cancel.addEventListener('click', function () { teamCall('/v1/team/invites/' + encodeURIComponent(inv.id), 'DELETE'); });
      row.appendChild(who);
      row.appendChild(cancel);
      pending.appendChild(row);
    });
  }

  async function teamCall(path, method, body) {
    $('teamError').textContent = '';
    var r = await api(path, { method: method, body: body });
    if (!r.ok) { $('teamError').textContent = errorText(r); await renderTeam(); return false; }
    // Roles change plans, so refresh the whole account
    await render();
    return true;
  }

  async function createTeam(e) {
    e.preventDefault();
    var name = $('teamName').value.trim();
    if (!name) { $('teamError').textContent = 'Give your team a name.'; return; }
    await teamCall('/v1/teams', 'POST', { name: name });
  }

  async function sendInvite(e) {
    e.preventDefault();
    var inviteEmail = $('inviteEmail').value.trim();
    if (await teamCall('/v1/team/invites', 'POST', { email: inviteEmail, role: $('inviteRole').value })) {
      $('inviteEmail').value = '';
      message('Invite sent to ' + inviteEmail.toLowerCase() + '.', 'good');
    }
  }

  async function rename(e) {
    e.preventDefault();
    await teamCall('/v1/team', 'PATCH', { name: $('renameInput').value.trim() });
  }

  async function leave() {
    if (!confirm('Leave ' + team.team.name + '? You’ll go back to your own plan.')) return;
    var r = await api('/v1/team/members/' + encodeURIComponent(account.user.id), { method: 'DELETE' });
    if (!r.ok) { $('teamError').textContent = errorText(r); return; }
    await render();
  }

  // ---------- Invites ----------
  var invitePreview = null;
  async function renderInvite() {
    if (!inviteToken) return;
    if (!invitePreview) {
      var r = await api('/invites/preview?token=' + encodeURIComponent(inviteToken), { auth: false });
      invitePreview = r.ok ? r.data : { error: errorText(r) };
    }
    show('inviteCard', true);
    if (invitePreview.error) {
      $('inviteTitle').textContent = 'Invite';
      $('inviteText').textContent = invitePreview.error;
      show('inviteActions', false);
      return;
    }
    $('inviteTitle').textContent = 'Join ' + invitePreview.team;
    $('inviteText').textContent = invitePreview.inviter + ' invited ' + invitePreview.email + ' to join ' + invitePreview.team + ' as ' + ROLE_NAMES[invitePreview.role] + '.' +
      (token() ? '' : ' Sign in with that email below to accept.');
    show('inviteActions', !!token());
    if (!token() && !$('email').value) $('email').value = invitePreview.email;
  }

  async function acceptInvite() {
    $('inviteError').textContent = '';
    var r = await api('/v1/team/invites/accept', { method: 'POST', body: { token: inviteToken } });
    if (!r.ok) { $('inviteError').textContent = errorText(r); return; }
    inviteToken = null;
    history.replaceState(null, '', location.pathname);
    show('inviteCard', false);
    message('You joined ' + invitePreview.team + '. Restart forProducers to pick up your new plan.', 'good');
    await render();
  }

  // ---------- Wiring ----------
  document.addEventListener('DOMContentLoaded', function () {
    $('emailForm').addEventListener('submit', sendCode);
    $('codeForm').addEventListener('submit', signIn);
    $('code').addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 6);
      if (this.value.length === 6) signIn();
    });
    $('resendBtn').addEventListener('click', function () { $('email').value = email; sendCode(); });
    $('otherEmailBtn').addEventListener('click', function () { show('codeForm', false); show('emailForm', true); $('email').focus(); });
    $('signOutBtn').addEventListener('click', signOut);
    $('portalBtn').addEventListener('click', portal);
    Array.prototype.forEach.call(document.querySelectorAll('[data-checkout]'), function (b) {
      b.addEventListener('click', function () { checkout(b.getAttribute('data-checkout')); });
    });
    $('nameForm').addEventListener('submit', saveName);
    $('createTeamForm').addEventListener('submit', createTeam);
    $('inviteForm').addEventListener('submit', sendInvite);
    $('renameForm').addEventListener('submit', rename);
    $('leaveBtn').addEventListener('click', leave);
    $('inviteAcceptBtn').addEventListener('click', acceptInvite);

    var checkoutResult = params.get('checkout');
    if (checkoutResult === 'success') message('Thanks! Your plan is active. Restart forProducers to unlock it.', 'good');
    if (checkoutResult === 'cancelled') message('Checkout was cancelled. Nothing was charged.');
    if (checkoutResult) history.replaceState(null, '', location.pathname + (inviteToken ? '?invite=' + encodeURIComponent(inviteToken) : ''));
    render();
  });
})();
