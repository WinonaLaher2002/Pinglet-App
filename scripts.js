/* ═══════════════════════════════════════
   FIREBASE CONFIG — replace with yours
═══════════════════════════════════════ */
const firebaseConfig = {
  apiKey: "AIzaSyDShmcP3kUTtG1l9WVv-c5OdOiADCIvpZA",
  authDomain: "pinglet-e8ac6.firebaseapp.com",
  projectId: "pinglet-e8ac6",
  storageBucket: "pinglet-e8ac6.firebasestorage.app",
  messagingSenderId: "193161983461",
  appId: "1:193161983461:web:7ff9e20870e41fffd4ab0c"
};

/* ═══════════════════════════════════════
   GLOBALS
═══════════════════════════════════════ */
let auth, db;
window.currentUser = null;

let curChat          = '';
let currentChatMeta  = null;
let unsub            = null;   // messages listener
let chatsUnsub       = null;   // chat list listener
let userMenuTarget   = null;
let addUserGroupTarget = null;
let requireManualLoginAfterSignup = false;

const CLOUDINARY_CLOUD_NAME = 'dzcyu6k1x';
const CLOUDINARY_UPLOAD_PRESET = 'ml_pingletapp';

const DEFAULT_AV_CLASS = 'av2';
const DEFAULT_ICON     = '🌸';

/* ═══════════════════════════════════════
   FIREBASE INIT
═══════════════════════════════════════ */
async function loadFb() {
  const { initializeApp } =
    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
  const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
          signOut, onAuthStateChanged, updateProfile } =
    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
  const { getFirestore, collection, addDoc, onSnapshot, query, orderBy,
          serverTimestamp, doc, setDoc, getDoc, getDocs, where, limit } =
    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const app = initializeApp(firebaseConfig);
  auth    = getAuth(app);
  db      = getFirestore(app);

  window._fb = {
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    signOut, onAuthStateChanged, updateProfile,
    collection, addDoc, onSnapshot, query, orderBy,
    serverTimestamp, doc, setDoc, getDoc, getDocs, where, limit
  };

  onAuthStateChanged(auth, async (u) => {
    if (u) {
      if (requireManualLoginAfterSignup) return;
      window.currentUser = u;
      const name = await resolveUsername(u);
      savePref('last_username', name);
      setProfile(name, u.email || '');
      await ensureUserDoc(name);
      await loadCloudProfile();
      const myPhoto = getPref('profile_pic', '') || u.photoURL || '';
      await syncMyProfileInConversations(name, myPhoto);
      loadUserPrefs();
      subscribeChatList();
      go('chatListScreen');
    } else {
      stopStreams();
    }
  });
}
loadFb().catch(() => console.info('Demo mode'));

/* ═══════════════════════════════════════
   LOCAL STORAGE HELPERS
═══════════════════════════════════════ */
function savePref(k, v)  { localStorage.setItem('pgl_' + k, JSON.stringify(v)); }
function getPref(k, fb)  { const v = localStorage.getItem('pgl_' + k); return v !== null ? JSON.parse(v) : fb; }
function delPref(k)      { localStorage.removeItem('pgl_' + k); }

function getLocalUsers()      { return getPref('local_users', []); }
function saveLocalUsers(u)    { savePref('local_users', u); }
function findLocalUser(email) { return getLocalUsers().find(u => u.email.toLowerCase() === (email||'').toLowerCase()); }

function getBlocked()      { return getPref('blocked', []); }
function isBlocked(name)   { return getBlocked().some(x => x.toLowerCase() === (name||'').toLowerCase()); }
function blockUser(name)   {
  const b = getBlocked();
  if (!b.includes(name)) { b.push(name); savePref('blocked', b); }
  applyBlockedVisibility();
  if (curChat === name) go('chatListScreen');
  showToast(`${name} has been blocked.`);
}

/* ═══════════════════════════════════════
   USER DOC HELPERS
═══════════════════════════════════════ */
async function resolveUsername(u) {
  if (u?.displayName) return u.displayName;
  if (window._fb && db && u?.uid) {
    try {
      const snap = await window._fb.getDoc(window._fb.doc(db, 'users', u.uid));
      if (snap.exists() && snap.data()?.username) return snap.data().username;
    } catch(_) {}
  }
  return getPref('last_username', 'user');
}

async function ensureUserDoc(username, photoURL) {
  if (!(window._fb && db && window.currentUser)) return;
  const u = window.currentUser;
  const payload = {
    uid: u.uid,
    username,
    usernameLower: username.toLowerCase(),
    email: u.email || '',
    emailLower: (u.email || '').toLowerCase(),
    updatedAt: window._fb.serverTimestamp()
  };
  const photo = photoURL || u.photoURL;
  if (photo) payload.photoURL = photo;
  await window._fb.setDoc(window._fb.doc(db, 'users', u.uid), payload, { merge: true });
}

async function syncMyProfileInConversations(username, photoURL) {
  if (!(window._fb && db && window.currentUser)) return;
  const myUid = window.currentUser.uid;
  const profile = {
    username: username || window.currentUser.displayName || 'user',
    email: window.currentUser.email || '',
    photoURL: photoURL || ''
  };
  try {
    const q = window._fb.query(
      window._fb.collection(db, 'conversations'),
      window._fb.where('participants', 'array-contains', myUid)
    );
    const snap = await window._fb.getDocs(q);
    const ops = [];
    snap.forEach(docSnap => {
      const d = docSnap.data() || {};
      const cur = (d.members || {})[myUid] || {};
      const unchanged =
        (cur.username || '') === profile.username &&
        (cur.email || '') === profile.email &&
        (cur.photoURL || '') === profile.photoURL;
      if (unchanged) return;
      ops.push(
        window._fb.setDoc(window._fb.doc(db, 'conversations', docSnap.id), {
          members: { [myUid]: profile },
          updatedAt: window._fb.serverTimestamp()
        }, { merge: true })
      );
    });
    await Promise.allSettled(ops);
  } catch (err) {
    console.error('Profile sync error:', err);
  }
}

async function loadCloudProfile() {
  if (!(window._fb && db && window.currentUser)) return;
  try {
    const snap = await window._fb.getDoc(window._fb.doc(db, 'users', window.currentUser.uid));
    if (!snap.exists()) return;
    const d = snap.data() || {};
    setProfile(d.username || window.currentUser.displayName || 'user', d.email || window.currentUser.email || '');
    if (d.photoURL) { applyProfilePic(d.photoURL); savePref('profile_pic', d.photoURL); }
    else { delPref('profile_pic'); clearProfilePic(); }
  } catch(e) { console.error('Profile load:', e); }
}

/* ═══════════════════════════════════════
   profile picture upload to Cloudinary (alternative to Firebase Storage)
/*=═══════════════════════════════════════ */

