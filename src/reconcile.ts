import reconcile_common from "./reconcile_common.js";
import * as core from '@actions/core';
const reconcile = JSON.parse(core.getInput('baedeker'));
const metadata = await reconcile_common(reconcile);
core.setOutput('baedeker', metadata);
