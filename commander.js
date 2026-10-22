// ─── CONFIG ────────────────────────────────────────────────────
var APPROVED_PLAN_ID = 'pln_particular-member-h16h0v8x';
var WEBHOOK_URL      = 'https://hook.eu1.make.com/y2ueyxytwnfysirx8auemj6n6y7ezl4u';
var CART_KEY         = 'aj_cart';

// ─── READ CMS DATA ─────────────────────────────────────────────
var _offer = (function() {
  var el = document.getElementById('aj-offer-data');
  if (!el) return {};
  return {
    offerId    : el.dataset.offerId    || '',
    offerName  : el.dataset.offerName  || '',
    offerImage : el.dataset.offerImage || '',
    shopId     : el.dataset.shopId     || '',
    shopName   : el.dataset.shopName   || '',
    vendorName : el.dataset.vendorName || '',
    vendorPhone: el.dataset.vendorPhone|| '',
    vendorEmail: el.dataset.vendorEmail|| '',
    vente      : (el.dataset.vente || '').toLowerCase(),
    price      : parseFloat(el.dataset.price) || 0,
    priceGros  : parseFloat(el.dataset.priceGros) || 0,
    moq        : Math.max(1, parseInt(el.dataset.moq) || 1),
    nego       : parseInt(el.dataset.nego) || 0,
    variations : (el.dataset.variations || '').split(',').map(function(v){ return v.trim(); }).filter(Boolean),
  };
})();

// ─── CART HELPERS ──────────────────────────────────────────────
function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
  catch(e) { return []; }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateAllBadges();
}
function addToCart(item) {
  var cart = getCart();
  var ex = cart.find(function(i){ return i.offerId === item.offerId; });
  if (ex) { ex.quantity += item.quantity; }
  else { cart.push(item); }
  saveCart(cart);
}
function removeFromCart(offerId) {
  saveCart(getCart().filter(function(i){ return i.offerId !== offerId; }));
}
function changeCartQty(offerId, delta) {
  var cart = getCart();
  var item = cart.find(function(i){ return i.offerId === offerId; });
  if (item) { item.quantity = Math.max(1, item.quantity + delta); saveCart(cart); }
}
function getCartCount() {
  return getCart().reduce(function(s,i){ return s + i.quantity; }, 0);
}
function getCartTotal() {
  return getCart().reduce(function(s,i){ return s + (parseFloat(i.price)||0)*i.quantity; }, 0);
}
function updateAllBadges() {
  var count = getCartCount();
  var ab = document.getElementById('aj-action-badge');
  if (ab) { ab.textContent = count; ab.style.display = count > 0 ? 'flex' : 'none'; }
  document.querySelectorAll('.aj-cart-badge').forEach(function(el){
    el.textContent = count;
    el.style.display = count > 0 ? 'flex' : 'none';
  });
}

// ─── MEMBERSTACK AUTH CHECK ────────────────────────────────────
var _memberChecked = false;
var _memberData    = null;
function getMsInstance() {
  return new Promise(function(resolve) {
    var attempts = 0;
    var check = setInterval(function() {
      attempts++;
      var ms = window.$memberstackDom;
      if (ms) {
        if (typeof ms.then === 'function') {
          ms.then(function(m){ clearInterval(check); resolve(m); });
        } else if (typeof ms.getMemberJSON === 'function') {
          clearInterval(check); resolve(ms);
        }
      }
      if (attempts > 20) { clearInterval(check); resolve(null); }
    }, 200);
  });
}
async function checkMemberAccess() {
  if (_memberChecked) return _memberData;
  _memberChecked = true;
  try {
    var ms = await getMsInstance();
    if (!ms) return null;
    try {
      var result = await ms.getMemberJSON();
      if (result && result.data) { _memberData = result.data; return _memberData; }
    } catch(e1) {}
    try {
      var result2 = await ms.getCurrentMember();
      if (result2 && result2.data) { _memberData = result2.data; return _memberData; }
    } catch(e2) {}
  } catch(e) {}
  return null;
}
function hasPlan(member, planId) {
  if (!member) return false;
  var plans = member.planConnections || member.plans || member.activePlans || [];
  if (plans.length > 0) {
    return plans.some(function(p){
      return p.planId === planId || p.id === planId || p === planId ||
             (p.plan && (p.plan.id === planId || p.plan.planId === planId));
    });
  }
  if (member.id || member.auth) {
    var memberStr = JSON.stringify(member);
    if (memberStr.indexOf(planId) !== -1) return true;
  }
  return false;
}