/* ═══════════════════════════════════════
   SCREENS
═══════════════════════════════════════ */
function go(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* ═══════════════════════════════════════
   THEME
═══════════════════════════════════════ */
const THEME_PALETTES = {
  default: ['rgb(165, 157, 132)','rgb(193, 186, 161)','rgb(215, 211, 191)','rgb(236, 235, 222)'],
  warm:    ['rgb(255, 205, 178)','rgb(255, 180, 162)','rgb(229, 152, 155)','rgb(181, 130, 140)'],
  mink:    ['rgb(168, 118, 118)','rgb(202, 135, 135)', 'rgb(225, 172, 172)','rgb(255, 208, 208)'],
  green:   ['rgb(85, 107, 47)','rgb(143, 163, 30)','rgb(198, 216, 112)','rgb(239, 245, 210)'],
  mlue:    ['rgb(100, 153, 233)','rgb(158, 221, 255)','rgb(166, 246, 255)','rgb(190, 255, 247)'],
  yellow:  ['rgb(255, 251, 218)','rgb(255, 236, 158)','rgb(255, 187, 112)','rgb(237, 148, 85)'],
  purple:  ['rgb(78, 86, 192)','rgb(155, 93, 224)','rgb(215, 143, 238)','rgb(253, 207, 250)'],
  brown:   ['rgb(62, 50, 50)','rgb(80, 60, 60)','rgb(126, 99, 99)','rgb(168, 124, 124)'],
  shockoy: ['rgb(0, 84, 97)','rgb(12, 119, 121)','rgb(36, 158, 148)','rgb(59, 193, 168)'],
  black:   ['rgb(34, 40, 49)','rgb(57, 62, 70)','rgb(148, 137, 121)','rgb(223, 208, 184)']
};

function normalizeThemeKey(theme) {
  if (theme === 'light') return 'default';
  if (theme === 'dark') return 'black';
  if (theme === 'mint') return 'mink';
  if (theme === 'choco' || theme === 'chocoy') return 'shockoy';
  return THEME_PALETTES[theme] ? theme : 'default';
}

function setTheme(theme, save=true) {
  const key = normalizeThemeKey(theme);
  document.documentElement.setAttribute('data-theme', key);
  document.querySelectorAll('.th-opt[data-theme-opt]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeOpt === key);
  });
  renderPal(THEME_PALETTES[key]);
  if (save) savePref('theme', key);
}
function renderPal(c) {
  const el = document.getElementById('palRow');
  if (el) el.innerHTML = c.map(x => `<div class="sw2" style="background:${x}"></div>`).join('');
}
renderPal(THEME_PALETTES.default);

/* ═══════════════════════════════════════
   LOAD PREFERENCES
═══════════════════════════════════════ */
function loadUserPrefs() {
  setTheme(getPref('theme', 'default'), false);
  const fs = getPref('chat_fontsize', 16);
  applyFontSize(fs);
  const fsl = document.getElementById('fontSlider');
  if (fsl) fsl.value = fs;
  applyBubbleStyle(getPref('chat_bubble', 'rounded'));
  applyWallpaper(getPref('chat_wallpaper', 'default'), false);
  const togLink = document.getElementById('togLink');
  if (togLink) togLink.checked = getPref('chat_link', true);
  const pic = getPref('profile_pic', null);
  if (pic) applyProfilePic(pic);
  applyBlockedVisibility();
}

/* ═══════════════════════════════════════
   AUTH
═══════════════════════════════════════ */
function switchTab(t) {
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', (t==='login') === (i===0)));
  document.getElementById('loginForm').classList.toggle('vis', t==='login');
  document.getElementById('signupForm').classList.toggle('vis', t==='signup');
}

async function doLogin() {
  const e  = document.getElementById('loginEmail').value.trim();
  const p  = document.getElementById('loginPass').value;
  const el = document.getElementById('loginErr');
  el.textContent = '';
  if (!e||!p) { el.textContent = 'Please fill in all fields.'; return; }
  requireManualLoginAfterSignup = false;

  if (window._fb) {
    try {
      const c = await window._fb.signInWithEmailAndPassword(auth, e, p);
      const name = await resolveUsername(c.user);
      savePref('last_username', name);
      setProfile(name, e);
    } catch(x) { el.textContent = fmtErr(x?.code, x?.message); }
  } else {
    const user = findLocalUser(e);
    if (!user)            { el.textContent = 'No account found.'; return; }
    if (user.password!==p){ el.textContent = 'Wrong password.'; return; }
    savePref('local_session', { username: user.username, email: user.email });
    savePref('last_username', user.username);
    setProfile(user.username, user.email);
    go('chatListScreen');
  }
}

async function doSignup() {
  const u  = document.getElementById('suUser').value.trim();
  const e  = document.getElementById('suEmail').value.trim();
  const p  = document.getElementById('suPass').value;
  const el = document.getElementById('signupErr');
  el.textContent = '';
  if (!u||!e||!p)  { el.textContent = 'Please fill in all fields.'; return; }
  if (p.length < 6){ el.textContent = 'Password must be at least 6 chars.'; return; }

  if (window._fb) {
    try {
      requireManualLoginAfterSignup = true;
      const c = await window._fb.createUserWithEmailAndPassword(auth, e, p);
      await window._fb.updateProfile(c.user, { displayName: u });
      await window._fb.setDoc(window._fb.doc(db, 'users', c.user.uid), {
        uid: c.user.uid, username: u, usernameLower: u.toLowerCase(),
        email: e, emailLower: e.toLowerCase(), photoURL: '',
        createdAt: window._fb.serverTimestamp(), updatedAt: window._fb.serverTimestamp()
      }, { merge: true });
      await window._fb.signOut(auth);
      savePref('last_username', u);
      switchTab('login');
      document.getElementById('loginEmail').value = e;
      document.getElementById('loginPass').value  = '';
      showToast('Account created! Please login 🌸');
    } catch(x) { requireManualLoginAfterSignup = false; el.textContent = fmtErr(x?.code, x?.message); }
  } else {
    if (findLocalUser(e)) { el.textContent = 'Email already registered.'; return; }
    const users = getLocalUsers();
    users.push({ username: u, email: e, password: p });
    saveLocalUsers(users);
    switchTab('login');
    document.getElementById('loginEmail').value = e;
    document.getElementById('loginPass').value  = '';
    showToast('Account created! Please login 🌸');
  }
}

async function doLogout() {
  stopStreams();
  if (window._fb) await window._fb.signOut(auth);
  window.currentUser = null;
  delPref('local_session');
  go('loginScreen');
}

function setProfile(n, e) {
  document.getElementById('prName').textContent  = n;
  document.getElementById('prEmail').textContent = e;
}

function fmtErr(code, msg) {
  const map = {
    'auth/invalid-email':        'Invalid email.',
    'auth/user-not-found':       'No account found.',
    'auth/wrong-password':       'Wrong password.',
    'auth/email-already-in-use': 'Email already registered.',
    'auth/weak-password':        'Password too weak.',
    'auth/network-request-failed':'Network error.',
    'auth/too-many-requests':    'Too many attempts. Try later.',
    'auth/operation-not-allowed':'Enable Email/Password in Firebase Auth.',
    'auth/configuration-not-found':'Firebase Auth not configured yet.'
  };
  return map[code] || msg || 'Something went wrong.';
}

