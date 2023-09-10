import * as tc from '@actions/tool-cache';
import * as core from '@actions/core';
import { chmod } from 'fs/promises';

const baedekerVersion = core.getInput('version');
const useCache = core.getBooleanInput('useCache');

core.startGroup('Discovering baedeker');
let foundBaedeker = tc.find('baedeker', baedekerVersion);
if (!foundBaedeker || !useCache) {
   core.info('Not found in cache, downloading');
   const baedekerPath = await tc.downloadTool(`https://github.com/UniqueNetwork/baedeker/releases/download/${baedekerVersion}/baedeker`);
   await chmod(baedekerPath, 0o775);
   foundBaedeker = await tc.cacheFile(baedekerPath, 'baedeker', 'Baedeker', baedekerVersion);
}

core.info(`Baedeker found in ${foundBaedeker}`);
core.addPath(foundBaedeker);
core.endGroup();