// ─── SHOW ORDER FORM DIRECTLY ──────────────────────────────────
function showOrderFormDirect() {
  document.getElementById('cmd-member-nudge').style.display = 'none';
  document.getElementById('cmd-order-form').style.display   = 'block';
}

// ─── ORDER MODE (gros / detail) ────────────────────────────────
var _orderMode = 'detail';
function cmdActivePrice() {
  return _orderMode === 'gros'
    ? (_offer.priceGros > 0 ? _offer.priceGros : _offer.price)
    : _offer.price;
}
function cmdApplyMode() {
  var qty = document.getElementById('cmd-qty');
  var negoWrap = document.getElementById('cmd-nego-wrap');
  var moqHint = document.getElementById('cmd-moq-hint');
  if (_orderMode === 'gros') {
    if (qty) {
      qty.min = _offer.moq || 1;
      if ((parseInt(qty.value)||0) < (_offer.moq||1)) qty.value = _offer.moq || 1;
    }
    if (moqHint) moqHint.textContent = (_offer.moq > 1) ? '⚠️ Commande minimum : ' + _offer.moq : '';
    cmdResetNego();
    cmdResetContact();
  } else {
    if (qty) { qty.min = 1; if ((parseInt(qty.value) || 0) < 1) qty.value = 1; }
    if (moqHint) moqHint.textContent = '';
    if (negoWrap) negoWrap.style.display = 'none';
    cmdResetNego();
    cmdResetContact();
  }
  updateCmdPrices();
}
function cmdSetMode(mode) {
  _orderMode = mode;
  /* Changement d'onglet : quantité et variantes repartent de zéro
     (détail = 1, gros = minimum de commande) */
  var _q = document.getElementById('cmd-qty');
  if (_q) _q.value = (mode === 'gros') ? (_offer.moq || 1) : 1;
  cmdBuildVariations();
  var g = document.getElementById('cmd-tab-gros');
  var d = document.getElementById('cmd-tab-detail');
  if (g) {
    g.style.background = mode === 'gros' ? '#0f0f0f' : '#fff';
    g.style.color      = mode === 'gros' ? '#fff' : '#0f0f0f';
    g.style.borderColor= mode === 'gros' ? '#0f0f0f' : '#e2ddd8';
  }
  if (d) {
    d.style.background = mode === 'detail' ? '#0f0f0f' : '#fff';
    d.style.color      = mode === 'detail' ? '#fff' : '#0f0f0f';
    d.style.borderColor= mode === 'detail' ? '#0f0f0f' : '#e2ddd8';
  }
  cmdApplyMode();
}

// ─── VARIATIONS ────────────────────────────────────────────────
var _varQtys = {};
function cmdBuildVariations() {
  var box = document.getElementById('cmd-vars-box');
  var list = document.getElementById('cmd-vars-list');
  if (!box || !list) return;
  _varQtys = {};
  if (!_offer.variations || _offer.variations.length === 0) {
    box.style.display = 'none';
    list.innerHTML = '';
    return;
  }
  box.style.display = 'block';
  list.innerHTML = '';
  _offer.variations.forEach(function(v, idx){
    _varQtys[v] = 0;
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;';
    row.innerHTML =
      '<span style="font-size:13px;font-weight:600;color:#0f0f0f;flex:1;">'+v+'</span>' +
      '<div style="display:flex;align-items:center;background:#fff;border:1.5px solid #e2ddd8;border-radius:10px;overflow:hidden;">' +
        '<button type="button" data-var="'+idx+'" data-d="-1" class="cmd-var-btn" style="width:32px;height:38px;border:none;background:none;cursor:pointer;font-size:16px;color:#0f0f0f;">−</button>' +
        '<span id="cmd-var-q-'+idx+'" style="width:36px;text-align:center;font-size:14px;font-weight:700;">0</span>' +
        '<button type="button" data-var="'+idx+'" data-d="1" class="cmd-var-btn" style="width:32px;height:38px;border:none;background:none;cursor:pointer;font-size:16px;color:#0f0f0f;">+</button>' +
      '</div>';
    list.appendChild(row);
  });
  list.querySelectorAll('.cmd-var-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var idx = parseInt(this.getAttribute('data-var'), 10);
      var d   = parseInt(this.getAttribute('data-d'), 10);
      var name = _offer.variations[idx];
      _varQtys[name] = Math.max(0, (_varQtys[name] || 0) + d);
      document.getElementById('cmd-var-q-'+idx).textContent = _varQtys[name];
      cmdSyncVarTotal();
    });
  });
}
function cmdVarsTotal() {
  var t = 0;
  for (var k in _varQtys) t += _varQtys[k];
  return t;
}
function cmdVarsDetail() {
  var parts = [];
  for (var k in _varQtys) if (_varQtys[k] > 0) parts.push(k + ' x' + _varQtys[k]);
  return parts.join(', ');
}
function cmdSyncVarTotal() {
  var t = cmdVarsTotal();
  var mainQty = document.getElementById('cmd-qty');
  if (mainQty && t > 0) { mainQty.value = t; }
  updateCmdPrices();
}

