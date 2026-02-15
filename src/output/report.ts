import fs from "node:fs";
import path from "node:path";
import type { HLDOutput, RunMeta } from "../types.js";
import { log } from "../utils/logger.js";

interface RunData {
  meta: RunMeta;
  output: HLDOutput;
  dirName: string;
}

/**
 * Scan the output directory and load all completed runs.
 */
function loadRuns(outputDir: string): RunData[] {
  if (!fs.existsSync(outputDir)) return [];

  const dirs = fs
    .readdirSync(outputDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());
  const runs: RunData[] = [];

  for (const dir of dirs) {
    const metaPath = path.join(outputDir, dir.name, "meta.json");
    const rawPath = path.join(outputDir, dir.name, "raw-response.json");

    if (!fs.existsSync(metaPath) || !fs.existsSync(rawPath)) continue;

    try {
      const meta: RunMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      meta.version ??= 1; // backward compat for runs generated before v1.2
      const output: HLDOutput = JSON.parse(fs.readFileSync(rawPath, "utf-8"));
      runs.push({ meta, output, dirName: dir.name });
    } catch {
      log.warn(`Skipping invalid run: ${dir.name}`);
    }
  }

  return runs.sort(
    (a, b) =>
      a.meta.problem.localeCompare(b.meta.problem) ||
      a.meta.model.localeCompare(b.meta.model),
  );
}

/**
 * Escape HTML special characters.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Format milliseconds into a readable string.
 */
function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Generate a self-contained HTML report from all benchmark results.
 */
export function generateReport(outputDir: string): string | null {
  const runs = loadRuns(outputDir);

  if (runs.length === 0) {
    log.error("No benchmark results found. Run `pnpm run bench run` first.");
    return null;
  }

  // Group runs by problem
  const byProblem = new Map<string, RunData[]>();
  for (const run of runs) {
    const existing = byProblem.get(run.meta.problem) ?? [];
    existing.push(run);
    byProblem.set(run.meta.problem, existing);
  }

  const reportPath = path.join(outputDir, "report.html");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HLD-Bench Report</title>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    securityLevel: 'loose',
    themeVariables: {
      fontSize: '14px',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      darkMode: true,
      background: '#161b22',
      primaryColor: '#1f6feb',
      primaryTextColor: '#e6edf3',
      primaryBorderColor: '#58a6ff',
      lineColor: '#8b949e',
      secondaryColor: '#238636',
      tertiaryColor: '#2d333b',
      nodeTextColor: '#e6edf3',
      mainBkg: '#1f6feb',
      nodeBorder: '#58a6ff',
      clusterBg: '#0d1117',
      clusterBorder: '#30363d',
      titleColor: '#e6edf3',
      edgeLabelBackground: '#161b22',
      actorBkg: '#1f6feb',
      actorTextColor: '#e6edf3',
      actorBorder: '#58a6ff',
      actorLineColor: '#8b949e',
      signalColor: '#e6edf3',
      signalTextColor: '#e6edf3',
      labelBoxBkgColor: '#161b22',
      labelBoxBorderColor: '#30363d',
      labelTextColor: '#e6edf3',
      loopTextColor: '#e6edf3',
      noteBkgColor: '#2d333b',
      noteTextColor: '#e6edf3',
      noteBorderColor: '#30363d',
    }
  });
  document.addEventListener('DOMContentLoaded', async () => {
    const diagrams = document.querySelectorAll('.mermaid[data-src]');
    await Promise.all([...diagrams].map(async (el) => {
      try {
        const resp = await fetch(el.getAttribute('data-src'));
        if (!resp.ok) throw new Error(resp.statusText);
        el.setAttribute('data-raw', await resp.text());
      } catch (e) {
        el.setAttribute('data-raw', '');
        el.innerHTML = '<p style="color:#f85149;padding:1rem">Failed to load diagram. Use <code>pnpm run bench serve</code> to view.</p>';
        console.error('Failed to load', el.getAttribute('data-src'), e);
      }
    }));
    // Render each diagram individually so one failure doesn't block others
    for (const el of diagrams) {
      const raw = el.getAttribute('data-raw');
      if (!raw) continue;
      el.textContent = raw;
      try {
        await mermaid.run({ nodes: [el] });
      } catch (err) {
        console.warn('Mermaid render failed for', el.getAttribute('data-src'), err);
        showFallback(el, raw);
      }
    }
    // Also catch diagrams where mermaid silently inserted an error SVG
    for (const el of diagrams) {
      if (el.getAttribute('data-raw') && el.innerHTML.includes('Syntax error')) {
        showFallback(el, el.getAttribute('data-raw'));
      }
    }
  });

  function showFallback(el, raw) {
    const pre = document.createElement('pre');
    pre.style.cssText = 'background:#161b22;color:#8b949e;padding:1rem;border-radius:6px;overflow-x:auto;font-size:0.8rem;white-space:pre-wrap';
    pre.textContent = raw;
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:0.5rem;margin-top:0.5rem';
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy source';
    copyBtn.style.cssText = 'padding:0.3rem 0.8rem;background:#30363d;color:#e6edf3;border:1px solid #484f58;border-radius:4px;cursor:pointer;font-size:0.8rem';
    copyBtn.addEventListener('click', () => { navigator.clipboard.writeText(raw); copyBtn.textContent = 'Copied!'; });
    const liveLink = document.createElement('a');
    liveLink.href = 'https://mermaid.live';
    liveLink.target = '_blank';
    liveLink.rel = 'noopener';
    liveLink.textContent = 'Open mermaid.live';
    liveLink.style.cssText = 'padding:0.3rem 0.8rem;background:#1f6feb33;color:#58a6ff;border:1px solid #1f6feb55;border-radius:4px;text-decoration:none;font-size:0.8rem';
    btnRow.append(copyBtn, liveLink);
    el.replaceChildren(pre, btnRow);
  }
