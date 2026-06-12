import { requireSignIn } from '../auth.js';
import { loadConfig, t } from '../config-loader.js';
import { loadMembers } from '../data.js';
import { el, announce } from '../dom.js';

let _members = [];
let _config = null;
let _session = null;

function initials(name) {
  return (name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

async function init() {
  _session = await requireSignIn();
  if (!_session) return;
  _config = await loadConfig();

  const membersName = (_config.terminology || {}).members_name || 'Members';
  const h1 = document.getElementById('page-title');
  if (h1) h1.textContent = membersName;
  const bc = document.getElementById('breadcrumb-current');
  if (bc) bc.textContent = membersName;

  try {
    _members = await loadMembers();
  } catch (err) {
    renderError(err);
    return;
  }

  renderMembers(_members);
  setupSearch();
}

function renderMembers(members) {
  const container = document.getElementById('members-list');
  if (!container) return;

  if (members.length === 0) {
    container.replaceChildren(el('p', { class: 'empty-state', text: 'No members yet.' }));
    return;
  }

  const ul = el('ul', { class: 'card-grid', role: 'list' });
  for (const m of members) {
    ul.appendChild(buildMemberCard(m));
  }
  container.replaceChildren(ul);
}

function buildMemberCard(m) {
  const li = el('li', { class: 'card' });
  const inner = el('div', { class: 'member-card' });

  const avatar = el('span', { class: 'member-avatar', 'aria-hidden': 'true' }, initials(m.name));
  inner.appendChild(avatar);

  const info = el('div', { class: 'member-info' });
  info.appendChild(el('h2', { class: 'card-title' },
    el('a', { href: `member.html?id=${encodeURIComponent(m.oid)}` },
      el('span', { class: 'sr-only' }, 'View member: '),
      m.name || 'Unknown',
    ),
    _session && m.oid === _session.oid ? el('span', { class: 'card-meta' }, ' (you)') : null,
  ));

  if (m.expertise && m.expertise.length) {
    const tagList = el('ul', { class: 'tag-list', role: 'list', 'aria-label': 'Expertise' });
    for (const tag of m.expertise) {
      tagList.appendChild(el('li', { class: 'tag', text: tag }));
    }
    info.appendChild(tagList);
  }

  if (m.stretch && m.stretch.length) {
    info.appendChild(el('p', { class: 'card-meta', text: `Wants to learn: ${m.stretch.join(', ')}` }));
  }

  if (m.talk_about && m.talk_about.length) {
    info.appendChild(el('p', { class: 'card-meta', text: `Ask about: ${m.talk_about.join(', ')}` }));
  }

  inner.appendChild(info);
  li.appendChild(inner);
  return li;
}

function setupSearch() {
  const form = document.getElementById('search-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = (document.getElementById('search-input') || {}).value || '';
    const filtered = filterMembers(_members, q.trim().toLowerCase());
    renderMembers(filtered);
    announce(`${filtered.length} member${filtered.length !== 1 ? 's' : ''} found`);
  });

  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const input = document.getElementById('search-input');
      if (input) input.value = '';
      renderMembers(_members);
      announce(`Showing all ${_members.length} members`);
    });
  }
}

function filterMembers(members, q) {
  if (!q) return members;
  return members.filter((m) => {
    const name = (m.name || '').toLowerCase();
    const expertise = (m.expertise || []).join(' ').toLowerCase();
    const stretch = (m.stretch || []).join(' ').toLowerCase();
    const talkAbout = (m.talk_about || []).join(' ').toLowerCase();
    return name.includes(q) || expertise.includes(q) || stretch.includes(q) || talkAbout.includes(q);
  });
}

function renderError(err) {
  const container = document.getElementById('members-list');
  if (!container) return;
  container.replaceChildren(
    el('div', { class: 'status-message status-message--error', role: 'alert' },
      el('p', { text: `Failed to load members: ${err.message}` }),
    ),
  );
}

init();
