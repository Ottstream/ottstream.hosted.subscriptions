/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
// schedule to generate invoices
const cron = require('node-cron');
const { repositories } = require('ottstream.dataaccess');
const logger = require('../../utils/logger/logger');
const config = require('../../config/config.js');
// eslint-disable-next-line no-unused-vars

const { invoiceRepository, ottProviderOtherApiRepository, ottProviderInvoiceRepository } = repositories;
// const EasyshipService = require('../../services/shiping/merchant/easyship.service');
// const BroadcastService = require('../../services/socket/broadcastService.service');
// const StatisticService = require('../../services/statistics/statistic.service');
const {service } = require('ottstream.service');
const BroadcastService = service.socketBroadcastService;
const StatisticService = service.statisticsService;
// const NotificationService = require('../../services/notification/notification.service');

function divideAndTruncate(x, y) {
  return x / y < 0 ? Math.ceil(x / y) : Math.floor(x / y);
}

// eslint-disable-next-line no-unused-vars
const processInvoicesToSend = async () => {
  // TODO generate notification of comment and send to user
  // eslint-disable-next-line no-empty
  try {
    const otherProviderPaymentGateway = await ottProviderInvoiceRepository.getList();
    const autosendInvoices = await otherProviderPaymentGateway.filter(
      (r) => r.settings && r.settings.autosend && r.settings.postalMethod !== 'manual'
    );
    for (const invoiceSettings of autosendInvoices) {
      // if (invoiceSettings.autosend && invoice.postal) {
      const otherApis = await ottProviderOtherApiRepository.getOttProviderOtherApiByProviderId(invoiceSettings.providerId);
      // eslint-disable-next-line no-continue
      if (!otherApis.length || !otherApis[0].postal?.secretKey) continue;

      // const otherApi = otherApis[0];

      const { autosend } = invoiceSettings.settings;
      const repeatSecondsinterval = (24 / autosend) * 60 * 60;

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const secondsFromStartOfDay = (now - startOfDay) / 1000;
      let leftSeconds = repeatSecondsinterval;
      const devidePart = divideAndTruncate(secondsFromStartOfDay, repeatSecondsinterval);
      if (devidePart < 0) {
        leftSeconds = repeatSecondsinterval - secondsFromStartOfDay;
      } else {
        leftSeconds = (devidePart + 1) * repeatSecondsinterval - secondsFromStartOfDay;
      }

      const saved = await StatisticService.setPostalScheduleInfo(invoiceSettings.providerId.toString(), {
        postalInoviceNextSchedule: leftSeconds * 1000,
      });

      // TODO save in redis cacshe
      await BroadcastService.broadcastToProvider(invoiceSettings.providerId.toString(), 'invoice-schedule-info', saved);
    }
    // let processedDocsCounts = 0;
    // const postalInvoices = await invoiceRepository.getList({ postalMethodStatus: { $ne: null } });
    // // // eslint-disable-next-line no-restricted-syntax
    // for (const invoice of postalInvoices) {
    //   if (invoice.postalMethodStatus === 'InProcess' || invoice.postalMethodStatus === 'Processed') {
    //     const otherApis = await ottProviderOtherApiRepository.getOttProviderOtherApiByProviderId(invoice.provider);
    //     if (otherApis.length && otherApis[0].postal?.secretKey) {
    //       const secretKey = otherApis[0].postal?.secretKey;
    //       try {
    //         const postalResponse = await PostalMethodService.GetStatus(invoice, secretKey);

    //         if (postalResponse.status) {
    //           await invoiceRepository.updateInvoiceById(invoice._id.toString(), {
    //             // postalMethodId: postalResponse.response.data.result.id,
    //             postalMethodStatus: postalResponse.response.data.result.status[0]?.status,
    //           });
    //         }
    //       } catch (exc) {
    //         if (typeof exc.status !== 'undefined') {
    //           await invoiceRepository.updateInvoiceById(invoice._id.toString(), {
    //             // postalMethodId: postalResponse.response.data.result.id,
    //             postalMethodStatus: 'Cancelled',
    //           });
    //           logger.warn(exc.message);
    //         } else {
    //           logger.error(exc);
    //         }
    //       }
    //       processedDocsCounts += 1;
    //     }
    //   }
    // }

    // logger.info(`postalmethods: overall processed ${processedDocsCounts} all(${postalInvoices.length})`);
  } catch (exception) {
    logger.error(exception, true);
  }
};