/* ═══════════════════════════════════════
   PROFILE PICTURE
═══════════════════════════════════════ */
function triggerAvatarUpload() { document.getElementById('avatarInput').click(); }

async function handleAvatarUpload(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 5*1024*1024) { showToast('Max 5MB for profile photo.'); return; }

  // Show immediately from local blob
  const blobUrl = URL.createObjectURL(file);
  applyProfilePic(blobUrl);

  if (window._fb && db && window.currentUser) {
    try {
      const url = await uploadToCloudinary(file);
      applyProfilePic(url);
      savePref('profile_pic', url);
      const currentUsername =
        document.getElementById('prName')?.textContent?.trim() ||
        window.currentUser.displayName ||
        'user';
      await ensureUserDoc(currentUsername, url);
      await syncMyProfileInConversations(currentUsername, url);
      subscribeChatList();
      showToast('Profile photo updated!');
    } catch(err) {
      console.error('Avatar upload error:', err);
      showToast('Photo saved locally only.');
      savePref('profile_pic', blobUrl);
    }
  } else {
    savePref('profile_pic', blobUrl);
    showToast('Profile photo updated!');
  }
}

function applyProfilePic(url) {
  const av = document.getElementById('prAv');
  if (!av) return;
  av.style.backgroundImage    = `url(${url})`;
  av.style.backgroundSize     = 'cover';
  av.style.backgroundPosition = 'center';
  av.textContent = '';
  av.classList.add('has-photo');
}
function clearProfilePic() {
  const av = document.getElementById('prAv');
  if (!av) return;
  av.style.backgroundImage = '';
  av.textContent = '🌸';
  av.classList.remove('has-photo');
}

/* ═══════════════════════════════════════
   SEARCH
═══════════════════════════════════════ */
let sOpen = false;
function toggleSearch() {
  sOpen = !sOpen;
  document.getElementById('searchBar').classList.toggle('open', sOpen);
  if (sOpen) document.getElementById('searchInput').focus();
}
function filterChats(v) {
  document.querySelectorAll('#chatList .ci').forEach(el => {
    el.style.display = (el.dataset.name||'').toLowerCase().includes(v.toLowerCase()) ? '' : 'none';
  });
}

