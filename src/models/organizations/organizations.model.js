'use strict';

import Sequelize from 'sequelize';
import _ from 'lodash';

const { Model } = Sequelize;

import { sequelize } from '../../database';

import datalayer from '../../datalayer';
import { logger } from '../../logger.js';
import { FileStore, Staging } from '../';

import { getDefaultOrganizationList } from '../../utils/data-loaders';

import { getDataModelVersion } from '../../utils/helpers';

import { CONFIG } from '../../user-config';

import ModelTypes from './organizations.modeltypes.cjs';

class Organization extends Model {
  static async getHomeOrg(includeAddress = true) {
    const myOrganization = await Organization.findOne({
      where: { isHome: true },
      raw: true,
    });

    if (myOrganization && myOrganization.metadata) {
      const parsedMetadata = JSON.parse(myOrganization.metadata);

      // Add each key from parsedMetadata to myOrganization
      for (const key in parsedMetadata) {
        if (Object.prototype.hasOwnProperty.call(parsedMetadata, key)) {
          myOrganization[key] = parsedMetadata[key];
        }
      }

      // Optionally, you can delete the original metadata property
      delete myOrganization.metadata;
    }

    if (myOrganization && includeAddress) {
      myOrganization.xchAddress = await datalayer.getPublicAddress();
      myOrganization.fileStoreSubscribed = true;
      return myOrganization;
    }

    if (myOrganization) {
      const pendingCommitsCount = await Staging.count({
        where: { commited: true },
      });

      myOrganization.synced =
        myOrganization.synced === 1 && pendingCommitsCount === 0;
    }

    return myOrganization;
  }

  static async getOrgsMap() {
    const organizations = await Organization.findAll({
      attributes: [
        'orgUid',
        'orgHash',
        'name',
        'icon',
        'prefix',
        'isHome',
        'subscribed',
        'synced',
        'fileStoreSubscribed',
        'registryId',
        'registryHash',
        'sync_remaining',
      ],
    });

    for (let i = 0; i < organizations.length; i++) {
      if (organizations[i].dataValues.isHome) {
        organizations[i].dataValues.xchAddress =
          await datalayer.getPublicAddress();
        organizations[i].dataValues.balance =
          await datalayer.getWalletBalance();

        const pendingCommitsCount = await Staging.count({
          where: { commited: true },
        });

        organizations[i].dataValues.synced =
          organizations[i].dataValues.synced === true &&
          pendingCommitsCount === 0;
        break;
      }
    }

    return organizations.reduce((map, current) => {
      map[current.orgUid] = current.dataValues;

      return map;
    }, {});
  }

  static async createHomeOrganization({
    name,
    prefix = '0',
    icon,
    dataVersion = 'v1',
  }) {
    try {
      logger.info('Creating New Organization, This could take a while.');
      const myOrganization = await Organization.getHomeOrg();

      if (myOrganization) {
        return myOrganization.orgUid;
      }

      await Organization.create({
        orgUid: 'PENDING',
        registryId: null,
        isHome: true,
        subscribed: false,
        name: '',
        icon: '',
      });

      const newOrganizationId = CONFIG().CADT.USE_SIMULATOR
        ? 'f1c54511-865e-4611-976c-7c3c1f704662'
        : await datalayer.createDataLayerStore();

      const newRegistryId = await datalayer.createDataLayerStore();
      const registryVersionId = await datalayer.createDataLayerStore();
      const fileStoreId = await datalayer.createDataLayerStore();

      const revertOrganizationIfFailed = async () => {
        logger.info('Reverting Failed Organization');
        await Promise.all([
          Organization.destroy({ where: { orgUid: newOrganizationId } }),
          Organization.destroy({ where: { orgUid: 'PENDING' } }),
        ]);
      };

      if (!CONFIG().CADT.USE_SIMULATOR) {
        await new Promise((resolve) => setTimeout(() => resolve(), 30000));
        await datalayer.waitForAllTransactionsToConfirm();
      }

      // sync the organization store
      await datalayer.syncDataLayer(
        newOrganizationId,
        {
          registryId: newRegistryId,
          fileStoreId,
          name,
          icon,
          prefix,
        },
        revertOrganizationIfFailed,
      );

      if (!CONFIG().CADT.USE_SIMULATOR) {
        await new Promise((resolve) => setTimeout(() => resolve(), 30000));
        await datalayer.waitForAllTransactionsToConfirm();
      }

      //sync the registry store
      await datalayer.syncDataLayer(
        newRegistryId,
        {
          [dataVersion]: registryVersionId,
        },
        revertOrganizationIfFailed,
      );

      await new Promise((resolve) => setTimeout(() => resolve(), 30000));
      await datalayer.waitForAllTransactionsToConfirm();

      await Promise.all([
        Organization.create({
          orgUid: newOrganizationId,
          registryId: registryVersionId,
          isHome: true,
          subscribed: CONFIG().CADT.USE_SIMULATOR,
          fileStoreId,
          name,
          icon,
          prefix,
        }),
        Organization.destroy({ where: { orgUid: 'PENDING' } }),
      ]);

      const onConfirm = () => {
        logger.info('Organization confirmed, you are ready to go');
        Organization.update(
          {
            subscribed: true,
          },
          { where: { orgUid: newOrganizationId } },
        );
      };

      if (!CONFIG().CADT.USE_SIMULATOR) {
        logger.info('Waiting for New Organization to be confirmed');
        datalayer.getStoreData(
          newRegistryId,
          onConfirm,
          revertOrganizationIfFailed,
        );
      } else {
        onConfirm();
      }

      return newOrganizationId;
    } catch (error) {
      console.trace(error);
      logger.error(error.message);
      logger.info('Reverting Failed Organization');
      await Organization.destroy({ where: { isHome: true } });
    }
  }