// ─── NEGOTIATION ───────────────────────────────────────────────
var _negoChannel = null;
function cmdShowNegoForm() {
  var _wrap = document.getElementById('cmd-nego-wrap');
  if (_wrap) _wrap.style.display = 'block';
  var _acts = document.getElementById('cmd-main-actions');
  if (_acts) _acts.style.display = 'none';
  document.getElementById('cmd-nego-form').style.display = 'block';
  document.getElementById('cmd-nego-btn').style.display = 'none';
  document.getElementById('cmd-nego-close').style.display = 'block';
  var qtyBox   = document.getElementById('cmd-qty-box');
  var notesBox = document.getElementById('cmd-notes-box');
  if (qtyBox)   qtyBox.style.display   = 'none';
  if (notesBox) notesBox.style.display = 'none';
  var confirmBtn = document.getElementById('cmd-confirm-btn');
  if (confirmBtn) confirmBtn.style.display = 'none';
  var q = document.getElementById('cmd-nego-qty');
  if (q) {
    q.min = _offer.nego || 1;
    q.placeholder = 'الحد الأدنى للتفاوض : ' + (_offer.nego || 1) + ' · Min: ' + (_offer.nego || 1);
    q.focus();
  }
  var mv = document.getElementById('cmd-nego-min-val');
  if (mv) mv.textContent = _offer.nego || 1;
}
function cmdNegoQtyCheck() {
  var q = parseInt(document.getElementById('cmd-nego-qty').value, 10) || 0;
  var minNego = _offer.nego || 1;
  var ok = q >= minNego;
  var negoBtn = document.getElementById('cmd-nego-confirm-btn');
  var hint    = document.getElementById('cmd-nego-hint');
  var minMsg  = document.getElementById('cmd-nego-min-msg');
  if (negoBtn) negoBtn.style.display = ok ? 'flex' : 'none';
  if (hint)    hint.style.display    = ok ? 'block' : 'none';
  if (minMsg)  minMsg.style.display  = (q > 0 && !ok) ? 'block' : 'none';
  if (ok) {
    var mainQty = document.getElementById('cmd-qty');
    if (mainQty) { mainQty.value = q; }
    updateCmdPrices();
  }
}
function cmdSetNegoChannel(ch) {
  _negoChannel = ch;
  var wa = document.getElementById('cmd-nego-wa');
  var tel = document.getElementById('cmd-nego-tel');
  if (wa) {
    wa.style.background = ch === 'whatsapp' ? '#1a5c2e' : '#fff';
    wa.style.color      = ch === 'whatsapp' ? '#fff' : '#1a5c2e';
    wa.innerHTML        = ch === 'whatsapp' ? '✓ 💬 WhatsApp' : '💬 WhatsApp';
  }
  if (tel) {
    tel.style.background = ch === 'phone' ? '#1a5c2e' : '#fff';
    tel.style.color      = ch === 'phone' ? '#fff' : '#1a5c2e';
    tel.innerHTML        = ch === 'phone' ? '✓ 📞 Téléphone · الهاتف' : '📞 Téléphone · الهاتف';
  }
}
function cmdResetNego() {
  _negoChannel = null;
  var f = document.getElementById('cmd-nego-form');
  if (!f) return;
  f.style.display = 'none';
  /* La boîte verte reste visible en mode gros (message seulement),
     le bouton « Négocier » est maintenant à côté de « Confirmer » */
  var _wrap = document.getElementById('cmd-nego-wrap');
  if (_wrap) _wrap.style.display = (_orderMode === 'gros' && _offer.nego > 0) ? 'block' : 'none';
  document.getElementById('cmd-nego-btn').style.display = 'none';
  document.getElementById('cmd-nego-close').style.display = 'none';
  document.getElementById('cmd-nego-phone').value = '';
  document.getElementById('cmd-nego-qty').value = '';
  cmdSetNegoChannel(null);
  var negoBtn = document.getElementById('cmd-nego-confirm-btn');
  var hint    = document.getElementById('cmd-nego-hint');
  var minMsg  = document.getElementById('cmd-nego-min-msg');
  if (negoBtn) negoBtn.style.display = 'none';
  if (hint)    hint.style.display    = 'none';
  if (minMsg)  minMsg.style.display  = 'none';
  var qtyBox   = document.getElementById('cmd-qty-box');
  var notesBox = document.getElementById('cmd-notes-box');
  if (qtyBox)   qtyBox.style.display   = 'block';
  if (notesBox) notesBox.style.display = 'none';
  var confirmBtn = document.getElementById('cmd-confirm-btn');
  if (confirmBtn) confirmBtn.style.display = 'flex';
  var _acts = document.getElementById('cmd-main-actions');
  if (_acts) _acts.style.display = 'flex';
  /* Bouton « Négocier » à côté de « Confirmer » : mode gros + négociation acceptée */
  var openBtn = document.getElementById('cmd-nego-open-btn');
  if (openBtn) openBtn.style.display = (_orderMode === 'gros' && _offer.nego > 0) ? 'flex' : 'none';
}