/* ═══════════════════════════════════════
   CHAT LIST RENDERING
═══════════════════════════════════════ */
function toMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return (ts.seconds * 1000) + Math.floor((ts.nanoseconds || 0) / 1000000);
  return Number(ts) || 0;
}
function fmtClock(ts) {
  const ms = toMs(ts) || Date.now();
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtTime(ts) {
  const ms = toMs(ts);
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  if (now.toDateString() === d.toDateString()) return fmtClock(ms);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${fmtClock(ms)}`;
}

function previewText(raw) {
  if (raw === '[Image]') return '📷 Image';
  if (raw === '[Video]') return '🎥 Video';
  return esc(raw || 'Start chatting...');
}

function renderChatItem(c) {
  const list = document.getElementById('chatList');
  if (!list) return;

  // Remove existing entry to re-insert at top
  const old = list.querySelector(`[data-cid="${CSS.escape(c.conversationId)}"]`);
  if (old) old.remove();

  const avHtml = c.photoURL
    ? `<div class="av ${c.avCls} has-photo" style="background-image:url(${escAttr(c.photoURL)})"></div>`
    : `<div class="av ${c.avCls}">${esc(c.icon)}</div>`;

  const el = document.createElement('div');
  el.className    = 'ci';
  el.dataset.cid  = c.conversationId;
  el.dataset.name = c.name;
  el.innerHTML    = `
    ${avHtml}
    <div class="cm">
      <div class="cn">${esc(c.name)}</div>
      <div class="cp">${previewText(c.preview)}</div>
    </div>
    <div class="cr"><div class="ct">${esc(c.time)}</div></div>`;
  el.onclick = () => {
    if (isBlocked(c.name)) { showToast('This user is blocked.'); return; }
    openChat(c);
  };

  // Insert at top (below "New Chat" button)
  list.insertBefore(el, list.firstChild);
  applyBlockedVisibility();
}

function applyBlockedVisibility() {
  const blocked = getBlocked();
  document.querySelectorAll('#chatList .ci').forEach(el => {
    el.style.display = blocked.some(b => b.toLowerCase() === (el.dataset.name||'').toLowerCase()) ? 'none' : '';
  });
}

function subscribeChatList() {
  if (!(window._fb && db && window.currentUser)) return;
  if (chatsUnsub) { chatsUnsub(); chatsUnsub = null; }

  const q = window._fb.query(
    window._fb.collection(db, 'conversations'),
    window._fb.where('participants', 'array-contains', window.currentUser.uid)
  );

  chatsUnsub = window._fb.onSnapshot(q, async snap => {
    const chats = await Promise.all(snap.docs.map(async (docSnap) => {
      const d = docSnap.data() || {};
      if (d.isGroup) {
        return {
          conversationId: docSnap.id,
          name: d.groupName || 'Group Chat',
          avCls: 'av3', icon: '\u{1F465}',
          photoURL: '',
          preview: d.lastMessage || '',
          time: fmtTime(d.lastMessageAt || d.updatedAt),
          ms: toMs(d.lastMessageAt || d.updatedAt),
          isGroup: true, userId: ''
        };
      }

      const participants = d.participants || [];
      const otherUid = participants.find(id => id !== window.currentUser.uid);
      if (!otherUid) return null;

      const other = (d.members || {})[otherUid] || {};
      let name = other.username || other.email || 'Unknown';
      let email = other.email || '';
      let photoURL = other.photoURL || '';

      try {
        const userSnap = await window._fb.getDoc(window._fb.doc(db, 'users', otherUid));
        if (userSnap.exists()) {
          const userData = userSnap.data() || {};
          name = userData.username || userData.email || name;
          email = userData.email || email;
          photoURL = userData.photoURL || photoURL;

          const shouldSync =
            (userData.username || '') !== (other.username || '') ||
            (userData.email || '') !== (other.email || '') ||
            (userData.photoURL || '') !== (other.photoURL || '');
          if (shouldSync) {
            window._fb.setDoc(window._fb.doc(db, 'conversations', docSnap.id), {
              members: {
                [otherUid]: {
                  username: userData.username || name,
                  email: userData.email || email,
                  photoURL: userData.photoURL || ''
                }
              }
            }, { merge: true }).catch(() => {});
          }
        }
      } catch (_) {}

      return {
        conversationId: docSnap.id,
        name,
        avCls: DEFAULT_AV_CLASS,
        icon: DEFAULT_ICON,
        photoURL,
        preview: d.lastMessage || '',
        time: fmtTime(d.lastMessageAt || d.updatedAt),
        ms: toMs(d.lastMessageAt || d.updatedAt),
        isGroup: false,
        userId: otherUid
      };
    }));

    const finalChats = chats.filter(Boolean);
    // Sort oldest first so newest ends up at top after insertBefore(el, firstChild)
    finalChats.sort((a, b) => a.ms - b.ms);
    const list = document.getElementById('chatList');
    if (list) list.innerHTML = '';
    finalChats.forEach(renderChatItem);
  }, err => {
    console.error('Chat list error:', err);
  });
}

/* ═══════════════════════════════════════
   FIND USER / CONVERSATION HELPERS
═══════════════════════════════════════ */
async function findUser(input) {
  if (!(window._fb && db)) return null;
  const raw = (input||'').trim(), key = raw.toLowerCase();
  if (!raw) return null;
  const col = window._fb.collection(db, 'users');
  for (const q of [
    window._fb.query(col, window._fb.where('usernameLower','==',key), window._fb.limit(1)),
    window._fb.query(col, window._fb.where('emailLower','==',key),    window._fb.limit(1)),
  ]) {
    const snap = await window._fb.getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0], data = d.data()||{};
      return { uid:d.id, username:data.username||'user', email:data.email||'', photoURL:data.photoURL||'' };
    }
  }
  return null;
}

async function ensureConversation(target) {
  if (!(window._fb && db && window.currentUser)) return null;
  const myUid   = window.currentUser.uid;
  const cid     = [myUid, target.uid].sort().join('_');
  const myName  = document.getElementById('prName')?.textContent?.trim() || window.currentUser.displayName || 'user';
  const myPhoto = getPref('profile_pic','') || window.currentUser.photoURL || '';
  await window._fb.setDoc(window._fb.doc(db,'conversations',cid), {
    participants: [myUid, target.uid],
    members: {
      [myUid]:      { username:myName,          email:window.currentUser.email||'', photoURL:myPhoto },
      [target.uid]: { username:target.username, email:target.email||'',            photoURL:target.photoURL||'' }
    },
    lastMessage: '', lastMessageAt: null,
    createdAt: window._fb.serverTimestamp(), updatedAt: window._fb.serverTimestamp()
  }, { merge: true });
  return {
    conversationId: cid, userId: target.uid,
    name: target.username, avCls: DEFAULT_AV_CLASS, icon: DEFAULT_ICON,
    photoURL: target.photoURL||'', isGroup: false, preview:'', time:'Now', ms:Date.now()
  };
}

/* ═══════════════════════════════════════
   MODAL — NEW CHAT
═══════════════════════════════════════ */
function openModal()  { document.getElementById('ncModal').classList.add('open'); }
function closeModal() { document.getElementById('ncModal').classList.remove('open'); }
function closeModalOut(e) { if (e.target===document.getElementById('ncModal')) closeModal(); }

async function findRejoinableGroupByName(input) {
  if (!(window._fb && db && window.currentUser)) return null;
  const key = (input || '').trim().toLowerCase();
  if (!key) return null;

  try {
    const q = window._fb.query(
      window._fb.collection(db, 'conversations'),
      window._fb.where('formerParticipants', 'array-contains', window.currentUser.uid)
    );
    const snap = await window._fb.getDocs(q);
    for (const docSnap of snap.docs) {
      const d = docSnap.data() || {};
      if (!d.isGroup) continue;
      const name = (d.groupName || '').trim();
      const normalized = d.groupNameLower || name.toLowerCase();
      if (normalized !== key) continue;
      return { conversationId: docSnap.id, name: name || 'Group Chat' };
    }
  } catch (err) {
    console.error('Find rejoinable group error:', err);
  }
  return null;
}

async function rejoinGroupConversation(conversationId) {
  if (!(window._fb && db && window.currentUser)) {
    showToast('Please login first.');
    return null;
  }

  try {
    const ref = window._fb.doc(db, 'conversations', conversationId);
    const snap = await window._fb.getDoc(ref);
    if (!snap.exists()) { showToast('Group not found.'); return null; }

    const data = snap.data() || {};
    if (!data.isGroup) { showToast('This is not a group chat.'); return null; }

    const myUid = window.currentUser.uid;
    const participants = Array.isArray(data.participants) ? data.participants : [];
    if (participants.includes(myUid)) {
      showToast('You are already in this group.');
      return {
        conversationId,
        name: data.groupName || 'Group Chat',
        avCls: 'av3',
        icon: '\u{1F465}',
        photoURL: '',
        isGroup: true,
        userId: '',
        preview: data.lastMessage || '',
        time: fmtTime(data.lastMessageAt || data.updatedAt),
        ms: toMs(data.lastMessageAt || data.updatedAt)
      };
    }

    const former = Array.isArray(data.formerParticipants) ? data.formerParticipants : [];
    if (!former.includes(myUid)) {
      showToast('You can only rejoin groups you left.');
      return null;
    }

    const joinerName =
      window.currentUser.displayName ||
      document.getElementById('prName')?.textContent?.trim() ||
      'A member';
    const myPhoto = getPref('profile_pic', '') || window.currentUser.photoURL || '';
    const updatedParticipants = Array.from(new Set([...participants, myUid]));
    const members = { ...(data.members || {}) };
    members[myUid] = {
      username: joinerName,
      email: window.currentUser.email || '',
      photoURL: myPhoto
    };
    const formerParticipants = former.filter(uid => uid !== myUid);

    await window._fb.addDoc(window._fb.collection(db, 'conversations', conversationId, 'messages'), {
      text: `${joinerName} joined the group`,
      mediaUrl: '',
      mediaType: '',
      uid: myUid,
      senderName: 'System',
      type: 'system',
      systemEvent: 'joined_group',
      actorUid: myUid,
      timestamp: window._fb.serverTimestamp()
    });

    await window._fb.setDoc(ref, {
      participants: updatedParticipants,
      members,
      formerParticipants,
      lastMessage: `${joinerName} joined the group`,
      lastMessageAt: window._fb.serverTimestamp(),
      updatedAt: window._fb.serverTimestamp()
    }, { merge: true });

    subscribeChatList();
    showToast(`You rejoined ${data.groupName || 'Group Chat'}.`);

    return {
      conversationId,
      name: data.groupName || 'Group Chat',
      avCls: 'av3',
      icon: '\u{1F465}',
      photoURL: '',
      isGroup: true,
      userId: '',
      preview: `${joinerName} joined the group`,
      time: 'Now',
      ms: Date.now()
    };
  } catch (err) {
    console.error('Rejoin group error:', err);
    showToast('Failed to rejoin group.');
    return null;
  }
}

async function startChat() {
  const raw = document.getElementById('ncUser').value.trim();
  if (!raw) return;

  if (window._fb && db && window.currentUser) {
    const target = await findUser(raw);
    if (target) {
      if (target.uid === window.currentUser.uid) { showToast('That is you.'); return; }
      if (isBlocked(target.username)) { showToast('This user is blocked.'); return; }
      const meta = await ensureConversation(target);
      if (!meta) return;
      document.getElementById('ncUser').value = '';
      closeModal();
      openChat(meta);
      return;
    }

    const groupMeta = await findRejoinableGroupByName(raw);
    if (groupMeta) {
      const meta = await rejoinGroupConversation(groupMeta.conversationId);
      if (!meta) return;
      document.getElementById('ncUser').value = '';
      closeModal();
      openChat(meta);
      return;
    }

    showToast('User or rejoinable group not found.');
    return;
  }
  // Demo mode
  if (isBlocked(raw)) { showToast('This user is blocked.'); return; }
  const meta = { conversationId:'demo_'+raw, name:raw, avCls:DEFAULT_AV_CLASS, icon:DEFAULT_ICON,
                 photoURL:'', isGroup:false, preview:'', time:'Now', ms:Date.now(), userId:'' };
  renderChatItem(meta);
  document.getElementById('ncUser').value = '';
  closeModal();
  openChat(meta);
}

async function createGroupChat() {
  if (!(window._fb && db && window.currentUser)) { showToast('Group chat needs Firebase.'); return; }
  const parts = (document.getElementById('ncUser').value||'').split(',').map(v=>v.trim()).filter(Boolean);
  if (parts.length < 2) { showToast('Enter at least 2 usernames separated by comma.'); return; }

  const seen = new Set(), users = [];
  for (const key of parts) {
    const u = await findUser(key);
    if (!u || u.uid===window.currentUser.uid || seen.has(u.uid)) continue;
    seen.add(u.uid); users.push(u);
  }
  if (users.length < 2) { showToast('Need at least 2 valid users.'); return; }

  const groupName = (window.prompt('Group name:', 'New Group Chat')||'').trim() || 'New Group Chat';
  const myUid    = window.currentUser.uid;
  const myName   = document.getElementById('prName')?.textContent?.trim() || 'user';
  const myPhoto  = getPref('profile_pic','') || window.currentUser.photoURL || '';
  const members  = { [myUid]: { username:myName, email:window.currentUser.email||'', photoURL:myPhoto } };
  users.forEach(u => { members[u.uid] = { username:u.username, email:u.email, photoURL:u.photoURL||'' }; });

  const ref = await window._fb.addDoc(window._fb.collection(db,'conversations'), {
    isGroup: true,
    groupName,
    groupNameLower: groupName.toLowerCase(),
    formerParticipants: [],
    participants: [myUid, ...users.map(u=>u.uid)],
    members, lastMessage:'', lastMessageAt:null,
    createdAt: window._fb.serverTimestamp(), updatedAt: window._fb.serverTimestamp()
  });
  document.getElementById('ncUser').value = '';
  closeModal();
  openChat({ conversationId:ref.id, name:groupName, avCls:'av3', icon:'👥', photoURL:'', isGroup:true, userId:'', preview:'', time:'Now', ms:Date.now() });
}

/* ═══════════════════════════════════════
   CHAT ROOM — OPEN
═══════════════════════════════════════ */
function resetMsgArea() {
  const area = document.getElementById('ma');
  if (!area) return;
  area.innerHTML = `
    <div class="dd">Today 🌸</div>
    <div class="msg in" id="typEl" style="display:none;">
      <div class="typ"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    </div>`;
}

function openChat(meta) {
  if (isBlocked(meta.name)) { showToast('This user is blocked.'); return; }
  curChat         = meta.name;
  currentChatMeta = meta;

  document.getElementById('cpn').textContent = meta.name;
  const av = document.getElementById('cav');
  av.className = `av ${meta.avCls || DEFAULT_AV_CLASS}`;
  if (meta.photoURL) {
    av.style.backgroundImage    = `url(${meta.photoURL})`;
    av.style.backgroundSize     = 'cover';
    av.style.backgroundPosition = 'center';
    av.textContent = '';
    av.classList.add('has-photo');
  } else {
    av.style.backgroundImage = '';
    av.textContent = meta.icon || DEFAULT_ICON;
    av.classList.remove('has-photo');
  }

  resetMsgArea();
  go('chatRoomScreen');

  if (window._fb && db && window.currentUser) {
    if (unsub) unsub();
    const cid  = meta.conversationId || [window.currentUser.uid, curChat].sort().join('_');
    const q    = window._fb.query(
      window._fb.collection(db, 'conversations', cid, 'messages'),
      window._fb.orderBy('timestamp')
    );
    unsub = window._fb.onSnapshot(q, snap => {
      snap.docChanges().forEach(ch => {
        if (ch.type !== 'added') return;
        const d = ch.doc.data();
        // Skip messages we already rendered optimistically (matched by clientId)
        if (d.clientId && findMsgByClientId(d.clientId)) {
          // Update the pending bubble to confirmed state
          const el = findMsgByClientId(d.clientId);
          if (el) {
            el.classList.remove('pending');
            let st = el.querySelector('.msg-status');
            if (st) st.textContent = '\u2713';
            const mt = el.querySelector('.mt');
            if (mt) {
              const t = fmtClock(d.timestamp || Date.now());
              if (d.uid === window.currentUser.uid) {
                if (!st) {
                  st = document.createElement('span');
                  st.className = 'msg-status';
                  st.textContent = '\u2713';
                }
                mt.innerHTML = `${t} ${st.outerHTML}`;
              } else {
                mt.textContent = t;
              }
            }
            el.removeAttribute('data-client-id');
          }
          return;
        }
        if (d.type === 'system') {
          renderSystemNotice(d.text || 'System update');
          return;
        }
        const isMe = window.currentUser && d.uid === window.currentUser.uid;
        renderMsg({
          text: d.text||'',
          mediaUrl: d.mediaUrl||'',
          mediaType: d.mediaType||'',
          timestamp: d.timestamp || null
        }, isMe ? 'out' : 'in', d.senderName || curChat);
      });
    });
  }
}

function goBack() {
  if (unsub) { unsub(); unsub = null; }
  currentChatMeta = null;
  go('chatListScreen');
}

function stopStreams() {
  if (unsub)      { unsub(); unsub = null; }
  if (chatsUnsub) { chatsUnsub(); chatsUnsub = null; }
  currentChatMeta = null;
}

/* ═══════════════════════════════════════
   MESSAGE RENDERING
═══════════════════════════════════════ */
function esc(s)     { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return String(s||'').replace(/"/g,'&quot;'); }

function linkify(text) {
  const e = esc(text);
  if (!getPref('chat_link', true)) return e;
  return e.replace(/(https?:\/\/[^\s<]+)/g, url =>
    `<a class="msg-link" href="${escAttr(url)}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
}

function buildMediaHtml(url, type) {
  if (!url) return '';
  const su = escAttr(url);
  if (type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg)/i.test(url)) {
    return `<div class="chat-media" onclick="openLightbox('${su}')">
              <img src="${su}" alt="image" loading="lazy">
            </div>`;
  }
  if (type.startsWith('video/') || /\.(mp4|webm|ogg|mov)/i.test(url)) {
    return `<div class="chat-media">
              <video src="${su}" controls playsinline></video>
            </div>`;
  }
  return `<div class="chat-file"><a href="${su}" target="_blank" rel="noopener noreferrer">📎 Open file</a></div>`;
}