  static async appendNewRegistry(registryId, dataVersion) {
    const registryVersionId = await datalayer.createDataLayerStore();
    await datalayer.syncDataLayer(registryId, {
      [dataVersion]: registryVersionId,
    });

    return registryVersionId;
  }

  static async addMirror(storeId, url, force = false) {
    await datalayer.addMirror(storeId, url, force);
  }

  static async importHomeOrg(orgUid) {
    const orgData = await datalayer.getLocalStoreData(orgUid);

    if (!orgData) {
      throw new Error('Your node does not have write access to this orgUid');
    }

    const orgDataObj = orgData.reduce((obj, curr) => {
      obj[curr.key] = curr.value;
      return obj;
    }, {});

    const registryData = await datalayer.getLocalStoreData(
      orgDataObj.registryId,
    );

    const registryDataObj = registryData.reduce((obj, curr) => {
      obj[curr.key] = curr.value;
      return obj;
    }, {});

    const dataModelVersion = getDataModelVersion();

    if (!registryDataObj[dataModelVersion]) {
      registryDataObj[dataModelVersion] = await Organization.appendNewRegistry(
        orgDataObj.registryId,
        dataModelVersion,
      );
    }

    await Organization.upsert({
      orgUid,
      name: orgDataObj.name,
      icon: orgDataObj.icon,
      registryId: registryDataObj[dataModelVersion],
      subscribed: true,
      isHome: true,
    });
  }

  static async importOrganization(orgUid) {
    try {
      const orgData = await datalayer.getSubscribedStoreData(orgUid);

      if (!orgData.registryId) {
        throw new Error(
          'Corrupted organization, no registryId on the datalayer, can not import',
        );
      }

      logger.info(`IMPORTING REGISTRY: ${orgData.registryId}`);

      const registryData = await datalayer.getSubscribedStoreData(
        orgData.registryId,
      );

      const dataModelVersion = getDataModelVersion();

      if (!registryData[dataModelVersion]) {
        throw new Error(
          `Organization has no registry for the ${dataModelVersion} datamodel, can not import`,
        );
      }

      logger.info(`IMPORTING REGISTRY ${dataModelVersion}: `, registryData.v1);

      await datalayer.subscribeToStoreOnDataLayer(registryData.v1);

      logger.info({
        orgUid,
        name: orgData.name,
        icon: orgData.icon,
        registryId: registryData[dataModelVersion],
        subscribed: true,
        isHome: false,
      });

      await Organization.upsert({
        orgUid,
        name: orgData.name,
        icon: orgData.icon,
        registryId: registryData[dataModelVersion],
        subscribed: true,
        isHome: false,
      });

      if (CONFIG().CADT.AUTO_SUBSCRIBE_FILESTORE) {
        await FileStore.subscribeToFileStore(orgUid);
      }
    } catch (error) {
      logger.info(error.message);
    }
  }

  static async subscribeToOrganization(orgUid) {
    const exists = await Organization.findOne({ where: { orgUid } });
    if (exists) {
      await Organization.update({ subscribed: true }, { where: { orgUid } });
    } else {
      throw new Error(
        'Can not subscribe, please import this organization first',
      );
    }
  }

