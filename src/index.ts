import reconcile_common from "./reconcile_common.js";
import * as core from '@actions/core';
const metadata = await reconcile_common();
core.setOutput('baedeker', metadata);