function findMsgByClientId(id) {
  if (!id) return null;
  return document.querySelector(`#ma .msg[data-client-id="${CSS.escape(id)}"]`);
}

function renderSystemNotice(text) {
  const area = document.getElementById('ma');
  const typ  = document.getElementById('typEl');
  if (!area || !typ) return;
  const el = document.createElement('div');
  el.className = 'dd';
  el.textContent = text || '';
  area.insertBefore(el, typ);
  area.scrollTop = 99999;
}

function renderMsg(msg, type, sender, opts={}) {
  const area = document.getElementById('ma');
  const typ  = document.getElementById('typEl');
  if (!area||!typ) return null;

  // Check for existing optimistic bubble
  const existing = opts.clientId ? findMsgByClientId(opts.clientId) : null;
  const el = existing || document.createElement('div');
  el.className = `msg ${type}${opts.pending ? ' pending' : ''}`;
  if (opts.clientId) el.dataset.clientId = opts.clientId;

  const t = fmtClock(msg.timestamp || Date.now());
  const mediaHtml = buildMediaHtml(msg.mediaUrl||'', msg.mediaType||'');
  const textHtml  = msg.text ? `<div class="msg-text">${linkify(msg.text)}</div>` : '';
  const body      = mediaHtml + textHtml || '<div class="msg-text"></div>';
  const statusHtml = type==='out' ? `<span class="msg-status">${opts.pending?'⏳':'✓'}</span>` : '';

  if (type === 'in') {
    el.innerHTML = `<div class="msr">${esc(sender)}</div><div class="mb">${body}</div><div class="mt">${t}</div>`;
  } else {
    el.innerHTML = `<div class="mb">${body}</div><div class="mt">${t} ${statusHtml}</div>`;
  }

  if (!existing) area.insertBefore(el, typ);
  area.scrollTop = 99999;

  // Demo mode auto-reply for text
  if (type==='out' && !window._fb && msg.text && !opts.pending) simReply();
  return el;
}

