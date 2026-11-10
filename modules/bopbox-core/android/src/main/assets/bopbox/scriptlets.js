/*
 * Bopbox scriptlet runner: the `##+js(...)` rules from uBlock Origin's lists, which is how uBO
 * and Brave keep YouTube ad-free without touching anything else on the page.
 *
 * The native filter engine sends the rule bodies that apply to each host (exceptions already
 * removed) in __bopboxConfig.scriptlets[host]. This file implements the scriptlets those YouTube
 * rules use, written from uBO's documented behaviour:
 *   set / set-constant, json-prune, json-prune-fetch-response, json-prune-xhr-response,
 *   json-edit(-fetch|-xhr)-response, trusted-replace-fetch-response (trusted-rpfr),
 *   trusted-replace-xhr-response, nano-setTimeout-booster (nano-stb), nano-setInterval-booster.
 * Anything else is skipped, and each rule runs in its own try/catch so one bad rule can never
 * break the page. Runs after bridge.js and before youtube.js, at document start.
 */
(function () {
  'use strict';
  if (window.__bopboxScriptlets) return;

  var nativeParse = JSON.parse;
  var nativeStringify = JSON.stringify;
  var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var applied = {};
  var counts = { rules: 0, edits: 0 };

  function post(n) {
    counts.edits += n;
    var b = window.__bopbox;
    if (b && b.post) b.post({ t: 'blocked', n: n });
  }

  // ---------------------------------------------------------------------------------------
  // Argument and pattern parsing
  // ---------------------------------------------------------------------------------------

  /** Split a rule body into its arguments: comma separated, `\,` escapes, quotes keep commas. */
  function parseArgs(body) {
    var args = [];
    var i = 0;
    var n = body.length;
    while (i <= n) {
      while (i < n && body[i] === ' ') i++;
      var q = body[i];
      var arg = '';
      if ((q === "'" || q === '"' || q === '`') && body.indexOf(q, i + 1) > i) {
        var j = i + 1;
        while (j < n && !(body[j] === q && body[j - 1] !== '\\')) j++;
        arg = body.slice(i + 1, j).split('\\' + q).join(q);
        i = j + 1;
        while (i < n && body[i] !== ',') i++;
      } else {
        var start = i;
        while (i < n && !(body[i] === ',' && body[i - 1] !== '\\')) i++;
        arg = body.slice(start, i).trim().split('\\,').join(',');
      }
      args.push(arg);
      i++;
    }
    if (args.length && /\.js$/.test(args[0])) args[0] = args[0].slice(0, -3);
    return args;
  }

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** `/regex/flags` or a literal substring; a leading `!` negates. */
  function toPattern(raw, defaultFlags) {
    var expect = true;
    if (raw.charAt(0) === '!') { expect = false; raw = raw.slice(1); }
    if (raw === '') return { re: /^/, expect: expect };
    var m = /^\/(.+)\/([gimsu]*)$/.exec(raw);
    if (m) {
      try { return { re: new RegExp(m[1], m[2] || defaultFlags || ''), expect: expect }; } catch (e) { return null; }
    }
    return { re: new RegExp(escapeRe(raw), defaultFlags || ''), expect: expect };
  }

  function testPattern(p, s) {
    p.re.lastIndex = 0;
    return p.re.test(s) === p.expect;
  }

  /** Trailing `name, value` pairs after the positional arguments. */
  function varargs(list) {
    var out = {};
    for (var i = 0; i + 1 < list.length; i += 2) out[list[i]] = list[i + 1];
    return out;
  }

  /** `propsToMatch`: space separated `prop:pattern`; a bare pattern means the URL. */
  function parseProps(raw) {
    var needles = [];
    if (!raw) return needles;
    raw.split(/\s+/).forEach(function (tok) {
      if (!tok) return;
      var colon = tok.indexOf(':');
      var prop = colon > 0 ? tok.slice(0, colon) : '';
      var pattern = tok;
      if (prop && !/[^$\w -]/.test(prop)) pattern = tok.slice(colon + 1);
      else prop = 'url';
      var p = toPattern(pattern);
      if (p) needles.push({ prop: prop, pattern: p });
    });
    return needles;
  }

  function matchProps(needles, props) {
    for (var i = 0; i < needles.length; i++) {
      var v = props[needles[i].prop];
      if (v === undefined) continue;
      if (typeof v !== 'string') {
        try { v = nativeStringify(v); } catch (e) { continue; }
        if (typeof v !== 'string') continue;
      }
      if (!testPattern(needles[i].pattern, v)) return false;
    }
    return true;
  }

  function fetchProps(resource, options) {
    var props = {};
    if (resource && typeof resource === 'object' && typeof resource.url === 'string' && typeof resource.method === 'string') {
      props.url = resource.url;
      props.method = resource.method;
    } else {
      props.url = String(resource);
    }
    if (options && typeof options === 'object') {
      ['method', 'mode', 'credentials', 'body'].forEach(function (k) {
        if (options[k] !== undefined) props[k] = options[k];
      });
    }
    return props;
  }

  // ---------------------------------------------------------------------------------------
  // Object pruning (uBO json-prune paths)
  //   a.b.c   remove c        a.[].c   every element of array a       a.*.c  every property
  //   a.[-].c remove the array elements of a that contain c          a.{-}.c  same for objects
  // ---------------------------------------------------------------------------------------

  function isObj(v) {
    return v !== null && typeof v === 'object';
  }

  function findOwner(root, path, prune) {
    var owner = root;
    var chain = path;
    for (;;) {
      if (!isObj(owner)) return false;
      var dot = chain.indexOf('.');
      if (dot === -1) {
        if (!prune) return hasOwn(owner, chain);
        if (chain === '*') {
          var any = false;
          Object.keys(owner).forEach(function (k) { delete owner[k]; any = true; });
          return any;
        }
        if (!hasOwn(owner, chain)) return false;
        delete owner[chain];
        return true;
      }
      var prop = chain.slice(0, dot);
      var next = chain.slice(dot + 1);
      var found = false;
      if (prop === '[-]' && Array.isArray(owner)) {
        for (var i = owner.length - 1; i >= 0; i--) {
          if (!findOwner(owner[i], next, false)) continue;
          owner.splice(i, 1);
          found = true;
        }
        return found;
      }
      if (prop === '{-}') {
        Object.keys(owner).forEach(function (k) {
          if (findOwner(owner[k], next, false)) { delete owner[k]; found = true; }
        });
        return found;
      }
      if ((prop === '[]' && Array.isArray(owner)) || prop === '{}' || prop === '*') {
        Object.keys(owner).forEach(function (k) {
          if (findOwner(owner[k], next, prune)) found = true;
        });
        return found;
      }
      if (!hasOwn(owner, prop)) return false;
      owner = owner[prop];
      chain = next;
    }
  }

  /** Returns a function that prunes an object in place and reports whether it changed it. */
  function makePruner(rawPrune, rawNeedles) {
    var prunePaths = rawPrune ? rawPrune.split(/ +/) : [];
    var needlePaths = prunePaths.length && rawNeedles ? rawNeedles.split(/ +/) : [];
    if (!prunePaths.length) return null;
    var prune = function (obj) {
      if (!isObj(obj)) return false;
      for (var i = 0; i < needlePaths.length; i++) if (!findOwner(obj, needlePaths[i], false)) return false;
      var changed = false;
      for (var j = 0; j < prunePaths.length; j++) if (findOwner(obj, prunePaths[j], true)) changed = true;
      return changed;
    };
    // Every needle must be there, and at least one prune path.
    prune.mayApply = textHint(needlePaths.map(pathKeys), prunePaths.map(pathKeys));
    return prune;
  }

  // ---------------------------------------------------------------------------------------
  // Text hints: a JSON body can only match a rule if the rule's property names appear in it
  // as quoted keys. Checking that with indexOf skips parsing, editing and re-serialising the
  // large watch/browse responses that carry no ads, which is most of them. (Without this every
  // video start paid for a full parse + tree walk + stringify of the watch response.)
  // ---------------------------------------------------------------------------------------

  var PATH_WILDCARDS = { '': 1, '*': 1, '[]': 1, '[-]': 1, '{}': 1, '{-}': 1 };

  /** Literal property names in a dotted json-prune path. */
  function pathKeys(path) {
    return path.split('.').filter(function (k) { return !PATH_WILDCARDS[k] && !/^\d+$/.test(k); });
  }

  function hasKeys(text, keys) {
    for (var i = 0; i < keys.length; i++) if (text.indexOf('"' + keys[i] + '"') === -1) return false;
    return true;
  }

  /** [all]: key lists that must all be present; [any]: at least one list must be fully present. */
  function textHint(all, any) {
    return function (text) {
      if (typeof text !== 'string') return true;
      for (var i = 0; i < all.length; i++) if (!hasKeys(text, all[i])) return false;
      if (!any || !any.length) return true;
      for (var j = 0; j < any.length; j++) if (hasKeys(text, any[j])) return true;
      return false;
    };
  }

  function mayApply(hook, text) {
    var f = hook.object && hook.object.mayApply;
    return !f || f(text);
  }

  // ---------------------------------------------------------------------------------------
  // JSON path editing (the subset of uBO's JSONPath that list rules use)
  //   ..key  .key  .*  [*]  [0]  ["key"]  [?.a.b]  [?!.a]  [?.a==json]  (also != ^= $= *= < > <= >=)
  //   A trailing `=json` assigns (trusted rules only); otherwise matched values are removed.
  // ---------------------------------------------------------------------------------------

  var ID_RE = /^(\*|[A-Za-z_$][\w$]*)/;
  var OPS = ['==', '!=', '^=', '$=', '*=', '<=', '>=', '<', '>'];

  function parseJsonValue(raw) {
    try { return { v: nativeParse(raw) }; } catch (e) { return null; }
  }

  function compileFilter(body) {
    var not = body.charAt(0) === '!';
    if (not) body = body.slice(1);
    var path = [];
    var i = 0;
    while (body.charAt(i) === '.') {
      var m = ID_RE.exec(body.slice(i + 1));
      if (!m) return null;
      path.push(m[1]);
      i += 1 + m[1].length;
    }
    if (!path.length) return null;
    var rest = body.slice(i).trim();
    var f = { not: not, path: path, op: null, value: undefined };
    if (!rest) return f;
    for (var k = 0; k < OPS.length; k++) {
      if (rest.indexOf(OPS[k]) === 0) {
        var val = parseJsonValue(rest.slice(OPS[k].length).trim());
        if (!val) return null;
        f.op = OPS[k];
        f.value = val.v;
        return f;
      }
    }
    return null;
  }

  function closingBracket(q, i) {
    var depth = 0;
    var quote = null;
    for (var j = i; j < q.length; j++) {
      var c = q[j];
      if (quote) { if (c === quote && q[j - 1] !== '\\') quote = null; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === '[') depth++;
      else if (c === ']' && --depth === 0) return j;
    }
    return -1;
  }

  function compileJsonPath(q) {
    var steps = [];
    var i = q.charAt(0) === '$' ? 1 : 0;
    var n = q.length;
    while (i < n) {
      var c = q.charAt(i);
      if (c === '=') break;
      var desc = false;
      if (c === '.') {
        desc = q.charAt(i + 1) === '.';
        i += desc ? 2 : 1;
        if (q.charAt(i) !== '[') {
          var m = ID_RE.exec(q.slice(i));
          if (!m) return null;
          steps.push({ desc: desc, key: m[1] });
          i += m[1].length;
          continue;
        }
      }
      if (q.charAt(i) !== '[') return null;
      var end = closingBracket(q, i);
      if (end < 0) return null;
      var inner = q.slice(i + 1, end).trim();
      i = end + 1;
      if (inner.charAt(0) === '?') {
        var f = compileFilter(inner.slice(1).replace(/^\(|\)$/g, '').trim());
        if (!f) return null;
        steps.push({ desc: desc, filter: f });
      } else if (inner === '*') {
        steps.push({ desc: desc, key: '*' });
      } else if (/^-?\d+$/.test(inner)) {
        steps.push({ desc: desc, index: parseInt(inner, 10) });
      } else if (/^(["']).*\1$/.test(inner)) {
        steps.push({ desc: desc, key: inner.slice(1, -1), literal: true });
      } else {
        return null;
      }
    }
    if (!steps.length) return null;
    var assign;
    if (i < n) {
      assign = parseJsonValue(q.slice(i + 1));
      if (!assign) return null;
    }
    return { steps: steps, assign: assign };
  }

  function compare(f, v) {
    if (v === undefined) return false;
    if (!f.op) return true;
    var s = typeof v === 'string' ? v : nativeStringify(v);
    var t = typeof f.value === 'string' ? f.value : nativeStringify(f.value);
    switch (f.op) {
      case '==': return v === f.value;
      case '!=': return v !== f.value;
      case '^=': return typeof s === 'string' && s.indexOf(t) === 0;
      case '$=': return typeof s === 'string' && s.slice(-t.length) === t;
      case '*=': return typeof s === 'string' && s.indexOf(t) !== -1;
      case '<': return v < f.value;
      case '<=': return v <= f.value;
      case '>': return v > f.value;
      case '>=': return v >= f.value;
    }
    return false;
  }

  function passes(f, value) {
    var v = value;
    for (var i = 0; i < f.path.length && v !== undefined; i++) {
      v = isObj(v) && hasOwn(v, f.path[i]) ? v[f.path[i]] : undefined;
    }
    return compare(f, v) !== f.not;
  }

  function childKeys(value) {
    if (!isObj(value)) return [];
    return Array.isArray(value) ? value.map(function (_, i) { return i; }) : Object.keys(value);
  }

  /**
   * Calls visit(parent, key, child) for every node under [value], without building a node list
   * first: watch responses have tens of thousands of nodes and `..key` used to allocate one
   * wrapper object per node on every request.
   */
  function walk(value, visit) {
    var stack = [value];
    while (stack.length) {
      var v = stack.pop();
      if (!isObj(v)) continue;
      var arr = Array.isArray(v);
      var keys = arr ? null : Object.keys(v);
      var n = arr ? v.length : keys.length;
      for (var i = 0; i < n; i++) {
        var k = arr ? i : keys[i];
        var c = v[k];
        visit(v, k, c);
        if (isObj(c)) stack.push(c);
      }
    }
  }

  function stepMatches(step, parentValue, key) {
    if (step.index !== undefined) {
      if (!Array.isArray(parentValue)) return false;
      var idx = step.index < 0 ? parentValue.length + step.index : step.index;
      return key === idx;
    }
    if (step.key === '*' && !step.literal) return true;
    return !Array.isArray(parentValue) && String(key) === step.key;
  }

  function evaluatePath(compiled, root) {
    var nodes = [{ parent: null, key: null, value: root }];
    compiled.steps.forEach(function (step) {
      var out = [];
      nodes.forEach(function (node) {
        if (step.filter) {
          if (step.desc) {
            walk(node.value, function (p, k, c) { if (passes(step.filter, c)) out.push({ parent: p, key: k, value: c }); });
          } else if (Array.isArray(node.value)) {
            childKeys(node.value).forEach(function (k) {
              if (passes(step.filter, node.value[k])) out.push({ parent: node.value, key: k, value: node.value[k] });
            });
          } else if (passes(step.filter, node.value)) {
            out.push(node);
          }
          return;
        }
        var own = node.value;
        childKeys(own).forEach(function (k) {
          if (stepMatches(step, own, k)) out.push({ parent: own, key: k, value: own[k] });
        });
        if (step.desc) {
          walk(own, function (p, k, c) {
            if (!isObj(c)) return;
            childKeys(c).forEach(function (ck) {
              if (stepMatches(step, c, ck)) out.push({ parent: c, key: ck, value: c[ck] });
            });
          });
        }
      });
      nodes = out;
    });
    return nodes;
  }

  /** Property names a document must contain for [compiled] to match anything. */
  function jsonPathKeys(compiled) {
    var keys = [];
    compiled.steps.forEach(function (step) {
      if (step.key !== undefined && (step.literal || step.key !== '*')) keys.push(step.key);
      if (step.filter && !step.filter.not) keys.push.apply(keys, step.filter.path.filter(function (k) { return k !== '*'; }));
    });
    return keys;
  }

  /** Apply a compiled path to [root] in place; returns the number of edited nodes. */
  function applyJsonPath(compiled, root) {
    var hits = evaluatePath(compiled, root).filter(function (h) { return h.parent !== null; });
    var REMOVED = {};
    var arrays = [];
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      if (compiled.assign) {
        h.parent[h.key] = isObj(compiled.assign.v) ? nativeParse(nativeStringify(compiled.assign.v)) : compiled.assign.v;
      } else if (Array.isArray(h.parent) && typeof h.key === 'number') {
        // Mark first and compact after, so indices stay valid whatever order hits came in.
        if (arrays.indexOf(h.parent) === -1) arrays.push(h.parent);
        h.parent[h.key] = REMOVED;
      } else {
        delete h.parent[h.key];
      }
    }
    arrays.forEach(function (a) {
      var w = 0;
      for (var r = 0; r < a.length; r++) if (a[r] !== REMOVED) a[w++] = a[r];
      a.length = w;
    });
    return hits.length;
  }

  // ---------------------------------------------------------------------------------------
  // Hook points, each installed once and shared by every rule that needs it.
  // ---------------------------------------------------------------------------------------

  var parseHooks = [];
  var fetchHooks = [];
  var xhrHooks = [];

  function runObjectHooks(hooks, obj) {
    var n = 0;
    for (var i = 0; i < hooks.length; i++) {
      try { if (hooks[i].object && hooks[i].object(obj)) n++; } catch (e) {}
    }
    return n;
  }

  /** Text and JSON hooks over a response body; returns the new text, or null when unchanged. */
  function rewriteBody(hooks, text) {
    var changed = 0;
    var out = text;
    hooks.forEach(function (h) {
      if (!h.text) return;
      try {
        var t = h.text(out);
        if (t !== out) { out = t; changed++; }
      } catch (e) {}
    });
    var objectHooks = hooks.filter(function (h) { return h.object && mayApply(h, out); });
    if (objectHooks.length) {
      var obj;
      try { obj = nativeParse(out); } catch (e) { obj = undefined; }
      if (isObj(obj)) {
        var n = runObjectHooks(objectHooks, obj);
        if (n) { out = nativeStringify(obj); changed += n; }
      }
    }
    if (!changed) return null;
    post(changed);
    return out;
  }

  var parseInstalled = false;
  function installParse() {
    if (parseInstalled) return;
    parseInstalled = true;
    var prev = JSON.parse;
    JSON.parse = function parse(text) {
      var obj = prev.apply(this, arguments);
      if (isObj(obj) && parseHooks.length) {
        var hooks = typeof text === 'string' ? parseHooks.filter(function (h) { return mayApply(h, text); }) : parseHooks;
        var n = hooks.length ? runObjectHooks(hooks, obj) : 0;
        if (n) post(n);
      }
      return obj;
    };
  }

  var fetchInstalled = false;
  function installFetch() {
    if (fetchInstalled || typeof window.fetch !== 'function') return;
    fetchInstalled = true;
    var prev = window.fetch;
    window.fetch = function fetch(resource, options) {
      var promise = prev.apply(this, arguments);
      var hooks;
      try {
        var props = fetchProps(resource, options);
        hooks = fetchHooks.filter(function (h) { return matchProps(h.needles, props); });
      } catch (e) {
        return promise;
      }
      if (!hooks.length) return promise;
      return promise.then(function (before) {
        return before.clone().text().then(function (text) {
          var out = rewriteBody(hooks, text);
          if (out === null) return before;
          var after = new Response(out, { status: before.status, statusText: before.statusText, headers: before.headers });
          Object.defineProperties(after, {
            ok: { value: before.ok },
            redirected: { value: before.redirected },
            type: { value: before.type },
            url: { value: before.url },
          });
          return after;
        }).catch(function () { return before; });
      });
    };
  }

  var xhrInstalled = false;
  function installXhr() {
    var XHR = window.XMLHttpRequest;
    if (xhrInstalled || !XHR) return;
    var proto = XHR.prototype;
    var open = proto.open;
    var responseDesc = Object.getOwnPropertyDescriptor(proto, 'response');
    var textDesc = Object.getOwnPropertyDescriptor(proto, 'responseText');
    if (!responseDesc || !responseDesc.get || !textDesc || !textDesc.get) return;
    xhrInstalled = true;
    proto.open = function (method, url) {
      try {
        var props = { method: String(method), url: String(url) };
        var hooks = xhrHooks.filter(function (h) { return matchProps(h.needles, props); });
        this.__bopboxXhr = hooks.length ? { hooks: hooks } : null;
      } catch (e) {
        this.__bopboxXhr = null;
      }
      return open.apply(this, arguments);
    };
    function filtered(xhr) {
      var st = xhr.__bopboxXhr;
      if (!st || xhr.readyState !== 4) return null;
      if (st.done) return st;
      var type = xhr.responseType;
      if (type === '' || type === 'text') {
        var out = rewriteBody(st.hooks, textDesc.get.call(xhr));
        st.text = out;
      } else if (type === 'json') {
        var obj = responseDesc.get.call(xhr);
        if (isObj(obj)) {
          var n = runObjectHooks(st.hooks, obj);
          if (n) post(n);
        }
      }
      st.done = true;
      return st;
    }
    Object.defineProperty(proto, 'response', {
      configurable: true,
      enumerable: true,
      get: function () {
        var st = filtered(this);
        return st && st.text != null ? st.text : responseDesc.get.call(this);
      },
    });
    Object.defineProperty(proto, 'responseText', {
      configurable: true,
      enumerable: true,
      get: function () {
        var st = filtered(this);
        return st && st.text != null ? st.text : textDesc.get.call(this);
      },
    });
  }

  // ---------------------------------------------------------------------------------------
  // set-constant
  // ---------------------------------------------------------------------------------------

  var NO_VALUE = {};

  function constantFor(raw) {
    switch (raw) {
      case 'undefined': return undefined;
      case 'false': return false;
      case 'true': return true;
      case 'null': return null;
      case "''": case '': return '';
      case '[]': case 'emptyArr': return [];
      case '{}': case 'emptyObj': return {};
      case 'noopFunc': return function () {};
      case 'trueFunc': return function () { return true; };
      case 'falseFunc': return function () { return false; };
    }
    if (/^-?\d+$/.test(raw) && Math.abs(parseInt(raw, 10)) <= 0x7fff) return parseInt(raw, 10);
    return NO_VALUE;
  }

  function setConstant(chain, raw) {
    var value = constantFor(raw);
    if (value === NO_VALUE || !chain) return;
    var aborted = false;
    // The page uses this name for something else: leave it alone, as uBO does.
    function clashes(v) {
      if (aborted) return true;
      aborted = v !== undefined && v !== null && value !== undefined && value !== null && typeof v !== typeof value;
      return aborted;
    }
    function trapLeaf(owner, prop) {
      var desc = Object.getOwnPropertyDescriptor(owner, prop);
      if (desc && !desc.configurable) return;
      if (desc && 'value' in desc && clashes(desc.value)) return;
      try {
        Object.defineProperty(owner, prop, {
          configurable: false,
          enumerable: desc ? desc.enumerable : true,
          get: function () { return value; },
          set: function (v) { if (clashes(v)) value = v; },
        });
      } catch (e) {}
    }
    function trap(owner, rest) {
      var dot = rest.indexOf('.');
      if (dot === -1) { trapLeaf(owner, rest); return; }
      var prop = rest.slice(0, dot);
      var tail = rest.slice(dot + 1);
      var current = owner[prop];
      if (current !== null && (typeof current === 'object' || typeof current === 'function')) {
        trap(current, tail);
        return;
      }
      var prev = Object.getOwnPropertyDescriptor(owner, prop);
      if (prev && !prev.configurable) return;
      var stored = current;
      try {
        Object.defineProperty(owner, prop, {
          configurable: true,
          enumerable: true,
          get: function () {
            if (prev && prev.get) prev.get.call(this);
            return stored;
          },
          set: function (v) {
            if (prev && prev.set) prev.set.call(this, v);
            stored = v;
            if (v !== null && (typeof v === 'object' || typeof v === 'function')) {
              try { trap(v, tail); } catch (e) {}
            }
          },
        });
      } catch (e) {}
    }
    trap(window, chain);
  }

  // ---------------------------------------------------------------------------------------
  // Timer boosters
  // ---------------------------------------------------------------------------------------

  function booster(name, needle, delay, boost) {
    var pattern = toPattern(needle || '');
    if (!pattern) return;
    var wanted = delay === '*' ? -1 : parseInt(delay || '1000', 10);
    var factor = parseFloat(boost || '0.05');
    if (!isFinite(factor)) factor = 0.05;
    factor = Math.min(50, Math.max(0.001, factor));
    var prev = window[name];
    window[name] = function (fn, ms) {
      var args = Array.prototype.slice.call(arguments);
      try {
        if ((wanted === -1 || Number(ms) === wanted) && testPattern(pattern, String(fn))) args[1] = Number(ms) * factor;
      } catch (e) {}
      return prev.apply(this, args);
    };
  }

  // ---------------------------------------------------------------------------------------
  // Rule dispatch
  // ---------------------------------------------------------------------------------------

  function replacer(pattern, replacement) {
    if (!pattern) return null;
    var p = /^\/(.+)\/([gimsu]*)$/.test(pattern) ? toPattern(pattern) : { re: new RegExp(escapeRe(pattern), 'g'), expect: true };
    if (!p) return null;
    var rep = replacement || '';
    return function (text) { p.re.lastIndex = 0; return text.replace(p.re, rep); };
  }

  function editor(jsonq, trusted) {
    var compiled = compileJsonPath(jsonq || '');
    if (!compiled || (compiled.assign && !trusted)) return null;
    var edit = function (obj) { return applyJsonPath(compiled, obj) > 0; };
    edit.mayApply = textHint([jsonPathKeys(compiled)]);
    return edit;
  }

  function addResponseHook(list, install, needlesRaw, hook) {
    if (!hook.object && !hook.text) return false;
    hook.needles = parseProps(needlesRaw);
    list.push(hook);
    install();
    return true;
  }

  /** Run one rule body; returns true when it was understood and installed. */
  function run(body) {
    var a = parseArgs(body);
    var name = a[0];
    var extra;
    switch (name) {
      case 'set':
      case 'set-constant':
        setConstant(a[1], a[2] === undefined ? '' : a[2]);
        return true;
      case 'json-prune': {
        var pruner = makePruner(a[1], a[2]);
        if (!pruner) return false;
        parseHooks.push({ object: pruner });
        installParse();
        return true;
      }
      case 'json-prune-fetch-response':
      case 'json-prune-xhr-response': {
        extra = varargs(a.slice(3));
        var fetch = name === 'json-prune-fetch-response';
        return addResponseHook(fetch ? fetchHooks : xhrHooks, fetch ? installFetch : installXhr, extra.propsToMatch, { object: makePruner(a[1], a[2]) });
      }
      case 'json-edit':
      case 'trusted-json-edit': {
        var ed = editor(a[1], name.indexOf('trusted-') === 0);
        if (!ed) return false;
        parseHooks.push({ object: ed });
        installParse();
        return true;
      }
      case 'json-edit-fetch-response':
      case 'trusted-json-edit-fetch-response':
      case 'json-edit-xhr-response':
      case 'trusted-json-edit-xhr-response': {
        extra = varargs(a.slice(2));
        var isFetch = name.indexOf('fetch') !== -1;
        return addResponseHook(isFetch ? fetchHooks : xhrHooks, isFetch ? installFetch : installXhr, extra.propsToMatch, {
          object: editor(a[1], name.indexOf('trusted-') === 0),
        });
      }
      case 'trusted-replace-fetch-response':
      case 'trusted-rpfr':
        return addResponseHook(fetchHooks, installFetch, a[3], { text: replacer(a[1], a[2]) });
      case 'trusted-replace-xhr-response':
        return addResponseHook(xhrHooks, installXhr, a[3], { text: replacer(a[1], a[2]) });
      case 'nano-setTimeout-booster':
      case 'nano-stb':
        booster('setTimeout', a[1], a[2], a[3]);
        return true;
      case 'nano-setInterval-booster':
      case 'nano-sib':
        booster('setInterval', a[1], a[2], a[3]);
        return true;
    }
    return false;
  }

  /** Install any rules for this host that are not installed yet (config can arrive late). */
  function sync() {
    var cfg = window.__bopboxConfig || {};
    if (!cfg.adblock || !cfg.scriptlets) return;
    var host = location.hostname;
    var list = cfg.scriptlets[host] || [];
    for (var i = 0; i < list.length; i++) {
      var body = list[i];
      if (typeof body !== 'string' || applied[body]) continue;
      applied[body] = true;
      try { if (run(body)) counts.rules++; } catch (e) {}
    }
  }

  window.__bopboxScriptlets = {
    sync: sync,
    run: run,
    counts: counts,
    parseArgs: parseArgs,
    parseProps: parseProps,
    matchProps: matchProps,
    findOwner: findOwner,
    makePruner: makePruner,
    compileJsonPath: compileJsonPath,
    applyJsonPath: applyJsonPath,
    textHint: textHint,
  };

  sync();
})();
