/* eslint-disable no-restricted-syntax */
/* eslint-disable no-continue */
/* eslint-disable no-await-in-loop */
// schedule to generate invoices
const cron = require('node-cron');
const { repositories } = require('ottstream.dataaccess');
const logger = require('../../utils/logger/logger');
const config = require('../../config/config.js');
// eslint-disable-next-line no-unused-vars

const { transactionRepository, ottProviderOtherApiRepository } = repositories;

// eslint-disable-next-line no-unused-vars
const processCheckeeper = async () => {
  // TODO generate notification of comment and send to user
  // eslint-disable-next-line no-empty
  try {
    // eslint-disable-next-line no-await-in-loop
    // const paymentGateways = await ottProviderOtherApiRepository.getList();
    // const paymentGatewaysDict = paymentGateways.reduce((obj, item) => {
    //   // eslint-disable-next-line no-param-reassign
    //   if (item.providerId) {
    //     if (!obj[item.providerId.toString()]) {
    //       // eslint-disable-next-line no-param-reassign
    //       obj[item.providerId.toString()] = [];
    //     }
    //     obj[item.providerId.toString()].push(item);
    //   }
    //   return obj;
    // }, {});
    const checkeeperLocalTransactions = await transactionRepository.getList({ 'sourcePay.merchant': 'checkeeper' });
    // const checkeeperLocalTransactionsDict = checkeeperLocalTransactions.reduce((obj, item) => {
    //   // eslint-disable-next-line no-param-reassign
    //   if (item.transactionId) {
    //     if (!obj[item.transactionId]) {
    //       // eslint-disable-next-line no-param-reassign
    //       obj[item.transactionId] = item;
    //     }
    //   }
    //   return obj;
    // }, {});
    // for (const providerId of Object.keys(paymentGatewaysDict)) {
    //   const paymentGateway = paymentGatewaysDict[providerId][0];
    //   if (!paymentGateway.checkeeper || !paymentGateway.checkeeper?.isValid) {
    //     continue;
    //   }
    //   const secretKey = paymentGateway?.checkeeper?.secretKey;
    //   const providerCheckeeperTransactions = await CheckeeperService.getUnsetteledTransactions(secretKey);
    //   if (providerCheckeeperTransactions.status) {
    //     logger.info(providerCheckeeperTransactions.message);

    //     const providerCheckeeperTransactionsDict = providerCheckeeperTransactions.list.reduce((obj, item) => {
    //       // eslint-disable-next-line no-param-reassign
    //       if (item.id) {
    //         if (!obj[item.id]) {
    //           // eslint-disable-next-line no-param-reassign
    //           obj[item.id] = item;
    //         }
    //       }
    //       return obj;
    //     }, {});
    //     for (const checkeeperLocalTransaction of checkeeperLocalTransactions) {
    //       if (
    //         !providerCheckeeperTransactionsDict[checkeeperLocalTransaction.transactionId] &&
    //         checkeeperLocalTransaction.voidable
    //       ) {
    //         // can not void
    //         await transactionRepository.updateOne(
    //           { _id: checkeeperLocalTransaction._id.toString(), state: { $ne: 5 } },
    //           { voidable: false }
    //         );

    //         await BroadcastService.broadcastToProvider(checkeeperLocalTransaction.provider, 'transaction-info', {
    //           status: true,
    //           message: checkeeperLocalTransaction,
    //         });
    //       } else if (
    //         providerCheckeeperTransactionsDict[checkeeperLocalTransaction.transactionId] ||
    //         !checkeeperLocalTransaction.voidable
    //       ) {
    //         await transactionRepository.updateTransactionById(
    //           { _id: checkeeperLocalTransaction._id.toString() },
    //           { voidable: true }
    //         );
    //         await BroadcastService.broadcastToProvider(checkeeperLocalTransaction.provider, 'transaction-info', {
    //           status: true,
    //           message: checkeeperLocalTransaction,
    //         });
    //       }
    //     }
    //   }
    //   logger.info(`checkeeper processor: unsetteled list received`);
    // }
    logger.info(`cron job: checkeeper payments, local checkeeper: ${checkeeperLocalTransactions.length}`);
  } catch (exception) {
    logger.error(exception, true);
  }
};

const checkeeperProcessorCronWorker = async () => {
  if (config.hosted.processCheckeeper) {
    logger.info(`cron job: processing checkeeper payments..`);
    await processCheckeeper();
  }
};

const checkeeperProcessorCron = async () => {
  const callMinutes = '*/5 * * * *';
  await checkeeperProcessorCronWorker();
  cron.schedule(callMinutes, async () => {
    await checkeeperProcessorCronWorker();
  });
};

module.exports = {
  checkeeperProcessorCron,
};