/* ═══════════════════════════════════════
   DEMO SIM REPLY
═══════════════════════════════════════ */
const reps = ['omg yesss!! 💗','haha totally 🌸','let me check babe!','sounds like a plan!! ✨',
  'interesting... tell me more 👀','got it!! will do 🌷','lol same honestly 😂',
  'can\'t wait!! 🎉','aww that\'s so cute 🥹','bestie you\'re so right 🌸'];

function simReply() {
  const t = document.getElementById('typEl');
  t.style.display = 'flex';
  document.getElementById('ma').scrollTop = 99999;
  setTimeout(() => {
    t.style.display = 'none';
    renderMsg({ text:reps[Math.floor(Math.random()*reps.length)] }, 'in', curChat);
  }, 1800);
}

/* ═══════════════════════════════════════
   SEND TEXT
═══════════════════════════════════════ */
async function send() {
  const inp  = document.getElementById('msgIn');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = ''; inp.style.height = 'auto';

  if (window._fb && db && window.currentUser && currentChatMeta?.conversationId) {
    const cid = currentChatMeta.conversationId;
    await window._fb.addDoc(window._fb.collection(db,'conversations',cid,'messages'), {
      text, mediaUrl:'', mediaType:'',
      uid: window.currentUser.uid,
      senderName: window.currentUser.displayName || 'You',
      timestamp: window._fb.serverTimestamp()
    });
    await window._fb.setDoc(window._fb.doc(db,'conversations',cid), {
      lastMessage: text,
      lastMessageAt: window._fb.serverTimestamp(),
      updatedAt: window._fb.serverTimestamp()
    }, { merge:true });
  } else {
    renderMsg({ text }, 'out', 'You');
  }
}

/* ═══════════════════════════════════════
   SEND MEDIA — Messenger style
   1. Show preview instantly (blob URL)
   2. Upload to Storage in background
   3. Save to Firestore with real URL
   4. Both users see it via onSnapshot
═══════════════════════════════════════ */
async function uploadToCloudinary(file, onProgress) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error('Cloudinary config is missing.');
  }
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable || typeof onProgress !== 'function') return;
      onProgress((evt.loaded / evt.total) * 100);
    };
    xhr.onload = () => {
      const data = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
        resolve(data.secure_url);
        return;
      }
      reject(new Error(data.error?.message || 'Cloudinary upload failed.'));
    };
    xhr.onerror = () => reject(new Error('Cloudinary upload failed.'));
    xhr.send(formData);
  });
}

function triggerMediaUpload() {
  if (!curChat) { showToast('Open a chat first.'); return; }
  document.getElementById('chatMediaInput')?.click();
}

