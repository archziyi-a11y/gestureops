import { fileURLToPath } from 'node:url';
import { readReportCards } from '../src/domain/report-card-observations.js';

const result = await readReportCards({ root: fileURLToPath(new URL('../', import.meta.url)) });
console.log(JSON.stringify(result, null, 2));
if (result.cards.some(card => card.status !== 'observed' || card.issue)) process.exitCode = 1;