// ─── RETAIL CONTACT (Nego Détail) ──────────────────────────────
// « Contacter le vendeur » à côté de « Confirmer ma commande »,
// visible uniquement en mode détail quand Nego Détail est activé.
var _contactReasons = [];
var _contactChannel = null;
/* Prix et « Tout » n'existent que si le vendeur accepte de négocier (Nego Détail) */
function cmdContactAll() {
  return cmdHasNegoDetail() ? ['Prix', 'Infos', 'Livraison'] : ['Infos', 'Livraison'];
}
function cmdHasNegoDetail() {
  var f = document.getElementById('aj-nego-detail-flag');
  return !!f && f.className.indexOf('w-condition-invisible') === -1;
}
function cmdShowContactForm() {
  var w = document.getElementById('cmd-contact-wrap');
  if (w) w.style.display = 'block';
  /* Vendeur sans négociation : aucun formulaire, seulement un message poli */
  var nego = cmdHasNegoDetail();
  var noPrice = document.getElementById('cmd-contact-noprice');
  var body = document.getElementById('cmd-contact-body');
  if (noPrice) noPrice.style.display = nego ? 'none' : 'block';
  if (body) body.style.display = nego ? 'block' : 'none';
  ['cmd-qty-box', 'cmd-main-actions'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  /* la note vocale n'existe que dans ce formulaire de contact */
  var notesBox = document.getElementById('cmd-notes-box');
  if (notesBox) notesBox.style.display = nego ? 'block' : 'none';
  var sheet = document.getElementById('aj-commander-sheet');
  if (sheet) sheet.scrollTop = 0;
}
function cmdPaintReasons() {
  var all = _contactReasons.indexOf('Tout') !== -1;
  document.querySelectorAll('.cmd-reason-btn').forEach(function(b){
    var on = all || _contactReasons.indexOf(b.getAttribute('data-reason')) !== -1;
    b.classList.toggle('is-on', on);
  });
}
function cmdToggleReason(el) {
  var r = el.getAttribute('data-reason');
  var all = _contactReasons.indexOf('Tout') !== -1;
  var allList = cmdContactAll();
  var nego = cmdHasNegoDetail();
  if (r === 'Tout') {
    _contactReasons = all ? [] : ['Tout'];
  } else if (all) {
    _contactReasons = allList.filter(function(x){ return x !== r; });
  } else {
    var i = _contactReasons.indexOf(r);
    if (i !== -1) _contactReasons.splice(i, 1); else _contactReasons.push(r);
    /* « Tout » automatique seulement quand Prix fait partie des choix */
    if (nego && _contactReasons.length === allList.length) _contactReasons = ['Tout'];
  }
  cmdPaintReasons();
  cmdContactCheck();
}
function cmdSetContactChannel(ch) {
  _contactChannel = ch;
  var wa = document.getElementById('cmd-contact-wa');
  var tel = document.getElementById('cmd-contact-tel');
  if (wa) { wa.style.background = ch === 'whatsapp' ? '#3a3fc9' : '#fff'; wa.style.color = ch === 'whatsapp' ? '#fff' : '#3a3fc9'; }
  if (tel) { tel.style.background = ch === 'phone' ? '#3a3fc9' : '#fff'; tel.style.color = ch === 'phone' ? '#fff' : '#3a3fc9'; }
  cmdContactCheck();
}
function cmdContactCheck() {
  var phone = (document.getElementById('cmd-contact-phone') || {value:''}).value.trim();
  var phoneOk = phone.replace(/\D/g, '').length >= 9;
  var missing = [];
  if (_contactReasons.length === 0) missing.push('سبب التواصل');
  if (!_contactChannel) missing.push('طريقة التواصل (واتساب ولا الهاتف)');
  if (!phoneOk) missing.push(phone ? 'رقم هاتف صحيح' : 'رقم الهاتف ديالك');
  var ok = missing.length === 0;
  var b = document.getElementById('cmd-contact-confirm-btn');
  var h = document.getElementById('cmd-contact-hint');
  var m = document.getElementById('cmd-contact-missing');
  if (b) b.style.display = ok ? 'flex' : 'none';
  if (h) h.style.display = ok ? 'block' : 'none';
  if (m) {
    m.innerHTML = '⚠️ باش نصيفطو الطلب ديالك للبائع، باقي خاصك تكمل:<br>• ' + missing.join('<br>• ');
    m.style.display = ok ? 'none' : 'block';
  }
}
function cmdResetContact() {
  _contactReasons = [];
  var w = document.getElementById('cmd-contact-wrap');
  if (!w) return;
  w.style.display = 'none';
  var p = document.getElementById('cmd-contact-phone');
  if (p) p.value = '';
  cmdPaintReasons();
  cmdSetContactChannel(null);
  _contactChannel = null;
  var b = document.getElementById('cmd-contact-confirm-btn');
  var h = document.getElementById('cmd-contact-hint');
  if (b) b.style.display = 'none';
  if (h) h.style.display = 'none';
  var qtyBox = document.getElementById('cmd-qty-box');
  if (qtyBox) qtyBox.style.display = 'block';
  var notesBox = document.getElementById('cmd-notes-box');
  if (notesBox) notesBox.style.display = 'none';
  if (_cmdIsRecording) cmdStopRecording();
  cmdDiscardRecording();
  var actions = document.getElementById('cmd-main-actions');
  if (actions) actions.style.display = 'flex';
  var confirmBtn = document.getElementById('cmd-confirm-btn');
  if (confirmBtn) confirmBtn.style.display = 'flex';
  var contactBtn = document.getElementById('cmd-contact-btn');
  if (contactBtn) contactBtn.style.display = (_orderMode === 'detail') ? 'flex' : 'none';
}
var _contactPhoneEl = document.getElementById('cmd-contact-phone');
if (_contactPhoneEl) _contactPhoneEl.addEventListener('input', cmdContactCheck);

// ─── COMMANDER POPUP ───────────────────────────────────────────
async function openCommanderPopup() {
  document.getElementById('cmd-offer-img').src          = _offer.offerImage || '';
  document.getElementById('cmd-offer-name').textContent = _offer.offerName || '';
  document.getElementById('cmd-shop-name').textContent  = _offer.shopName  || '';

  var v2 = _offer.vente;
  var isGros   = v2.indexOf('gros') !== -1;
  var isDetail = v2.indexOf('tail') !== -1;
  var tabs = document.getElementById('cmd-mode-tabs');
  var tabG = document.getElementById('cmd-tab-gros');
  var tabD = document.getElementById('cmd-tab-detail');
  var grosNotice = document.getElementById('cmd-gros-notice');

  if (isGros && isDetail) {
    if (tabs) tabs.style.display = 'flex';
    if (tabD) tabD.style.display = 'block';
    if (tabG) tabG.innerHTML = '📦 الطلب بالجملة';
    if (grosNotice) {
      grosNotice.innerHTML = '📦 هاد العرض متوفر بالجملة والتقسيط · Vente en gros et au détail';
      grosNotice.style.display = 'block';
    }
    _orderMode = 'gros';
  } else if (isGros) {
    if (tabs) tabs.style.display = 'flex';
    if (tabD) tabD.style.display = 'none';
    if (tabG) tabG.innerHTML = '📦 الطلب بالجملة فقط';
    if (grosNotice) {
      grosNotice.innerHTML = '📦 Cette offre est une vente en gros uniquement · هاد العرض بالجملة فقط';
      grosNotice.style.display = 'block';
    }
    _orderMode = 'gros';
  } else {
    if (tabs) tabs.style.display = 'none';
    if (grosNotice) grosNotice.style.display = 'none';
    _orderMode = 'detail';
  }

  if (_offer.nego > 0) {
    var _gp = _offer.priceGros > 0 ? _offer.priceGros : _offer.price;
    if (_gp > 0) {
      // price set + negotiation accepted
      document.getElementById('cmd-nego-text').innerHTML =
        '🤝 Ce vendeur accepte de négocier le prix à partir de <b>' + _offer.nego + '</b> unités' +
        '<br><span dir="rtl">هاد البائع كيقبل التفاوض على الثمن إلى طلبتي <b>' + _offer.nego + '</b> وحدة أو كثر</span>';
    } else {
      // no price — negotiation is the path
      document.getElementById('cmd-nego-text').innerHTML =
        '🤝 Prix à négocier — à partir de <b>' + _offer.nego + '</b> unités' +
        '<br><span dir="rtl">الثمن للتفاوض — ابتداءً من <b>' + _offer.nego + '</b> وحدة</span>';
    }
  }
  cmdResetNego();
  cmdBuildVariations();
  cmdSetMode(_orderMode);

  var confirmBtn = document.getElementById('cmd-confirm-btn');
  var secondary  = document.getElementById('cmd-secondary-buttons');
  if (confirmBtn) confirmBtn.style.display = 'flex';
  if (secondary)  secondary.style.display  = 'none';
  cmdDiscardRecording();

  var overlay = document.getElementById('aj-commander-overlay');
  var sheet   = document.getElementById('aj-commander-sheet');
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){ sheet.style.transform = 'translateY(0)'; });
  });

  updateCmdPrices();

  var member = await checkMemberAccess();
  var nudge  = document.getElementById('cmd-member-nudge');
  var form   = document.getElementById('cmd-order-form');
  if (!member) {
    nudge.style.display = 'block';
    form.style.display  = 'none';
  } else {
    nudge.style.display = 'none';
    form.style.display  = 'block';
  }
}

