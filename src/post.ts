import * as core from '@actions/core';
import * as exec from '@actions/exec';
const configPath = core.getState(`configPath`);
await core.group(`Container logs`, () => exec.exec('docker', [
   'compose',
   '-f',
   configPath,
   'logs',
]));
await core.group('Teardown', () => exec.exec('docker', [
   'compose',
   '-f',
   configPath,
   'down',
   '-v',
   '--remove-orphans',
]));
