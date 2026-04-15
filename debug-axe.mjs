import { chromium } from 'playwright';
import axe from 'axe-core';

const html = `<!DOCTYPE html><html lang="fr"><head><style>
  p { color: #aaaaaa; background-color: #ffffff; font-size: 16px; }
</style></head><body><main><p>Texte mauvais contraste</p></main></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();

await page.setContent(html);
await page.addScriptTag({ content: axe.source });

const results = await page.evaluate(() => {
  return window.axe.run(document, {
    rules: { 'color-contrast': { enabled: true } },
    reporter: 'v2',
  });
});

console.log('Violations:', results.violations.length);
console.log('Incomplete:', results.incomplete.map(r => r.id));
results.violations.forEach(v => {
  console.log(' - Rule:', v.id, '|', v.impact);
  v.nodes.forEach(n => {
    const check = [...(n.any||[]),...(n.all||[])].find(c => c.data?.contrastRatio);
    if (check) console.log('   Ratio:', check.data.contrastRatio, '| FG:', check.data.fgColor, '| BG:', check.data.bgColor);
  });
});

await browser.close();