async function handleChatMediaUpload(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file || !curChat) return;
  if (file.size > 50*1024*1024) { showToast('Max 50MB per file.'); return; }

  const caption    = (document.getElementById('msgIn')?.value||'').trim();
  const msgInEl    = document.getElementById('msgIn');
  if (msgInEl) { msgInEl.value=''; msgInEl.style.height='auto'; }

  // ── Step 1: Instant local preview ──
  const blobUrl  = URL.createObjectURL(file);
  const clientId = `c_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const pendingEl = renderMsg(
    { text:caption, mediaUrl:blobUrl, mediaType:file.type },
    'out', 'You',
    { clientId, pending:true }
  );

  if (window._fb && db && window.currentUser && currentChatMeta?.conversationId) {
    const cid = currentChatMeta.conversationId;

    try {
      // ── Step 2: Upload to Firebase Storage ──
      let bar = null;
      if (pendingEl) {
        bar = document.createElement('div');
        bar.className = 'upload-progress';
        bar.innerHTML = '<div class="upload-bar"></div>';
        pendingEl.querySelector('.mb')?.appendChild(bar);
      }

      const mediaUrl = await uploadToCloudinary(file, (pct) => {
        const b = bar?.querySelector('.upload-bar');
        if (b) b.style.width = `${pct}%`;
      });

      // ── Step 3: Save to Firestore (onSnapshot delivers it to OTHER user) ──
      await window._fb.addDoc(window._fb.collection(db,'conversations',cid,'messages'), {
        text: caption,
        mediaUrl,
        mediaType: file.type,
        clientId,                // so OUR listener can match & confirm
        uid: window.currentUser.uid,
        senderName: window.currentUser.displayName || 'You',
        timestamp: window._fb.serverTimestamp()
      });

      // Update conversation preview
      const preview = file.type.startsWith('video/') ? '[Video]' : '[Image]';
      await window._fb.setDoc(window._fb.doc(db,'conversations',cid), {
        lastMessage: preview,
        lastMessageAt: window._fb.serverTimestamp(),
        updatedAt: window._fb.serverTimestamp()
      }, { merge:true });

      // ── Step 4: Swap blob → permanent URL in existing bubble ──
      if (pendingEl) {
        const img = pendingEl.querySelector('img');
        const vid = pendingEl.querySelector('video');
        if (img) img.src = mediaUrl;
        if (vid) vid.src = mediaUrl;
        pendingEl.querySelector('.upload-progress')?.remove();
        pendingEl.classList.remove('pending');
        const st = pendingEl.querySelector('.msg-status');
        if (st) st.textContent = '✓';
        pendingEl.removeAttribute('data-client-id');  // listener won't double-render
      }

    } catch(err) {
      console.error('Media upload error:', err);
      showToast('Failed to upload media. Check Cloudinary config.');
      if (pendingEl) pendingEl.remove();
    } finally {
      URL.revokeObjectURL(blobUrl);
    }

  } else {
    // ── Demo mode: just show locally, no Firestore ──
    // pendingEl already shows. Make it look confirmed.
    if (pendingEl) {
      pendingEl.classList.remove('pending');
      const st = pendingEl.querySelector('.msg-status');
      if (st) st.textContent = '✓';
      pendingEl.removeAttribute('data-client-id');
    }
    // Demo auto-reply with a fun message
    setTimeout(() => simReply(), 2000);
  }
}

/* ═══════════════════════════════════════
   LIGHTBOX
═══════════════════════════════════════ */
function openLightbox(url) {
  const lb  = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  if (!lb||!img) return;
  img.src = url;
  lb.classList.add('open');
}
function closeLightbox() {
  document.getElementById('lightbox')?.classList.remove('open');
}

/* ═══════════════════════════════════════
   KEYBOARD
═══════════════════════════════════════ */
function hk(e)  { if (e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); } }
function ar(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,100)+'px'; }

/* ═══════════════════════════════════════
   CHAT MENU (⋮ block user)
═══════════════════════════════════════ */
function openChatMenu() {
  if (!curChat) return;
  userMenuTarget = curChat;
  document.getElementById('userMenuTitle').textContent = curChat;
  const actionBtn = document.getElementById('userMenuActionBtn');
  const joinBtn = document.getElementById('userMenuJoinBtn');
  if (actionBtn) actionBtn.textContent = currentChatMeta?.isGroup ? 'Leave Group' : 'Delete This User';
  if (joinBtn) joinBtn.style.display = currentChatMeta?.isGroup ? 'block' : 'none';
  document.getElementById('userMenuModal').classList.add('open');
}
function closeUserMenu()     { document.getElementById('userMenuModal').classList.remove('open'); userMenuTarget=null; }
function closeUserMenuOut(e) { if (e.target===document.getElementById('userMenuModal')) closeUserMenu(); }
function confirmMenuAction() {
  if (currentChatMeta?.isGroup) {
    confirmLeaveFromMenu();
    return;
  }
  const meta = currentChatMeta;
  closeUserMenu();
  if (!(meta?.conversationId)) return;
  const name = meta.name || 'this user';
  showConfirm('\u{1F5D1}', 'Delete This User?', `Delete chat with "${name}" for your account only?`, () => deleteUserConversation(meta.conversationId, name));
}
function confirmLeaveFromMenu() {
  const meta = currentChatMeta;
  closeUserMenu();
  if (!(meta?.isGroup && meta?.conversationId)) {
    showToast('Leave Group works only in group chats.');
    return;
  }
  const groupName = meta.name || 'this group';
  showConfirm('\u{1F6AA}', 'Leave Group?', `Leave "${groupName}"?`, () => leaveGroupConversation(meta.conversationId, groupName));
}

async function confirmJoinFromMenu() {
  const meta = currentChatMeta;
  closeUserMenu();
  if (!(meta?.isGroup && meta?.conversationId)) {
    showToast('Join User works only in group chats.');
    return;
  }
  setTimeout(() => openAddUserModal(meta), 220);
}

function openAddUserModal(meta) {
  if (!(meta?.conversationId)) return;
  addUserGroupTarget = {
    conversationId: meta.conversationId,
    name: meta.name || 'this group'
  };
  const input = document.getElementById('addUserInput');
  if (input) input.value = '';
  document.getElementById('addUserModal')?.classList.add('open');
  setTimeout(() => input?.focus(), 50);
}

function closeAddUserModal() {
  document.getElementById('addUserModal')?.classList.remove('open');
  addUserGroupTarget = null;
}

function closeAddUserModalOut(e) {
  if (e.target === document.getElementById('addUserModal')) closeAddUserModal();
}

async function submitAddUserToGroup() {
  if (!(addUserGroupTarget?.conversationId)) {
    showToast('No group selected.');
    closeAddUserModal();
    return;
  }
  const inputEl = document.getElementById('addUserInput');
  const usernameOrEmail = (inputEl?.value || '').trim();
  if (!usernameOrEmail) {
    showToast('Enter username or email.');
    inputEl?.focus();
    return;
  }
  const ok = await addUserToGroupConversation(
    addUserGroupTarget.conversationId,
    usernameOrEmail,
    addUserGroupTarget.name
  );
  if (ok) closeAddUserModal();
}

async function addUserToGroupConversation(conversationId, usernameOrEmail, groupName) {
  if (!(window._fb && db && window.currentUser)) {
    showToast('Please login first.');
    return false;
  }

  const input = (usernameOrEmail || '').trim();
  if (!input) return false;

  try {
    const target = await findUser(input);
    if (!target) {
      showToast('User not found.');
      return false;
    }

    const ref = window._fb.doc(db, 'conversations', conversationId);
    const snap = await window._fb.getDoc(ref);
    if (!snap.exists()) { showToast('Group not found.'); return false; }
    const data = snap.data() || {};
    if (!data.isGroup) { showToast('This is not a group chat.'); return false; }

    const myUid = window.currentUser.uid;
    if (target.uid === myUid) {
      showToast('You are already in this group.');
      return false;
    }

    const participants = Array.isArray(data.participants) ? data.participants : [];
    if (participants.includes(target.uid)) {
      showToast(`${target.username} is already in ${groupName}.`);
      return false;
    }

    const members = { ...(data.members || {}) };
    members[target.uid] = {
      username: target.username || 'user',
      email: target.email || '',
      photoURL: target.photoURL || ''
    };

    const actorName =
      window.currentUser.displayName ||
      document.getElementById('prName')?.textContent?.trim() ||
      'A member';

    const updatedParticipants = [...participants, target.uid];
    const formerParticipants = (data.formerParticipants || []).filter(uid => uid !== target.uid);
    const joinedGroupName = data.groupName || groupName || 'this group';
    const systemText = `${actorName} added ${target.username} to the group`;

    await window._fb.addDoc(window._fb.collection(db, 'conversations', conversationId, 'messages'), {
      text: systemText,
      mediaUrl: '',
      mediaType: '',
      uid: myUid,
      senderName: 'System',
      type: 'system',
      systemEvent: 'added_member',
      actorUid: myUid,
      targetUid: target.uid,
      timestamp: window._fb.serverTimestamp()
    });

    await window._fb.setDoc(ref, {
      participants: updatedParticipants,
      members,
      formerParticipants,
      groupNameLower: joinedGroupName.toLowerCase(),
      lastMessage: systemText,
      lastMessageAt: window._fb.serverTimestamp(),
      updatedAt: window._fb.serverTimestamp()
    }, { merge: true });

    showToast(`${target.username} joined ${joinedGroupName}.`);
    return true;
  } catch (err) {
    console.error('Add user to group error:', err);
    showToast('Failed to add user to group.');
    return false;
  }
}

async function leaveGroupConversation(conversationId, groupName) {
  if (!(window._fb && db && window.currentUser)) {
    showToast('Please login first.');
    return;
  }
  try {
    const ref = window._fb.doc(db, 'conversations', conversationId);
    const snap = await window._fb.getDoc(ref);
    if (!snap.exists()) { showToast('Group not found.'); return; }
    const data = snap.data() || {};
    if (!data.isGroup) { showToast('This is not a group chat.'); return; }

    const myUid = window.currentUser.uid;
    if (!(data.participants || []).includes(myUid)) {
      showToast('You already left this group.');
      return;
    }
    const leaverName =
      window.currentUser.displayName ||
      document.getElementById('prName')?.textContent?.trim() ||
      'A member';
    const participants = (data.participants || []).filter(uid => uid !== myUid);
    const members = { ...(data.members || {}) };
    delete members[myUid];
    const formerParticipants = Array.from(new Set([...(data.formerParticipants || []), myUid]));

    await window._fb.addDoc(window._fb.collection(db, 'conversations', conversationId, 'messages'), {
      text: `${leaverName} left the group`,
      mediaUrl: '',
      mediaType: '',
      uid: myUid,
      senderName: 'System',
      type: 'system',
      systemEvent: 'left_group',
      actorUid: myUid,
      timestamp: window._fb.serverTimestamp()
    });

    await window._fb.setDoc(ref, {
      participants,
      members,
      formerParticipants,
      groupNameLower: (data.groupName || groupName || '').toLowerCase(),
      lastMessage: `${leaverName} left the group`,
      lastMessageAt: window._fb.serverTimestamp(),
      updatedAt: window._fb.serverTimestamp()
    }, { merge: true });

    if (unsub) { unsub(); unsub = null; }
    currentChatMeta = null;
    go('chatListScreen');
    subscribeChatList();
    showToast(`You left ${groupName}.`);
  } catch (err) {
    console.error('Leave group error:', err);
    showToast('Failed to leave group.');
  }
}

async function deleteUserConversation(conversationId, name) {
  if (!(window._fb && db && window.currentUser)) {
    showToast('Please login first.');
    return;
  }
  try {
    const ref = window._fb.doc(db, 'conversations', conversationId);
    const snap = await window._fb.getDoc(ref);
    if (!snap.exists()) { showToast('Conversation not found.'); return; }
    const data = snap.data() || {};
    if (data.isGroup) { showToast('Use Leave Group for group chats.'); return; }

    const myUid = window.currentUser.uid;
    if (!(data.participants || []).includes(myUid)) {
      showToast('Chat already deleted.');
      return;
    }
    const participants = (data.participants || []).filter(uid => uid !== myUid);
    const members = { ...(data.members || {}) };
    delete members[myUid];

    await window._fb.setDoc(ref, {
      participants,
      members,
      updatedAt: window._fb.serverTimestamp()
    }, { merge: true });

    if (unsub) { unsub(); unsub = null; }
    currentChatMeta = null;
    go('chatListScreen');
    subscribeChatList();
    showToast(`Deleted chat with ${name}.`);
  } catch (err) {
    console.error('Delete user chat error:', err);
    showToast('Failed to delete chat.');
  }
}
/* ═══════════════════════════════════════
   CHAT SETTINGS — Font Size
═══════════════════════════════════════ */
function updateFontSize(val) {
  applyFontSize(val);
  savePref('chat_fontsize', parseInt(val));
  const prev = document.getElementById('fontPreview');
  if (prev) prev.style.fontSize = val + 'px';
}
function applyFontSize(val) {
  document.documentElement.style.setProperty('--chat-font-size', val+'px');
  const prev = document.getElementById('fontPreview');
  if (prev) prev.style.fontSize = val+'px';
}

/* ═══════════════════════════════════════
   CHAT SETTINGS — Bubble
═══════════════════════════════════════ */
const bubStyles = { rounded:{r:'19px',bl:'4px',br:'19px'}, soft:{r:'14px',bl:'6px',br:'14px'}, sharp:{r:'8px',bl:'2px',br:'8px'} };
function setBubble(style) { applyBubbleStyle(style); savePref('chat_bubble',style); }
function applyBubbleStyle(style) {
  const s = bubStyles[style]||bubStyles.rounded;
  document.documentElement.style.setProperty('--bub-radius',s.r);
  document.documentElement.style.setProperty('--bub-bl',s.bl);
  document.documentElement.style.setProperty('--bub-br',s.br);
  ['rounded','soft','sharp'].forEach(k=>{
    document.getElementById('chk-'+k)?.style && (document.getElementById('chk-'+k).style.opacity = k===style?'1':'0');
    document.getElementById('bub-'+k)?.classList.toggle('selected',k===style);
  });
}

/* ═══════════════════════════════════════
   CHAT SETTINGS — Wallpaper
═══════════════════════════════════════ */
const wallpapers = {
  default:  'linear-gradient(140deg,rgb(255,228,228) 0%,rgb(255,208,208) 50%,rgb(225,172,172) 100%)',
  stars:    'radial-gradient(ellipse at top,#1a1a3e 0%,#0d0d1f 100%)',
  sakura:   'linear-gradient(135deg,#ffe4e1 0%,#ffb6c1 50%,#ffc8d4 100%)',
  mint:     'linear-gradient(135deg,#d4f5e0 0%,#b8e8c8 60%,#a8dbb8 100%)',
  lavender: 'linear-gradient(135deg,#e8d5f5 0%,#d4b8e8 60%,#c8a8e0 100%)',
  sunset:   'linear-gradient(135deg,#ffd1a0 0%,#ffb3b3 50%,#ffccd5 100%)',
};
function setWallpaper(id) { applyWallpaper(id, true); }
function applyWallpaper(id, save=true) {
  document.documentElement.style.setProperty('--chat-wallpaper', wallpapers[id]||wallpapers.default);
  Object.keys(wallpapers).forEach(k=>{
    document.getElementById('wp-'+k)?.classList.toggle('active', k===id);
  });
  if (save) savePref('chat_wallpaper', id);
}

function saveChatSettings() {
  const fs = document.getElementById('fontSlider').value;
  savePref('chat_fontsize', parseInt(fs));
  applyFontSize(fs);
  showToast('Chat settings saved! 💬');
  setTimeout(()=>go('settingsScreen'), 900);
}

/* ═══════════════════════════════════════
   ABOUT
═══════════════════════════════════════ */
function openLink(url) {
  if (url.startsWith('#')) { showToast('Coming soon! 🌸'); return; }
  window.open(url,'_blank');
}

/* ═══════════════════════════════════════
   TOAST
═══════════════════════════════════════ */
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 2800);
}

/* ═══════════════════════════════════════
   CONFIRM DIALOG
═══════════════════════════════════════ */
let confirmCb = null;
function showConfirm(icon, title, msg, cb) {
  document.getElementById('confirmIcon').textContent  = icon;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent   = msg;
  confirmCb = cb;
  document.getElementById('confirmOverlay').classList.add('open');
}
function closeConfirm() { document.getElementById('confirmOverlay').classList.remove('open'); confirmCb=null; }
function runConfirm()   { const cb = confirmCb; closeConfirm(); if (cb) cb(); }

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  loadUserPrefs();
  document.getElementById('chatMenuBtn')?.addEventListener('click', openChatMenu);
  // Restore local demo session
  const session = getPref('local_session', null);
  if (session?.username && session?.email) {
    setProfile(session.username, session.email);
    savePref('last_username', session.username);
  }
});