function closeCommanderPopup() {
  var sheet = document.getElementById('aj-commander-sheet');
  sheet.style.transform = 'translateY(100%)';
  setTimeout(function(){
    document.getElementById('aj-commander-overlay').style.display = 'none';
    document.body.style.overflow = '';
  }, 350);
}

function cmdGetQty() {
  var min = (_orderMode === 'gros') ? (_offer.moq || 1) : 1;
  return Math.max(min, parseInt(document.getElementById('cmd-qty').value) || min);
}
function cmdQtyChange(delta) {
  var input = document.getElementById('cmd-qty');
  var min = (_orderMode === 'gros') ? (_offer.moq || 1) : 1;
  input.value = Math.max(min, (parseInt(input.value)||min) + delta);
  updateCmdPrices();
}

document.getElementById('cmd-qty').addEventListener('input', updateCmdPrices);
document.getElementById('cmd-qty').addEventListener('blur', function(){
  this.value = cmdGetQty();
  updateCmdPrices();
});
var _negoQtyEl = document.getElementById('cmd-nego-qty');
if (_negoQtyEl) _negoQtyEl.addEventListener('input', cmdNegoQtyCheck);

function updateCmdPrices() {
  var qty   = cmdGetQty();
  var price = cmdActivePrice();
  document.getElementById('cmd-unit-price').textContent  = price > 0 ? price.toFixed(2)+' MAD' : 'À négocier';
  document.getElementById('cmd-total-price').textContent = price > 0 ? (price*qty).toFixed(2)+' MAD' : 'À négocier';
}