// eslint-disable-next-line no-unused-vars
const processInvoiceStatistic = async () => {
  // TODO generate notification of comment and send to user
  // eslint-disable-next-line no-empty
  try {
    const billInvoices = await invoiceRepository.getList({ type: 2 });
    const billInvoicesDict = billInvoices.reduce((obj, item) => {
      // eslint-disable-next-line no-param-reassign
      if (!obj[item.provider.toString()]) obj[item.provider.toString()] = [];
      // eslint-disable-next-line no-param-reassign
      obj[item.provider.toString()].push(item);
      return obj;
    }, {});
    for (const providerId of Object.keys(billInvoicesDict)) {
      const providerInvoices = billInvoicesDict[providerId];
      const unsentInvoices = providerInvoices.filter((r) => !r.sent);
      const sentInvoices = providerInvoices.filter((r) => r.sent);

      const unsentQueue = unsentInvoices.length;
      const sentCount = sentInvoices.length;
      const saved = await StatisticService.setPostalScheduleInfo(providerId, {
        provider: providerId,
        sent: sentCount,
        queue: unsentQueue,
      });

      // TODO save in redis cacshe
      await BroadcastService.broadcastToProvider(providerId, 'invoice-schedule-info', saved);
    }
    // let processedDocsCounts = 0;
    // const postalInvoices = await invoiceRepository.getList({ postalMethodStatus: { $ne: null } });
    // // // eslint-disable-next-line no-restricted-syntax
    // for (const invoice of postalInvoices) {
    //   if (invoice.postalMethodStatus === 'InProcess' || invoice.postalMethodStatus === 'Processed') {
    //     const otherApis = await ottProviderOtherApiRepository.getOttProviderOtherApiByProviderId(invoice.provider);
    //     if (otherApis.length && otherApis[0].postal?.secretKey) {
    //       const secretKey = otherApis[0].postal?.secretKey;
    //       try {
    //         const postalResponse = await PostalMethodService.GetStatus(invoice, secretKey);

    //         if (postalResponse.status) {
    //           await invoiceRepository.updateInvoiceById(invoice._id.toString(), {
    //             // postalMethodId: postalResponse.response.data.result.id,
    //             postalMethodStatus: postalResponse.response.data.result.status[0]?.status,
    //           });
    //         }
    //       } catch (exc) {
    //         if (typeof exc.status !== 'undefined') {
    //           await invoiceRepository.updateInvoiceById(invoice._id.toString(), {
    //             // postalMethodId: postalResponse.response.data.result.id,
    //             postalMethodStatus: 'Cancelled',
    //           });
    //           logger.warn(exc.message);
    //         } else {
    //           logger.error(exc);
    //         }
    //       }
    //       processedDocsCounts += 1;
    //     }
    //   }
    // }

    // logger.info(`postalmethods: overall processed ${processedDocsCounts} all(${postalInvoices.length})`);
  } catch (exception) {
    logger.error(exception, true);
  }
};

const invoiceSendCronWorker = async () => {
  if (config.hosted.processInvoices) {
    logger.info(`cron job: processing invoices postal send..`);
    await processInvoicesToSend();
  }
};

const invoiceStatisticCronWorker = async () => {
  if (config.hosted.processInvoices) {
    logger.info(`cron job: processing invoices statistics..`);
    await processInvoiceStatistic();
  }
};

const invoiceProcessorCron = async () => {
  const callMinutes = '*/3 * * * *';
  await invoiceSendCronWorker();
  await invoiceStatisticCronWorker();
  cron.schedule(callMinutes, async () => {
    await invoiceSendCronWorker();
    await invoiceStatisticCronWorker();
  });
};

module.exports = {
  invoiceProcessorCron,
};
