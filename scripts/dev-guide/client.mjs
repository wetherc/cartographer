/**
 * The script that runs inside the developer guide. It reads the generated
 * DATA object and builds every interactive panel from it, so the page holds
 * no facts of its own.
 */
export const CLIENT = String.raw`
(function () {
  'use strict';

  var DATA = window.__GUIDE_DATA__;
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function count(n, noun) {
    return n.toLocaleString() + ' ' + noun + (n === 1 ? '' : 's');
  }

  /* ---------- contents rail ---------- */

  var rail = $('rail');
  var sections = DATA.sections;
  sections.forEach(function (s, i) {
    var li = el('li');
    var a = el('a', 'rail-link');
    a.href = '#' + s.id;
    a.appendChild(el('span', null, String(i + 1).padStart(2, '0')));
    a.appendChild(el('span', null, s.short));
    li.appendChild(a);
    rail.appendChild(li);
  });

  var links = Array.prototype.slice.call(rail.querySelectorAll('.rail-link'));
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (a) {
          a.setAttribute('aria-current', a.getAttribute('href') === '#' + entry.target.id ? 'true' : 'false');
        });
      });
    },
    { rootMargin: '-10% 0px -70% 0px' }
  );
  sections.forEach(function (s) { var n = $(s.id); if (n) observer.observe(n); });

  /* ---------- import map ---------- */

  var board = $('layerBoard');
  var verdict = $('layerVerdict');
  var chipById = {};
  var selected = null;

  DATA.kindGroups.forEach(function (group) {
    var members = DATA.dirs.filter(function (d) { return d.kind === group[0]; });
    if (!members.length) return;
    var row = el('div', 'layer-row');
    row.appendChild(el('div', 'layer-kind', group[1]));
    var chips = el('div', 'chips');
    members.forEach(function (d) {
      var b = el('button', 'chip');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.appendChild(el('span', null, d.name));
      b.appendChild(el('small', null, count(d.files, 'file') + ' / ' + count(d.lines, 'line')));
      b.addEventListener('click', function () { selectDir(selected === d.id ? null : d.id); });
      chipById[d.id] = b;
      chips.appendChild(b);
    });
    row.appendChild(chips);
    board.appendChild(row);
  });

  function selectDir(id) {
    selected = id;
    var dir = DATA.dirs.filter(function (d) { return d.id === id; })[0];
    DATA.dirs.forEach(function (d) {
      var chip = chipById[d.id];
      chip.className = 'chip';
      chip.setAttribute('aria-pressed', 'false');
      if (!dir) return;
      if (d.id === dir.id) { chip.setAttribute('aria-pressed', 'true'); return; }
      chip.classList.add(dir.imports.indexOf(d.id) >= 0 ? 'allowed' : 'forbidden');
    });

    verdict.innerHTML = '';
    if (!dir) {
      verdict.appendChild(el('div', 'verdict-title', 'Nothing selected'));
      verdict.appendChild(el('p', null, 'Pick a directory. The highlighted neighbors are the ones it imports today. The faded ones are the ones it does not.'));
      return;
    }
    verdict.appendChild(el('div', 'verdict-title', dir.id === 'main' ? 'src/main.js' : 'src/' + dir.name));
    verdict.appendChild(el('p', null, dir.role || 'No description yet. Add one to scripts/dev-guide/content.mjs.'));
    var named = dir.imports.map(function (i) { return i === 'main' ? 'main.js' : i + '/'; });
    var line = named.length ? 'Imports: ' + named.join(', ') + '.' : 'Imports nothing.';
    if (dir.kind === 'pure' || dir.kind === 'data') line += ' Never imports ui/ or app/, and never touches the DOM.';
    verdict.appendChild(el('p', null, line));
  }

  selectDir(null);

  /* ---------- mount order ---------- */

  var steps = DATA.steps;
  var stepList = $('stepList');
  var stepDetail = $('stepDetail');
  var stepButtons = [];
  var stepIndex = 0;

  steps.forEach(function (s, i) {
    var li = el('li');
    var b = el('button', 'step-btn');
    b.type = 'button';
    b.appendChild(el('span', null, String(i + 1).padStart(2, '0')));
    b.appendChild(el('span', null, s.call));
    b.addEventListener('click', function () { setStep(i); });
    stepButtons.push(b);
    li.appendChild(b);
    stepList.appendChild(li);
  });

  function setStep(i) {
    stepIndex = Math.max(0, Math.min(steps.length - 1, i));
    var step = steps[stepIndex];

    stepButtons.forEach(function (b, n) {
      b.setAttribute('aria-current', n === stepIndex ? 'true' : 'false');
      b.classList.toggle('done', n < stepIndex);
    });

    stepDetail.innerHTML = '';
    stepDetail.appendChild(el('div', 'plate-label', 'Call ' + (stepIndex + 1) + ' of ' + steps.length + ', main.js line ' + step.line));

    var title = el('div', 'step-call', step.call + '(app)');
    stepDetail.appendChild(title);
    if (step.role) stepDetail.appendChild(el('p', null, step.role));

    if (step.why) {
      var why = el('div', 'step-why');
      why.appendChild(el('em', null, 'Why here'));
      why.appendChild(el('span', null, step.why));
      stepDetail.appendChild(why);
    }

    var views = [];
    var actions = [];
    for (var n = 0; n <= stepIndex; n += 1) {
      steps[n].regs.forEach(function (r) {
        (r.registry === 'views' ? views : actions).push({ name: r.name, fresh: n === stepIndex });
      });
    }

    var reg = el('div', 'registry');
    reg.appendChild(registryLine('app.views', views));
    reg.appendChild(registryLine('app.actions', actions));
    stepDetail.appendChild(reg);

    $('stepPrev').disabled = stepIndex === 0;
    $('stepNext').disabled = stepIndex === steps.length - 1;
  }

  function registryLine(label, items) {
    var wrap = el('div');
    wrap.appendChild(el('div', 'reg-line', label + ' (' + items.length + ')'));
    var chips = el('div', 'chips');
    if (!items.length) {
      chips.appendChild(el('span', 'reg-chip', 'empty'));
    } else {
      items.forEach(function (it) {
        chips.appendChild(el('span', 'reg-chip' + (it.fresh ? ' fresh' : ''), it.name));
      });
    }
    wrap.appendChild(chips);
    return wrap;
  }

  $('stepPrev').addEventListener('click', function () { setStep(stepIndex - 1); });
  $('stepNext').addEventListener('click', function () { setStep(stepIndex + 1); });
  $('stepReset').addEventListener('click', function () { setStep(0); });
  setStep(0);

  /* ---------- fog demo ---------- */

  var W = 14;
  var H = 9;
  var radius = DATA.revealRadius;
  var party = '6,4';
  var revealed = Object.create(null);
  var cells = {};
  var grid = $('tileGrid');
  grid.style.gridTemplateColumns = 'repeat(' + W + ', 2rem)';

  for (var y = 0; y < H; y += 1) {
    for (var x = 0; x < W; x += 1) {
      (function (id) {
        var c = el('button', 'cell');
        c.type = 'button';
        c.textContent = id;
        c.setAttribute('aria-label', 'Tile ' + id);
        c.addEventListener('click', function () { moveTo(id); });
        cells[id] = c;
        grid.appendChild(c);
      })(x + ',' + y);
    }
  }

  function revealAround(centerId, r) {
    var parts = centerId.split(',');
    var cx = Number(parts[0]);
    var cy = Number(parts[1]);
    var added = 0;
    for (var ty = Math.max(0, cy - r); ty <= Math.min(H - 1, cy + r); ty += 1) {
      for (var tx = Math.max(0, cx - r); tx <= Math.min(W - 1, cx + r); tx += 1) {
        var dx = tx - cx;
        var dy = ty - cy;
        if (dx * dx + dy * dy > r * r) continue;
        var id = tx + ',' + ty;
        if (!revealed[id]) { revealed[id] = true; added += 1; }
      }
    }
    return added;
  }

  var lastAdded = revealAround(party, radius);

  function readout(label, value) {
    var s = el('span');
    s.appendChild(document.createTextNode(label + ' '));
    s.appendChild(el('b', null, value));
    return s;
  }

  function paintTiles() {
    Object.keys(cells).forEach(function (id) {
      cells[id].classList.toggle('revealed', !!revealed[id]);
      cells[id].classList.toggle('party', id === party);
    });
    var out = $('tileReadout');
    out.innerHTML = '';
    out.appendChild(readout('party.tileId', '"' + party + '"'));
    out.appendChild(readout('revealed', Object.keys(revealed).length + ' / ' + W * H));
    out.appendChild(readout('newly revealed', String(lastAdded)));
    out.appendChild(readout('node identity', lastAdded === 0 ? 'unchanged' : 'replaced'));
  }

  function moveTo(id) {
    party = id;
    lastAdded = revealAround(party, radius);
    paintTiles();
  }

  $('fogRadius').addEventListener('click', function () {
    radius = radius >= 3 ? 1 : radius + 1;
    this.textContent = 'Reveal radius: ' + radius;
    lastAdded = revealAround(party, radius);
    paintTiles();
  });

  $('fogReset').addEventListener('click', function () {
    revealed = Object.create(null);
    lastAdded = revealAround(party, radius);
    paintTiles();
  });

  $('fogRadius').textContent = 'Reveal radius: ' + radius;
  paintTiles();

  /* ---------- packing layers ---------- */

  var stages = DATA.stages;
  var packBars = $('packBars');
  var packDetail = $('packDetail');
  var max = stages[0].size;
  var barButtons = [];

  stages.forEach(function (p, i) {
    var row = el('button', 'bar-row');
    row.type = 'button';
    row.setAttribute('aria-pressed', 'false');
    row.appendChild(el('div', 'bar-name', p.name));
    var track = el('div', 'bar-track');
    var fill = el('div', 'bar-fill');
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('div', 'bar-val', p.size.toLocaleString()));
    row.addEventListener('click', function () { selectPack(i); });
    barButtons.push(row);
    packBars.appendChild(row);
    requestAnimationFrame(function () {
      setTimeout(function () { fill.style.width = (p.size / max) * 100 + '%'; }, i * 70);
    });
  });

  function selectPack(i) {
    barButtons.forEach(function (b, n) { b.setAttribute('aria-pressed', n === i ? 'true' : 'false'); });
    var p = stages[i];
    packDetail.innerHTML = '';
    packDetail.appendChild(el('div', 'verdict-title', p.name + ': ' + p.size.toLocaleString() + ' characters'));
    packDetail.appendChild(el('p', null, p.note));
    if (i > 0) {
      var cut = Math.round((1 - p.size / stages[i - 1].size) * 100);
      var total = Math.round((1 - p.size / max) * 100);
      packDetail.appendChild(el('p', null, i === 1
        ? 'This layer removes ' + cut + '% of the in-memory state.'
        : 'This layer removes ' + cut + '% of what reached it. Total against the in-memory state: ' + total + '%.'));
    }
  }

  selectPack(stages.length - 1);

  /* ---------- storage keys ---------- */

  var keyList = $('keyList');
  DATA.storageKeys.forEach(function (k) {
    var row = el('div', 'cmd');
    var left = el('div');
    left.appendChild(el('div', 'cmd-code', k.key));
    left.appendChild(el('div', 'cmd-note', k.file + ':' + k.line));
    row.appendChild(left);
    keyList.appendChild(row);
  });

  /* ---------- commands ---------- */

  var cmdList = $('cmdList');
  DATA.commands.forEach(function (c) {
    var row = el('div', 'cmd');
    var left = el('div');
    left.appendChild(el('div', 'cmd-code', c.command));
    left.appendChild(el('div', 'cmd-note', c.note));
    row.appendChild(left);

    var copy = el('button', 'btn', 'Copy');
    copy.type = 'button';
    copy.setAttribute('aria-label', 'Copy command: ' + c.command);
    copy.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(c.command).then(function () {
          copy.textContent = 'Copied';
          setTimeout(function () { copy.textContent = 'Copy'; }, 1400);
        }, function () { copy.textContent = 'Blocked'; });
      } else {
        copy.textContent = 'Blocked';
      }
    });
    row.appendChild(copy);
    cmdList.appendChild(row);
  });

  /* ---------- router ---------- */

  var routerNode = 'start';
  var router = $('router');
  var crumbs = $('routerCrumbs');
  var trail = [];

  function renderRouter() {
    router.innerHTML = '';
    crumbs.textContent = trail.length ? trail.join('  /  ') : 'Start';

    var answer = DATA.routerAnswers[routerNode];
    if (answer) {
      var dl = el('dl', 'answer');
      dl.appendChild(el('dt', null, 'Write it in'));
      var dd = el('dd');
      dd.appendChild(el('code', null, answer.where));
      dl.appendChild(dd);
      dl.appendChild(el('dt', null, 'Test you owe'));
      dl.appendChild(el('dd', null, answer.test));
      dl.appendChild(el('dt', null, 'Trap'));
      dl.appendChild(el('dd', null, answer.trap));
      if (answer.refs.length) {
        dl.appendChild(el('dt', null, 'Start reading at'));
        var refs = el('dd');
        answer.refs.forEach(function (r, i) {
          if (i) refs.appendChild(document.createTextNode(' '));
          refs.appendChild(el('code', null, r.file + ':' + r.line));
        });
        dl.appendChild(refs);
      }
      router.appendChild(dl);

      var again = el('button', 'btn', 'Start over');
      again.type = 'button';
      again.addEventListener('click', function () { routerNode = 'start'; trail = []; renderRouter(); });
      var bar = el('div', 'toolbar');
      bar.appendChild(again);
      router.appendChild(bar);
      return;
    }

    var node = DATA.routerTree[routerNode];
    router.appendChild(el('div', 'q', node.q));
    var opts = el('div', 'opts');
    node.opts.forEach(function (o) {
      var b = el('button', 'opt');
      b.type = 'button';
      b.appendChild(el('b', null, o.label));
      b.appendChild(el('small', null, o.note));
      b.addEventListener('click', function () {
        trail.push(o.label);
        routerNode = o.answer || o.next;
        renderRouter();
      });
      opts.appendChild(b);
    });
    router.appendChild(opts);
  }

  renderRouter();

  /* ---------- pre-flight checklist ---------- */

  var checkList = $('checkList');
  var checkProgress = $('checkProgress');
  var checkState = DATA.checklist.map(function () { return false; });

  DATA.checklist.forEach(function (c, i) {
    var b = el('button', 'check');
    b.type = 'button';
    b.setAttribute('aria-pressed', 'false');
    b.appendChild(el('span', 'check-box', '✓'));
    var text = el('span', 'check-text', c.title);
    var note = el('small', null, c.note);
    if (c.refs.length) {
      note.appendChild(document.createTextNode(' '));
      c.refs.forEach(function (r, n) {
        if (n) note.appendChild(document.createTextNode(', '));
        note.appendChild(el('code', null, r.file + ':' + r.line));
      });
    }
    text.appendChild(note);
    b.appendChild(text);
    b.addEventListener('click', function () {
      checkState[i] = !checkState[i];
      b.setAttribute('aria-pressed', checkState[i] ? 'true' : 'false');
      paintProgress();
    });
    checkList.appendChild(b);
  });

  function paintProgress() {
    var done = checkState.filter(Boolean).length;
    checkProgress.textContent = done + ' of ' + DATA.checklist.length + ' cleared'
      + (done === DATA.checklist.length ? '. Ready to commit.' : '');
  }

  paintProgress();
})();
`;