// Confirm order = add to cart with voice note as base64
function cmdConfirmOrder() {
  var btn        = document.getElementById('cmd-confirm-btn');
  var secondary  = document.getElementById('cmd-secondary-buttons');

  function doSave(audioBase64, audioType) {
    var _saveFn = (window.AJCart && typeof window.AJCart.add === 'function')
      ? window.AJCart.add
      : addToCart;
    _saveFn({
      offerId    : _offer.offerId,
      offerName  : _offer.offerName,
      offerImage : _offer.offerImage,
      shopId     : _offer.shopId,
      shopName   : _offer.shopName,
      vendorName : _offer.vendorName,
      vendorPhone: _offer.vendorPhone,
      vendorEmail: _offer.vendorEmail,
      price      : cmdActivePrice(),
      quantity   : cmdGetQty(),
      audioBase64: audioBase64 || null,
      audioType  : audioType   || null,
      orderMode  : _orderMode,
      negoChannel: _negoChannel || _contactChannel || null,
      negoPhone  : _contactChannel
                   ? ((document.getElementById('cmd-contact-phone') || {value:''}).value.trim() || null)
                   : ((document.getElementById('cmd-nego-phone') || {value:''}).value.trim() || null),
      negoQty    : parseInt((document.getElementById('cmd-nego-qty') || {value:''}).value, 10) || null,
      contactReason: _contactReasons.length ? _contactReasons.join(', ') : null,
      variationsDetail: cmdVarsDetail() || null,
    });

    if (btn) btn.style.display = 'none';
    var _negoBtn = document.getElementById('cmd-nego-confirm-btn');
    if (_negoBtn) _negoBtn.style.display = 'none';
    var _contactBtn = document.getElementById('cmd-contact-confirm-btn');
    if (_contactBtn) _contactBtn.style.display = 'none';
    var _contactOpenBtn = document.getElementById('cmd-contact-btn');
    if (_contactOpenBtn) _contactOpenBtn.style.display = 'none';
    var _negoOpenBtn = document.getElementById('cmd-nego-open-btn');
    if (_negoOpenBtn) _negoOpenBtn.style.display = 'none';
    var _negoHint = document.getElementById('cmd-nego-hint');
    if (_negoHint) _negoHint.style.display = 'none';
    var _contactHint = document.getElementById('cmd-contact-hint');
    if (_contactHint) _contactHint.style.display = 'none';
    if (secondary) secondary.style.display = 'flex';

    /* pas de notification après confirmation — supprimer aussi le toast d'AJCart */
    var _t = document.getElementById('aj-cart-toast');
    if (_t) _t.remove();
    updateAllBadges();
  }

  if (_cmdAudioBlob) {
    var reader = new FileReader();
    reader.onloadend = function() {
      var base64 = reader.result.split(',')[1];
      doSave(base64, _cmdAudioBlob.type);
    };
    reader.readAsDataURL(_cmdAudioBlob);
  } else {
    doSave(null, null);
  }
}

