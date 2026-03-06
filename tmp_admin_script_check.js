
var photos = [];
var currentReviewStatus = 'pending';

function getStatusLabel(status) {
  return status === 'approved' ? '已通过' : status === 'rejected' ? '已拒绝' : '待审核';
}

function getTypeLabel(type) {
  if (type === 'card') return '卡片审核';
  if (type === 'photo') return '卡片审核';
  if (type === 'comment') return '评论审核';
  if (type === 'user_name') return '用户名审核';
  if (type === 'user_avatar') return '头像审核';
  return type || '未知类型';
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
  document.getElementById('pageTitle').textContent = page === 'upload' ? '上传卡片' : '审核内容';
  document.getElementById('pageSubtitle').textContent = page === 'upload'
    ? '创建新的投票卡片，浏览器端压缩图片后提交到审核流程。'
    : '按状态、类型和时间筛选审核记录，并快速处理审核结果。';
  document.getElementById('heroNote').textContent = page === 'upload'
    ? '上传页专注于创建内容，右侧单独管理图片。'
    : '审核页将文字与图片分开展示，避免重复审核。';
  if (page === 'review') loadModeration();
}

async function checkAuth() {
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
checkAuth();

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

async function loadModeration() {
  var list = document.getElementById('reviewList');
  list.innerHTML = '<div class="review-meta">加载中...</div>';
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
    list.innerHTML = '<div class="review-meta">加载失败</div>';
  }
}

