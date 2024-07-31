import _ from 'lodash';
import { SimpleIntervalJob, Task } from 'toad-scheduler';
import { Governance } from '../models/index.js';
import {
  assertDataLayerAvailable,
  assertWalletIsSynced,
} from '../utils/data-assertions.js';
import { CONFIG } from '../user-config.js';
import { logger } from '../logger.js';
import { Organization } from '../models/index.js';

import dotenv from 'dotenv';
dotenv.config();

const task = new Task('sync-governance-meta', async () => {
  try {
    await assertDataLayerAvailable();
    await assertWalletIsSynced();

    logger.task('Syncing governance data');
    if (CONFIG().CADT.GOVERNANCE.GOVERNANCE_BODY_ID) {
      logger.task(
        `Governance Config Found ${
          CONFIG().CADT.GOVERNANCE.GOVERNANCE_BODY_ID
        }`,
      );

      const myOrganization = await Organization.getHomeOrg();

      if (
        _.get(myOrganization, 'orgUid', '') !==
        CONFIG().CADT.GOVERNANCE.GOVERNANCE_BODY_ID
      ) {
        Governance.sync();
      }
    }
  } catch (error) {
    logger.error(
      `Cant download Goverance data, Retrying in ${
        CONFIG().CADT.TASKS?.GOVERNANCE_SYNC_TASK_INTERVAL || 300
      } seconds`,
      error,
    );
  }
});

const job = new SimpleIntervalJob(
  {
    // DEFAULT 1 day
    seconds: CONFIG().CADT?.TASKS?.GOVERNANCE_SYNC_TASK_INTERVAL || 300,
    runImmediately: true,
  },
  task,
  { id: 'sync-governance-meta', preventOverrun: true },
);

export default job;
