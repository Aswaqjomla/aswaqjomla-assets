// ─── CONFIG ────────────────────────────────────────────────────
var PRO_GATE_PASSWORD    = 'PRO2025';
var PARTICULAR_PLAN_ID   = 'pln_pending-particular-members-5x8r0cwo';
var PARTICULAR_WEBHOOK   = 'https://hook.eu1.make.com/d26f86g7x3otjfp8ysjlk305la46adre';
var PRO_WEBHOOK          = 'https://hook.eu1.make.com/xohvg5je7ylpgy533k317v7po27b027k';
var PENDING_PAGE         = '/membre-en-attente';
var PRO_PENDING_PAGE     = '/membre-en-attente';

// ─── STATE ─────────────────────────────────────────────────────
var msInstance         = null;
var proMemberstackId   = '';
var proSelectedCity    = '';
var proSelectedMarket  = '';
var proSelectedSector  = '';
var proGoogleMember    = null;

// ─── MEMBERSTACK LOADER ────────────────────────────────────────
function getMsInstance() {
  return new Promise(function(resolve, reject) {
    if (msInstance) { resolve(msInstance); return; }
    var attempts = 0;
    var check = setInterval(function() {
      attempts++;
      var ms = window.$memberstackDom;
      if (ms) {
        if (typeof ms.then === 'function') {
          ms.then(function(m) { msInstance = m; clearInterval(check); resolve(m); }).catch(reject);
        } else if (typeof ms.loginWithProvider === 'function') {
          msInstance = ms; clearInterval(check); resolve(ms);
        }
      }
      if (attempts > 30) { clearInterval(check); reject(new Error('MS not loaded')); }
    }, 200);
  });
}

// ─── HELPERS ───────────────────────────────────────────────────
function togglePwd(id) {
  var el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
}

function showE(id) { var el = document.getElementById(id); if(el){ el.classList.add('visible'); el.style.display = 'block'; } }
function hideE(id) { var el = document.getElementById(id); if(el){ el.classList.remove('visible'); el.style.display = 'none'; } }
function gv(id)    { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

function showSuccess(msg) {
  document.querySelectorAll('.aj-panel').forEach(function(p){ p.style.display = 'none'; });
  document.querySelectorAll('.aj-tabs').forEach(function(t){ t.style.display = 'none'; });
  var s = document.getElementById('aj-success');
  if (msg) document.getElementById('aj-success-msg').textContent = msg;
  s.classList.add('visible');
}

// ─── TABS ──────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.aj-tab').forEach(function(t){ t.classList.remove('active'); });
  document.querySelectorAll('.aj-panel').forEach(function(p){ p.classList.remove('active'); });
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('panel-' + tab).classList.add('active');
}

// ─── PASSWORD STRENGTH ─────────────────────────────────────────
document.getElementById('p-password').addEventListener('input', function() {
  var v = this.value, s = 0;
  if (v.length >= 8) s++;
  if (/[A-Z]/.test(v)) s++;
  if (/[0-9]/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  var colors = ['#e2ddd8','#e74c3c','#e67e22','#f1c40f','#2a7a4b'];
  var labels = ['','Faible','Moyen','Bon','Très fort'];
  document.getElementById('p-strength-fill').style.cssText = 'width:'+(s/4*100)+'%!important;background:'+colors[s]+'!important;';
  var t = document.getElementById('p-strength-text');
  t.textContent = v.length > 0 ? labels[s] : '';
  t.style.color = colors[s];
});

// ═══════════════════════════════════════════════════════════════
// PARTICULIER FLOW
// ═══════════════════════════════════════════════════════════════

// Google signup — Particulier
function startGoogleSignup(type) {
  var errId = type === 'particulier' ? 'p-error' : 'pro-step1-error';
  var errBox = document.getElementById(errId);
  if (errBox) { errBox.classList.remove('visible'); errBox.style.display = 'none'; }

  getMsInstance().then(function(ms) {
    if (type === 'particulier') {
      return ms.signupWithProvider({
        provider: 'google',
        plans: [{ planId: PARTICULAR_PLAN_ID }],
        allowLogin: true
      });
    } else {
      return ms.signupWithProvider({
        provider: 'google',
        allowLogin: true
      });
    }
  }).then(function(result) {
    if (result && result.data) {
      if (type === 'particulier') {
        proGoogleMember = result.data.member;
        // Show step 2 to collect phone + city
        document.getElementById('p-manual-form').style.display = 'none';
        document.querySelector('#panel-particulier .aj-google-btn').style.display = 'none';
        document.querySelector('#panel-particulier .aj-divider').style.display = 'none';
        document.getElementById('p-google-step2').style.display = 'block';
        // Pre-fill name if available
        if (result.data.member.customFields && result.data.member.customFields['first-name']) {
          document.getElementById('p-g-name').value = result.data.member.customFields['first-name'];
        }
      } else {
        proGoogleMember = result.data.member;
        proMemberstackId = result.data.member.id;
        goToProStep2();
      }
    }
  }).catch(function(err) {
    if (errBox) {
      errBox.textContent = 'Erreur Google. Réessayez.';
      errBox.classList.add('visible');
      errBox.style.display = 'block';
    }
  });
}

// Submit Google Particulier (after collecting phone + city)
async function submitParticularGoogle() {
  var name  = gv('p-g-name');
  var phone = gv('p-g-phone');
  var city  = gv('p-g-city');
  var terms = document.getElementById('p-g-terms').checked;
  var ok = true;

  if (!terms) { showE('err-p-g-terms'); ok = false; } else hideE('err-p-g-terms');
  if (!ok) return;

  var btn = document.getElementById('p-g-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="aj-spinner"></span>Envoi…';

  try {
    // Update Memberstack custom fields
    var ms = await getMsInstance();
    await ms.updateMember({
      customFields: {
        'phone-number' : phone,
        'city-location': city,
        'first-name'   : name
      }
    });

    // Send to Make
    await fetch(PARTICULAR_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: name,
        email: proGoogleMember.auth ? proGoogleMember.auth.email : '',
        phone: phone,
        city: city,
        memberstack_id: proGoogleMember.id,
        signup_method: 'google',
        status: 'En attente'
      })
    });

    showSuccess('Votre demande est en cours de vérification. Vous recevrez un email de confirmation.');
    setTimeout(function() { window.location.href = PENDING_PAGE; }, 2500);

  } catch(err) {
    btn.disabled = false;
    btn.innerHTML = 'Finaliser mon inscription →';
    var errBox = document.getElementById('p-g-error');
    errBox.textContent = 'Une erreur est survenue. Réessayez.';
    errBox.classList.add('visible');
    errBox.style.display = 'block';
  }
}

