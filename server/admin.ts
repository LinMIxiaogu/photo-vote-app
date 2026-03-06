import type { Express } from "express";
import { Router } from "express";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { moderateImages } from "./_core/aliyunImageModeration";
import { moderateText } from "./_core/aliyunTextModeration";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { storagePut } from "./storage";

// Hardcoded admin credentials - change these before deploying to production
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "photoAdmin2026";
const ADMIN_OPEN_ID = "admin:operator";

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Photo Vote Admin</title>
<style>
:root{
  --bg:#f6f2ea;
  --bg-accent:#f1e4d2;
  --panel:#fffdf8;
  --panel-strong:#ffffff;
  --line:#dccfbe;
  --line-soft:#ebe1d5;
  --text:#3d3127;
  --muted:#7d6f63;
  --accent:#c96f4a;
  --accent-strong:#a94f2f;
  --accent-soft:#f7e4d5;
  --success:#2f7a58;
  --danger:#b84d4d;
  --shadow:0 18px 50px rgba(111, 84, 61, 0.12);
}
*{box-sizing:border-box;margin:0;padding:0}
body{
  min-height:100vh;
  font-family:"Segoe UI",system-ui,sans-serif;
  color:var(--text);
  background:
    radial-gradient(circle at top left, rgba(201,111,74,0.12), transparent 28%),
    radial-gradient(circle at right 15%, rgba(201,111,74,0.08), transparent 24%),
    linear-gradient(180deg, #fbf7f0 0%, var(--bg) 100%);
}
.shell{max-width:1200px;margin:0 auto;padding:28px 20px 64px}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 22px;margin-bottom:22px;background:rgba(255,253,248,0.88);border:1px solid rgba(220,207,190,0.8);border-radius:24px;box-shadow:var(--shadow)}
.brand{display:flex;align-items:center;gap:14px}
.brand-mark{width:52px;height:52px;border-radius:18px;background:linear-gradient(135deg, #d7865f, #f1bb89);color:#fff8f2;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;box-shadow:0 10px 24px rgba(201,111,74,0.24)}
.brand-copy h1{font-size:28px;line-height:1.05;letter-spacing:0.02em}
.brand-copy p{margin-top:6px;color:var(--muted);font-size:13px}
.top-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.nav{display:flex;gap:10px;padding:6px;border-radius:999px;background:var(--bg-accent)}
.nav a{padding:10px 16px;border-radius:999px;text-decoration:none;color:var(--text);font-size:13px;font-weight:700}
.nav a.active{background:var(--panel-strong);color:var(--accent-strong);box-shadow:0 6px 20px rgba(111,84,61,0.12)}
.logout{border:none;background:transparent;color:var(--muted);font-size:13px;font-weight:700;cursor:pointer;padding:10px 12px}
.logout:hover{color:var(--accent-strong)}
.hero{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding:28px;margin-bottom:20px;border-radius:28px;background:linear-gradient(135deg, rgba(201,111,74,0.14), rgba(241,187,137,0.24)),var(--panel);border:1px solid rgba(220,207,190,0.9);box-shadow:var(--shadow)}
.hero h2{font-size:34px;line-height:1.05;margin-bottom:10px}
.hero p{max-width:620px;color:var(--muted);font-size:14px;line-height:1.6}
.hero-note{min-width:220px;padding:16px 18px;border-radius:18px;background:rgba(255,255,255,0.72);border:1px solid rgba(220,207,190,0.8)}
.hero-note strong{display:block;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
.hero-note span{font-size:14px;line-height:1.5}
.page-grid{display:grid;grid-template-columns:1.05fr 0.95fr;gap:20px}
.panel{background:rgba(255,253,248,0.92);border:1px solid rgba(220,207,190,0.88);border-radius:24px;padding:24px;box-shadow:var(--shadow)}
.panel-title{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:16px}
.panel-title h3{font-size:22px}
.panel-title span{color:var(--muted);font-size:13px}
.field{margin-bottom:16px}
label{display:block;margin-bottom:7px;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:var(--muted)}
input[type=text],input[type=password],textarea,select,input[type=date]{width:100%;padding:14px 15px;border:1px solid var(--line);border-radius:16px;background:var(--panel-strong);color:var(--text);font:inherit;transition:border-color .2s, box-shadow .2s}
input[type=text]:focus,input[type=password]:focus,textarea:focus,select:focus,input[type=date]:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px rgba(201,111,74,0.12)}
textarea{min-height:132px;resize:vertical}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 18px;border:none;border-radius:16px;background:linear-gradient(135deg, var(--accent), #e09a67);color:#fffaf6;font:inherit;font-weight:700;cursor:pointer;box-shadow:0 12px 24px rgba(201,111,74,0.2)}
.btn:disabled{opacity:.6;cursor:not-allowed;box-shadow:none}
.btn-secondary{background:#fffaf6;color:var(--accent-strong);border:1px solid var(--line);box-shadow:none}
.msg-error,.msg-ok{padding:13px 14px;margin-bottom:14px;border-radius:16px;font-size:13px}
.msg-error{background:#fff1ee;color:var(--danger);border:1px solid rgba(184,77,77,0.22)}
.msg-ok{background:#eef9f2;color:var(--success);border:1px solid rgba(47,122,88,0.22)}
.hidden{display:none !important}
.progress-wrap{height:6px;margin-bottom:16px;border-radius:999px;background:#efe5db;overflow:hidden}
.progress-bar{height:100%;width:0;background:linear-gradient(90deg, var(--accent), #efb177);transition:width .3s ease}
.photo-zone{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:220px;border:2px dashed #d7c7b4;border-radius:24px;background:linear-gradient(180deg, rgba(255,255,255,0.9), rgba(249,241,231,0.85));text-align:center;cursor:pointer;transition:transform .2s, border-color .2s, background .2s}
.photo-zone:hover,.photo-zone.drag-over{transform:translateY(-1px);border-color:var(--accent);background:linear-gradient(180deg, #fffaf6, #f6e6d8)}
.photo-zone strong{font-size:22px;font-weight:700}
.photo-zone p{color:var(--muted);font-size:14px}
.photo-grid{display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:12px;margin-top:16px}
.photo-item{position:relative;aspect-ratio:1;overflow:hidden;border-radius:18px;background:#eadfce}
.photo-item img{width:100%;height:100%;object-fit:cover}
.del-btn{position:absolute;top:8px;right:8px;width:30px;height:30px;border:none;border-radius:999px;background:rgba(61,49,39,0.72);color:#fff;font-size:14px;cursor:pointer}
.hint{margin-top:12px;color:var(--muted);font-size:12px}
.review-toolbar{display:grid;grid-template-columns:1.2fr 1fr;gap:16px;margin-bottom:18px}
.status-pills{display:flex;gap:10px;flex-wrap:wrap}
.filter-btn{padding:10px 14px;border-radius:999px;border:1px solid var(--line);background:#fffaf6;color:var(--text);font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.filter-btn.active{background:var(--accent-soft);border-color:#e5b28d;color:var(--accent-strong)}
.stack{display:grid;gap:10px}
.date-row{display:grid;grid-template-columns:1fr 1fr auto;gap:10px}
.review-list{display:grid;gap:14px}
.review-item{padding:18px;border-radius:20px;background:#fffaf6;border:1px solid var(--line-soft)}
.review-meta{margin-bottom:12px;color:var(--muted);font-size:12px;line-height:1.5}
.review-text{margin-bottom:12px;font-size:13px;line-height:1.6;white-space:pre-wrap}
.review-photos{display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));gap:8px;margin-bottom:12px}
.review-photos img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;background:#eadfce}
.review-actions{display:flex;gap:10px}
.btn-sm{padding:10px 12px;border:none;border-radius:12px;color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.btn-approve{background:var(--success)}
.btn-reject{background:var(--danger)}
.login-shell{display:flex;justify-content:center;padding-top:10vh}
.login-card{width:min(100%, 430px);padding:30px}
.login-card h2{font-size:32px;margin-bottom:10px}
.login-card p{color:var(--muted);line-height:1.7;margin-bottom:18px}
@media (max-width:960px){.page-grid,.review-toolbar,.date-row{grid-template-columns:1fr}.hero{flex-direction:column;align-items:flex-start}}
@media (max-width:640px){.shell{padding:18px 14px 48px}.topbar{flex-direction:column;align-items:flex-start}.top-actions{width:100%;justify-content:space-between}.nav{width:100%;justify-content:space-between}.nav a{flex:1;text-align:center}.hero h2{font-size:28px}.review-photos{grid-template-columns:repeat(2, minmax(0, 1fr))}}
</style>
</head>
<body>
<div class="shell">
  <div id="loginBox" class="login-shell hidden">
    <div class="panel login-card">
      <h2>Admin Login</h2>
      <p>Manage card uploads and moderation from one place.</p>
      <div id="loginErr" class="msg-error hidden"></div>
      <div class="field">
        <label>Username</label>
        <input id="uname" type="text" placeholder="Enter username" autocomplete="username" />
      </div>
      <div class="field">
        <label>Password</label>
        <input id="upass" type="password" placeholder="Enter password" autocomplete="current-password" />
      </div>
      <button class="btn" id="loginBtn" onclick="doLogin()">Login</button>
    </div>
  </div>

  <div id="appShell" class="hidden">
    <div class="topbar">
      <div class="brand">
        <div class="brand-mark">PV</div>
        <div class="brand-copy">
          <h1>Photo Vote Admin</h1>
          <p>Manage uploads and moderation flow.</p>
        </div>
      </div>
      <div class="top-actions">
        <div class="nav">
          <a href="/admin/upload" id="navUpload">Upload</a>
          <a href="/admin/review" id="navReview">Review</a>
        </div>
        <button class="logout" onclick="doLogout()">Logout</button>
      </div>
    </div>

    <div class="hero">
      <div>
        <h2 id="pageTitle">Upload card</h2>
        <p id="pageSubtitle">Create a new voting card. Images are compressed in the browser before upload.</p>
      </div>
      <div class="hero-note">
        <strong>Workspace</strong>
        <span id="heroNote">Separate upload and moderation work so the team can move faster.</span>
      </div>
    </div>

    <div id="pageUpload" class="page-grid">
      <div class="panel">
        <div class="panel-title">
          <h3>Card details</h3>
          <span>Title up to 14 characters</span>
        </div>
        <div id="uploadMsg" class="hidden"></div>
        <div id="progressWrap" class="progress-wrap hidden"><div class="progress-bar" id="progressBar"></div></div>
        <div class="field">
          <label>Title</label>
          <input id="cardTitle" type="text" maxlength="14" placeholder="Optional title" />
        </div>
        <div class="field">
          <label>Description</label>
          <textarea id="cardDesc" maxlength="2000" placeholder="Optional description"></textarea>
        </div>
        <button class="btn" id="uploadBtn" onclick="doUpload()">Upload card</button>
      </div>

      <div class="panel">
        <div class="panel-title">
          <h3>Images</h3>
          <span>2 to 4 images</span>
        </div>
        <div class="photo-zone" id="photoZone"
          onclick="document.getElementById('photoInput').click()"
          ondragover="event.preventDefault();this.classList.add('drag-over')"
          ondragleave="this.classList.remove('drag-over')"
          ondrop="handleDrop(event)">
          <strong>Select images</strong>
          <p>Click to choose files, or drag images here.</p>
        </div>
        <div class="photo-grid" id="photoGrid"></div>
        <p class="hint">Supports JPG, PNG, and WEBP. Images are compressed before upload.</p>
        <input id="photoInput" type="file" accept="image/*" multiple style="display:none" onchange="handleFileSelect(event)" />
      </div>
    </div>

    <div id="pageReview" class="panel hidden">
      <div class="panel-title">
        <h3>Moderation queue</h3>
        <span>Browse pending items and moderation history.</span>
      </div>
      <div class="review-toolbar">
        <div class="stack">
          <label>Status</label>
          <div class="status-pills">
            <button class="filter-btn active" id="filterPending" onclick="setReviewStatus('pending')">Pending</button>
            <button class="filter-btn" id="filterApproved" onclick="setReviewStatus('approved')">Approved</button>
            <button class="filter-btn" id="filterRejected" onclick="setReviewStatus('rejected')">Rejected</button>
          </div>
        </div>
        <div class="stack">
          <label>Filters</label>
          <div class="stack">
            <select id="typeFilter">
              <option value="all">All types</option>
              <option value="card_audit">Card review</option>
              <option value="comment">Comment review</option>
              <option value="user_name">Username review</option>
              <option value="user_avatar">Avatar review</option>
            </select>
            <input id="keywordFilter" type="text" placeholder="Keyword search" />
          </div>
        </div>
      </div>
      <div class="date-row">
        <input id="startDateFilter" type="date" />
        <input id="endDateFilter" type="date" />
        <button class="btn btn-secondary" onclick="loadModeration()">Apply filters</button>
      </div>
      <div id="reviewList" class="review-list"></div>
    </div>
  </div>
</div>

<script>
var photos = [];
var currentReviewStatus = 'pending';

function getStatusLabel(status) {
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  return 'Pending';
}

function getTypeLabel(type) {
  if (type === 'card') return 'Card review';
  if (type === 'photo') return 'Photo review';
  if (type === 'comment') return 'Comment review';
  if (type === 'user_name') return 'Username review';
  if (type === 'user_avatar') return 'Avatar review';
  return type || 'Unknown type';
}

function formatTime(value) {
  if (!value) return '';
  var date = new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function currentPage() {
  return location.pathname.endsWith('/review') ? 'review' : 'upload';
}

function applyNav() {
  var page = currentPage();
  document.getElementById('navUpload').classList.toggle('active', page === 'upload');
  document.getElementById('navReview').classList.toggle('active', page === 'review');
  document.getElementById('pageUpload').classList.toggle('hidden', page !== 'upload');
  document.getElementById('pageReview').classList.toggle('hidden', page !== 'review');
  document.getElementById('pageTitle').textContent = page === 'upload' ? 'Upload card' : 'Moderation queue';
  document.getElementById('pageSubtitle').textContent = page === 'upload'
    ? 'Create a new voting card. Images are compressed in the browser before upload.'
    : 'Filter moderation records by status, type, and date, then handle them quickly.';
  document.getElementById('heroNote').textContent = page === 'upload'
    ? 'The upload page focuses on content creation and image management.'
    : 'The review page groups text and images together to avoid repeated work.';
  if (page === 'review') loadModeration();
}

async function checkAuth() {
  showLogin();
  try {
    var response = await fetch('/api/admin/me', { credentials: 'include' });
    var data = await response.json();
    if (data.loggedIn) {
      showApp();
      return;
    }
  } catch (error) {}
  showLogin();
}

function showApp() {
  document.getElementById('loginBox').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  applyNav();
}

function showLogin() {
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginBox').classList.remove('hidden');
}

function setReviewStatus(status) {
  currentReviewStatus = status;
  document.getElementById('filterPending').classList.toggle('active', status === 'pending');
  document.getElementById('filterApproved').classList.toggle('active', status === 'approved');
  document.getElementById('filterRejected').classList.toggle('active', status === 'rejected');
  loadModeration();
}

function normalizeModerationItems(items) {
  var grouped = new Map();
  var result = [];

  items.forEach(function(item) {
    var isCardAudit = item.targetType === 'card' || item.targetType === 'photo';
    if (!isCardAudit) {
      result.push(item);
      return;
    }

    var cardId = item.targetId;
    var existing = grouped.get(cardId);

    if (!existing) {
      existing = {
        recordId: item.recordId || null,
        recordIds: [],
        targetType: 'card',
        targetId: cardId,
        status: item.status,
        autoResult: item.autoResult || null,
        autoMessage: '',
        manualReason: '',
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        sourceLabel: item.sourceLabel || 'Card content',
        displayTypeLabel: 'Card review',
        content: {
          title: null,
          description: null,
          photos: []
        }
      };
      grouped.set(cardId, existing);
      result.push(existing);
    }

    if (item.recordId && !existing.recordId) existing.recordId = item.recordId;
    if (item.recordIds && item.recordIds.length) existing.recordIds = existing.recordIds.concat(item.recordIds);
    if (item.status) existing.status = item.status;
    if (item.content && item.content.title) existing.content.title = item.content.title;
    if (item.content && item.content.description) existing.content.description = item.content.description;
    if (item.content && item.content.photos) existing.content.photos = existing.content.photos.concat(item.content.photos);
    if (item.autoMessage) existing.autoMessage = existing.autoMessage ? existing.autoMessage + ' / ' + item.autoMessage : item.autoMessage;
    if (item.manualReason) existing.manualReason = existing.manualReason ? existing.manualReason + ' / ' + item.manualReason : item.manualReason;
    if (new Date(item.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      existing.updatedAt = item.updatedAt;
      existing.createdAt = item.createdAt;
    }
  });

  result.forEach(function(item) {
    if (item.recordIds && item.recordIds.length) item.recordIds = Array.from(new Set(item.recordIds));
    if (item.autoMessage) item.autoMessage = Array.from(new Set(item.autoMessage.split(' / ').filter(Boolean))).join(' / ');
    if (item.manualReason) item.manualReason = Array.from(new Set(item.manualReason.split(' / ').filter(Boolean))).join(' / ');
    if (item.content && item.content.photos) {
      var photoMap = new Map();
      item.content.photos.forEach(function(photo) {
        photoMap.set(photo.id || photo.url, photo);
      });
      item.content.photos = Array.from(photoMap.values());
    }
  });

  return result.sort(function(a, b) {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function renderModeration(items) {
  var list = document.getElementById('reviewList');
  var normalizedItems = normalizeModerationItems(items);
  if (!normalizedItems.length) {
    list.innerHTML = '<div class="review-meta">No records</div>';
    return;
  }

  list.innerHTML = '';
  normalizedItems.forEach(function(item) {
    var card = document.createElement('div');
    card.className = 'review-item';

    var meta = document.createElement('div');
    meta.className = 'review-meta';
    var metaParts = [
      '[' + (item.displayTypeLabel || getTypeLabel(item.targetType)) + ']',
      '#' + item.targetId,
      getStatusLabel(item.status)
    ];
    if (item.sourceLabel) metaParts.push('Source: ' + item.sourceLabel);
    if (item.createdAt) metaParts.push('Created: ' + formatTime(item.createdAt));
    if (item.autoMessage) metaParts.push('Auto review: ' + item.autoMessage);
    if (item.manualReason) metaParts.push('Manual note: ' + item.manualReason);
    meta.textContent = metaParts.join(' | ');
    card.appendChild(meta);

    if (item.content) {
      if (item.content.title || item.content.description) {
        var titleBlock = document.createElement('div');
        titleBlock.className = 'review-text';
        titleBlock.textContent = (item.content.title ? ('Title: ' + item.content.title + '\\n') : '')
          + (item.content.description ? ('Description: ' + item.content.description) : '');
        card.appendChild(titleBlock);
      }
      if (item.content.content) {
        var contentBlock = document.createElement('div');
        contentBlock.className = 'review-text';
        contentBlock.textContent = item.content.content;
        card.appendChild(contentBlock);
      }
      if (item.content.name) {
        var nameBlock = document.createElement('div');
        nameBlock.className = 'review-text';
        nameBlock.textContent = 'Username: ' + item.content.name;
        card.appendChild(nameBlock);
      }
      if (item.content.avatarUrl) {
        var avatarGrid = document.createElement('div');
        avatarGrid.className = 'review-photos';
        var avatar = document.createElement('img');
        avatar.src = item.content.avatarUrl;
        avatarGrid.appendChild(avatar);
        card.appendChild(avatarGrid);
      }

      var photoItems = item.content.photos || item.content.images || [];
      if (item.content.url) photoItems = [item.content.url];
      if (photoItems.length) {
        var grid = document.createElement('div');
        grid.className = 'review-photos';
        photoItems.forEach(function(photo) {
          var image = document.createElement('img');
          image.src = photo.url || photo;
          grid.appendChild(image);
        });
        card.appendChild(grid);
      }
    }

    if (item.status === 'pending') {
      var actions = document.createElement('div');
      actions.className = 'review-actions';
      var approve = document.createElement('button');
      approve.className = 'btn-sm btn-approve';
      approve.textContent = 'Approve';
      approve.onclick = function() { decideModeration(item, 'approved'); };
      actions.appendChild(approve);

      var reject = document.createElement('button');
      reject.className = 'btn-sm btn-reject';
      reject.textContent = 'Reject';
      reject.onclick = function() { decideModeration(item, 'rejected'); };
      actions.appendChild(reject);
      card.appendChild(actions);
    }

    list.appendChild(card);
  });
}

async function loadModeration() {
  var list = document.getElementById('reviewList');
  list.innerHTML = '<div class="review-meta">閸旂姾娴囨稉?..</div>';
  try {
    var type = document.getElementById('typeFilter').value;
    var keyword = document.getElementById('keywordFilter').value.trim();
    var startDate = document.getElementById('startDateFilter').value;
    var endDate = document.getElementById('endDateFilter').value;
    var qs = 'status=' + encodeURIComponent(currentReviewStatus);
    if (type && type !== 'all') qs += '&type=' + encodeURIComponent(type);
    if (keyword) qs += '&keyword=' + encodeURIComponent(keyword);
    if (startDate) qs += '&startDate=' + encodeURIComponent(startDate);
    if (endDate) qs += '&endDate=' + encodeURIComponent(endDate);

    var response = await fetch('/api/admin/moderation/list?' + qs, { credentials: 'include' });
    var data = await response.json();
    renderModeration(data.items || []);
  } catch (error) {
    list.innerHTML = '<div class="review-meta">閸旂姾娴囨径杈Е</div>';
  }
}

async function decideModeration(item, decision) {
  try {
    var reason = '';
    if (decision === 'rejected') {
      reason = prompt('Reason for rejection (optional)', '') || '';
    }
    await fetch('/api/admin/moderation/decide', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recordId: item.recordId || null,
        recordIds: item.recordIds || null,
        targetType: item.targetType,
        targetId: item.targetId,
        decision: decision,
        reason: reason
      })
    });
    loadModeration();
  } catch (error) {}
}

async function doLogin() {
  var username = document.getElementById('uname').value.trim();
  var password = document.getElementById('upass').value;
  var errorBox = document.getElementById('loginErr');
  var button = document.getElementById('loginBtn');

  errorBox.classList.add('hidden');
  if (!username || !password) {
    errorBox.textContent = 'Please enter both username and password';
    errorBox.classList.remove('hidden');
    return;
  }

  button.disabled = true;
  button.textContent = '閻ц缍嶆稉?..';
  try {
    var response = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    });
    var data = await response.json();
    if (data.success) {
      showApp();
    } else {
      errorBox.textContent = data.error || '閻ц缍嶆径杈Е';
      errorBox.classList.remove('hidden');
    }
  } catch (error) {
    errorBox.textContent = '缂冩垹绮跺鍌氱埗閿涘矁顕柌宥堢槸';
    errorBox.classList.remove('hidden');
  } finally {
    button.disabled = false;
    button.textContent = 'Login';
  }
}

async function doLogout() {
  await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' }).catch(function() {});
  photos.forEach(function(photo) { URL.revokeObjectURL(photo.objectUrl); });
  photos = [];
  renderPhotos();
  document.getElementById('cardTitle').value = '';
  document.getElementById('cardDesc').value = '';
  document.getElementById('uploadMsg').classList.add('hidden');
  showLogin();
}

function handleFileSelect(event) {
  addFiles(Array.from(event.target.files));
  event.target.value = '';
}

function handleDrop(event) {
  event.preventDefault();
  document.getElementById('photoZone').classList.remove('drag-over');
  addFiles(Array.from(event.dataTransfer.files).filter(function(file) {
    return file.type.startsWith('image/');
  }));
}

function compressImage(file, callback) {
  var objectUrl = URL.createObjectURL(file);
  var img = new Image();
  img.onload = function() {
    var maxSize = 1200;
    var width = img.width;
    var height = img.height;

    if (width > maxSize || height > maxSize) {
      if (width > height) {
        height = Math.round(height * maxSize / width);
        width = maxSize;
      } else {
        width = Math.round(width * maxSize / height);
        height = maxSize;
      }
    }

    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    var mime = 'image/jpeg';
    var dataUrl = canvas.toDataURL(mime, 0.85);
    callback({ base64: dataUrl.split(',')[1], mimeType: mime, objectUrl: objectUrl });
  };
  img.src = objectUrl;
}

function addFiles(files) {
  var remaining = 4 - photos.length;
  files.slice(0, remaining).forEach(function(file) {
    compressImage(file, function(photo) {
      photos.push(photo);
      renderPhotos();
    });
  });
}

function renderPhotos() {
  var grid = document.getElementById('photoGrid');
  grid.innerHTML = '';
  photos.forEach(function(photo, index) {
    var item = document.createElement('div');
    item.className = 'photo-item';
    item.innerHTML = '<img src="' + photo.objectUrl + '" /><button class="del-btn" onclick="removePhoto(' + index + ')">x</button>';
    grid.appendChild(item);
  });
}

function removePhoto(index) {
  URL.revokeObjectURL(photos[index].objectUrl);
  photos.splice(index, 1);
  renderPhotos();
}

function setMsg(text, type) {
  var node = document.getElementById('uploadMsg');
  node.className = type === 'ok' ? 'msg-ok' : 'msg-error';
  node.textContent = text;
  node.classList.remove('hidden');
  if (type === 'ok') {
    setTimeout(function() {
      node.classList.add('hidden');
    }, 6000);
  }
}

async function doUpload() {
  var title = document.getElementById('cardTitle').value.trim();
  var description = document.getElementById('cardDesc').value.trim();
  var button = document.getElementById('uploadBtn');
  var progressWrap = document.getElementById('progressWrap');
  var progressBar = document.getElementById('progressBar');

  document.getElementById('uploadMsg').classList.add('hidden');
  if (photos.length < 2) {
    setMsg('Please select at least 2 images', 'err');
    return;
  }

  button.disabled = true;
  button.textContent = 'Uploading...';
  progressWrap.classList.remove('hidden');
  progressBar.style.width = '25%';

  try {
    progressBar.style.width = '55%';
    var body = { photos: photos.map(function(photo) { return { base64: photo.base64, mimeType: photo.mimeType }; }) };
    if (title) body.title = title;
    if (description) body.description = description;

    var response = await fetch('/api/admin/create-card', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    progressBar.style.width = '90%';
    if (!response.ok) {
      var errText = await response.text().catch(function() { return ''; });
      progressBar.style.width = '0';
      progressWrap.classList.add('hidden');
      setMsg('Request failed HTTP ' + response.status + ' - ' + errText.replace(/<[^>]*>/g, '').trim().slice(0, 160), 'err');
      return;
    }

    var data = await response.json();
    if (data.success) {
      progressBar.style.width = '100%';
      setTimeout(function() {
        progressWrap.classList.add('hidden');
        progressBar.style.width = '0';
      }, 700);
      setMsg('Upload succeeded, card ID: ' + data.cardId, 'ok');
      photos.forEach(function(photo) { URL.revokeObjectURL(photo.objectUrl); });
      photos = [];
      renderPhotos();
      document.getElementById('cardTitle').value = '';
      document.getElementById('cardDesc').value = '';
    } else {
      progressBar.style.width = '0';
      progressWrap.classList.add('hidden');
      setMsg(data.error || 'Upload failed, please retry', 'err');
    }
  } catch (error) {
    progressBar.style.width = '0';
    progressWrap.classList.add('hidden');
    setMsg('Network error: ' + error.message, 'err');
  } finally {
    button.disabled = false;
    button.textContent = 'Upload card';
  }
}

document.getElementById('upass').addEventListener('keydown', function(event) {
  if (event.key === 'Enter') doLogin();
});

checkAuth();
</script>
</body>
</html>`;

export function registerAdminRoutes(app: Express): void {
  const router = Router();

  async function requireAdmin(req: any, res: any) {
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.openId !== ADMIN_OPEN_ID) {
        res.status(403).json({ success: false, error: "Forbidden" });
        return null;
      }
      return user;
    } catch {
      res.status(401).json({ success: false, error: "Please log in first" });
      return null;
    }
  }

  // Serve the admin HTML page
  router.get("/admin", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(ADMIN_HTML);
  });
  router.get("/admin/upload", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(ADMIN_HTML);
  });
  router.get("/admin/review", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(ADMIN_HTML);
  });

  // Check if current session is an authenticated admin
  router.get("/api/admin/me", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.openId === ADMIN_OPEN_ID) {
        res.json({ loggedIn: true });
      } else {
        res.json({ loggedIn: false });
      }
    } catch {
      res.json({ loggedIn: false });
    }
  });

  // Login with hardcoded credentials
  router.post("/api/admin/login", async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      res.status(401).json({ success: false, error: "Invalid username or password" });
      return;
    }

    // Ensure the admin user exists in the database
    await db.upsertUser({
      openId: ADMIN_OPEN_ID,
      name: "admin",
      lastSignedIn: new Date(),
    });

    const token = await sdk.createSessionToken(ADMIN_OPEN_ID, { name: "admin" });
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, token, {
      ...cookieOptions,
      sameSite: "lax",  // lax works over HTTP; "none" requires HTTPS
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({ success: true });
  });

  // Logout - clear the session cookie
  router.post("/api/admin/logout", (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // Create a voting card with photos (admin only)
  router.post("/api/admin/create-card", async (req, res) => {
    // Authenticate and verify this is the admin account
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ success: false, error: "Please log in first" });
      return;
    }

    if (user.openId !== ADMIN_OPEN_ID) {
      res.status(403).json({ success: false, error: "Forbidden" });
      return;
    }

    const { title, description, photos } = req.body as {
      title?: string;
      description?: string;
      photos?: Array<{ base64: string; mimeType: string }>;
    };

    if (!photos || photos.length < 2 || photos.length > 4) {
      res.status(400).json({ success: false, error: "Please upload 2 to 4 images" });
      return;
    }

    const cardId = await db.createCard({
      userId: user.id,
      title: title || null,
      description: description || null,
      moderationStatus: "pending",
    });

    try {
      const photoRecords = await Promise.all(
        photos.map(async (photo, index) => {
          const randomSuffix = Math.random().toString(36).substring(2, 10);
          const extension = photo.mimeType.split("/")[1] || "jpg";
          const fileKey = `cards/${cardId}/photo-${index}-${randomSuffix}.${extension}`;
          const buffer = Buffer.from(photo.base64, "base64");
          const { url } = await storagePut(fileKey, buffer, photo.mimeType);
          return { cardId, url, photoIndex: index, moderationStatus: "pending" as const };
        }),
      );

      await db.createPhotos(photoRecords);
      const createdPhotos = await db.getPhotosByCardId(cardId, { includeUnapproved: true });

      const textChecks: Array<{ pass: boolean; message?: string; result?: string }> = [];
      if (title?.trim()) {
        const mod = await moderateText(title.trim(), "comment_detection");
        textChecks.push({ pass: mod.pass, message: mod.message, result: mod.result });
      }
      if (description?.trim()) {
        const mod = await moderateText(description.trim(), "comment_detection");
        textChecks.push({ pass: mod.pass, message: mod.message, result: mod.result });
      }
      const textFail = textChecks.find((c) => !c.pass);
      const textPass = !textFail;

      const imageMod = await moderateImages(photoRecords.map((p) => p.url));
      const imagePass = imageMod.pass;

      const overallPass = textPass && imagePass;
      const cardStatus = overallPass ? "approved" : "pending";
      await db.updateCardModerationStatus(cardId, cardStatus);

      if (overallPass) {
        for (const p of createdPhotos) {
          await db.updatePhotoModerationStatus(p.id, "approved");
        }
      }

      await db.createModerationRecord({
        targetType: "card",
        targetId: cardId,
        status: cardStatus,
        autoResult: (overallPass ? "pass" : (textFail?.result ?? "block")) as "pass" | "review" | "block",
        autoMessage: overallPass ? null : (textFail?.message ?? imageMod.message ?? "Content needs manual review"),
      });

      for (const p of createdPhotos) {
        await db.createModerationRecord({
          targetType: "photo",
          targetId: p.id,
          status: cardStatus,
          autoResult: imagePass ? "pass" : "block",
          autoMessage: imagePass ? null : (imageMod.message ?? "Image needs manual review"),
        });
      }
    } catch (err) {
      await db.deleteCard(cardId, user.id);
      const message = err instanceof Error ? err.message : "Image upload failed";
      res.status(500).json({ success: false, error: message });
      return;
    }

    res.json({ success: true, cardId });
  });

  router.get("/api/admin/moderation/list", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const status = (typeof req.query.status === "string" ? req.query.status : "pending") as "approved" | "pending" | "rejected";
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const typeParam = typeof req.query.type === "string" ? req.query.type : "";
    const keyword = (typeof req.query.keyword === "string" ? req.query.keyword : "").trim();
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : "";
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : "";

    const targetTypes = typeParam && typeParam !== "all"
      ? (typeParam === "card_audit"
        ? ["card", "photo"]
        : typeParam.split(",").filter(Boolean)) as Array<"card" | "photo" | "comment" | "user_name" | "user_avatar">
      : undefined;
    const startAt = startDate ? new Date(`${startDate}T00:00:00`) : undefined;
    const endAt = endDate ? new Date(`${endDate}T23:59:59`) : undefined;

    const includesCardAudit = !targetTypes || targetTypes.includes("card") || targetTypes.includes("photo");
    const cardAuditRecords = includesCardAudit
      ? await db.listModerationRecords(undefined, limit * 3, 0, {
        targetTypes: ["card", "photo"],
        startAt,
        endAt,
      })
      : [];
    const defaultNonCardTargetTypes: Array<"comment" | "user_name" | "user_avatar"> = ["comment", "user_name", "user_avatar"];
    const nonCardTargetTypes = targetTypes?.filter((type) => type !== "card" && type !== "photo");
    const otherTargetTypes = targetTypes === undefined ? defaultNonCardTargetTypes : nonCardTargetTypes;
    const shouldQueryOtherRecords = otherTargetTypes != null && otherTargetTypes.length > 0;
    const otherRecords = shouldQueryOtherRecords
      ? await db.listModerationRecords(status, limit, offset, {
        targetTypes: otherTargetTypes,
        startAt,
        endAt,
      })
      : [];

    const cardRecords = cardAuditRecords.filter((record) => record.targetType === "card");
    const photoRecords = cardAuditRecords.filter((record) => record.targetType === "photo");
    const photoRecordsByCardId = new Map<number, typeof photoRecords>();

    for (const record of photoRecords) {
      const photo = await db.getPhotoById(record.targetId);
      if (!photo) continue;
      const existing = photoRecordsByCardId.get(photo.cardId) ?? [];
      existing.push(record);
      photoRecordsByCardId.set(photo.cardId, existing);
    }

    const cardItems = await Promise.all(cardRecords.map(async (record) => {
      const card = await db.getCardById(record.targetId, { includeUnapproved: true });
      const photos = await db.getPhotosByCardId(record.targetId, { includeUnapproved: true });
      const linkedPhotoRecords = photoRecordsByCardId.get(record.targetId) ?? [];
      const autoMessages = Array.from(new Set([
        record.autoMessage,
        ...linkedPhotoRecords.map((item) => item.autoMessage),
      ].filter(Boolean)));
      const manualReasons = Array.from(new Set([
        record.manualReason,
        ...linkedPhotoRecords.map((item) => item.manualReason),
      ].filter(Boolean)));
      const latestUpdatedAt = linkedPhotoRecords.reduce((latest, item) => {
        return new Date(item.updatedAt).getTime() > new Date(latest).getTime() ? item.updatedAt : latest;
      }, record.updatedAt);

      return {
        recordId: record.id,
        recordIds: linkedPhotoRecords.map((item) => item.id),
        targetType: "card" as const,
        targetId: record.targetId,
        status: card?.moderationStatus ?? record.status,
        autoResult: record.autoResult,
        autoMessage: autoMessages.length ? autoMessages.join(" / ") : null,
        manualReason: manualReasons.length ? manualReasons.join(" / ") : null,
        createdAt: record.createdAt,
        updatedAt: latestUpdatedAt,
        sourceLabel: "Card content",
        displayTypeLabel: "Card review",
        content: {
          title: card?.title ?? null,
          description: card?.description ?? null,
          photos: photos.map((photo) => ({ id: photo.id, url: photo.url, moderationStatus: photo.moderationStatus })),
          moderationStatus: card?.moderationStatus ?? null,
        },
      };
    }));

    const otherItems = await Promise.all(otherRecords.map(async (record) => {
      if (record.targetType === "comment") {
        const comment = await db.getCommentById(record.targetId);
        return {
          recordId: record.id,
          targetType: record.targetType,
          targetId: record.targetId,
          status: record.status,
          autoResult: record.autoResult,
          autoMessage: record.autoMessage,
          manualReason: record.manualReason,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          sourceLabel: "Comment content",
          content: comment ? { content: comment.content, images: comment.images ?? [], moderationStatus: comment.moderationStatus } : null,
        };
      }
      if (record.targetType === "user_name") {
        const userRow = await db.getUserById(record.targetId);
        return {
          recordId: record.id,
          targetType: record.targetType,
          targetId: record.targetId,
          status: record.status,
          autoResult: record.autoResult,
          autoMessage: record.autoMessage,
          manualReason: record.manualReason,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          sourceLabel: "User profile",
          content: userRow ? { name: userRow.name, moderationStatus: userRow.nameModerationStatus } : null,
        };
      }
      if (record.targetType === "user_avatar") {
        const userRow = await db.getUserById(record.targetId);
        return {
          recordId: record.id,
          targetType: record.targetType,
          targetId: record.targetId,
          status: record.status,
          autoResult: record.autoResult,
          autoMessage: record.autoMessage,
          manualReason: record.manualReason,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          sourceLabel: "User profile",
          content: userRow ? { avatarUrl: userRow.avatarUrl, moderationStatus: userRow.avatarModerationStatus } : null,
        };
      }
      return {
        recordId: record.id,
        targetType: record.targetType,
        targetId: record.targetId,
        status: record.status,
        autoResult: record.autoResult,
        autoMessage: record.autoMessage,
        manualReason: record.manualReason,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        sourceLabel: "",
        content: null,
      };
    }));

    const items = [...cardItems, ...otherItems]
      .filter((item) => item.status === status)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const filtered = keyword
      ? items.filter((item) => {
        const content = (item.content ?? {}) as any;
        const hay = [
          item.autoMessage,
          item.manualReason,
          item.targetType,
          content.title,
          content.description,
          content.content,
          content.name,
          content.avatarUrl,
          ...(content.photos ? content.photos.map((p: any) => p.url) : []),
          ...(content.images ? content.images : []),
          content.url,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(keyword.toLowerCase());
      })
      : items;

    res.json({ items: filtered });
  });

  router.post("/api/admin/moderation/decide", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { recordId, recordIds, targetType, targetId, decision, reason } = req.body as {
      recordId?: number;
      recordIds?: number[];
      targetType?: "card" | "photo" | "comment" | "user_name" | "user_avatar";
      targetId?: number;
      decision?: "approved" | "rejected";
      reason?: string;
    };
    if ((!recordId && (!recordIds || !recordIds.length)) || (decision !== "approved" && decision !== "rejected")) {
      res.status(400).json({ success: false, error: "Invalid parameters" });
      return;
    }

    if (targetType === "photo" && recordIds?.length && targetId) {
      for (const id of recordIds) {
        await db.updateModerationRecordDecision(id, decision, admin.id, reason);
      }
      const photos = await db.getPhotosByCardId(targetId, { includeUnapproved: true });
      for (const photo of photos) {
        await db.updatePhotoModerationStatus(photo.id, decision);
      }
      const nextPhotos = await db.getPhotosByCardId(targetId, { includeUnapproved: true });
      const anyRejected = nextPhotos.some((p) => p.moderationStatus === "rejected");
      const allApproved = nextPhotos.length > 0 && nextPhotos.every((p) => p.moderationStatus === "approved");
      const nextStatus = anyRejected ? "rejected" : (allApproved ? "approved" : "pending");
      await db.updateCardModerationStatus(targetId, nextStatus);
      res.json({ success: true });
      return;
    }

    if (!recordId) {
      res.status(400).json({ success: false, error: "Missing moderation record ID" });
      return;
    }

    const record = await db.getModerationRecordById(recordId);
    if (!record) {
      res.status(404).json({ success: false, error: "Moderation record not found" });
      return;
    }

    await db.updateModerationRecordDecision(recordId, decision, admin.id, reason);

    if (record.targetType === "card") {
      if (recordIds?.length) {
        for (const id of recordIds) {
          await db.updateModerationRecordDecision(id, decision, admin.id, reason);
        }
        const photos = await db.getPhotosByCardId(record.targetId, { includeUnapproved: true });
        for (const photo of photos) {
          await db.updatePhotoModerationStatus(photo.id, decision);
        }
      }
      await db.updateCardModerationStatus(record.targetId, decision);
      const photos = await db.getPhotosByCardId(record.targetId, { includeUnapproved: true });
      const anyRejected = photos.some((p) => p.moderationStatus === "rejected") || decision === "rejected";
      const allApproved = photos.every((p) => p.moderationStatus === "approved") && decision === "approved";
      const nextStatus = anyRejected ? "rejected" : (allApproved ? "approved" : "pending");
      await db.updateCardModerationStatus(record.targetId, nextStatus);
    } else if (record.targetType === "photo") {
      await db.updatePhotoModerationStatus(record.targetId, decision);
      const photo = await db.getPhotoById(record.targetId);
      if (photo) {
        const photos = await db.getPhotosByCardId(photo.cardId, { includeUnapproved: true });
        const card = await db.getCardById(photo.cardId, { includeUnapproved: true });
        const anyRejected = photos.some((p) => p.moderationStatus === "rejected") || card?.moderationStatus === "rejected";
        const allApproved = photos.every((p) => p.moderationStatus === "approved") && card?.moderationStatus === "approved";
        const nextStatus = anyRejected ? "rejected" : (allApproved ? "approved" : "pending");
        await db.updateCardModerationStatus(photo.cardId, nextStatus);
      }
    } else if (record.targetType === "comment") {
      await db.updateCommentModerationStatus(record.targetId, decision);
    } else if (record.targetType === "user_name") {
      await db.updateUserNameModerationStatus(record.targetId, decision);
    } else if (record.targetType === "user_avatar") {
      await db.updateUserAvatarModerationStatus(record.targetId, decision);
    }

    res.json({ success: true });
  });

  app.use(router);
}