function cmdAddToCart() { cmdConfirmOrder(); }

// ─── VOICE RECORDER ────────────────────────────────────────────
var _cmdMediaRecorder  = null;
var _cmdAudioChunks    = [];
var _cmdAudioBlob      = null;
var _cmdTimerInterval  = null;
var _cmdSeconds        = 0;
var _cmdIsRecording    = false;
var _cmdRecordingStart = 0;

function getSupportedMimeType() {
  var types = ['audio/mp4','audio/aac','audio/webm;codecs=opus','audio/webm','audio/ogg'];
  for (var i=0;i<types.length;i++) {
    if (MediaRecorder.isTypeSupported(types[i])) return types[i];
  }
  return '';
}
function formatTime(s) { return Math.floor(s/60)+':'+(String(s%60).padStart(2,'0')); }

async function cmdToggleRecording() {
  if (!_cmdIsRecording) {
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      var mime   = getSupportedMimeType();
      _cmdMediaRecorder = new MediaRecorder(stream, mime ? { mimeType:mime } : {});
      _cmdAudioChunks   = [];
      _cmdRecordingStart= Date.now();

      _cmdMediaRecorder.ondataavailable = function(e) {
        if (e.data && e.data.size > 0) _cmdAudioChunks.push(e.data);
      };

      _cmdMediaRecorder.onstop = function() {
        var duration = Date.now() - _cmdRecordingStart;
        var finalMime = mime || 'audio/webm';
        var raw = new Blob(_cmdAudioChunks, { type: finalMime });
        if (finalMime.includes('webm') && typeof ysFixWebmDuration === 'function') {
          ysFixWebmDuration(raw, duration, function(fixed) {
            _cmdAudioBlob = fixed;
            document.getElementById('cmd-audio-player').src = URL.createObjectURL(_cmdAudioBlob);
            document.getElementById('cmd-audio-preview').style.display = 'flex';
          });
        } else {
          _cmdAudioBlob = raw;
          document.getElementById('cmd-audio-player').src = URL.createObjectURL(_cmdAudioBlob);
          document.getElementById('cmd-audio-preview').style.display = 'flex';
        }
        stream.getTracks().forEach(function(t){ t.stop(); });
      };

      _cmdMediaRecorder.start(100);
      _cmdIsRecording = true;
      _cmdSeconds = 0;

      var timer = document.getElementById('cmd-rec-timer');
      var btn   = document.getElementById('cmd-rec-btn');
      var status= document.getElementById('cmd-rec-status');

      timer.style.display = 'block';
      timer.textContent   = '0:00';
      btn.style.background = '#3a3fc9';
      btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>';
      status.textContent = 'كيتسجل دابا… اضغط مرة أخرى باش توقف';
      status.style.color = '#4B50E6';

      _cmdTimerInterval = setInterval(function(){
        _cmdSeconds++;
        timer.textContent = formatTime(_cmdSeconds);
        if (_cmdSeconds >= 120) cmdStopRecording();
      }, 1000);

    } catch(err) {
      document.getElementById('cmd-rec-status').textContent = 'ما قدرناش نوصلو للميكرو، سمح للمتصفح يستعملو';
    }
  } else {
    cmdStopRecording();
  }
}

