/**
 * Cinematic scenario player.
 * Intro → steps (hotspot or screen click advances) → complete → next showcase.
 * Back repeats the previous step.
 */
(function () {
  const MISS_WARN = 'Click the highlighted control to continue.';

  const KIND_LABELS = {
    context: 'Context',
    action: 'Your action',
    result: 'Result',
    bridge: 'Same for others',
    attention: 'Attention',
  };

  const DEFAULT_BRIDGE_MS = 3800;

  let scenario = null;
  let stepIndex = 0;
  let seekerTimer = null;
  let advanceTimer = null;
  /** @type {{ slug: string, title: string }[]} */
  let showcaseList = [];

  const els = {
    loading: document.getElementById('loading'),
    error: document.getElementById('error'),
    intro: document.getElementById('intro'),
    introTitle: document.getElementById('intro-title'),
    introBody: document.getElementById('intro-body'),
    introMeta: document.getElementById('intro-meta'),
    btnStart: document.getElementById('btn-start'),
    player: document.getElementById('player'),
    complete: document.getElementById('complete'),
    scenarioTitle: document.getElementById('scenario-title'),
    stepMeta: document.getElementById('step-meta'),
    stepKind: document.getElementById('step-kind'),
    stepTitle: document.getElementById('step-title'),
    stepBody: document.getElementById('step-body'),
    actionHint: document.getElementById('action-hint'),
    resultNote: document.getElementById('result-note'),
    warn: document.getElementById('skip-warn'),
    img: document.getElementById('step-image'),
    hotspot: document.getElementById('hotspot'),
    seeker: document.getElementById('hotspot-seeker'),
    stage: document.getElementById('stage'),
    flash: document.getElementById('click-flash'),
    btnBack: document.getElementById('btn-back'),
    completeTitle: document.getElementById('complete-title'),
    completeBody: document.getElementById('complete-body'),
    btnNextShowcase: document.getElementById('btn-next-showcase'),
    completeNextHint: document.getElementById('complete-next-hint'),
    attentionOverlay: document.getElementById('attention-overlay'),
    attentionTitle: document.getElementById('attention-title'),
    attentionMessage: document.getElementById('attention-message'),
  };

  function slugFromQuery() {
    return (new URLSearchParams(window.location.search).get('scenario') || '').trim();
  }

  function show(el, on) {
    if (!el) return;
    el.hidden = !on;
  }

  function currentStep() {
    return scenario && scenario.steps ? scenario.steps[stepIndex] : null;
  }

  function inferKind(step) {
    if (step.kind) return step.kind;
    if (step.hotspot) return 'action';
    return 'context';
  }

  function imageLayout() {
    const img = els.img;
    const stage = els.stage;
    const stageRect = stage.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    const natW = img.naturalWidth || 1;
    const natH = img.naturalHeight || 1;
    const scale = Math.min(imgRect.width / natW, imgRect.height / natH);
    const drawnW = natW * scale;
    const drawnH = natH * scale;
    const offsetX = imgRect.left - stageRect.left + (imgRect.width - drawnW) / 2;
    const offsetY = imgRect.top - stageRect.top + (imgRect.height - drawnH) / 2;
    return { drawnW, drawnH, offsetX, offsetY };
  }

  function clearSeeker() {
    if (seekerTimer) {
      clearTimeout(seekerTimer);
      seekerTimer = null;
    }
    if (els.seeker) {
      els.seeker.hidden = true;
      els.seeker.classList.remove('fly-in');
    }
  }

  function clearAdvanceTimer() {
    if (advanceTimer) {
      clearTimeout(advanceTimer);
      advanceTimer = null;
    }
  }

  function playSeekerTo(cx, cy) {
    if (!els.seeker || !els.stage) return;
    const stageW = els.stage.clientWidth;
    const stageH = els.stage.clientHeight;
    els.seeker.style.setProperty('--seek-x0', stageW / 2 + 'px');
    els.seeker.style.setProperty('--seek-y0', stageH * 0.42 + 'px');
    els.seeker.style.setProperty('--seek-x1', cx + 'px');
    els.seeker.style.setProperty('--seek-y1', cy + 'px');
    els.seeker.hidden = false;
    els.seeker.classList.remove('fly-in');
    void els.seeker.offsetWidth;
    els.seeker.classList.add('fly-in');
  }

  function positionHotspot() {
    const step = currentStep();
    const hs = step && step.hotspot;
    if (!hs || !els.img || !els.hotspot || !els.stage) {
      if (els.hotspot) {
        els.hotspot.hidden = true;
        els.hotspot.classList.remove('revealed', 'acted');
      }
      clearSeeker();
      return;
    }

    const layout = imageLayout();
    const rawW = (hs.w / 100) * layout.drawnW;
    const rawH = (hs.h / 100) * layout.drawnH;
    const pad = 10;
    const minSize = 52;
    const w = Math.max(rawW + pad * 2, minSize);
    const h = Math.max(rawH + pad * 2, minSize);
    const left = layout.offsetX + (hs.x / 100) * layout.drawnW + rawW / 2 - w / 2;
    const top = layout.offsetY + (hs.y / 100) * layout.drawnH + rawH / 2 - h / 2;
    const cx = left + w / 2;
    const cy = top + h / 2;

    els.hotspot.style.left = left + 'px';
    els.hotspot.style.top = top + 'px';
    els.hotspot.style.width = w + 'px';
    els.hotspot.style.height = h + 'px';
    els.hotspot.hidden = false;
    els.hotspot.classList.remove('acted', 'revealed');

    clearSeeker();
    playSeekerTo(cx, cy);
    seekerTimer = setTimeout(function () {
      if (els.hotspot) els.hotspot.classList.add('revealed');
      if (els.seeker) {
        els.seeker.hidden = true;
        els.seeker.classList.remove('fly-in');
      }
      seekerTimer = null;
    }, 1050);
  }

  function nextShowcase() {
    if (!scenario || !showcaseList.length) return { kind: 'none' };
    const idx = showcaseList.findIndex(function (s) {
      return s.slug === scenario.slug;
    });
    if (idx < 0) return { kind: 'not-showcase' };
    if (idx >= showcaseList.length - 1) return { kind: 'last' };
    return { kind: 'next', scenario: showcaseList[idx + 1] };
  }

  function advance() {
    clearAdvanceTimer();
    if (!scenario) return;
    if (stepIndex >= scenario.steps.length - 1) {
      showComplete();
      return;
    }
    stepIndex += 1;
    renderStep();
  }

  function goBack() {
    clearAdvanceTimer();
    if (stepIndex <= 0) {
      // From first step, Back returns to the intro overview.
      showIntro();
      return;
    }
    stepIndex -= 1;
    renderStep();
  }

  function flashAt(clientX, clientY) {
    if (!els.flash || !els.stage) return;
    const stageR = els.stage.getBoundingClientRect();
    els.flash.style.left = clientX - stageR.left + 'px';
    els.flash.style.top = clientY - stageR.top + 'px';
    els.flash.hidden = false;
    els.flash.classList.remove('pulse');
    void els.flash.offsetWidth;
    els.flash.classList.add('pulse');
  }

  function showIntro() {
    clearAdvanceTimer();
    clearSeeker();
    show(els.player, false);
    show(els.complete, false);
    show(els.intro, true);
    els.scenarioTitle.textContent = scenario.title || scenario.slug;
    els.introTitle.textContent = scenario.title || scenario.slug;
    els.introBody.textContent =
      scenario.description || 'A short walkthrough recorded from the live application.';
    const n = scenario.steps ? scenario.steps.length : 0;
    els.introMeta.textContent =
      n + ' steps · click highlighted controls to advance · Back to repeat';
    const eyebrow = els.intro.querySelector('.gate-eyebrow');
    if (eyebrow) {
      const inShowcase = showcaseList.some(function (s) {
        return s.slug === scenario.slug;
      });
      eyebrow.textContent = inShowcase ? 'Showcase' : 'Tutorial';
    }
  }

  function startWalkthrough() {
    show(els.intro, false);
    show(els.complete, false);
    show(els.player, true);
    stepIndex = 0;
    renderStep();
  }

  function renderStep() {
    if (!scenario) return;
    const step = currentStep();
    if (!step) return;

    clearSeeker();
    clearAdvanceTimer();
    if (els.hotspot) els.hotspot.classList.remove('revealed', 'acted');
    show(els.warn, false);
    if (els.warn) els.warn.textContent = '';
    if (els.flash) els.flash.hidden = true;

    const kind = inferKind(step);
    const hasHotspot = !!step.hotspot;
    const isAttention = kind === 'attention';
    const autoMs =
      typeof step.autoAdvanceMs === 'number' && step.autoAdvanceMs > 0
        ? step.autoAdvanceMs
        : kind === 'bridge'
          ? DEFAULT_BRIDGE_MS
          : 0;

    els.scenarioTitle.textContent = scenario.title || scenario.slug;
    els.stepMeta.textContent = 'Step ' + (stepIndex + 1) + ' of ' + scenario.steps.length;
    els.stepTitle.textContent = step.title || '';
    els.stepBody.textContent = step.body || '';

    if (els.stepKind) {
      els.stepKind.textContent = KIND_LABELS[kind] || kind;
      els.stepKind.className = 'kind-badge kind-' + kind;
      show(els.stepKind, true);
    }

    if (isAttention) {
      if (els.attentionTitle) els.attentionTitle.textContent = step.title || 'Attention';
      if (els.attentionMessage) els.attentionMessage.textContent = step.body || '';
      show(els.attentionOverlay, true);
      if (els.attentionOverlay) {
        els.attentionOverlay.classList.remove('flash-twice');
        void els.attentionOverlay.offsetWidth;
        els.attentionOverlay.classList.add('flash-twice');
      }
      els.actionHint.textContent = 'Click anywhere to continue';
      show(els.actionHint, true);
      show(els.resultNote, false);
    } else {
      show(els.attentionOverlay, false);
      if (els.attentionOverlay) els.attentionOverlay.classList.remove('flash-twice');

      if (hasHotspot) {
        els.actionHint.textContent = 'Do this: ' + (step.actionHint || 'Click the highlighted control');
        show(els.actionHint, true);
      } else if (autoMs > 0) {
        els.actionHint.textContent = 'Continuing automatically…';
        show(els.actionHint, true);
      } else {
        els.actionHint.textContent =
          stepIndex >= scenario.steps.length - 1
            ? 'Click the screen to finish'
            : 'Click the screen to continue';
        show(els.actionHint, true);
      }

      if (step.resultNote) {
        els.resultNote.textContent = 'What changed: ' + step.resultNote;
        show(els.resultNote, true);
      } else if (kind === 'result') {
        els.resultNote.textContent =
          'What changed: Review the screen — this is the outcome of the previous action.';
        show(els.resultNote, true);
      } else if (kind === 'bridge') {
        els.resultNote.textContent =
          'What changed: Further selections use the same control — shown next without repeating each click.';
        show(els.resultNote, true);
      } else {
        show(els.resultNote, false);
      }
    }

    // Back always available: first step returns to intro.
    els.btnBack.disabled = false;
    els.stage.classList.toggle('clickable-advance', !hasHotspot);
    els.stage.classList.toggle('auto-advance', autoMs > 0);
    els.stage.classList.toggle('attention-mode', isAttention);
    if (autoMs > 0) {
      els.stage.style.animationDuration = autoMs + 'ms';
    } else {
      els.stage.style.animationDuration = '';
    }

    els.stage.classList.remove('frame-in');
    void els.stage.offsetWidth;
    els.stage.classList.add('frame-in');

    els.img.onload = function () {
      positionHotspot();
    };
    els.img.src = step.image;
    els.img.alt = step.title || 'Tutorial step';
    if (els.img.complete) positionHotspot();

    if (autoMs > 0) {
      clearAdvanceTimer();
      advanceTimer = setTimeout(advance, autoMs);
    }
  }

  function goHome() {
    window.location.href = 'index.html';
  }

  function showComplete() {
    show(els.player, false);
    show(els.intro, false);
    show(els.complete, true);

    els.scenarioTitle.textContent = scenario.title || scenario.slug;
    const inShowcase = showcaseList.some(function (s) {
      return s.slug === scenario.slug;
    });
    els.completeTitle.textContent = inShowcase ? 'Showcase complete' : 'Tutorial complete';
    els.completeBody.textContent =
      'You finished “' +
      (scenario.title || scenario.slug) +
      '”. Click Home to return to the catalog.';

    const next = nextShowcase();
    if (els.btnNextShowcase) els.btnNextShowcase.hidden = true;
    if (els.completeNextHint) els.completeNextHint.hidden = false;

    if (scenario.hideNextShowcase) {
      els.completeNextHint.textContent = 'Click Home to return to the catalog.';
    } else if (next.kind === 'next' && next.scenario) {
      els.btnNextShowcase.hidden = false;
      els.btnNextShowcase.href =
        'play.html?scenario=' + encodeURIComponent(next.scenario.slug);
      els.btnNextShowcase.textContent = 'Next: ' + (next.scenario.title || next.scenario.slug);
      els.completeNextHint.textContent = 'Return Home, or continue with the next showcase.';
    } else if (next.kind === 'last') {
      els.completeNextHint.textContent =
        'That was the last showcase. Click Home to pick another tutorial.';
    } else {
      els.completeNextHint.textContent = 'Click Home to pick another tutorial.';
    }
  }

  function onHotspotActivate(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    const step = currentStep();
    if (!step || !step.hotspot) return;

    clearSeeker();
    if (els.hotspot) els.hotspot.classList.add('revealed', 'acted');
    show(els.warn, false);

    if (ev && typeof ev.clientX === 'number') {
      flashAt(ev.clientX, ev.clientY);
    } else if (els.hotspot) {
      const r = els.hotspot.getBoundingClientRect();
      flashAt(r.left + r.width / 2, r.top + r.height / 2);
    }

    clearAdvanceTimer();
    advanceTimer = setTimeout(advance, 280);
  }

  function onStageActivate(ev) {
    const step = currentStep();
    if (!step) return;

    if (step.hotspot) {
      if (els.warn) {
        els.warn.textContent = MISS_WARN;
        show(els.warn, true);
      }
      return;
    }

    if (ev && typeof ev.clientX === 'number') {
      flashAt(ev.clientX, ev.clientY);
    }
    clearAdvanceTimer();
    advanceTimer = setTimeout(advance, 180);
  }

  async function loadShowcaseOrder() {
    try {
      const res = await fetch('catalog.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const data = await res.json();
      // Catalog is role-grouped showcases; flatten in page order for Next.
      showcaseList = [];
      (data.roles || []).forEach(function (role) {
        (role.scenarios || []).forEach(function (s) {
          showcaseList.push(s);
        });
      });
    } catch (e) {
      showcaseList = [];
    }
  }

  async function init() {
    const slug = slugFromQuery();
    if (!slug) {
      show(els.loading, false);
      show(els.error, true);
      els.error.textContent = 'Missing scenario. Open a scenario from the catalog.';
      return;
    }

    try {
      await loadShowcaseOrder();
      const res = await fetch('scenarios/' + encodeURIComponent(slug) + '.json', {
        cache: 'no-cache',
      });
      if (!res.ok) throw new Error('Scenario not found: ' + slug);
      scenario = await res.json();
      if (!scenario.steps || !scenario.steps.length) {
        throw new Error('Scenario has no steps');
      }
      show(els.loading, false);
      document.title = (scenario.title || slug) + ' — Spin Master tutorial';
      showIntro();
    } catch (err) {
      show(els.loading, false);
      show(els.error, true);
      els.error.textContent = err && err.message ? err.message : String(err);
    }
  }

  els.btnStart.addEventListener('click', startWalkthrough);
  els.btnBack.addEventListener('click', goBack);
  els.hotspot.addEventListener('click', onHotspotActivate);
  els.hotspot.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' || ev.key === ' ') onHotspotActivate(ev);
  });
  els.stage.addEventListener('click', onStageActivate);
  els.stage.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' || ev.key === ' ') onStageActivate(ev);
  });
  // Finish screen: click anywhere except Next goes Home.
  els.complete.addEventListener('click', function (ev) {
    const t = ev.target;
    if (t && t.closest && t.closest('#btn-next-showcase')) return;
    if (t && t.closest && t.closest('a[href]')) return;
    goHome();
  });
  window.addEventListener('resize', positionHotspot);

  init();
})();