function renderModeration(items) {
  var list = document.getElementById('reviewList');
  if (!items.length) {
    list.innerHTML = '<div class="review-meta">暂无记录</div>';
    return;
  }
  list.innerHTML = '';
  items.forEach(function(item) {
    var card = document.createElement('div');
    card.className = 'review-item';
    var meta = document.createElement('div');
    meta.className = 'review-meta';
    var metaParts = [
      '[' + getTypeLabel(item.targetType) + ']',
      '#' + item.targetId,
      getStatusLabel(item.status)
    ];
    if (item.sourceLabel) metaParts.push('来源：' + item.sourceLabel);
    if (item.createdAt) metaParts.push('创建于：' + formatTime(item.createdAt));
    if (item.autoMessage) metaParts.push('机审：' + item.autoMessage);
    if (item.manualReason) metaParts.push('人工备注：' + item.manualReason);
    meta.textContent = metaParts.join(' · ');
    card.appendChild(meta);

    if (item.content) {
      if (item.content.title || item.content.description) {
        var titleBlock = document.createElement('div');
        titleBlock.className = 'review-text';
        titleBlock.textContent = (item.content.title ? ('标题：' + item.content.title + '\\n') : '')
          + (item.content.description ? ('描述：' + item.content.description) : '');
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
        nameBlock.textContent = '用户名：' + item.content.name;
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

    var actions = document.createElement('div');
    actions.className = 'review-actions';
    var approve = document.createElement('button');
    approve.className = 'btn-sm btn-approve';
    approve.textContent = '通过';
    approve.onclick = function() { decideModeration(item, 'approved'); };
    actions.appendChild(approve);
    var reject = document.createElement('button');
    reject.className = 'btn-sm btn-reject';
    reject.textContent = '拒绝';
    reject.onclick = function() { decideModeration(item, 'rejected'); };
    actions.appendChild(reject);
    card.appendChild(actions);
    list.appendChild(card);
  });
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

    var cardId = item.targetType === 'card'
      ? item.targetId
      : ((item.content && item.content.cardId) || item.targetId);
    var existing = grouped.get(cardId);

    if (!existing) {
      existing = {
        recordId: null,
        recordIds: [],
        targetType: 'card',
        targetId: cardId,
        status: item.status,
        autoResult: item.autoResult || null,
        autoMessage: '',
        manualReason: '',
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        sourceLabel: '????',
        displayTypeLabel: '????',
        content: {
          title: null,
          description: null,
          photos: []
        }
      };
      grouped.set(cardId, existing);
      result.push(existing);
    }

    if (item.recordId && !existing.recordId) {
      existing.recordId = item.recordId;
    }
    if (item.recordIds && item.recordIds.length) {
      existing.recordIds = existing.recordIds.concat(item.recordIds);
    } else if (item.targetType === 'photo' && item.recordId) {
      existing.recordIds.push(item.recordId);
    }
    if (item.status) {
      existing.status = item.status;
    }
    if (item.content && item.content.title) {
      existing.content.title = item.content.title;
    }
    if (item.content && item.content.description) {
      existing.content.description = item.content.description;
    }
    if (item.content && item.content.photos) {
      existing.content.photos = existing.content.photos.concat(item.content.photos);
    }
    if (item.autoMessage) {
      existing.autoMessage = existing.autoMessage
        ? (existing.autoMessage + ' / ' + item.autoMessage)
        : item.autoMessage;
    }
    if (item.manualReason) {
      existing.manualReason = existing.manualReason
        ? (existing.manualReason + ' / ' + item.manualReason)
        : item.manualReason;
    }
    if (new Date(item.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      existing.updatedAt = item.updatedAt;
      existing.createdAt = item.createdAt;
    }
  });

  result.forEach(function(item) {
    if (item.targetType !== 'card') return;
    if (item.recordIds && item.recordIds.length) {
      item.recordIds = Array.from(new Set(item.recordIds));
    }
    if (item.autoMessage) {
      item.autoMessage = Array.from(new Set(item.autoMessage.split(' / ').filter(Boolean))).join(' / ');
    }
    if (item.manualReason) {
      item.manualReason = Array.from(new Set(item.manualReason.split(' / ').filter(Boolean))).join(' / ');
    }
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

renderModeration = function(items) {
  var list = document.getElementById('reviewList');
  var normalizedItems = normalizeModerationItems(items);
  if (!normalizedItems.length) {
    list.innerHTML = '<div class="review-meta">????</div>';
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
    if (item.sourceLabel) metaParts.push('??: ' + item.sourceLabel);
    if (item.createdAt) metaParts.push('???: ' + formatTime(item.createdAt));
    if (item.autoMessage) metaParts.push('??: ' + item.autoMessage);
    if (item.manualReason) metaParts.push('????: ' + item.manualReason);
    meta.textContent = metaParts.join(' ? ');
    card.appendChild(meta);

    if (item.content) {
      if (item.content.title || item.content.description) {
        var titleBlock = document.createElement('div');
        titleBlock.className = 'review-text';
        titleBlock.textContent = (item.content.title ? ('??: ' + item.content.title + '\n') : '')
          + (item.content.description ? ('??: ' + item.content.description) : '');
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
        nameBlock.textContent = '???: ' + item.content.name;
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
      approve.textContent = '??';
      approve.onclick = function() { decideModeration(item, 'approved'); };
      actions.appendChild(approve);
      var reject = document.createElement('button');
      reject.className = 'btn-sm btn-reject';
      reject.textContent = '??';
      reject.onclick = function() { decideModeration(item, 'rejected'); };
      actions.appendChild(reject);
      card.appendChild(actions);
    }

    list.appendChild(card);
  });
};

async function decideModeration(item, decision) {
  try {
    var reason = '';
    if (decision === 'rejected') {
      reason = prompt('拒绝原因（选填）', '') || '';
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
    errorBox.textContent = '请输入用户名和密码';
    errorBox.classList.remove('hidden');
    return;
  }
  button.disabled = true;
  button.textContent = '登录中...';
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
      errorBox.textContent = data.error || '登录失败';
      errorBox.classList.remove('hidden');
    }
  } catch (error) {
    errorBox.textContent = '网络异常，请重试';
    errorBox.classList.remove('hidden');
  } finally {
    button.disabled = false;
    button.textContent = '登录';
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

document.getElementById('upass').addEventListener('keydown', function(event) {
  if (event.key === 'Enter') doLogin();
});

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
    var MAX = 1200;
    var width = img.width;
    var height = img.height;
    if (width > MAX || height > MAX) {
      if (width > height) {
        height = Math.round(height * MAX / width);
        width = MAX;
      } else {
        width = Math.round(width * MAX / height);
        height = MAX;
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
    setMsg('请至少选择 2 张图片', 'err');
    return;
  }
  button.disabled = true;
  button.textContent = '上传中...';
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
      setMsg('请求失败 HTTP ' + response.status + ' - ' + errText.replace(/<[^>]*>/g, '').trim().slice(0, 160), 'err');
      button.disabled = false;
      button.textContent = '上传卡片';
      return;
    }
    var data = await response.json();
    if (data.success) {
      progressBar.style.width = '100%';
      setTimeout(function() {
        progressWrap.classList.add('hidden');
        progressBar.style.width = '0';
      }, 700);
      setMsg('上传成功，卡片 ID：' + data.cardId, 'ok');
      photos.forEach(function(photo) { URL.revokeObjectURL(photo.objectUrl); });
      photos = [];
      renderPhotos();
      document.getElementById('cardTitle').value = '';
      document.getElementById('cardDesc').value = '';
    } else {
      progressBar.style.width = '0';
      progressWrap.classList.add('hidden');
      setMsg(data.error || '上传失败，请重试', 'err');
    }
  } catch (error) {
    progressBar.style.width = '0';
    progressWrap.classList.add('hidden');
    setMsg('网络异常：' + error.message, 'err');
  } finally {
    button.disabled = false;
    button.textContent = '上传卡片';
  }
}
