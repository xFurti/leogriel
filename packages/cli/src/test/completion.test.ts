import test from 'node:test';
import assert from 'node:assert/strict';
import { bashCompletion, powerShellCompletion, zshCompletion } from '../commands/completion.js';

test('generates completion scripts for supported shells', () => {
  assert.match(bashCompletion(), /complete -F _leogriel leogriel/);
  assert.match(zshCompletion(), /#compdef leogriel/);
  assert.match(powerShellCompletion(), /Register-ArgumentCompleter/);
  for (const output of [bashCompletion(), zshCompletion(), powerShellCompletion()]) {
    assert.match(output, /outdated/);
    assert.match(output, /claude-code/);
  }
});
