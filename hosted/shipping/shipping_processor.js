/* eslint-disable no-await-in-loop */
// schedule to generate invoices
const cron = require('node-cron');
const { repositories } = require('ottstream.dataaccess');
const logger = require('../../utils/logger/logger');
// eslint-disable-next-line no-unused-vars

const { shippingRepository, ottProviderShippingProviderRepository } = repositories;

const {service } = require('ottstream.service');
const ShippingService = service.shippingService;
const CacheService = service.cacheService;
const EasyshipService = service.shipingMerchantService;

// const ShippingService = require('../../services/shiping/shipping.service');
// const CacheService = require('../../services/cache/CacheService');
// const NotificationService = require('../../services/notification/notification.service');

const config = require('../../config/config.js');
// const EasyshipService = require('../../services/shiping/merchant/easyship.service');
// eslint-disable-next-line no-unused-vars
const processShippings = async () => {
  // TODO generate notification of comment and send to user
  // eslint-disable-next-line no-empty
  try {
    const shippingGateways = await ottProviderShippingProviderRepository.getList({});
    const balanceUpdated = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const shippingGateway of shippingGateways) {
      if (shippingGateway.easyship && shippingGateway.easyship.productionToken && shippingGateway.easyship.isValid) {
        const provider = shippingGateway.providerId;
        await ShippingService.syncEasyshipShippings(provider);

        const providerId = shippingGateway.providerId.toString();
        const shippingResponse = await EasyshipService.getBalance(shippingGateway.easyship?.productionToken);
        if (shippingResponse.status) {
          const cacheKey = `provider-easyship-info-${providerId}`;
          let saveData = {};
          if (await CacheService.hasKey(cacheKey)) {
            saveData = await CacheService.get(cacheKey);
          }
          saveData.balance = shippingResponse.data.credit.available_balance;
          const postalData = await CacheService.set(cacheKey, saveData, 1000);
          balanceUpdated.push(postalData);
        }
      }
    }

    logger.info(`shipping balances updated ${balanceUpdated.length}`);
    logger.info(`shippings are synced...`);
  } catch (exception) {
    logger.error(exception, true);
  }
};

const shippingProcessorCronWorker = async () => {
  if (config.hosted.processShippings) {
    logger.info(`cron job: processing shippings..`);
    await processShippings();
  }
};

const shippingProcessorCron = async () => {
  const callMinutes = '*/1 * * * *';
  await shippingProcessorCronWorker();
  cron.schedule(callMinutes, async () => {
    await shippingProcessorCronWorker();
  });
};

module.exports = {
  shippingProcessorCron,
};