// Manual Particulier signup
async function submitParticular() {
  var name     = gv('p-name');
  var email    = gv('p-email');
  var phone    = gv('p-phone');
  var city     = gv('p-city');
  var password = document.getElementById('p-password').value;
  var confirm  = document.getElementById('p-confirm').value;
  var terms    = document.getElementById('p-terms').checked;
  var ok = true;

  if (!name)  { showE('err-p-name'); ok=false; } else hideE('err-p-name');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showE('err-p-email'); ok=false; } else hideE('err-p-email');
  if (!phone) { showE('err-p-phone'); ok=false; } else hideE('err-p-phone');
  if (!city)  { showE('err-p-city'); ok=false; } else hideE('err-p-city');
  if (password.length < 8) { showE('err-p-password'); ok=false; } else hideE('err-p-password');
  if (password !== confirm) { showE('err-p-confirm'); ok=false; } else hideE('err-p-confirm');
  if (!terms) { showE('err-p-terms'); ok=false; } else hideE('err-p-terms');
  if (!ok) return;

  var btn = document.getElementById('p-submit');
  var errBox = document.getElementById('p-error');
  btn.disabled = true;
  btn.innerHTML = '<span class="aj-spinner"></span>Création…';
  errBox.classList.remove('visible'); errBox.style.display = 'none';

  try {
    var ms = await getMsInstance();
    var result = await ms.signupMemberEmailPassword({
      email: email,
      password: password,
      plans: [{ planId: PARTICULAR_PLAN_ID }],
      customFields: {
        'first-name'   : name,
        'phone-number' : phone,
        'city-location': city
      }
    });

    if (!result || !result.data) throw new Error('signup_failed');

    var memberId = result.data.member.id;

    // Send to Make
    await fetch(PARTICULAR_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: name, email: email, phone: phone,
        city: city, memberstack_id: memberId,
        signup_method: 'manual', status: 'En attente'
      })
    });

    showSuccess('Votre demande est en cours de vérification. Vous recevrez un email de confirmation.');
    setTimeout(function() { window.location.href = PENDING_PAGE; }, 2500);

  } catch(err) {
    btn.disabled = false;
    btn.innerHTML = 'Créer mon compte →';
    var msg = 'Une erreur est survenue. Réessayez.';
    if (err.message && err.message.includes('already')) msg = 'Cette adresse email est déjà utilisée.';
    errBox.textContent = msg;
    errBox.classList.add('visible');
    errBox.style.display = 'block';
  }
}

// ═══════════════════════════════════════════════════════════════
// PROFESSIONNEL FLOW
// ═══════════════════════════════════════════════════════════════

// Password gate
function checkProGate() {
  var pwd = gv('pro-gate-pwd');
  var errEl = document.getElementById('err-gate');
  if (pwd === PRO_GATE_PASSWORD) {
    document.getElementById('pro-gate').style.display = 'none';
    document.getElementById('pro-form-wrap').style.display = 'block';
  } else {
    errEl.textContent = 'Code incorrect. Veuillez réessayer.';
    errEl.style.display = 'block';
    errEl.classList.add('visible');
  }
}

