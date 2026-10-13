/* イベント申込画面（LIFF） */
(function () {
  'use strict';
  var app = document.getElementById('app');
  // ?ch= などは、LIFFの転送で liff.state の中に入って届くことがあるため、両方から読む
  var CH = 'none', PREV = '', MODE = '';
  function readParams() {
    var p = new URLSearchParams(location.search);
    var st = p.get('liff.state');
    if (st) {
      var q = st.indexOf('?');
      if (q >= 0) new URLSearchParams(st.slice(q + 1)).forEach(function (v, k) { if (!p.has(k)) p.set(k, v); });
    }
    CH = p.get('ch') || 'none';
    PREV = p.get('prev') || '';
    MODE = p.get('mode') || '';
  }
  readParams();
  var state = { idToken: '', sub: '', init: null };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nl(s) { return esc(s).replace(/\r?\n/g, '<br>'); }
  function chars(s) { return String(s || '').replace(/\r?\n/g, '').length; }
  function show(html) { app.innerHTML = html; window.scrollTo(0, 0); }
  function showError(msg) { show('<section class="card"><h1>うまく開けませんでした</h1><p class="err">' + esc(msg) + '</p><p class="muted">時間をおいて開き直すか、このLINEのトークでお知らせください。</p></section>'); }

  function api(action, data) {
    var body = Object.assign({ action: action, idToken: state.idToken }, data || {});
    return fetch(window.APP_CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }

  function friendship() {
    return liff.getFriendship().then(function (f) { return !!f.friendFlag; }).catch(function () { return true; });
  }

  // ---------- 起動 ----------
  liff.init({ liffId: window.APP_CONFIG.LIFF_ID }).then(function () {
    readParams();
    if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
    state.idToken = liff.getIDToken();
    var dec = liff.getDecodedIDToken();
    state.sub = dec ? dec.sub : 'me';
    return api('init', { ch: CH, prev: PREV, mode: MODE }).then(function (res) {
      if (!res.ok) throw new Error(res.error || 'エラー');
      state.init = res;
      route();
    });
  }).catch(function (e) { showError(e.message || String(e)); });

  function route() {
    var s = state.init.student;
    if (MODE === 'survey') return renderSurvey();
    if (!s || !s.status || s.status === "2' 再提出依頼" || s.status === '1 LINE登録') return renderFriendThen(renderForm);
    show('<section class="card center"><div class="ok">✓</div><h1>お申込み済みです</h1><p>ご連絡はこのLINEでお送りします。</p><p class="muted">日程の変更などは、このLINEのトークでお知らせください。</p>' + closeBtn() + '</section>');
  }

  function closeBtn() { return liff.isInClient() ? '<button class="btn sub" onclick="liff.closeWindow()">閉じる</button>' : ''; }

  // ---------- 友だち確認 ----------
  function renderFriendThen(next) {
    friendship().then(function (ok) {
      if (ok) return next();
      show('<section class="card"><h1>はじめに友だち追加をお願いします</h1>' +
        '<p>選考の結果やご案内は、すべて<b>株式会社エージェント イベント事務局のLINE</b>でお送りします。友だち追加がないと、結果をお届けできません。</p>' +
        '<button class="btn" id="add">友だち追加する</button>' +
        '<button class="btn sub" id="re">追加しました（続ける）</button><p class="err" id="e"></p></section>');
      document.getElementById('add').onclick = function () { liff.openWindow({ url: state.init.friendUrl, external: false }); };
      document.getElementById('re').onclick = function () {
        friendship().then(function (ok2) { if (ok2) next(); else document.getElementById('e').textContent = 'まだ友だち追加が確認できません。もう一度お試しください。'; });
      };
    });
  }

  // ---------- 申込画面 ----------
  var DKEY = function () { return 'evline_draft_' + state.sub; };
  function loadDraft() { try { return JSON.parse(localStorage.getItem(DKEY()) || '{}'); } catch (e) { return {}; } }
  function saveDraft(d) { try { localStorage.setItem(DKEY(), JSON.stringify(d)); } catch (e) { } }
  function clearDraft() { try { localStorage.removeItem(DKEY()); } catch (e) { } }

  function renderForm() {
    var I = state.init, s = I.student || {}, d = loadDraft(), prevA = I.prevAnswers || {}, T = I.texts || {};
    var resub = s.status === "2' 再提出依頼";
    var v = function (k, fb) { return d[k] != null ? d[k] : (fb || ''); };
    if (!I.events.length && !resub) {
      show('<section class="card"><h1>受付中の日程がありません</h1><p>現在お申込みいただける日程はありません。次回の日程が決まりましたら、このLINEでご案内します。</p>' + closeBtn() + '</section>');
      return;
    }
    var evOpts = I.events.map(function (e) { return '<option value="' + esc(e.id) + '"' + (v('eventId', s.eventId) === e.id ? ' selected' : '') + '>' + esc(e.label) + '</option>'; }).join('');
    if (resub && s.eventId && !I.events.some(function (e) { return e.id === s.eventId; })) evOpts = '<option value="' + esc(s.eventId) + '" selected>前回選んだ日程</option>' + evOpts;
    var qs = I.questions.map(function (q) {
      var val = v('q' + q.no, prevA[q.no]);
      return '<label class="' + (q.required ? 'req' : '') + '" for="q' + q.no + '">設問' + q.no + '</label><div class="q">' + esc(q.text) + '</div>' +
        '<textarea id="q' + q.no + '" data-min="' + q.min + '" data-max="' + q.max + '">' + esc(val) + '</textarea><div class="counter" id="c' + q.no + '"></div>';
    }).join('');
    var head = resub
      ? '<h1>内容の修正</h1><div class="note">直してほしい点：<br>' + esc(s.fix || 'LINEでお送りした内容をご確認ください') + '</div>'
      : '<h1>イベントのお申込み</h1>' + (I.questions.length
        ? (T.intro ? '<p>' + nl(T.intro) + '</p>' : '') + '<p class="muted">入力した内容は、この端末に自動で保存されます（途中で閉じても大丈夫です）。</p>'
        : '<p class="muted">所要時間の目安：3分ほど。</p>');
    show('<section class="card">' + head +
      (I.ch === 'none' && !resub ? '<label class="req" for="src">どこでこのイベントを知りましたか</label><select id="src"><option value="">選んでください</option>' + ['友人・知人の紹介', 'OfferBox', 'iroots', 'Wantedly', '学生団体', '大学', 'SNS', 'その他'].map(function (x) { return '<option' + (v('src', s.source) === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>' : '') +
      '<label class="req" for="name">氏名</label><input type="text" id="name" value="' + esc(v('name', s.name)) + '">' +
      '<label class="req" for="kana">フリガナ</label><input type="text" id="kana" value="' + esc(v('kana', s.kana)) + '" placeholder="ヤマダ タロウ">' +
      '<label class="req" for="mail">メールアドレス</label><input type="email" id="mail" value="' + esc(v('mail', s.mail)) + '" autocomplete="email">' +
      '<label class="req" for="tel">電話番号</label><input type="tel" id="tel" value="' + esc(v('tel', s.tel)) + '" placeholder="09012345678">' +
      '<label class="req" for="birth">生年月日</label><input type="date" id="birth" value="' + esc(v('birth', s.birth)) + '">' +
      '<label class="req">性別</label><div class="radio">' + ['男性', '女性', 'その他', '回答しない'].map(function (x) { return '<label><input type="radio" name="sex" value="' + x + '"' + (v('sex', s.sex) === x ? ' checked' : '') + '>' + x + '</label>'; }).join('') + '</div>' +
      '<label class="req" for="univ">大学名・学部名</label><input type="text" id="univ" value="' + esc(v('univ', s.univ)) + '" placeholder="〇〇大学 〇〇学部">' +
      '<label class="req" for="grad">卒業年度</label><select id="grad"><option value="">選んでください</option>' + ['2028年3月卒業予定', '2027年3月卒業予定', '2029年3月卒業予定', 'その他'].map(function (x) { return '<option' + (v('grad', s.grad) === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>' +
      '<label class="req" for="eventId">参加希望日</label><select id="eventId"><option value="">選んでください</option>' + evOpts + '</select>' +
      (I.questions.length && T.criteria ? '<div class="note">' + nl(T.criteria) + '</div>' : '') +
      qs +
      '<label class="req">個人情報の取り扱い</label><div class="consent"><input type="checkbox" id="consent"' + (d.consent ? ' checked' : '') + '><span>ご入力いただいた個人情報は、株式会社エージェントの<a href="https://agent-network.com/policy/" target="_blank" rel="noopener">プライバシーポリシー</a>に基づき、採用活動およびイベントの運営のために利用します。また、お申込みの経路となった提携企業・団体へ、イベントへの参加状況をお知らせすることがあります。<br><b>プライバシーポリシーと上記の内容に同意する</b></span></div>' +
      '<button class="btn" id="send">' + (resub ? '修正して送る' : '申し込む') + '</button><p class="err" id="e"></p></section>');

    var ids = ['name', 'kana', 'mail', 'tel', 'birth', 'univ', 'grad', 'eventId'];
    if (document.getElementById('src')) ids.unshift('src');
    function collect() {
      var f = {}; ids.forEach(function (k) { f[k] = document.getElementById(k).value.trim(); });
      var sx = document.querySelector('input[name=sex]:checked'); f.sex = sx ? sx.value : '';
      f.answers = {}; I.questions.forEach(function (q) { f.answers[q.no] = document.getElementById('q' + q.no).value; });
      f.consent = document.getElementById('consent').checked;
      return f;
    }
    function persist() {
      var f = collect(), dd = {}; ids.forEach(function (k) { dd[k] = f[k]; }); dd.sex = f.sex; dd.consent = f.consent;
      I.questions.forEach(function (q) { dd['q' + q.no] = f.answers[q.no]; });
      saveDraft(dd);
    }
    function count(q) {
      var n = chars(document.getElementById('q' + q.no).value), el = document.getElementById('c' + q.no);
      el.textContent = n + '字（目安：' + q.min + '〜' + q.max + '字程度）';
      el.className = 'counter' + (n < q.min ? ' short' : (q.max && n > q.max ? ' over' : ''));
    }
    I.questions.forEach(function (q) { count(q); document.getElementById('q' + q.no).addEventListener('input', function () { count(q); }); });
    var timer = null;
    app.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(persist, 800); });
    app.addEventListener('change', persist);

    document.getElementById('send').onclick = function () {
      var f = collect(), e = document.getElementById('e'), btn = this;
      e.textContent = '';
      for (var i = 0; i < ids.length; i++) if (!f[ids[i]]) { e.textContent = '未入力の項目があります'; document.getElementById(ids[i]).focus(); return; }
      if (!f.sex) { e.textContent = '性別を選んでください'; return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.mail)) { e.textContent = 'メールアドレスの形式が正しくありません'; return; }
      if (!/^[0-9\-]{10,13}$/.test(f.tel.replace(/\s/g, ''))) { e.textContent = '電話番号は半角数字で入力してください'; return; }
      for (var j = 0; j < I.questions.length; j++) {
        var q = I.questions[j];
        if (q.required && chars(f.answers[q.no]) < q.min) { e.textContent = '設問' + q.no + 'は' + q.min + '字以上で入力してください（いま' + chars(f.answers[q.no]) + '字）'; document.getElementById('q' + q.no).focus(); return; }
      }
      if (!f.consent) { e.textContent = 'プライバシーポリシーへの同意が必要です'; return; }
      btn.disabled = true; btn.textContent = '送信しています…';
      friendship().then(function (ok) {
        if (!ok) { btn.disabled = false; btn.textContent = '申し込む'; return renderFriendThen(renderForm); }
        return api('apply', { form: f, ch: CH, prev: PREV }).then(function (res) {
          if (!res.ok) { btn.disabled = false; btn.textContent = resub ? '修正して送る' : '申し込む'; e.textContent = res.error; if (res.needFriend) renderFriendThen(renderForm); return; }
          clearDraft();
          show('<section class="card center"><div class="ok">✓</div><h1>' + (resub ? '修正を受け付けました' : 'お申込みを受け付けました') + '</h1>' +
            '<p>受付完了のご連絡を、このLINEにお送りしました。</p><p class="muted">' + (res.dr ? '続けて、LINEに届いたリンクから面談の日程をお選びください。' : '書類選考の結果は、このLINEでお知らせします。') + '</p>' + (!res.dr && !resub && T.after ? '<div class="note" style="text-align:left">' + nl(T.after) + '</div>' : '') + closeBtn() + '</section>');
        });
      }).catch(function (err) { btn.disabled = false; e.textContent = '送信できませんでした。通信状況をご確認のうえ、もう一度お試しください。（' + err.message + '）'; });
    };
  }

  // ---------- 参加後アンケート ----------
  function renderSurvey() {
    var I = state.init;
    var qs = I.questions.map(function (q) {
      return '<label class="' + (q.required ? 'req' : '') + '" for="q' + q.no + '">Q' + q.no + '</label><div class="q">' + esc(q.text) + '</div><textarea id="q' + q.no + '" style="min-height:120px"></textarea>';
    }).join('');
    show('<section class="card"><h1>参加後アンケート</h1><p class="muted">本日はご参加いただき、ありがとうございました。</p>' + qs +
      '<label class="req">今後の選考へのご参加を希望されますか</label><div class="radio"><label><input type="radio" name="want" value="yes">希望する</label><label><input type="radio" name="want" value="no">希望しない</label></div>' +
      '<button class="btn" id="send">送る</button><p class="err" id="e"></p></section>');
    document.getElementById('send').onclick = function () {
      var e = document.getElementById('e'), w = document.querySelector('input[name=want]:checked'), btn = this;
      var answers = {};
      for (var i = 0; i < I.questions.length; i++) {
        var q = I.questions[i], val = document.getElementById('q' + q.no).value.trim();
        if (q.required && !val) { e.textContent = 'Q' + q.no + 'にご回答ください'; return; }
        answers[q.no] = val;
      }
      if (!w) { e.textContent = '選考へのご希望を選んでください'; return; }
      btn.disabled = true;
      api('survey', { answers: answers, want: w.value }).then(function (res) {
        if (!res.ok) { btn.disabled = false; e.textContent = res.error; return; }
        show('<section class="card center"><div class="ok">✓</div><h1>ご回答ありがとうございました</h1>' +
          (res.want ? '<p>選考へのご希望を承りました。ご案内をこのLINEにお送りします。</p>' : '<p>貴重なご意見をありがとうございました。またどこかでお会いできることを楽しみにしております。</p>') + closeBtn() + '</section>');
      }).catch(function (err) { btn.disabled = false; e.textContent = '送信できませんでした（' + err.message + '）'; });
    };
  }
})();
