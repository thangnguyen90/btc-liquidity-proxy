import assert from 'node:assert/strict';
import {injectWickCoinNavigation as inject} from '../src/wickCoinNavigation.js';
const html='<main><a href="/wick-coins">CTA</a></main><nav><a href="/">Home</a></nav><nav aria-label="mobile"><a href="/wick-coins">Old name</a></nav><nav class="pagination">Next</nav>';
const result=inject(html);assert.equal((result.match(/Volume kiểu AIN/g)||[]).length,2);assert.ok(result.includes('<main><a href="/wick-coins">CTA</a></main>'));assert.ok(result.includes('<nav class="pagination">Next</nav>'));assert.equal(inject(result),result);
const legacy='<header><a class="nav-link" href="/">Home</a><a class="nav-link" href="/wick-coins">Old name</a></header>';
const updated=inject(legacy);assert.equal((updated.match(/href="\/wick-coins"/g)||[]).length,1);assert.ok(updated.indexOf('Volume kiểu AIN')<updated.indexOf('Home'));assert.equal(inject(updated),updated);
console.log('PASS: desktop/mobile menus, front placement, CTA isolation, pagination exclusion, no duplicate links');
