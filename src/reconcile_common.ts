import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { mkdir, mkdtemp, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

type ReconcilerData = {
   composeProject?: string,
   configPath?: string,
   inputs?: string[],
   tlaStr?: string[],
   tlaCode?: string[],
   jpath?: string[],
   inputModules?: string[],
};

const handleEphemeral = (recon: string[], list: string[], equalsSign: boolean, process: (value: string) => string = v => v) => {
   const raw = [
      ...recon,
      ...list,
   ].filter(v => !v.startsWith('#'));
   const toSave = raw.filter(i => !i.startsWith(equalsSign ? 'ephemeral=' : 'ephemeral:'));
   const toUse = raw.map(i => process(i.replace(equalsSign ? /^ephemeral=/ : /^ephemeral:/, '')));
   return [toSave, toUse];
};

/**
 * Parses either JSON array, or newline-delimited JSON
 * Assumes there is no surrounding whitespace, and there is no internal newline
 * separators in JSON output (So, no pretty-printed jsonNL).
 * If those assumptions are not correct, then it will fail with error, it should not
 * produce corrupted output.
 */
const parseJsonArray = <T>(json: string) => {
   if (json.startsWith('[')) {
      return JSON.parse(json) as T[];
   }

   return json.replace(/\n$/g, '').split('\n').map((line, lineNum) => {
      try {
         return JSON.parse(line) as T;
      } catch (cause) {
         throw new Error(`failed to parse output line ${lineNum}`, {cause})
      }
   })
}

export default async (recon?: ReconcilerData) => {
   if (recon === undefined) {
      recon = {};
   } else {
      if (!recon.composeProject) throw new Error('bad reconciler data');
      // We don't want to mess with Post action.
      await core.group('Ensuring chain is still running', async () => {
         const output = await exec.getExecOutput('docker', [
            'compose',
            'ls',
            '--format',
            'json',
         ]);
         const projects: Array<{ConfigFiles: string; Status: string}> = parseJsonArray(output.stdout);
         for (const project of projects) {
            if ((project.ConfigFiles === recon!.composeProject || project.ConfigFiles === recon!.configPath) && project.Status.startsWith('running(')) return;
         }
         throw new Error('compose project is not running, refusing to start/reconcile');
      });
   }
   const composeProject = recon?.composeProject ?? await mkdtemp(join(process.env.RUNNER_TEMP ?? tmpdir(), 'baedeker-network-'));
   recon.composeProject = composeProject;
   core.saveState('composeProject', composeProject);
   core.setOutput('composeProject', composeProject);
   const composeDiscover = join(composeProject, 'discover.env');
   core.setOutput('composeDiscover', composeDiscover);
   const secretsDir = join(composeProject, 'secrets');
   try {
      await mkdir(secretsDir, {recursive: true});
   } catch (e) {
      // Pass
   }
   const configPath = join(composeProject, 'docker-compose.yml');
   recon.configPath = configPath;
   core.saveState('configPath', configPath);

   const [reconInputs, inputs] = handleEphemeral(recon.inputs ?? [], core.getMultilineInput('inputs'), false);
   recon.inputs = reconInputs;

   const [reconTlaStr, tlaStr] = handleEphemeral(recon.tlaStr ?? [], core.getMultilineInput('tla-str'), true, s => `--tla-str=${s}`);
   recon.tlaStr = reconTlaStr;

   const [reconTlaCode, tlaCode] = handleEphemeral(recon.tlaCode ?? [], core.getMultilineInput('tla-code'), true, s => `--tla-code=${s}`);
   recon.tlaCode = reconTlaCode;

   const [reconJpath, jpath] = handleEphemeral(recon.jpath ?? [], core.getMultilineInput('jpath'), false, s => `-J${s}`);
   recon.jpath = reconJpath;

   const [reconInputModules, inputModules] = handleEphemeral(recon.inputModules ?? [], core.getMultilineInput('input-modules'), false, s => `--input-modules=${s}`);
  recon.inputModules = reconInputModules;

   await core.group('Generating docker-compose', () => exec.exec('baedeker', [
      `--secret=file=${secretsDir}`,
      '--spec=docker',
      `--generator=docker_compose=${composeProject}`,
      `--generator=docker_compose_discover=${composeDiscover}`,
      // '--generator=debug',
      ...inputs,
      ...tlaStr,
      ...tlaCode,
      ...jpath,
      ...inputModules,  
   ], {
      env: {
         RUST_LOG: 'info',
      },
   }));

   await core.group('Launching network', () => exec.exec('docker', [
      'compose',
      '-f',
      configPath,
      'up',
      '-d',
      '--wait',
      '--remove-orphans',
   ]));

   await core.group('Gathering info', async () => {
      const psOutput = await exec.getExecOutput('docker', [
         'compose',
         '-f',
         configPath,
         'ps',
         '--format',
         'json',
      ]);
      const containers: Array<{ ID: string; Service: string }> = parseJsonArray(psOutput.stdout);
      const nginxContainer = containers.find(c => c.Service === 'nginx');
      if (!nginxContainer) {
         core.notice('Nginx container not found, no balancer output will be provided');
         return;
      }

      const inspectOutput = await exec.getExecOutput('docker', [
         'inspect',
         nginxContainer.ID,
      ]);

      // TODO: Also support ipv6-only docker?
      type ContainerInfo = {NetworkSettings: {Networks: Record<string, {IPAddress: string}>}};

      const nginxInspects: ContainerInfo[] = parseJsonArray(inspectOutput.stdout);
      // We're querying by id, so there is only one container.
      const nginxInspect = nginxInspects[0];
      const networks = nginxInspect.NetworkSettings.Networks;
      const primaryNetworkName = Object.keys(networks)[0];
      const ip = networks[primaryNetworkName].IPAddress;
      core.setOutput('balancer', ip);

      try {
         const discover = (await readFile(composeDiscover)).toString('utf8').split('\n').filter(l => l !== '');
         for (const line of discover) {
            const [name, value] = line.split('=', 2);
            const replacedValue = value.replace('BALANCER_URL', ip);
            core.info(`Discovered ${name} = ${replacedValue}`);
            core.exportVariable(name, replacedValue);
         }
      } catch (e: any) {
         core.error('Failed to configure environment:');
         core.error(e);
      }
   });
   return recon;
};