  static async unsubscribeToOrganization(orgUid) {
    await Organization.update({ subscribed: false }, { orgUid });
  }

  /**
   * Synchronizes metadata for all subscribed organizations.
   */
  static async syncOrganizationMeta() {
    try {
      const allSubscribedOrganizations = await Organization.findAll({
        where: { subscribed: true },
        raw: true,
      });

      for (const organization of allSubscribedOrganizations) {
        const processData = (data, keyFilter) =>
          data
            .filter(({ key }) => keyFilter(key))
            .reduce(
              (update, { key, value }) => ({ ...update, [key]: value }),
              {},
            );

        const onFail = async (message) => {
          logger.info(`Unable to sync metadata from ${organization.orgUid}`);
          logger.error(`ORGANIZATION DATA SYNC ERROR: ${message}`);
          await Organization.update(
            { orgHash: '0' },
            { where: { orgUid: organization.orgUid } },
          );
        };

        const onResult = async (updateHash, data) => {
          try {
            const updateData = processData(
              data,
              (key) => !key.includes('meta_'),
            );
            const metadata = processData(data, (key) => key.includes('meta_'));

            await Organization.update(
              {
                ..._.omit(updateData, ['registryId']),
                prefix: updateData.prefix || '0',
                metadata: JSON.stringify(metadata),
              },
              { where: { orgUid: organization.orgUid } },
            );

            logger.debug(
              `Updating orgUid ${organization.orgUid} with hash ${updateHash}`,
            );
            await Organization.update(
              { orgHash: updateHash },
              { where: { orgUid: organization.orgUid } },
            );
          } catch (error) {
            logger.info(error.message);
            onFail(error.message);
          }
        };

        await datalayer.getStoreIfUpdated(
          organization.orgUid,
          organization.orgHash,
          onResult,
          onFail,
        );
      }
    } catch (error) {
      logger.error(error.message);
    }
  }

  static async subscribeToDefaultOrganizations() {
    try {
      const defaultOrgs = await getDefaultOrganizationList();
      if (!Array.isArray(defaultOrgs)) {
        throw new Error(
          'ERROR: Default Organization List Not found, This instance may be missing data from default orgs',
        );
      }

      for (let i = 0; i < defaultOrgs.length; i++) {
        const org = defaultOrgs[i];
        const exists = await Organization.findOne({
          where: { orgUid: org.orgUid },
        });

        if (!exists) {
          await Organization.importOrganization(org.orgUid);
        }
      }
    } catch (error) {
      logger.info(error);
    }
  }

  static async editOrgMeta({ name, icon, prefix }) {
    const myOrganization = await Organization.getHomeOrg();
    const payload = {};

    if (name) {
      payload.name = name;
    }

    if (icon) {
      payload.icon = icon;
    }

    if (prefix) {
      payload.prefix = prefix;
    }

    await datalayer.upsertDataLayer(myOrganization.orgUid, payload);
  }

  static async addMetadata(payload) {
    // These first 3 steps update the datalayer as normal
    const myOrganization = await Organization.getHomeOrg();

    const metadataForDatalayer = _.mapKeys(
      payload,
      (_value, key) => `meta_${key}`,
    );

    await datalayer.upsertDataLayer(
      myOrganization.orgUid,
      metadataForDatalayer,
    );

    // These next steps update the metadata column in the database
    // Normally we would just update the datalayer and let the sync process
    // update the database, but we want to update the database immediately

    const existingOrganization = await Organization.findOne({
      attributes: ['metadata'],
      where: { orgUid: myOrganization.orgUid },
      raw: true,
    });

    const existingMetadata = JSON.parse(existingOrganization.metadata || '{}');

    // Prefix keys with "meta_" in the payload for the database update
    const payloadForDatabase = _.mapKeys(
      payload,
      (_value, key) => `meta_${key}`,
    );

    // Merge the existing metadata with the new payload
    const updatedMetadata = { ...existingMetadata, ...payloadForDatabase };

    // Convert the updated metadata back to JSON string
    const updatedMetadataJson = JSON.stringify(updatedMetadata);

    // Update the metadata column in the database
    await Organization.update(
      { metadata: updatedMetadataJson },
      { where: { orgUid: myOrganization.orgUid } },
    );
  }

  static async removeMirror(storeId, coinId) {
    datalayer.removeMirror(storeId, coinId);
  }
}

Organization.init(ModelTypes, {
  sequelize,
  modelName: 'organization',
  timestamps: true,
});

export { Organization };
