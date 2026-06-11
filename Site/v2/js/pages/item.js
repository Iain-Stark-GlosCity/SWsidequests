import { requireSignIn } from '../auth.js';
import { loadConfig, t } from '../config-loader.js';
import { loadItems, timeAgo, fullDate } from '../data.js';
import { el, chipEl, statusVariant, moveFocus } from '../dom.js';

async function init() {
  const session = await requireSignIn();
  if (!session) return;

  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (!id) {
    renderNotFound();
    return;
  }

  const config = await loadConfig();
  let item;
  try {
    const items = await loadItems();
    item = items.find((i) => i.item_id === id);
  } catch (err) {
    renderError(err);
    return;
  }

  if (!item) {
    renderNotFound();
    return;
  }

  updateTitle(item, config);
  renderItem(item, config, session);
}

function updateTitle(item, config) {
  const singular = t(config, `items.${item.item_type}.singular`);
  const orgName = (config.branding || {}).org_name || 'Activity Board';
  document.title = `${item.title || singular} — ${orgName}`;
  const h1 = document.getElementById('item-title');
  if (h1) h1.textContent = item.title || singular;
  const bc = document.getElementById('breadcrumb-current');
  if (bc) bc.textContent = item.title || singular;
}

function renderItem(item, config, session) {
  const main = document.getElementById('item-content');
  if (!main) return;

  const frag = document.createDocumentFragment();

  /* Header row: chip + meta */
  const header = el('div', { class: 'card-header', style: 'margin-bottom: 1.5rem' });
  header.appendChild(chipEl(item.status || 'unknown', statusVariant(item.status)));
  const postedBy = item.item_type === 'session' ? item.host_name : item.posted_by_name;
  if (postedBy) {
    header.appendChild(el('span', { class: 'card-meta' },
      `By ${postedBy}`,
      item.created_at
        ? el('time', { datetime: item.created_at }, ` · ${fullDate(item.created_at)}`)
        : '',
    ));
  }
  frag.appendChild(header);

  /* Grid layout */
  const grid = el('div', { class: 'detail-grid' });
  const mainCol = el('div');
  const sideCol = el('div');

  /* Description / question / topic */
  const bodyText = item.description || item.question || item.topic;
  if (bodyText) {
    mainCol.appendChild(el('p', { text: bodyText }));
  }

  /* Finding / output */
  if (item.finding) {
    mainCol.appendChild(el('h2', { text: 'Finding' }));
    mainCol.appendChild(el('p', { text: item.finding }));
  }
  if (item.output) {
    mainCol.appendChild(el('h2', { text: 'Output' }));
    mainCol.appendChild(el('p', { text: item.output }));
  }

  /* Updates thread */
  if (item.updates && item.updates.length > 0) {
    mainCol.appendChild(el('h2', { text: 'Updates' }));
    const ul = el('ul', { class: 'updates-list', role: 'list' });
    for (const u of item.updates) {
      const li = el('li', { class: 'update-item' });
      const meta = el('p', { class: 'update-meta' },
        u.author_name || 'Unknown',
        u.timestamp ? el('time', { datetime: u.timestamp }, ` · ${timeAgo(u.timestamp)}`) : '',
      );
      li.appendChild(meta);
      li.appendChild(el('p', { class: 'update-text', text: u.text }));
      ul.appendChild(li);
    }
    mainCol.appendChild(ul);
  }

  /* Sidebar meta */
  const metaItems = buildMetaItems(item, config);
  if (metaItems.length) {
    const metaList = el('ul', { class: 'detail-meta-list', role: 'list' });
    for (const [label, value] of metaItems) {
      const li = el('li', { class: 'detail-meta-item' },
        el('span', { class: 'detail-meta-label', text: label }),
        el('span', { text: value }),
      );
      metaList.appendChild(li);
    }
    sideCol.appendChild(el('h2', { text: 'Details' }));
    sideCol.appendChild(metaList);
  }

  grid.appendChild(mainCol);
  grid.appendChild(sideCol);
  frag.appendChild(grid);

  main.replaceChildren(frag);
  moveFocus(document.getElementById('item-title'));
}

function buildMetaItems(item, config) {
  const rows = [];
  const singular = t(config, `items.${item.item_type}.singular`);
  rows.push(['Type', singular]);
  if (item.difficulty) rows.push(['Difficulty', item.difficulty]);
  if (item.effort)     rows.push(['Effort',     item.effort]);
  if (item.deadline)   rows.push(['Deadline',   fullDate(item.deadline)]);
  if (item.session_date) rows.push(['Date', fullDate(item.session_date)]);
  if (item.format) rows.push(['Format', item.format]);

  if (item.team_oids && item.team_oids.length) {
    rows.push(['Team', item.team_names.join(', ')]);
  }
  if (item.attendee_oids && item.attendee_oids.length) {
    rows.push(['Attendees', item.attendee_names.join(', ')]);
  }

  const pts = config.points;
  if (pts && pts.enabled && item.xp_reward) {
    rows.push([pts.values ? 'Points' : 'Points', String(item.xp_reward)]);
  }
  return rows;
}

function renderNotFound() {
  const main = document.getElementById('item-content');
  if (!main) return;
  document.title = 'Not found — Activity Board';
  main.replaceChildren(
    el('p', { class: 'empty-state', text: 'Activity not found. It may have been removed.' }),
    el('a', { href: 'index.html', text: 'Back to board' }),
  );
}

function renderError(err) {
  const main = document.getElementById('item-content');
  if (!main) return;
  main.replaceChildren(
    el('div', { class: 'status-message status-message--error', role: 'alert' },
      el('p', { text: `Failed to load activity: ${err.message}` }),
    ),
  );
}

init();
