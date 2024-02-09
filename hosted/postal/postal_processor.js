/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
// schedule to generate invoices
const cron = require('node-cron');
const { repositories } = require('ottstream.dataaccess');
const logger = require('../../utils/logger/logger');
const config = require('../../config/config.js');

const {service } = require('ottstream.service');
const CacheService = service.cacheService;
const PostalMethodService = service.postalService
// const CacheService = require('../../services/cache/CacheService');

// eslint-disable-next-line no-unused-vars
const { invoiceRepository, ottProviderOtherApiRepository, ottProviderInvoiceRepository } = repositories;
// const EasyshipService = require('../../services/shiping/merchant/easyship.service');
// const PostalMethodService = require('../../services/postal/postal.service');
// const NotificationService = require('../../services/notification/notification.service');

// eslint-disable-next-line no-unused-vars
const processPostals = async () => {
  // TODO generate notification of comment and send to user
  // eslint-disable-next-line no-empty
  try {
    let processedDocsCounts = 0;
    const postalInvoices = await invoiceRepository.getList({
      $and: [{ postalMethodStatus: { $nin: ['Cancelled', null] } }],
    });
    // // eslint-disable-next-line no-restricted-syntax
    for (const invoice of postalInvoices) {
      if (invoice.postalMethodStatus === 'InProcess' || invoice.postalMethodStatus === 'Processed') {
        const otherApis = await ottProviderOtherApiRepository.getOttProviderOtherApiByProviderId(invoice.provider);
        if (otherApis.length && otherApis[0].postal?.secretKey) {
          const secretKey = otherApis[0].postal?.secretKey;
          try {
            const postalResponse = await PostalMethodService.GetStatus(invoice, secretKey);

            if (postalResponse.status) {
              await invoiceRepository.updateInvoiceById(invoice._id.toString(), {
                // postalMethodId: postalResponse.response.data.result.id,
                postalMethodStatus: postalResponse.response.data.result.status[0]?.status,
              });
            }
          } catch (exc) {
            if (typeof exc.status !== 'undefined') {
              await invoiceRepository.updateInvoiceById(invoice._id.toString(), {
                // postalMethodId: postalResponse.response.data.result.id,
                postalMethodStatus: 'Cancelled',
              });
              logger.warn(exc.message);
            } else {
              logger.error(exc);
            }
          }
          processedDocsCounts += 1;
        }
      }
    }

    // balance update part

    const otherApis = await ottProviderOtherApiRepository.getList();
    const balanceUpdated = [];
    for (const otherApi of otherApis) {
      if (otherApi.postal?.secretKey && otherApi.postal?.isValid) {
        const providerId = otherApi.providerId.toString();
        const postalResponse = await PostalMethodService.GetBalance(otherApi.postal?.secretKey);
        if (postalResponse.status && postalResponse.response.status === 200) {
          const cacheKey = `provider-postal-info-${providerId}`;
          let saveData = {};
          if (await CacheService.hasKey(cacheKey)) {
            saveData = await CacheService.get(cacheKey);
          }
          saveData.balance = postalResponse.response.data.result;
          const postalData = await CacheService.set(cacheKey, saveData, 1000);
          balanceUpdated.push(postalData);
        }
      }
    }
    logger.info(`postalmethods: balancesUpdated ${balanceUpdated.length}`);

    logger.info(`postalmethods: overall processed ${processedDocsCounts} all(${postalInvoices.length})`);
  } catch (exception) {
    logger.error(exception, true);
  }
};

const postalMethodsProcessorCronWorker = async () => {
  if (config.hosted.processPostalMethods) {
    logger.info(`cron job: processing postal methods..`);
    await processPostals();
  }
};

const postalProcessorCron = async () => {
  const callMinutes = '*/3 * * * *';
  await postalMethodsProcessorCronWorker();
  cron.schedule(callMinutes, async () => {
    await postalMethodsProcessorCronWorker();
  });
};

module.exports = {
  postalProcessorCron,
};
