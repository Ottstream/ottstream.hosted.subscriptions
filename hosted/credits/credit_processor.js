// schedule to generate invoices
const cron = require('node-cron');
const logger = require('../../utils/logger/logger');
const config = require('../../config/config.js');
const { repositories } = require('ottstream.dataaccess');

const { creditRepository, ottProviderRepository, clientRepository } = repositories;
const {service} = require('ottstream.service');
const serviceCollection = service.collectionService;
// const balanceRepository = require('../../repository/payment/balance.repository');

// eslint-disable-next-line no-unused-vars
const addCredit = async (providerId, clientId, amount, creditId, balance) => {
  let result;
  if (providerId) {
    // eslint-disable-next-line no-await-in-loop
    result = await ottProviderRepository.addBalance(providerId, amount);
  }
  if (clientId) {
    // eslint-disable-next-line no-await-in-loop
    result = await clientRepository.addBalance(clientId, amount);
  }
  // eslint-disable-next-line no-await-in-loop
  await creditRepository.updateCreditById(creditId, {
    paymentState: 2,
  });
  const res = serviceCollection.getService('socketService');
  res.send(result.id, 'user', {
    balance,
  });
};

// eslint-disable-next-line no-unused-vars
const payCredit = async (providerId, clientId, amount, creditId, balance) => {
  let result;
  if (providerId) {
    // eslint-disable-next-line no-await-in-loop
    result = await ottProviderRepository.addBalance(providerId, -amount);
  }
  if (clientId) {
    // eslint-disable-next-line no-await-in-loop
    result = await clientRepository.addBalance(clientId, -amount);
  }
  // eslint-disable-next-line no-await-in-loop
  await creditRepository.updateCreditById(creditId, {
    paymentState: 1,
    state: 0,
  });
  const res = serviceCollection.getService('socketService');
  res.send(result.id, 'user', {
    balance,
  });
};

// eslint-disable-next-line no-unused-vars
const processCreditPayments = async () => {
  return;
  // eslint-disable-next-line no-unreachable
  try {
    const filter = {
      state: 1,
    };
    const creditList = await creditRepository.queryCredits(filter, {});
    logger.info(`number of credits ${creditList.length}`);
    if (creditList && creditList.results && creditList.results.length) {
      // eslint-disable-next-line no-restricted-syntax
      for (const result of creditList.results) {
        const now = new Date();
        const payed = result.paymentState;
        const creditState = result.state;
        const startDate = result.creditStartDate;
        const days = result.creditTerm;
        const endDate = new Date(startDate);
        // get end Date
        if (result.days) {
          endDate.setDate(endDate.getDate() + days);
        } else {
          endDate.setMonth(endDate.getMonth() + days);
        }
        if (now >= startDate && now < endDate) {
          if (creditState === 1) {
            if (payed === 2) {
              // eslint-disable-next-line no-await-in-loop
              // await addCredit(
              //   result.providerId ? result.providerId : null,
              //   result.clientId ? result.clientId : null,
              //   result.creditAmount,
              //   result.id
              // );
            }
          }
        }
        if (now >= endDate) {
          if (creditState === 1) {
            // eslint-disable-next-line no-await-in-loop
            // await payCredit(
            //   result.providerId ? result.providerId : null,
            //   result.clientId ? result.clientId : null,
            //   result.creditAmount,
            //   result.id
            // );
          }
        }
        if (now < startDate) {
          // TODO nothing
        }
      }
    }
  } catch (exception) {
    logger.error(exception, true);
  }
};

const creditProcessorCronWorker = async () => {
  if (config.hosted.processCredits) {
    logger.info(`cron job: processing credits..`);
    await processCreditPayments();
  }
};

const creditProcessorCron = async () => {
  const callMinutes = '*/5 * * * *';
  await creditProcessorCronWorker();
  cron.schedule(callMinutes, async () => {
    await creditProcessorCronWorker();
  });
};

module.exports = {
  creditProcessorCron,
};
