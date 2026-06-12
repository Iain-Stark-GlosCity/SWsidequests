import { requireSignIn } from '../auth.js';
import { loadConfig, t } from '../config-loader.js';
import { loadMembers, saveMember } from '../data.js';
import { el, announce, moveFocus } from '../dom.js';
import { buildTagsField } from '../tag-field.js';
import { markRegistered } from '../onboarding.js';
import { validate, showErrors, clearErrors, loadDraft, clearDraft, autosaveDraft } from '../forms.js';

const DRAFT_KEY = 'welcome-profile';
const MAX_TAGS = 5;
const MAX_STRETCH = 3;
const MAX_TALK_ABOUT = 3;

let _session = null;
let _config = null;

async function init() {
  _session = await requireSignIn();
  if (!_session) return;
  _config = await loadConfig();

  const orgName = (_config.branding || {}).org_name || 'Activity Board';
  document.title = `Welcome — ${orgName}`;
  const orgEl = document.getElementById('org-name');
  if (orgEl) orgEl.textContent = orgName;
  const siteName = document.getElementById('site-name');
  if (siteName) siteName.textContent = orgName;

  /* Already registered? Nothing to do here — go to the board. */
  try {
    const members = await loadMembers();
    if (members.some((m) => m.oid === _session.oid)) {
      markRegistered(_session.oid);
      location.replace('index.html');
      return;
    }
  } catch { /* members API unreachable — let them fill the form; save will surface errors */ }

  renderIntro();
  renderProfileForm();
  wireSteps();
}

/* ── Step 1: orientation, built from config so it matches the org's terms ── */

function renderIntro() {
  const introEl = document.getElementById('intro-text');
  if (introEl) {
    introEl.classList.remove('loading');
    const custom = (_config.branding || {}).intro_text;
    introEl.textContent = custom
      || 'This is your team’s space to test ideas, share what you learn, and grow together. The loop is simple:';
  }

  const features = _config.features || {};
  const pts = _config.points || {};
  const ptsName = (_config.terminology || {}).points_name || 'points';
  const expPlural = t(_config, 'items.experiment.plural').toLowerCase();
  const expSingular = t(_config, 'items.experiment.singular').toLowerCase();

  const steps = [];
  steps.push(['Test', `Run small ${expPlural} — one question, one quick test. Start your own or join someone else’s team.`]);

  if (features.sessions) {
    const sessPlural = t(_config, 'items.session.plural').toLowerCase();
    steps.push(['Learn', `Share as you go. Every finished ${expSingular} ends with a shared finding, and you can host or join ${sessPlural} to spread what works.`]);
  } else {
    steps.push(['Learn', `Share as you go — every finished ${expSingular} ends with a finding the whole team can read.`]);
  }

  if (features.challenges) {
    const chalPlural = t(_config, 'items.challenge.plural').toLowerCase();
    steps.push(['Grow', `Pick up open ${chalPlural} from teammates${pts.enabled ? `, and earn ${ptsName} as your findings stack up` : ''}.`]);
  } else if (pts.enabled) {
    steps.push(['Grow', `Earn ${ptsName} as your findings stack up.`]);
  } else {
    steps.push(['Grow', 'Watch the shared findings stack up over time.']);
  }

  const list = document.getElementById('loop-list');
  if (!list) return;
  const frag = document.createDocumentFragment();
  for (const [label, text] of steps) {
    frag.appendChild(el('li', null, el('strong', { text: label }), ` — ${text}`));
  }
  list.replaceChildren(frag);
}

/* ── Step 2: the registration form ───────────────────────────────────────── */

function renderProfileForm() {
  const form = document.getElementById('welcome-form');
  if (!form) return;

  const draft = loadDraft(DRAFT_KEY) || {};

  const nameInput = document.getElementById('name');
  if (nameInput) nameInput.value = draft.name || _session.name || '';

  const tagBox = document.getElementById('tag-fields');
  if (tagBox) {
    tagBox.replaceChildren(
      buildTagsField('expertise', 'Expertise (optional)',
        `Up to ${MAX_TAGS} skills or techniques you already practice. Add one at a time with Enter or comma.`,
        draft.expertise || [], MAX_TAGS),
      buildTagsField('stretch', 'Learning goals (optional)',
        `Up to ${MAX_STRETCH} things you want to learn next — teammates can help you get there.`,
        draft.stretch || [], MAX_STRETCH),
      buildTagsField('talk_about', 'Ask me about (optional)',
        `Up to ${MAX_TALK_ABOUT} topics people can come and ask you about.`,
        draft.talk_about || [], MAX_TALK_ABOUT),
    );
  }

  autosaveDraft(form, DRAFT_KEY, getValues);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = getValues();
    const errors = validate([
      { id: 'name', label: 'your name', value: values.name, required: true, maxLength: 100 },
    ]);
    if (errors.length) { showErrors(errors, 'form-errors'); return; }
    clearErrors('form-errors');
    await register(values, form.querySelector('button[type="submit"]'));
  });

  const skipBtn = document.getElementById('skip-details');
  if (skipBtn) {
    skipBtn.addEventListener('click', async () => {
      const name = (nameInput && nameInput.value.trim()) || _session.name || 'New member';
      await register({ name, expertise: [], stretch: [], talk_about: [] }, skipBtn);
    });
  }
}

function getValues() {
  const v = (id) => (document.getElementById(id) || {}).value || '';
  const parseHidden = (id) => { try { return JSON.parse(v(id)) || []; } catch { return []; } };
  return {
    name:       v('name').trim(),
    expertise:  parseHidden('expertise'),
    stretch:    parseHidden('stretch'),
    talk_about: parseHidden('talk_about'),
  };
}

async function register(values, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await saveMember({
      oid: _session.oid,
      name: values.name,
      email: _session.email || undefined,
      expertise: values.expertise,
      stretch: values.stretch,
      talk_about: values.talk_about,
      joined_at: new Date().toISOString(),
    });
    clearDraft(DRAFT_KEY);
    markRegistered(_session.oid);
    location.href = 'index.html?welcome=1';
  } catch (err) {
    btn.disabled = false;
    btn.textContent = original;
    const detail = err.status === 403 ? 'You do not have permission.' : err.message;
    showErrors([{ field: 'name', message: `Could not create your profile: ${detail}` }], 'form-errors');
  }
}

/* ── Step switching with focus management ────────────────────────────────── */

function wireSteps() {
  const stepIntro = document.getElementById('step-intro');
  const stepProfile = document.getElementById('step-profile');
  const indicator = document.getElementById('step-indicator');

  const toProfile = document.getElementById('to-profile');
  if (toProfile) {
    toProfile.addEventListener('click', () => {
      stepIntro.hidden = true;
      stepProfile.hidden = false;
      if (indicator) indicator.textContent = 'Step 2 of 2';
      announce('Step 2 of 2 — set up your profile');
      moveFocus(document.getElementById('profile-heading'));
    });
  }

  const back = document.getElementById('back-to-intro');
  if (back) {
    back.addEventListener('click', () => {
      stepProfile.hidden = true;
      stepIntro.hidden = false;
      if (indicator) indicator.textContent = 'Step 1 of 2';
      announce('Step 1 of 2 — how this works');
      moveFocus(document.getElementById('intro-heading'));
    });
  }
}

init();
