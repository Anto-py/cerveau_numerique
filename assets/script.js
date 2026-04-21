/* ============================================================
   GTD — Mini-formation asynchrone
   Logique de parcours, déblocage, retry par question, localStorage
   ============================================================ */

(function () {
  'use strict';

  // ----------------------------------------------------------
  // Constantes
  // ----------------------------------------------------------

  const STORAGE_KEY = 'gtd-formation-state-v1';

  // Ordre strict des sections du parcours
  const SECTION_ORDER = [
    'intro',
    'm01',
    'm02',
    'm03',
    'm04',
    'm05',
    'conclusion',
    'final'
  ];

  // Modules à valider (les 5 étapes GTD)
  const MODULES = ['m01', 'm02', 'm03', 'm04', 'm05'];

  // ----------------------------------------------------------
  // État + persistance
  // ----------------------------------------------------------

  function defaultState() {
    return { unlockedUpTo: 'intro', completed: [] };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaultState();
      if (!SECTION_ORDER.includes(parsed.unlockedUpTo)) return defaultState();
      return {
        unlockedUpTo: parsed.unlockedUpTo,
        completed: Array.isArray(parsed.completed) ? parsed.completed : []
      };
    } catch (e) {
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* silent — localStorage indisponible (mode privé, quota…) */
    }
  }

  let state = loadState();

  // ----------------------------------------------------------
  // Progression
  // ----------------------------------------------------------

  function sectionIndex(id) {
    return SECTION_ORDER.indexOf(id);
  }

  function isSectionUnlocked(id) {
    return sectionIndex(id) <= sectionIndex(state.unlockedUpTo);
  }

  function unlockUpTo(id) {
    if (sectionIndex(id) > sectionIndex(state.unlockedUpTo)) {
      state.unlockedUpTo = id;
      saveState();
    }
    renderState();
  }

  function markCompleted(id) {
    if (!id) return;
    if (!SECTION_ORDER.includes(id)) return;
    if (!state.completed.includes(id)) {
      state.completed.push(id);
      saveState();
    }
    renderState();
  }

  function scrollToSection(id, behavior) {
    const el = document.getElementById(id);
    if (!el) return;
    window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: behavior || 'smooth', block: 'start' });
    });
  }

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  function renderState() {
    // Sections : locked / unlocked / completed
    SECTION_ORDER.forEach(function (id) {
      const section = document.getElementById(id);
      if (!section) return;
      const unlocked = isSectionUnlocked(id);
      const completed = state.completed.includes(id);
      if (!unlocked) {
        section.dataset.state = 'locked';
      } else if (completed) {
        section.dataset.state = 'completed';
      } else {
        section.dataset.state = 'unlocked';
      }
    });

    // Module map (5 points alignés)
    MODULES.forEach(function (id) {
      const item = document.querySelector('.module-map li[data-map="' + id + '"]');
      if (!item) return;
      if (state.completed.includes(id)) {
        item.dataset.state = 'completed';
      } else if (isSectionUnlocked(id)) {
        item.dataset.state = 'unlocked';
      } else {
        item.dataset.state = 'locked';
      }
    });

    // Completion banners : visibles si le module est déjà validé
    MODULES.forEach(function (id) {
      const section = document.getElementById(id);
      if (!section) return;
      const banner = section.querySelector('.completion-banner');
      if (!banner) return;
      banner.hidden = !state.completed.includes(id);
    });

    // Barre de progression globale
    const done = state.completed.filter(function (id) {
      return MODULES.includes(id);
    }).length;
    const pct = Math.round((done / MODULES.length) * 100);

    const fill = document.querySelector('[data-progress-fill]');
    if (fill) fill.style.width = pct + '%';

    const label = document.querySelector('[data-progress-label]');
    if (label) {
      label.textContent = done + ' / ' + MODULES.length + ' modules validés';
    }
  }

  // ----------------------------------------------------------
  // Quiz — retry par question, 100% requis
  // ----------------------------------------------------------

  function initQuiz(quiz) {
    const moduleId = quiz.dataset.quiz;
    const questions = Array.from(quiz.querySelectorAll('.question'));
    const counter = quiz.querySelector('[data-question-counter]');
    const total = questions.length;
    let currentIndex = 0;

    function showQuestion(idx) {
      questions.forEach(function (q, i) {
        q.dataset.active = i === idx ? 'true' : 'false';
      });
      if (counter) {
        counter.textContent = 'Question ' + (idx + 1) + ' / ' + total;
      }
    }

    function resetQuestion(q) {
      q.querySelectorAll('.answer').forEach(function (btn) {
        btn.dataset.result = '';
        btn.disabled = false;
      });
      const fb = q.querySelector('.feedback-slot');
      if (fb) {
        fb.hidden = true;
        fb.textContent = '';
        fb.dataset.type = '';
      }
      const nextBtn = q.querySelector('.next-q');
      if (nextBtn) nextBtn.hidden = true;
    }

    function resetAll() {
      questions.forEach(resetQuestion);
      currentIndex = 0;
      showQuestion(0);
      scrollToSection(moduleId, 'smooth');
    }

    function handleCorrect(q, btn, idx) {
      btn.dataset.result = 'correct';
      // Verrouille toutes les réponses de la question
      q.querySelectorAll('.answer').forEach(function (a) {
        a.disabled = true;
      });

      const fb = q.querySelector('.feedback-slot');
      const text = btn.querySelector('.answer-feedback');
      if (fb && text) {
        fb.textContent = text.textContent;
        fb.dataset.type = 'correct';
        fb.hidden = false;
      }

      if (idx === total - 1) {
        // Dernière question : valide le module + débloque la suivante
        markCompleted(moduleId);
        const nextIdx = sectionIndex(moduleId) + 1;
        if (nextIdx < SECTION_ORDER.length) {
          unlockUpTo(SECTION_ORDER[nextIdx]);
        }
        // Scroll vers la bannière de complétion
        const banner = quiz.closest('.section').querySelector('.completion-banner');
        if (banner) {
          window.setTimeout(function () {
            banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 250);
        }
      } else {
        const nextBtn = q.querySelector('.next-q');
        if (nextBtn) nextBtn.hidden = false;
      }
    }

    function handleWrong(q, btn) {
      btn.dataset.result = 'wrong';
      btn.disabled = true;
      const fb = q.querySelector('.feedback-slot');
      const text = btn.querySelector('.answer-feedback');
      if (fb && text) {
        fb.textContent = text.textContent;
        fb.dataset.type = 'wrong';
        fb.hidden = false;
      }
    }

    questions.forEach(function (q, idx) {
      q.querySelectorAll('.answer').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (btn.disabled) return;
          const correct = btn.dataset.correct === 'true';
          if (correct) {
            handleCorrect(q, btn, idx);
          } else {
            handleWrong(q, btn);
          }
        });
      });

      const nextBtn = q.querySelector('.next-q');
      if (nextBtn) {
        nextBtn.addEventListener('click', function () {
          if (idx + 1 < total) {
            currentIndex = idx + 1;
            showQuestion(currentIndex);
            // Scroll léger vers la nouvelle question
            window.setTimeout(function () {
              q.nextElementSibling && q.nextElementSibling.scrollIntoView &&
                questions[currentIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
          }
        });
      }
    });

    // Bouton "Refaire l'exercice" dans la bannière de complétion
    const retryBtn = quiz.closest('.section').querySelector('.retry-quiz');
    if (retryBtn) {
      retryBtn.addEventListener('click', resetAll);
    }

    showQuestion(0);
  }

  // ----------------------------------------------------------
  // Gestionnaire simulé — M03 : déplacer chaque item dans sa liste
  // ----------------------------------------------------------

  function initGestionnaire(gest) {
    var moduleId = gest.dataset.gestionnaire;
    var items    = Array.from(gest.querySelectorAll('.gtd-item'));
    var placed   = 0;
    var counter  = gest.querySelector('[data-placed]');

    function updateCounter() {
      if (counter) counter.textContent = placed;
    }

    function handleMove(item, select) {
      if (item.dataset.state === 'placed') return;
      var value   = select.value;
      var correct = item.dataset.correct;
      if (!value) return;
      // Efface le feedback d'erreur précédent si l'apprenant retente
      var prevFeedback = item.querySelector('.gtd-item-feedback');
      if (prevFeedback) prevFeedback.hidden = true;

      if (value === correct) {
        var target = gest.querySelector('[data-target="' + correct + '"]');
        if (target) {
          var li = document.createElement('li');
          li.className   = 'gtd-placed-item';
          li.textContent = item.dataset.label || '';
          target.appendChild(li);
          var listEl = target.closest('.gtd-list');
          if (listEl) listEl.dataset.hasItems = 'true';
        }
        item.dataset.state = 'placed';
        select.disabled    = true;
        placed++;
        updateCounter();

        if (placed === items.length) {
          markCompleted(moduleId);
          var nextIdx = sectionIndex(moduleId) + 1;
          if (nextIdx < SECTION_ORDER.length) {
            unlockUpTo(SECTION_ORDER[nextIdx]);
          }
          var banner = gest.closest('.section').querySelector('.completion-banner');
          if (banner) {
            window.setTimeout(function () {
              banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 250);
          }
        }
      } else {
        var feedback = item.querySelector('.gtd-item-feedback');
        item.classList.remove('is-shaking');
        void item.offsetWidth; // force reflow pour rejouer l'animation
        item.classList.add('is-shaking');
        select.disabled = true;
        if (feedback) {
          feedback.textContent = item.dataset.feedbackWrong || '';
          feedback.hidden      = false;
        }
        window.setTimeout(function () {
          select.disabled = false;
          select.value    = '';
          item.classList.remove('is-shaking');
        }, 1400);
      }
    }

    items.forEach(function (item) {
      var select = item.querySelector('.gtd-move-select');
      if (select) {
        select.addEventListener('change', function () { handleMove(item, select); });
      }
    });

    var retryBtn = gest.closest('.section').querySelector('.retry-gestionnaire');
    if (retryBtn) {
      retryBtn.addEventListener('click', function () {
        items.forEach(function (item) {
          item.dataset.state = '';
          item.classList.remove('is-shaking');
          var sel = item.querySelector('.gtd-move-select');
          if (sel) { sel.value = ''; sel.disabled = false; }
          var fb = item.querySelector('.gtd-item-feedback');
          if (fb) fb.hidden = true;
        });
        gest.querySelectorAll('.gtd-list-items').forEach(function (list) {
          list.innerHTML = '';
        });
        gest.querySelectorAll('.gtd-list').forEach(function (list) {
          delete list.dataset.hasItems;
        });
        placed = 0;
        updateCounter();
        scrollToSection(moduleId, 'smooth');
      });
    }
  }

  // ----------------------------------------------------------
  // Inbox simulée — M01 : sélection globale puis validation
  // ----------------------------------------------------------

  function initInbox(inbox) {
    var moduleId    = inbox.dataset.inbox;
    var cards       = Array.from(inbox.querySelectorAll('.inbox-card'));
    var validateBtn = inbox.querySelector('.inbox-validate');

    // État par carte
    var cardStates = cards.map(function (card) {
      return {
        el:            card,
        shouldCapture: card.dataset.shouldCapture === 'true',
        selected:      false,
        correct:       false,
        showFeedback:  false
      };
    });

    function renderCard(cs) {
      var card     = cs.el;
      var check    = card.querySelector('.inbox-check');
      var feedback = card.querySelector('.inbox-card-feedback');

      if (cs.correct) {
        card.dataset.state = 'correct';
        if (check)    check.textContent = '✓';
        if (feedback) feedback.hidden   = false;
        return;
      }

      if (cs.showFeedback) {
        card.dataset.state = 'wrong';
        if (check)    check.textContent = '✗';
        if (feedback) feedback.hidden   = false;
      } else {
        card.dataset.state = cs.selected ? 'selected' : 'idle';
        if (check)    check.textContent = cs.selected ? '✓' : '+';
        if (feedback) feedback.hidden   = true;
      }
    }

    function renderAll() {
      cardStates.forEach(renderCard);
    }

    function handleCardClick(cs, e) {
      if (e.target.closest('a')) return; // clic sur lien = ne pas toggler
      if (cs.correct) return;            // carte verrouillée

      cs.selected     = !cs.selected;
      cs.showFeedback = false;           // efface l'état wrong si l'apprenant corrige
      renderCard(cs);
    }

    function handleValidate() {
      var allCorrect = true;

      cardStates.forEach(function (cs) {
        if (cs.correct) return;
        var isCorrect = (cs.selected === cs.shouldCapture);
        if (isCorrect) {
          cs.correct      = true;
          cs.showFeedback = false;
        } else {
          cs.showFeedback = true;
          allCorrect      = false;
        }
      });

      renderAll();

      if (allCorrect) {
        markCompleted(moduleId);
        var nextIdx = sectionIndex(moduleId) + 1;
        if (nextIdx < SECTION_ORDER.length) {
          unlockUpTo(SECTION_ORDER[nextIdx]);
        }
        var banner = inbox.closest('.section').querySelector('.completion-banner');
        if (banner) {
          window.setTimeout(function () {
            banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 250);
        }
      }
    }

    function handleReset() {
      cardStates.forEach(function (cs) {
        cs.selected     = false;
        cs.correct      = false;
        cs.showFeedback = false;
      });
      renderAll();
      scrollToSection(moduleId, 'smooth');
    }

    cardStates.forEach(function (cs) {
      cs.el.addEventListener('click', function (e) { handleCardClick(cs, e); });
    });

    if (validateBtn) {
      validateBtn.addEventListener('click', handleValidate);
    }

    var retryBtn = inbox.closest('.section').querySelector('.retry-inbox');
    if (retryBtn) {
      retryBtn.addEventListener('click', handleReset);
    }

    renderAll();
  }

  // ----------------------------------------------------------
  // Fiche de clarification — M02 : 2 selects par item
  // ----------------------------------------------------------

  function initClarif(clarif) {
    var moduleId     = clarif.dataset.clarif;
    var fiches       = Array.from(clarif.querySelectorAll('.clarif-fiche'));
    var counter      = clarif.querySelector('[data-question-counter]');
    var total        = fiches.length;
    var currentIndex = 0;

    function showFiche(idx) {
      fiches.forEach(function (f, i) {
        f.dataset.active = i === idx ? 'true' : 'false';
      });
      if (counter) {
        counter.textContent = 'Fiche ' + (idx + 1) + ' / ' + total;
      }
    }

    function resetFiche(fiche) {
      fiche.querySelectorAll('.clarif-select').forEach(function (sel) {
        sel.value    = '';
        sel.disabled = false;
      });
      fiche.querySelectorAll('.clarif-row').forEach(function (row) {
        row.dataset.state = '';
      });
      var slot = fiche.querySelector('.feedback-slot');
      if (slot) {
        slot.hidden       = true;
        slot.textContent  = '';
        slot.dataset.type = '';
      }
      var validateBtn = fiche.querySelector('.clarif-validate');
      if (validateBtn) {
        validateBtn.hidden   = false;
        validateBtn.disabled = false;
      }
      var nextBtn = fiche.querySelector('.next-q');
      if (nextBtn) nextBtn.hidden = true;
    }

    function resetAll() {
      fiches.forEach(resetFiche);
      currentIndex = 0;
      showFiche(0);
      scrollToSection(moduleId, 'smooth');
    }

    function showFeedback(fiche, key, type) {
      var slot = fiche.querySelector('.feedback-slot');
      if (!slot) return;
      var feedbacks = fiche.querySelector('.clarif-feedbacks');
      var el = feedbacks ? feedbacks.querySelector('[data-for="' + key + '"]') : null;
      slot.textContent  = el ? el.textContent : '';
      slot.dataset.type = type;
      slot.hidden       = false;
    }

    function handleValidate(fiche, idx) {
      var ansActionnable = fiche.dataset.ansActionnable;
      var ansDecision    = fiche.dataset.ansDecision;
      var selActionnable = fiche.querySelector('[data-key="actionnable"]');
      var selDecision    = fiche.querySelector('[data-key="decision"]');

      if (!selActionnable.value || !selDecision.value) return;

      var okActionnable = selActionnable.value === ansActionnable;
      var okDecision    = selDecision.value    === ansDecision;
      var allOk         = okActionnable && okDecision;

      var rowActionnable = fiche.querySelector('[data-row="actionnable"]');
      var rowDecision    = fiche.querySelector('[data-row="decision"]');
      if (rowActionnable) rowActionnable.dataset.state = okActionnable ? 'correct' : 'wrong';
      if (rowDecision)    rowDecision.dataset.state    = okDecision    ? 'correct' : 'wrong';

      if (allOk) {
        showFeedback(fiche, 'correct', 'correct');
        selActionnable.disabled = true;
        selDecision.disabled    = true;
        var validateBtn = fiche.querySelector('.clarif-validate');
        if (validateBtn) validateBtn.hidden = true;

        if (idx === total - 1) {
          markCompleted(moduleId);
          var nextIdx = sectionIndex(moduleId) + 1;
          if (nextIdx < SECTION_ORDER.length) {
            unlockUpTo(SECTION_ORDER[nextIdx]);
          }
          var banner = clarif.closest('.section').querySelector('.completion-banner');
          if (banner) {
            window.setTimeout(function () {
              banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 250);
          }
        } else {
          var nextBtn = fiche.querySelector('.next-q');
          if (nextBtn) nextBtn.hidden = false;
        }
      } else {
        var feedbackKey = !okActionnable ? 'wrong-actionnable' : 'wrong-decision';
        showFeedback(fiche, feedbackKey, 'wrong');
        window.setTimeout(function () {
          if (!okActionnable) {
            selActionnable.value = '';
            if (rowActionnable) rowActionnable.dataset.state = '';
          }
          if (!okDecision) {
            selDecision.value = '';
            if (rowDecision) rowDecision.dataset.state = '';
          }
        }, 1000);
      }
    }

    fiches.forEach(function (fiche, idx) {
      var validateBtn = fiche.querySelector('.clarif-validate');
      if (validateBtn) {
        validateBtn.addEventListener('click', function () {
          handleValidate(fiche, idx);
        });
      }
      var nextBtn = fiche.querySelector('.next-q');
      if (nextBtn) {
        nextBtn.addEventListener('click', function () {
          if (idx + 1 < total) {
            currentIndex = idx + 1;
            showFiche(currentIndex);
            window.setTimeout(function () {
              fiches[currentIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
          }
        });
      }
    });

    var retryBtn = clarif.closest('.section').querySelector('.retry-clarif');
    if (retryBtn) retryBtn.addEventListener('click', resetAll);

    showFiche(0);
  }

  // ----------------------------------------------------------
  // WR Builder — M04 : sélection de cases à cocher, validation globale
  // ----------------------------------------------------------

  function initWRBuilder(wr) {
    var moduleId    = wr.dataset.wr;
    var items       = Array.from(wr.querySelectorAll('.wr-item'));
    var validateBtn = wr.querySelector('.wr-validate');
    var selected    = items.map(function () { return false; });

    function renderItem(item, idx) {
      var state = item.dataset.state || 'idle';
      if (state === 'correct') return; // verrouillé
      var btn   = item.querySelector('.wr-item-btn');
      var check = item.querySelector('.wr-item-check');
      item.dataset.state = selected[idx] ? 'selected' : 'idle';
      if (btn)   btn.setAttribute('aria-pressed', selected[idx] ? 'true' : 'false');
      if (check) check.textContent = selected[idx] ? '☑' : '☐';
    }

    function handleItemClick(item, idx) {
      if (item.dataset.state === 'correct') return;
      // Si l'item est en erreur, le clic le remet à idle et efface le feedback
      if (item.dataset.state === 'oubli' || item.dataset.state === 'faux-positif') {
        selected[idx] = !selected[idx];
        item.dataset.state = selected[idx] ? 'selected' : 'idle';
        var btn   = item.querySelector('.wr-item-btn');
        var check = item.querySelector('.wr-item-check');
        var fb    = item.querySelector('.wr-item-feedback');
        if (btn)   btn.setAttribute('aria-pressed', selected[idx] ? 'true' : 'false');
        if (check) check.textContent = selected[idx] ? '☑' : '☐';
        if (fb)    fb.hidden = true;
        return;
      }
      selected[idx] = !selected[idx];
      renderItem(item, idx);
    }

    function handleValidate() {
      var allCorrect = true;

      items.forEach(function (item, idx) {
        if (item.dataset.state === 'correct') return;
        var isCorrect  = item.dataset.correct === 'true';
        var isSelected = selected[idx];
        var btn   = item.querySelector('.wr-item-btn');
        var check = item.querySelector('.wr-item-check');
        var fb    = item.querySelector('.wr-item-feedback');

        if (isCorrect && isSelected) {
          item.dataset.state = 'correct';
          if (btn)   { btn.disabled = true; btn.setAttribute('aria-pressed', 'true'); }
          if (check) check.textContent = '☑';
          if (fb)    fb.hidden = true;
        } else if (isCorrect && !isSelected) {
          item.dataset.state = 'oubli';
          if (fb)    { fb.textContent = item.dataset.feedbackMissed || ''; fb.hidden = false; }
          if (check) check.textContent = '☐';
          allCorrect = false;
        } else if (!isCorrect && isSelected) {
          item.dataset.state = 'faux-positif';
          if (fb)    { fb.textContent = item.dataset.feedbackFp || ''; fb.hidden = false; }
          if (check) check.textContent = '☑';
          allCorrect = false;
        } else {
          item.dataset.state = 'idle';
          if (fb) fb.hidden = true;
        }
      });

      if (allCorrect) {
        markCompleted(moduleId);
        var nextIdx = sectionIndex(moduleId) + 1;
        if (nextIdx < SECTION_ORDER.length) {
          unlockUpTo(SECTION_ORDER[nextIdx]);
        }
        var banner = wr.closest('.section').querySelector('.completion-banner');
        if (banner) {
          window.setTimeout(function () {
            banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 250);
        }
      }
    }

    function handleReset() {
      selected = items.map(function () { return false; });
      items.forEach(function (item) {
        item.dataset.state = 'idle';
        var btn   = item.querySelector('.wr-item-btn');
        var check = item.querySelector('.wr-item-check');
        var fb    = item.querySelector('.wr-item-feedback');
        if (btn)   { btn.disabled = false; btn.setAttribute('aria-pressed', 'false'); }
        if (check) check.textContent = '☐';
        if (fb)    fb.hidden = true;
      });
      scrollToSection(moduleId, 'smooth');
    }

    items.forEach(function (item, idx) {
      var btn = item.querySelector('.wr-item-btn');
      if (btn) btn.addEventListener('click', function () { handleItemClick(item, idx); });
    });

    if (validateBtn) validateBtn.addEventListener('click', handleValidate);

    var retryBtn = wr.closest('.section').querySelector('.retry-wr');
    if (retryBtn) retryBtn.addEventListener('click', handleReset);
  }

  // ----------------------------------------------------------
  // Pairing — M05 : appariement tâche ↔ contexte (clic-clic)
  // ----------------------------------------------------------

  function shuffleChildren(container) {
    var children = Array.from(container.children);
    for (var i = children.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      container.appendChild(children[j]);
      children.splice(j, 1);
    }
  }

  function initPairing(pairing) {
    var moduleId   = pairing.dataset.pairing;
    var tasks      = Array.from(pairing.querySelectorAll('.pair-task'));
    var contexts   = Array.from(pairing.querySelectorAll('.pair-ctx'));
    var counterEl  = pairing.querySelector('[data-pairs-done]');
    var feedbackEl = pairing.querySelector('.pairing-feedback');
    var selected   = null; // tâche actuellement sélectionnée
    var pairsDone  = 0;

    // Mélange initial des contextes (colonne droite)
    var ctxContainer = pairing.querySelector('.pair-contexts');
    var ctxTitle = ctxContainer ? ctxContainer.querySelector('.pair-col-title') : null;
    if (ctxContainer) shuffleChildren(ctxContainer);
    // Remet le titre en premier après le mélange
    if (ctxTitle && ctxContainer) ctxContainer.insertBefore(ctxTitle, ctxContainer.firstChild);

    function updateCounter() {
      if (counterEl) counterEl.textContent = pairsDone;
    }

    function showFeedback(text, type) {
      if (!feedbackEl) return;
      feedbackEl.textContent  = text;
      feedbackEl.dataset.type = type;
      feedbackEl.hidden       = false;
    }

    function hideFeedback() {
      if (feedbackEl) feedbackEl.hidden = true;
    }

    function selectTask(task) {
      if (selected) selected.dataset.state = '';
      selected = task;
      task.dataset.state = 'selected';
      hideFeedback();
    }

    function handleContextClick(ctx) {
      if (!selected) return;
      if (ctx.dataset.state === 'paired') return;

      var correctCtx = selected.dataset.correctCtx;
      var ctxId      = ctx.dataset.ctx;

      if (ctxId === correctCtx) {
        // Paire correcte
        selected.dataset.state = 'paired';
        ctx.dataset.state      = 'paired';
        var ctxSpan = selected.querySelector('.pair-task-ctx');
        if (ctxSpan) ctxSpan.textContent = ctx.dataset.label || '';
        showFeedback(ctx.dataset.feedbackCorrect || '', 'correct');
        pairsDone++;
        updateCounter();
        selected = null;

        if (pairsDone === tasks.length) {
          markCompleted(moduleId);
          var nextIdx = sectionIndex(moduleId) + 1;
          if (nextIdx < SECTION_ORDER.length) {
            unlockUpTo(SECTION_ORDER[nextIdx]);
          }
          var banner = pairing.closest('.section').querySelector('.completion-banner');
          if (banner) {
            window.setTimeout(function () {
              banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
          }
        }
      } else {
        // Paire incorrecte : secousse + feedback + annulation
        var taskToReset = selected;
        taskToReset.classList.add('is-shaking');
        ctx.classList.add('is-shaking');
        showFeedback(taskToReset.dataset.feedbackWrong || 'Mauvais appariement — réessaie.', 'wrong');
        selected = null;
        window.setTimeout(function () {
          taskToReset.classList.remove('is-shaking');
          ctx.classList.remove('is-shaking');
          taskToReset.dataset.state = '';
        }, 500);
      }
    }

    function handleReset() {
      tasks.forEach(function (task) {
        task.dataset.state = '';
        task.classList.remove('is-shaking');
        var ctxSpan = task.querySelector('.pair-task-ctx');
        if (ctxSpan) ctxSpan.textContent = '';
      });
      contexts.forEach(function (ctx) {
        ctx.dataset.state = '';
        ctx.classList.remove('is-shaking');
      });
      // Re-mélange les contextes à chaque retry
      if (ctxContainer) shuffleChildren(ctxContainer);
      if (ctxTitle && ctxContainer) ctxContainer.insertBefore(ctxTitle, ctxContainer.firstChild);
      selected  = null;
      pairsDone = 0;
      updateCounter();
      hideFeedback();
      scrollToSection(moduleId, 'smooth');
    }

    tasks.forEach(function (task) {
      task.addEventListener('click', function () {
        if (task.dataset.state === 'paired') return;
        selectTask(task);
      });
    });

    contexts.forEach(function (ctx) {
      ctx.addEventListener('click', function () {
        handleContextClick(ctx);
      });
    });

    var retryBtn = pairing.closest('.section').querySelector('.retry-pairing');
    if (retryBtn) retryBtn.addEventListener('click', handleReset);
  }

  // ----------------------------------------------------------
  // Boutons "débloquer la section suivante" (intro, conclusion)
  // ----------------------------------------------------------

  function initUnlockButtons() {
    document.querySelectorAll('[data-unlock-next]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const target = btn.dataset.unlockNext;
        unlockUpTo(target);
        markCompleted(btn.dataset.completesSelf || '');
        scrollToSection(target, 'smooth');
      });
    });
  }

  // ----------------------------------------------------------
  // Reset
  // ----------------------------------------------------------

  function initResetButton() {
    const btn = document.querySelector('[data-reset]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      const ok = window.confirm(
        'Réinitialiser tout le parcours ?\n\nTon avancement sera effacé et tu repartiras du début.'
      );
      if (!ok) return;
      state = defaultState();
      saveState();
      window.location.reload();
    });
  }

  // ----------------------------------------------------------
  // Init
  // ----------------------------------------------------------

  function init() {
    document.querySelectorAll('.quiz').forEach(initQuiz);
    document.querySelectorAll('.wr-builder[data-wr]').forEach(initWRBuilder);
    document.querySelectorAll('.pairing[data-pairing]').forEach(initPairing);
    document.querySelectorAll('.clarif[data-clarif]').forEach(initClarif);
    document.querySelectorAll('.gestionnaire[data-gestionnaire]').forEach(initGestionnaire);
    document.querySelectorAll('.inbox[data-inbox]').forEach(initInbox);
    initUnlockButtons();
    initResetButton();
    renderState();

    // À l'ouverture, si l'apprenant a déjà progressé, scroll à sa section active
    if (state.unlockedUpTo !== 'intro') {
      window.setTimeout(function () {
        scrollToSection(state.unlockedUpTo, 'auto');
      }, 80);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
