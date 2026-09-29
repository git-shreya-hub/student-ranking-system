/*
 * End-to-end browser test of every major workflow (optional, needs Node.js + Playwright).
 *   cd tests/browser && npm install playwright && npx playwright install chromium   (once)
 *   node tests/browser/workflow.test.js
 * The app must already be running (run.bat).
 * WARNING: clears the student table, then leaves the 30 sample students loaded.
 * Set SIMULATE_DB_OUTAGE=1 on a Linux machine where "service postgresql stop/start" works
 * to also test the "database offline" banner and reconnect.
 */
const { chromium } = require('playwright');
const { execSync } = require('child_process');

const BASE = process.env.APP_URL || 'http://127.0.0.1:5000';
let passed = 0, failed = 0;

async function step(name, fn) {
    try { await fn(); passed++; console.log(`  PASS  ${name}`); }
    catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message.split('\n')[0]}`); }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }

(async () => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const text = sel => page.locator(sel).innerText();
    const toast = async () => (await page.locator('.toast').last().innerText());
    const nav = async s => { await page.click(`.nav-btn[data-section="${s}"]`); await page.waitForTimeout(500); };

    console.log(`Browser workflow test against ${BASE}\n`);
    await page.goto(BASE);

    await step('Page loads and shows PostgreSQL connected', async () => {
        await page.waitForSelector('#db-status.ok', { timeout: 5000 });
        expect((await text('#db-status-text')).includes('connected'), 'badge not connected');
    });

    await step('Every navigation button opens its section and highlights itself', async () => {
        for (const s of ['students', 'ranking', 'visualization', 'performance', 'algorithm', 'dashboard']) {
            await nav(s);
            expect(await page.locator(`#${s}.active`).count() === 1, `${s} not shown`);
            expect(await page.locator('.nav-btn.active').getAttribute('data-section') === s, `${s} not highlighted`);
        }
    });

    await step('Clear All asks for confirmation and empties the table', async () => {
        await nav('students');
        await page.waitForTimeout(500);
        if (!(await page.locator('#clear-all-btn').isDisabled())) {
            await page.click('#clear-all-btn');
            await page.waitForSelector('#confirm-modal:not([hidden])');
            await page.click('#confirm-ok');
            await page.waitForTimeout(800);
        }
        expect((await text('#student-tbody')).includes('No students found'), 'table not empty');
        expect(await text('#student-count') === '0', 'count not 0');
    });

    await step('Empty dashboard and ranking show helpful empty states', async () => {
        await nav('dashboard');
        await page.waitForTimeout(500);
        expect(await text('#dash-total') === '0', 'total not 0');
        expect((await text('#dash-top')).includes('No students yet'), 'no empty state');
        await nav('ranking');
        await page.waitForTimeout(600);
        expect((await text('#ranking-tbody')).includes('No students in the database'), 'ranking empty msg');
    });

    await step('Form validation shows field errors (empty, bad name, marks > 100)', async () => {
        await nav('students');
        await page.click('#submit-btn');
        expect((await text('#err-roll')).length > 0, 'no roll error');
        await page.fill('#student-roll', '201');
        await page.fill('#student-name', 'Robert<script>');
        await page.fill('#student-marks', '50');
        await page.click('#submit-btn');
        expect((await text('#err-name')).includes('letters'), 'no name error');
        await page.fill('#student-name', 'Aditi Sharma');
        await page.fill('#student-marks', '101');
        await page.click('#submit-btn');
        expect((await text('#err-marks')).includes('between 0 and 100'), 'no marks error');
    });

    await step('Add students (including decimal marks and a tie)', async () => {
        for (const [r, n, m] of [['201', 'Aditi Sharma', '87.5'], ['202', 'Bharat Rao', '91'], ['203', 'Chitra Nair', '91'], ['204', 'Deepak Jain', '64']]) {
            await page.fill('#student-roll', r); await page.fill('#student-name', n); await page.fill('#student-marks', m);
            await page.click('#submit-btn');
            await page.waitForTimeout(600);
        }
        expect(await text('#student-count') === '4', 'count not 4: ' + await text('#student-count'));
        expect((await text('#student-tbody')).includes('87.5'), 'decimal marks lost');
    });

    await step('Duplicate roll number is rejected by the API with a field error', async () => {
        await page.fill('#student-roll', '201'); await page.fill('#student-name', 'Someone Else'); await page.fill('#student-marks', '40');
        await page.click('#submit-btn');
        await page.waitForTimeout(600);
        expect((await text('#err-roll')).includes('already belongs to Aditi Sharma'), 'no duplicate error: ' + await text('#err-roll'));
        await page.click('#cancel-btn');
    });

    await step('Edit a student', async () => {
        await page.locator('#student-tbody tr', { hasText: 'Deepak Jain' }).locator('button:has-text("Edit")').click();
        expect((await text('#form-title')).includes('Deepak Jain'), 'not in edit mode');
        await page.fill('#student-marks', '99');
        await page.click('#submit-btn');
        await page.waitForTimeout(700);
        expect((await toast()).includes('updated'), 'no success toast');
        expect((await page.locator('#student-tbody tr', { hasText: 'Deepak Jain' }).innerText()).includes('99'), 'marks not updated');
        expect(await text('#submit-btn') === 'Add Student', 'form not reset');
    });

    await step('Delete a student after confirmation (Cancel keeps it)', async () => {
        const row = () => page.locator('#student-tbody tr', { hasText: 'Chitra Nair' });
        await row().locator('button:has-text("Delete")').click();
        await page.click('#confirm-cancel');
        await page.waitForTimeout(200);
        expect(await row().count() === 1, 'deleted on cancel');
        await row().locator('button:has-text("Delete")').click();
        await page.click('#confirm-ok');
        await page.waitForTimeout(700);
        expect(await row().count() === 0, 'not deleted');
    });

    await step('Load Sample Data adds 30 records and does not duplicate', async () => {
        await page.click('#sample-btn');
        await page.waitForTimeout(900);
        expect(await text('#student-count') === '33', 'expected 33, got ' + await text('#student-count'));
        await page.click('#sample-btn');
        await page.waitForTimeout(900);
        expect(await text('#student-count') === '33', 'duplicated');
    });

    await step('Search filters the student list', async () => {
        await page.fill('#student-search', 'nair');
        expect(await page.locator('#student-tbody tr').count() === 1, 'search failed');
        await page.fill('#student-search', '');
    });

    await step('Dashboard shows statistics, top 5 and distribution', async () => {
        await nav('dashboard');
        await page.waitForTimeout(800);
        expect(await text('#dash-total') === '33', 'total');
        expect(await text('#dash-highest') === '99', 'highest');
        expect(await text('#dash-lowest') === '38', 'lowest');
        expect(await page.locator('#dash-top .top-row').count() === 5, 'top 5');
        expect(await page.locator('#dash-dist .dist-row').count() === 5, 'distribution');
    });

    await step('Dashboard "View Ranking" opens the ranking', async () => {
        await page.click('#dashboard >> text=View Ranking');
        await page.waitForTimeout(900);
        expect(await page.locator('#ranking.active').count() === 1, 'not navigated');
        expect(await page.locator('#ranking-tbody tr').count() === 33, 'ranking rows');
    });

    await step('Ranking is descending with competition ranks for ties', async () => {
        const rows = await page.locator('#ranking-tbody tr').allInnerTexts();
        const parsed = rows.map(r => r.split('\t').map(c => c.trim()));
        const marks = parsed.map(c => parseFloat(c[3]));
        for (let i = 1; i < marks.length; i++) expect(marks[i - 1] >= marks[i], 'not descending at ' + i);
        const ranks = parsed.map(c => parseInt(c[0]));
        for (let i = 1; i < ranks.length; i++) {
            if (marks[i] === marks[i - 1]) expect(ranks[i] === ranks[i - 1], 'tie rank differs at ' + i);
            else expect(ranks[i] === i + 1, 'competition rank wrong at ' + i);
        }
        // 99 twice (Ananya 109, Deepak 204) -> both rank 1, next is rank 3
        expect(ranks[0] === 1 && ranks[1] === 1 && ranks[2] === 3, `top ranks ${ranks.slice(0, 3)}`);
        expect(await page.locator('#ranking-tbody .tie-chip').count() > 0, 'no tie chips');
        expect((await text('#algo-summary')).includes('Comparisons'), 'no algorithm summary');
    });

    await step('Ranking filters (search, min/max) keep original ranks', async () => {
        await page.fill('#filter-min', '90');
        await page.fill('#filter-max', '95');
        const rows = await page.locator('#ranking-tbody tr').allInnerTexts();
        expect(rows.every(r => { const m = parseFloat(r.split('\t')[3]); return m >= 90 && m <= 95; }), 'range filter');
        await page.click('#ranking >> text=Reset');
        await page.fill('#search-student', 'Bharat');
        expect((await page.locator('#ranking-tbody tr').innerText()).startsWith('6'), 'rank changed when filtered: ' + await page.locator('#ranking-tbody tr').innerText());
        await page.click('#ranking >> text=Reset');
    });

    await step('Before-sorting tab shows database order', async () => {
        await page.click('.tab[data-tab="before"]');
        expect(await page.locator('#before-tbody tr').count() === 33, 'before rows');
        await page.click('.tab[data-tab="after"]');
    });

    await step('Export ranking as CSV', async () => {
        const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
        expect(download.suggestedFilename() === 'student_ranking.csv', 'filename');
    });

    await step('Visualization: start, step, jump to the end, see ranks', async () => {
        await nav('visualization');
        await page.fill('#viz-input', '96, 72, 91, 85, 91');
        await page.click('#viz-start');
        await page.waitForTimeout(800);
        expect((await text('#viz-message')).startsWith('DIVIDE'), 'first step');
        await page.click('#viz-next'); await page.click('#viz-next');
        expect((await text('#viz-counter')).startsWith('Step 3'), 'next');
        await page.click('#viz-prev');
        expect((await text('#viz-counter')).startsWith('Step 2'), 'prev');
        expect(await page.locator('#viz-array .viz-bar').count() === 5, 'bars');
        await page.locator('#viz-steps .step-item').last().click();
        expect((await text('#viz-message')).includes('96, 91, 91, 85, 72'), 'final order');
        expect((await text('#viz-result')).replace(/\s+/g, ' ').includes('2 91'), 'tie ranks');
    });

    await step('Visualization Play animates and Pause stops', async () => {
        await page.click('#visualization >> text=Reset');
        await page.fill('#viz-speed', '200');
        await page.click('#viz-play');
        await page.waitForTimeout(1300);
        await page.click('#viz-pause');
        const at = await text('#viz-counter');
        expect(!at.startsWith('Step 1 '), 'did not advance');
        await page.waitForTimeout(500);
        expect(await text('#viz-counter') === at, 'did not pause');
    });

    await step('Visualization rejects invalid input', async () => {
        await page.fill('#viz-input', '90, abc');
        await page.click('#viz-start');
        await page.waitForTimeout(300);
        expect((await toast()).includes('not a valid mark'), 'no error');
    });

    await step('Visualization from database students', async () => {
        await page.click('text=From database');
        await page.waitForTimeout(1000);
        expect(await page.locator('#viz-array .viz-bar').count() === 16, 'expected 16 bars');
        expect(await page.locator('#viz-tree .tree-node').count() >= 1, 'tree');
    });

    await step('Performance: Merge Sort scalability run', async () => {
        await nav('performance');
        await page.click('#perf-all-btn');
        await page.waitForSelector('#perf-chart svg', { timeout: 60000 });
        expect(await page.locator('#perf-results tbody tr').count() === 7, 'rows');
        expect(!(await text('#perf-results')).includes('✗'), 'incorrect sort');
    });

    await step('Performance: comparison with Bubble, Selection, Insertion', async () => {
        await page.selectOption('#compare-order', 'reverse');
        await page.click('#compare-btn');
        await page.waitForSelector('#compare-chart svg', { timeout: 180000 });
        expect(await page.locator('#compare-results tbody tr').count() === 5, 'compare rows');
        expect((await text('#compare-insight')).includes('slower than Merge Sort'), 'insight');
        await page.click('.chip[data-metric="comparisons"]');
        expect((await text('#compare-chart')).includes('Comparisons'), 'metric toggle');
    });

    if (process.env.SIMULATE_DB_OUTAGE === '1') {
        await step('Database outage shows banner, Retry recovers', async () => {
            execSync('service postgresql stop');
            await nav('students');
            await page.waitForTimeout(1500);
            expect(await page.locator('#conn-banner:not([hidden])').count() === 1, 'no banner');
            expect((await text('#conn-banner-text')).includes('PostgreSQL'), 'banner text: ' + await text('#conn-banner-text'));
            execSync('service postgresql start');
            await page.click('#conn-banner >> text=Retry');
            await page.waitForSelector('#db-status.ok', { timeout: 15000 });
            expect(await page.locator('#conn-banner[hidden]').count() === 1, 'banner still shown');
        });
    }

    await step('Mobile layout: menu toggle opens navigation, no sideways scroll', async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.click('#nav-toggle');
        await page.click('.nav-btn[data-section="students"]');
        await page.waitForTimeout(500);
        expect(await page.locator('#students.active').count() === 1, 'mobile nav');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        expect(!overflow, 'horizontal page scroll on phone');
    });

    await step('No JavaScript errors during the whole run', async () => {
        expect(errors.length === 0, errors.join(' | '));
    });

    // Leave the demo data in place: remove the test students, keep the sample class
    await page.evaluate(async () => {
        const list = (await (await fetch('/api/students')).json()).students;
        for (const s of list) if (s.roll >= 201 && s.roll <= 204) await fetch(`/api/students/${s.id}`, { method: 'DELETE' });
    });

    await browser.close();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})();