</script>
<style>
  :root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --text: #e6edf3; --text-muted: #8b949e; --accent: #58a6ff;
    --green: #3fb950; --orange: #d29922; --red: #f85149;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
  .container { max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem; }
  h1 { font-size: 2rem; margin-bottom: 0.25rem; }
  .subtitle { color: var(--text-muted); margin-bottom: 2rem; font-size: 0.95rem; }
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2.5rem; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; }
  .stat-card .label { font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .stat-card .value { font-size: 1.5rem; font-weight: 600; margin-top: 0.25rem; }
  .problem-section { margin-bottom: 3rem; }
  .problem-title { font-size: 1.4rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); }

  /* Tabs */
  .tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 0; overflow-x: auto; }
  .tab { padding: 0.6rem 1.2rem; cursor: pointer; color: var(--text-muted); border-bottom: 2px solid transparent; font-size: 0.9rem; white-space: nowrap; transition: all 0.15s; background: none; border-top: none; border-left: none; border-right: none; }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab-content { display: none; background: var(--surface); border: 1px solid var(--border); border-top: none; border-radius: 0 0 8px 8px; padding: 1.5rem; }
  .tab-content.active { display: block; }

  /* Content */
  .meta-bar { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; font-size: 0.85rem; color: var(--text-muted); }
  .meta-bar span { display: inline-flex; align-items: center; gap: 0.3rem; }
  .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 500; }
  .badge-provider { background: #1f6feb33; color: var(--accent); }

  .section { margin-bottom: 1.5rem; }
  .section h3 { font-size: 1rem; margin-bottom: 0.5rem; color: var(--accent); }
  .section h4 { font-size: 0.9rem; margin-bottom: 0.4rem; color: var(--text); }
  .section p, .section li { font-size: 0.9rem; color: var(--text); }
  .section ul { padding-left: 1.5rem; }
  .section li { margin-bottom: 0.2rem; }

  .mermaid { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 1rem; margin: 0.75rem 0; overflow-x: auto; }
  .mermaid-warning { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem; }
  .mermaid-warning a { color: var(--accent); text-decoration: none; }
  .mermaid-warning a:hover { text-decoration: underline; }

  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin: 0.5rem 0; }
  th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 2px solid var(--border); color: var(--text-muted); font-weight: 600; }
  td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); }
  tr:last-child td { border-bottom: none; }
  code { background: var(--bg); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85em; }

  .tradeoff { background: var(--bg); border-radius: 6px; padding: 1rem; margin-bottom: 0.75rem; }
  .tradeoff h4 { margin-bottom: 0.5rem; }
  .pros-cons { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .pros li { color: var(--green); }
  .cons li { color: var(--orange); }
  .pros li span, .cons li span { color: var(--text); }

  .overview-text { font-size: 0.95rem; line-height: 1.7; }

  /* Comparison table */
  .compare-table { margin-top: 1.5rem; }
  .compare-table th { position: sticky; top: 0; background: var(--surface); }

  @media (max-width: 768px) {
    .pros-cons { grid-template-columns: 1fr; }
    .container { padding: 1rem; }
  }
</style>
${
  process.env.POSTHOG_KEY
    ? `<!-- PostHog Analytics -->
<script>
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group identify setPersonProperties setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags resetGroups onFeatureFlags addFeatureFlagsHandler onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    posthog.init('${process.env.POSTHOG_KEY}', {
        api_host: '${process.env.POSTHOG_HOST || "https://us.i.posthog.com"}',
        defaults: '2025-11-30'
    })
</script>`
    : ""
}
</head>
<body>
<div class="container">
  <h1>HLD-Bench Report</h1>
  <p class="subtitle">Generated on ${new Date().toLocaleString()} &middot; ${runs.length} run(s) across ${byProblem.size} problem(s)</p>

  <div class="summary-grid">
    <div class="stat-card"><div class="label">Total Runs</div><div class="value">${runs.length}</div></div>
    <div class="stat-card"><div class="label">Problems</div><div class="value">${byProblem.size}</div></div>
    <div class="stat-card"><div class="label">Models</div><div class="value">${new Set(runs.map((r) => r.meta.model)).size}</div></div>
    <div class="stat-card"><div class="label">Providers</div><div class="value">${new Set(runs.map((r) => r.meta.provider)).size}</div></div>
  </div>

${Array.from(byProblem.entries())
  .map(
    ([problemKey, problemRuns]) => `
  <div class="problem-section">
    <h2 class="problem-title">${esc(problemRuns[0].output.title || problemKey)}</h2>
    <div class="tabs">
      ${problemRuns.map((r, i) => `<button class="tab${i === 0 ? " active" : ""}" onclick="switchTab(this, '${problemKey}', ${i})">${esc(r.meta.model)} <span class="badge badge-provider">${esc(r.meta.provider)}</span></button>`).join("\n      ")}
    </div>
    ${problemRuns
      .map(
        (r, i) => `
    <div id="${problemKey}-${i}" class="tab-content${i === 0 ? " active" : ""}">
      <div class="meta-bar">
        <span>⏱ ${fmtDuration(r.meta.durationMs)}</span>
        <span>📅 ${new Date(r.meta.timestamp).toLocaleString()}</span>
        <span>📁 ${esc(r.dirName)}</span>
      </div>

      <div class="section">
        <h3>Overview</h3>
        <p class="overview-text">${esc(r.output.overview)}</p>
      </div>

      <div class="section">
        <h3>Requirements</h3>
        <div class="pros-cons">
          <div>
            <h4>Functional</h4>
            <ul>${r.output.requirements.functional.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
          </div>
          <div>
            <h4>Non-Functional</h4>
            <ul>${r.output.requirements.nonFunctional.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
          </div>
        </div>
      </div>

      <div class="section">
        <h3>Architecture Diagram</h3>
        <p class="mermaid-warning">⚠ Mermaid rendering can be flaky with LLM-generated diagrams. If the diagram fails, copy the source and paste it into <a href="https://mermaid.live" target="_blank" rel="noopener">mermaid.live</a> for reliable rendering.</p>
        <div class="mermaid" data-src="${r.dirName}/architecture.mmd"></div>
      </div>

      <div class="section">
        <h3>Components</h3>
        <table>
          <thead><tr><th>Component</th><th>Technology</th><th>Responsibility</th><th>Justification</th></tr></thead>
          <tbody>${r.output.components.map((c) => `<tr><td><strong>${esc(c.name)}</strong></td><td><code>${esc(c.techChoice)}</code></td><td>${esc(c.responsibility)}</td><td>${esc(c.justification)}</td></tr>`).join("")}</tbody>
        </table>
      </div>

      <div class="section">
        <h3>Data Flow</h3>
        <p class="mermaid-warning">⚠ Mermaid rendering can be flaky with LLM-generated diagrams. If the diagram fails, copy the source and paste it into <a href="https://mermaid.live" target="_blank" rel="noopener">mermaid.live</a> for reliable rendering.</p>
        <div class="mermaid" data-src="${r.dirName}/data-flow.mmd"></div>
      </div>

      <div class="section">
        <h3>Data Storage</h3>
        <table>
          <thead><tr><th>Store</th><th>Type</th><th>Justification</th></tr></thead>
          <tbody>${r.output.dataStorage.map((s) => `<tr><td><strong>${esc(s.store)}</strong></td><td><code>${esc(s.type)}</code></td><td>${esc(s.justification)}</td></tr>`).join("")}</tbody>
        </table>
      </div>

      <div class="section">
        <h3>API Design</h3>
        <table>
          <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
          <tbody>${r.output.apiDesign.map((a) => `<tr><td><code>${esc(a.method)}</code></td><td><code>${esc(a.endpoint)}</code></td><td>${esc(a.description)}</td></tr>`).join("")}</tbody>
        </table>
      </div>

      <div class="section">
        <h3>Scalability Strategy</h3>
        <p>${esc(r.output.scalabilityStrategy)}</p>
      </div>

      <div class="section">
        <h3>Trade-offs</h3>
        ${r.output.tradeoffs
          .map(
            (t) => `
        <div class="tradeoff">
          <h4>${esc(t.decision)}</h4>
          <div class="pros-cons">
            <div><ul class="pros">${t.pros.map((p) => `<li>✓ <span>${esc(p)}</span></li>`).join("")}</ul></div>
            <div><ul class="cons">${t.cons.map((c) => `<li>✗ <span>${esc(c)}</span></li>`).join("")}</ul></div>
          </div>
        </div>`,
          )
          .join("")}
      </div>
    </div>`,
      )
      .join("")}
  </div>`,
  )
  .join("\n")}

</div>
<script>
function switchTab(btn, problem, idx) {
  // Deactivate all tabs & content for this problem
  btn.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const section = btn.closest('.problem-section');
  section.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  // Activate selected
  btn.classList.add('active');
  document.getElementById(problem + '-' + idx).classList.add('active');
}
</script>
</body>
</html>`;

  fs.writeFileSync(reportPath, html);
  return reportPath;
}