function cmdStopRecording() {
  if (_cmdMediaRecorder && _cmdIsRecording) {
    _cmdMediaRecorder.stop();
    _cmdIsRecording = false;
    clearInterval(_cmdTimerInterval);
    var btn = document.getElementById('cmd-rec-btn');
    btn.style.background = '#4B50E6';
    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
    document.getElementById('cmd-rec-status').textContent = 'تسجلات الرسالة ✓';
    document.getElementById('cmd-rec-status').style.color = '#2a7a4b';
    document.getElementById('cmd-rec-timer').style.display = 'none';
  }
}

function cmdDiscardRecording() {
  _cmdAudioBlob = null;
  document.getElementById('cmd-audio-player').src = '';
  document.getElementById('cmd-audio-preview').style.display = 'none';
  document.getElementById('cmd-rec-status').textContent = 'اضغط على الميكرو باش تسجل رسالتك';
  document.getElementById('cmd-rec-status').style.color = '#8a8480';
  document.getElementById('cmd-rec-timer').style.display = 'none';
  document.getElementById('cmd-rec-timer').textContent = '0:00';
}

// ─── TOAST ─────────────────────────────────────────────────────
function showToast(msg) {
  var container = document.getElementById('aj-toast-container');
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0f0f0f;color:#fff;padding:12px 20px;border-radius:12px;font-family:Inter,sans-serif;font-size:13px;font-weight:500;z-index:9999999;display:flex;align-items:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,0.3);white-space:nowrap;max-width:90vw;';
  toast.innerHTML = msg + ' <a href="/panier" style="color:#4B50E6;font-weight:600;text-decoration:none;margin-left:4px;">Voir le panier →</a>';
  container.appendChild(toast);
  setTimeout(function(){
    toast.style.transition='opacity 0.3s';toast.style.opacity='0';
    setTimeout(function(){toast.remove();},300);
  }, 3000);
}

// ─── CLOSE ON BACKDROP ─────────────────────────────────────────
document.getElementById('aj-commander-overlay').addEventListener('click', function(e){
  if (e.target === this) closeCommanderPopup();
});
var _cartOverlay = document.getElementById('aj-cart-overlay');
if (_cartOverlay) {
  _cartOverlay.addEventListener('click', function(e){
    if (e.target === this) closeCartPanel();
  });
}

// ─── INIT ───────────────────────────────────────────────────────
window.addEventListener('load', function() {
  updateAllBadges();
  updateCmdPrices();
  var stickyBtn = document.getElementById('aj-order-btn');
  if (stickyBtn) {
    stickyBtn.addEventListener('click', function(e){
      e.preventDefault();
      openCommanderPopup();
    });
  }
});
window.addEventListener('storage', function(e) {
  if (e.key === 'aj_cart') updateAllBadges();
});
