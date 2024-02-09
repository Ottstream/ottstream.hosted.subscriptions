/* eslint-disable no-restricted-syntax */
/* eslint-disable no-continue */
/* eslint-disable no-await-in-loop */
// schedule to generate invoices
const cron = require('node-cron');
const { repositories } = require('ottstream.dataaccess');
const logger = require('../../utils/logger/logger');
const config = require('../../config/config.js');

// eslint-disable-next-line no-unused-vars
const { clientPaymentMethodRepository, clientRepository, ottProviderPaymentGatewayRepository } = repositories;
// const AuthorizeService = require('../../services/payment/merchant/authorize.service');
const { service } = require('ottstream.service');
const AuthorizeService = service.paymentMerchantAuthorizeService;

// eslint-disable-next-line no-unused-vars
const processAuthorize = async () => {
  // TODO generate notification of comment and send to user
  // eslint-disable-next-line no-empty
  try {
    const paymentGateways = await ottProviderPaymentGatewayRepository.getList();
    const paymentGatewaysDict = paymentGateways.reduce((obj, item) => {
      // eslint-disable-next-line no-param-reassign
      if (item.providerId) {
        if (!obj[item.providerId.toString()]) {
          // eslint-disable-next-line no-param-reassign
          obj[item.providerId.toString()] = [];
        }
        obj[item.providerId.toString()].push(item);
      }
      return obj;
    }, {});
    for (const providerId of Object.keys(paymentGatewaysDict)) {
      const paymentGateway = paymentGatewaysDict[providerId][0];
      if (!paymentGateway.authorize || !paymentGateway.authorize?.isValid) {
        continue;
      }
      const apiLoginId = paymentGateway?.authorize?.apiLoginId;
      const transactionKey = paymentGateway?.authorize?.transactionKey;
      const providerAuthorizeTransactions = await AuthorizeService.getUnsetteledTransactions(apiLoginId, transactionKey);
      if (!providerAuthorizeTransactions.status) {
        logger.info(providerAuthorizeTransactions.message);
      }
      logger.info(`authorize processor: unsetteled list received`);
    }
    logger.info(`cron job: processing cards`);
  } catch (exception) {
    logger.error(exception, true);
  }
};

const authorizeProcessorCronWorker = async () => {
  if (config.hosted.processAuthorize) {
    logger.info(`cron job: processing authorize payments..`);
    await processAuthorize();
  }
};

const authorizeProcessorCron = async () => {
  const callMinutes = '*/5 * * * *';
  await authorizeProcessorCronWorker();
  cron.schedule(callMinutes, async () => {
    await authorizeProcessorCronWorker();
  });
};

module.exports = {
  authorizeProcessorCron,
};