// Allow Enter key on gate password
document.getElementById('pro-gate-pwd').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') checkProGate();
});

// Step navigation
function goToProStep2() {
  document.getElementById('pro-step-1').style.display = 'none';
  document.getElementById('pro-step-2').style.display = 'block';
  document.getElementById('pro-step-1-ind').classList.remove('active');
  document.getElementById('pro-step-1-ind').classList.add('done');
  document.getElementById('pro-step-2-ind').classList.add('active');
}

function goToProStep3() {
  document.getElementById('pro-step-2').style.display = 'none';
  document.getElementById('pro-step-3').style.display = 'block';
  document.getElementById('pro-step-2-ind').classList.remove('active');
  document.getElementById('pro-step-2-ind').classList.add('done');
  document.getElementById('pro-step-3-ind').classList.add('active');
  // Pre-fill name from step 1
  if (gv('pro-name') && !gv('pro-fullname')) {
    document.getElementById('pro-fullname').value = gv('pro-name');
  }
  if (proGoogleMember && !gv('pro-fullname')) {
    var ms_name = proGoogleMember.customFields && proGoogleMember.customFields['first-name'];
    if (ms_name) document.getElementById('pro-fullname').value = ms_name;
  }
}

// Step 1 — validate and create Memberstack account (manual)
async function proStep1Next() {
  // Check if Google already handled step 1
  if (proGoogleMember) { goToProStep2(); return; }

  var name     = gv('pro-name');
  var email    = gv('pro-email');
  var password = document.getElementById('pro-password').value;
  var confirm  = document.getElementById('pro-confirm').value;
  var ok = true;

  if (!name)  { showE('err-pro-name'); ok=false; } else hideE('err-pro-name');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showE('err-pro-email'); ok=false; } else hideE('err-pro-email');
  if (password.length < 8) { showE('err-pro-password'); ok=false; } else hideE('err-pro-password');
  if (password !== confirm) { showE('err-pro-confirm'); ok=false; } else hideE('err-pro-confirm');
  if (!ok) return;

  var btn = document.querySelector('#pro-step-1 .aj-btn');
  var errBox = document.getElementById('pro-step1-error');
  btn.disabled = true;
  btn.innerHTML = '<span class="aj-spinner"></span>Création du compte…';
  errBox.classList.remove('visible'); errBox.style.display = 'none';

  try {
    var ms = await getMsInstance();
    var result = await ms.signupMemberEmailPassword({
      email: email,
      password: password,
      customFields: { 'first-name': name }
    });

    if (!result || !result.data) throw new Error('signup_failed');
    proMemberstackId = result.data.member.id;
    btn.disabled = false;
    btn.innerHTML = 'Continuer →';
    goToProStep2();

  } catch(err) {
    btn.disabled = false;
    btn.innerHTML = 'Continuer →';
    var msg = 'Une erreur est survenue. Réessayez.';
    if (err.message && err.message.includes('already')) msg = 'Cette adresse email est déjà utilisée.';
    errBox.textContent = msg;
    errBox.classList.add('visible');
    errBox.style.display = 'block';
  }
}

// City selection
function selectCity(city) {
  var notice = document.getElementById('city-notice');
  if (city === 'Casablanca') {
    proSelectedCity = city;
    notice.classList.remove('visible');
    setTimeout(function() { goToProStep3(); }, 300);
  } else {
    proSelectedCity = '';
    notice.classList.add('visible');
  }
}

// Market selection — only Derbghalef is available for now
function selectMarket(btn, market) {
  var notice = document.getElementById('souk-notice');
  if (market === 'Derbghalef') {
    document.querySelectorAll('.aj-market-btn').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    proSelectedMarket = market;
    if (notice) notice.classList.remove('visible');
    hideE('err-pro-market');
  } else {
    document.querySelectorAll('.aj-market-btn').forEach(function(b){ b.classList.remove('active'); });
    proSelectedMarket = '';
    if (notice) notice.classList.add('visible');
  }
}

// Help-me-choose quiz + language
var sectorLang = 'fr';
var lastQuizSector = '';

function quizResultText(sector) {
  if (sectorLang === 'ar') {
    return '✓ القطاع المختار: ' + sector + ' — تقدر تبدلو من تحت إلا بغيتي.';
  }
  return '✓ Secteur sélectionné : ' + sector + ' — vous pouvez le modifier ci-dessous si besoin.';
}

