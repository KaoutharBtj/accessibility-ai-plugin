import { JSDOM } from 'jsdom';
import axe from 'axe-core';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url); 
const __dirname = dirname(__filename);             
const SCENARIOS_DIR = join(__dirname, 'test-scenarios');
const WCAG_LEVEL = 'wcag2aa';
const ENABLED_RULES = ['color-contrast', 'color-contrast-enhanced', 'link-in-text-block'];


async function runAxeOnFile(htmlPath) {
  const htmlContent = readFileSync(htmlPath, 'utf-8');
  const htmlDir = dirname(htmlPath);

  const linkedCss = collectLinkedCss(htmlContent, htmlDir);

  const dom = new JSDOM(htmlContent, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
  });

  const { window } = dom;
  const { document: doc } = window;

  if (linkedCss) {
    const style = doc.createElement('style');
    style.textContent = linkedCss;
    doc.head.appendChild(style);
  }

  const script = doc.createElement('script');
  script.textContent = axe.source;
  doc.head.appendChild(script);

  const results = await window.axe.run(doc, {
    runOnly: { type: 'tag', values: [WCAG_LEVEL] },
    rules: buildRulesConfig(ENABLED_RULES),
  });

  return results;
}


function collectLinkedCss(html, baseDir) {
  const cssChunks = [];
  const re = /<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const href = match[1];
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
      console.log(`  [SKIP] CDN stylesheet not loaded: ${href}`);
      continue;
    }
    const fullPath = resolve(baseDir, href);
    if (existsSync(fullPath)) {
      cssChunks.push(readFileSync(fullPath, 'utf-8'));
      console.log(`  [CSS]  Loaded local stylesheet: ${href}`);
    }
  }
  return cssChunks.join('\n');
}

function buildRulesConfig(enabledRules) {
  const all = ['color-contrast', 'color-contrast-enhanced', 'link-in-text-block', 'focus-visible'];
  const config = {};
  all.forEach(r => { config[r] = { enabled: enabledRules.includes(r) }; });
  return config;
}

function formatViolation(v) {
  const lines = [];
  lines.push(`\n  RULE: ${v.id} [${v.impact?.toUpperCase()}]`);
  lines.push(`     Help: ${v.help}`);
  lines.push(`     WCAG: ${v.tags.filter(t => t.startsWith('wcag')).join(', ')}`);

  v.nodes.forEach((node, i) => {
    lines.push(`     Node ${i + 1}: ${node.target.join(' > ')}`);
    const anyCheck = [...(node.any || []), ...(node.all || [])].find(c => c.data?.contrastRatio);
    if (anyCheck?.data) {
      const d = anyCheck.data;
      lines.push(`       Contrast: ${d.contrastRatio?.toFixed(2) ?? '?'}:1  (required ≥ ${d.expectedContrastRatio ?? 4.5}:1)`);
      lines.push(`       FG: ${d.fgColor ?? '?'}  BG: ${d.bgColor ?? '?'}`);
    }
  });

  return lines.join('\n');
}


async function main() {
  const scenarioFiles = readdirSync(SCENARIOS_DIR)
    .filter(f => f.endsWith('.html'))
    .sort();

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   CSS A11y VSCode Plugin — POC Validation Runner     ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  console.log(`Running ${scenarioFiles.length} test scenarios against WCAG level: ${WCAG_LEVEL}\n`);

  const summary = [];

  for (const file of scenarioFiles) {
    const filePath = join(SCENARIOS_DIR, file);
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📄 ${file}`);
    console.log('─'.repeat(60));

    const start = Date.now();
    let results;
    try {
      results = await runAxeOnFile(filePath);
    } catch (err) {
      console.error(`  ⚠️  Error during analysis: ${err.message}`);
      summary.push({ file, violations: '(error)', passes: 0, ms: Date.now() - start });
      continue;
    }
    const ms = Date.now() - start;

    const violations = results.violations;
    const passes = results.passes.filter(p => ENABLED_RULES.includes(p.id));

    console.log(`  Analysis time: ${ms}ms`);
    console.log(` Passing rules: ${passes.length}`);
    console.log(`  Violations: ${violations.length}`);

    if (violations.length > 0) {
      violations.forEach(v => console.log(formatViolation(v)));
    }

    summary.push({ file, violations: violations.length, passes: passes.length, ms });
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  console.log(`${'Scenario'.padEnd(42)} ${'Violations'.padEnd(12)} ${'Time'}`);
  console.log('─'.repeat(60));
  summary.forEach(s => {
    const v = String(s.violations).padEnd(12);
    const t = `${s.ms}ms`;
    console.log(`${s.file.padEnd(42)} ${v} ${t}`);
  });
  console.log('═'.repeat(60));
}

main().catch(console.error);