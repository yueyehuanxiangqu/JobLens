import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJSONResponse, safeParseJSON } from '../src/shared/schema-validator.js';
import { buildDiagnosticReport } from '../src/shared/diagnostics.js';

test('JSON parsing preserves source strings through safe wrappers and split text parts', () => {
  const value = { quote: 'Dutch (Beginner, actively learning)', text: 'A } bracket and "quote".' };
  const json = JSON.stringify(value);
  for (const input of [json, `\uFEFF${json}`, `\n\x60\x60\x60JSON\n${json}\n\x60\x60\x60`,
    `Here is the JSON:\n${json}\nEnd of response.`,
    [{ type: 'text', text: json.slice(0, 17) }, { type: 'text', text: json.slice(17) }]]) {
    assert.deepEqual(safeParseJSON(input), value);
  }
});

test('malformed, truncated and multiple-root JSON is rejected without semantic repairs or nested salvage', () => {
  for (const input of ['{"score":78,}', '{"score":78', '{"nested":{"score":78}',
    'Here is JSON: {"score":78} {"score":20}', '{"text":"line\nbreak"}']) {
    const parsed = parseJSONResponse(input);
    assert.equal(parsed.value, null);
    assert.equal(parsed.error.kind, 'invalid_json');
  }
  assert.equal(parseJSONResponse('  ').error.kind, 'empty_output');
  assert.equal(parseJSONResponse([]).error.code, 'EMPTY_OUTPUT');
  const diagnostic = parseJSONResponse('{"PRIVATE_CV_TEXT": invalid}');
  assert.equal(JSON.stringify(diagnostic).includes('PRIVATE_CV_TEXT'), false);
  const report = buildDiagnosticReport({ diagnostics: { stage: 'json', failureKind: 'invalid_json',
    jsonAttempts: [{ attempt: 1, outcome: 'invalid_json', code: diagnostic.error.code,
      rawResponse: 'PRIVATE_CV_TEXT', message: 'PRIVATE_CV_TEXT' }] } });
  assert.match(report.nextStep, /contained text/);
  assert.equal(JSON.stringify(report).includes('PRIVATE_CV_TEXT'), false);
});
