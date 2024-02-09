/* eslint-disable no-continue */
/* eslint-disable no-await-in-loop */
// schedule to generate invoices
const cron = require('node-cron');
const { repositories } = require('ottstream.dataaccess');
const logger = require('../../utils/logger/logger');
const config = require('../../config/config.js');
// eslint-disable-next-line no-unused-vars

const { clientPaymentMethodRepository, clientRepository, ottProviderPaymentGatewayRepository } = repositories;

// eslint-disable-next-line no-unused-vars
const processCards = async () => {
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
    const clientPaymentMethods = await clientPaymentMethodRepository.getList({}, [{ path: 'clientId' }]);
    // eslint-disable-next-line no-restricted-syntax
    for (const paymentMethod of clientPaymentMethods) {
      const clientProviderId = paymentMethod?.clientId?.provider?.toString();
      if (!clientProviderId) {
        logger.warn(`client payment method has no client binded to it paymentMethodId ${paymentMethod._id.toString()}`);
        continue;
      }
      if (!paymentMethod.creditCard || !paymentMethod.creditCard.cardNumber) continue;
      const providerGateways = paymentGatewaysDict[clientProviderId];
      if (!providerGateways || !providerGateways.length) {
        logger.warn(`client payment method provider has no gateway ${paymentMethod._id.toString()}`);
        continue;
      }
      const providerGateway = providerGateways[0];
      if (providerGateway.cards === 'clover' && providerGateway.clover?.isValid) {
        // TODO get client paymentMethods with populated client
        if (
          !paymentMethod.cloverId ||
          !paymentMethod.cloverProviderId ||
          paymentMethod.cloverProviderId.toString() !== clientProviderId
        ) {
          if (paymentMethod.isValid) {
            logger.warn(`client payment method gateway changed, need type card again (now clover)`);
            await clientPaymentMethodRepository.updateClientPaymentMethodById(paymentMethod._id.toString(), {
              isValid: false,
              validationMessage: `provider's paymentgateway changed to clover`,
            });
          }
        } else if (!paymentMethod.isValid) {
          await clientPaymentMethodRepository.updateClientPaymentMethodById(paymentMethod._id.toString(), {
            isValid: true,
            validationMessage: ``,
          });
        }
        // check provider and cloverId
      } else if (providerGateway.cards === 'square' && providerGateway.square?.isValid) {
        // TODO get client paymentMethods with populated client
        if (
          !paymentMethod.squareId ||
          !paymentMethod.squareProviderId ||
          paymentMethod.squareProviderId.toString() !== clientProviderId
        ) {
          if (paymentMethod.isValid) {
            logger.warn(`client payment method gateway changed, need type card again (now square)`);
            await clientPaymentMethodRepository.updateClientPaymentMethodById(paymentMethod._id.toString(), {
              isValid: false,
              validationMessage: `provider's paymentgateway changed to square`,
            });
          }
        } else if (!paymentMethod.isValid) {
          await clientPaymentMethodRepository.updateClientPaymentMethodById(paymentMethod._id.toString(), {
            isValid: true,
            validationMessage: ``,
          });
        }
        // check provider and squareId
      } else if (providerGateway.cards === 'authorize' && providerGateway.authorize?.isValid) {
        // TODO get client paymentMethods with populated client
        if (
          !paymentMethod.authorizeId ||
          !paymentMethod.authorizeProviderId ||
          paymentMethod.authorizeProviderId.toString() !== clientProviderId
        ) {
          if (paymentMethod.isValid) {
            logger.warn(`client payment method gateway changed, need type card again (now authorize)`);
            await clientPaymentMethodRepository.updateClientPaymentMethodById(paymentMethod._id.toString(), {
              isValid: false,
              validationMessage: `provider's paymentgateway changed to authorize`,
            });
          }
        } else if (!paymentMethod.isValid) {
          await clientPaymentMethodRepository.updateClientPaymentMethodById(paymentMethod._id.toString(), {
            isValid: true,
            validationMessage: ``,
          });
        }
      }
    }
    logger.info(`cron job: processing cards`);
  } catch (exception) {
    logger.error(exception, true);
  }
};

const cardProcessorCronWorker = async () => {
  if (config.hosted.processCards) {
    logger.info(`cron job: processing cards..`);
    await processCards();
  }
};

const cardProcessorCron = async () => {
  const callMinutes = '*/5 * * * *';
  await cardProcessorCronWorker();
  cron.schedule(callMinutes, async () => {
    await cardProcessorCronWorker();
  });
};

module.exports = {
  cardProcessorCron,
};