function setSectorLang(lang) {
  sectorLang = lang;
  document.getElementById('lang-fr').classList.toggle('active', lang === 'fr');
  document.getElementById('lang-ar').classList.toggle('active', lang === 'ar');

  // Swap all bilingual texts in step 3
  document.querySelectorAll('#pro-step-3 [data-fr]').forEach(function(el){
    el.textContent = el.getAttribute(lang === 'ar' ? 'data-ar' : 'data-fr');
  });

  // RTL direction for Arabic
  var dir = lang === 'ar' ? 'rtl' : 'ltr';
  var quiz = document.getElementById('aj-quiz');
  if (quiz) quiz.setAttribute('dir', dir);
  document.querySelectorAll('.aj-sector-desc').forEach(function(el){
    el.setAttribute('dir', dir);
    el.style.textAlign = lang === 'ar' ? 'right' : 'left';
  });

  // Re-render quiz result if visible
  var res = document.getElementById('aj-quiz-result');
  if (res && res.style.display === 'block' && lastQuizSector) {
    res.textContent = quizResultText(lastQuizSector);
    res.setAttribute('dir', dir);
  }
}

function toggleQuiz() {
  var q = document.getElementById('aj-quiz');
  q.classList.toggle('visible');
}

function quizPick(sector) {
  var matched = null;
  document.querySelectorAll('.aj-sector-btn').forEach(function(b){
    b.classList.remove('active');
    if (b.getAttribute('data-sector') === sector) { b.classList.add('active'); matched = b; }
  });
  proSelectedSector = sector;
  lastQuizSector = sector;
  hideE('err-pro-sector');
  var res = document.getElementById('aj-quiz-result');
  res.textContent = quizResultText(sector);
  res.setAttribute('dir', sectorLang === 'ar' ? 'rtl' : 'ltr');
  res.style.display = 'block';
  if (matched) {
    setTimeout(function(){ matched.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 200);
  }
}

// Sector selection
function selectSector(btn, sector) {
  document.querySelectorAll('.aj-sector-btn').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  proSelectedSector = sector;
}

// Step 3 — final submit
async function submitPro() {
  var phone    = gv('pro-phone');
  var fullname = gv('pro-fullname');
  var physical = document.getElementById('pro-physical').checked;
  var terms    = document.getElementById('pro-terms').checked;
  var ok = true;

  if (!phone)            { showE('err-pro-phone'); ok=false; } else hideE('err-pro-phone');
  if (!proSelectedMarket){ showE('err-pro-market'); ok=false; } else hideE('err-pro-market');
  if (!proSelectedSector){ showE('err-pro-sector'); ok=false; } else hideE('err-pro-sector');
  if (!physical)         { showE('err-pro-physical'); ok=false; } else hideE('err-pro-physical');
  if (!terms)            { showE('err-pro-terms'); ok=false; } else hideE('err-pro-terms');
  if (!ok) return;

  var btn = document.querySelector('#pro-step-3 .aj-btn');
  var errBox = document.getElementById('pro-step3-error');
  btn.disabled = true;
  btn.innerHTML = '<span class="aj-spinner"></span>Envoi…';
  errBox.classList.remove('visible'); errBox.style.display = 'none';

  // Get email
  var email = proGoogleMember ?
    (proGoogleMember.auth ? proGoogleMember.auth.email : '') :
    gv('pro-email');

  var name = fullname || gv('pro-name') ||
    (proGoogleMember && proGoogleMember.customFields ? proGoogleMember.customFields['first-name'] : '');

  var memberId = proMemberstackId || (proGoogleMember ? proGoogleMember.id : '');

  try {
    // Update Memberstack custom fields
    var ms = await getMsInstance();
    await ms.updateMember({
      customFields: {
        'phone-number'      : phone,
        'city-location'     : proSelectedCity,
        'souk-location'     : proSelectedMarket,
        'domain-service'    : proSelectedSector,
        'physical-existing' : 'true',
        'first-name'        : name
      }
    });

    // Send the COMPLETE payload to Make (fires only at the end of step 3)
    await fetch(PRO_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name      : name,
        email          : email,
        phone          : phone,
        city           : proSelectedCity,
        souk           : proSelectedMarket,
        sector         : proSelectedSector,
        physical       : true,
        memberstack_id : memberId,
        member_type    : 'professionnel',
        signup_method  : proGoogleMember ? 'google' : 'manual',
        status         : 'En attente'
      })
    });

    showSuccess('Votre demande professionnelle est en cours de vérification. Vous recevrez un email sous 24-48h.');
    setTimeout(function() { window.location.href = PRO_PENDING_PAGE; }, 2500);

  } catch(err) {
    btn.disabled = false;
    btn.innerHTML = 'Soumettre ma demande →';
    errBox.textContent = 'Une erreur est survenue. Réessayez.';
    errBox.classList.add('visible');
    errBox.style.display = 'block';
  }
}

// Pre-load Memberstack
window.addEventListener('load', function() { getMsInstance().catch(function(){}); });
