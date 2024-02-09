/* eslint-disable no-restricted-syntax */
/* eslint-disable no-continue */
/* eslint-disable no-await-in-loop */
// schedule to generate invoices
const cron = require('node-cron');
const { repositories } = require('ottstream.dataaccess');
const logger = require('../../utils/logger/logger');
const config = require('../../config/config.js');
const { service } = require('ottstream.service');
const CloverService = service.paymentMerchantCloverService;
const BroadcastService = service.socketBroadcastService;
// eslint-disable-next-line no-unused-vars
const { ottProviderPaymentGatewayRepository, transactionRepository } = repositories;
// const BroadcastService = require('../../services/socket/broadcastService.service');
// const CloverService = require('../../services/payment/merchant/clover.service');

// eslint-disable-next-line no-unused-vars
const processClover = async () => {
  // TODO generate notification of comment and send to user
  // eslint-disable-next-line no-empty
  try {
    // eslint-disable-next-line no-await-in-loop
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
    const cloverLocalTransactions = await transactionRepository.getList({ 'sourcePay.merchant': 'clover' });
    // const cloverLocalTransactionsDict = cloverLocalTransactions.reduce((obj, item) => {
    //   // eslint-disable-next-line no-param-reassign
    //   if (item.transactionId) {
    //     if (!obj[item.transactionId]) {
    //       // eslint-disable-next-line no-param-reassign
    //       obj[item.transactionId] = item;
    //     }
    //   }
    //   return obj;
    // }, {});
    for (const providerId of Object.keys(paymentGatewaysDict)) {
      const paymentGateway = paymentGatewaysDict[providerId][0];
      if (!paymentGateway.clover || !paymentGateway.clover?.isValid) {
        continue;
      }
      const secretKey = paymentGateway?.clover?.secretKey;
      const providerCloverTransactions = await CloverService.getUnsetteledTransactions(secretKey);
      if (providerCloverTransactions.status) {
        logger.info(providerCloverTransactions.message);

        const providerCloverTransactionsDict = providerCloverTransactions.list.reduce((obj, item) => {
          // eslint-disable-next-line no-param-reassign
          if (item.id) {
            if (!obj[item.id]) {
              // eslint-disable-next-line no-param-reassign
              obj[item.id] = item;
            }
          }
          return obj;
        }, {});
        for (const cloverLocalTransaction of cloverLocalTransactions) {
          if (!providerCloverTransactionsDict[cloverLocalTransaction.transactionId] && cloverLocalTransaction.voidable) {
            // can not void
            await transactionRepository.updateOne(
              { _id: cloverLocalTransaction._id.toString(), state: { $ne: 5 } },
              { voidable: false }
            );

            await BroadcastService.broadcastToProvider(cloverLocalTransaction.provider, 'transaction-info', {
              status: true,
              message: cloverLocalTransaction,
            });
          } else if (
            providerCloverTransactionsDict[cloverLocalTransaction.transactionId] ||
            !cloverLocalTransaction.voidable
          ) {
            await transactionRepository.updateTransactionById(
              { _id: cloverLocalTransaction._id.toString() },
              { voidable: true }
            );
            await BroadcastService.broadcastToProvider(cloverLocalTransaction.provider, 'transaction-info', {
              status: true,
              message: cloverLocalTransaction,
            });
          }
        }
      }
      logger.info(`clover processor: unsetteled list received`);
    }
    logger.info(`cron job: processing cards`);
  } catch (exception) {
    logger.error(exception, true);
  }
};

const cloverProcessorCronWorker = async () => {
  if (config.hosted.processClover) {
    logger.info(`cron job: processing clover payments..`);
    await processClover();
  }
};

const cloverProcessorCron = async () => {
  const callMinutes = '*/5 * * * *';
  await cloverProcessorCronWorker();
  cron.schedule(callMinutes, async () => {
    await cloverProcessorCronWorker();
  });
};

module.exports = {
  cloverProcessorCron,
};
