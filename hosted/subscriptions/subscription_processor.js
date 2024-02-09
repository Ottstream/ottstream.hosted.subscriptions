/* eslint-disable no-unreachable */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-await-in-loop */
// schedule to generate invoices
const cron = require('node-cron');
const queue = require('queue');
const { repositories } = require('ottstream.dataaccess');
const config = require('../../config/config.js');
const logger = require('../../utils/logger/logger');

const {
  invoiceRepository,
  clientLocationRepository,
  clientRepository,
  ottProviderRepository,
  subscriptionRepository,
  clientPaymentMethodRepository,
  ottProviderPaymentGatewayRepository,
} = repositories;
// const subscriptionRepository = require('../../repository/subscription/subscription.repository');
// eslint-disable-next-line no-unused-vars
const { service } = require('ottstream.service');
const SubscriptionService = service.subscriptionService;
const InvoiceService = service.paymentInvoiceService;
const NotificationService = service.notificationService;
const StatisticService = service.statisticsService
// const SubscriptionService = require('../../services/subscription/subscription.service');
// const clientPaymentMethodRepository = require('../../repository/client/client_payment_method.repository');
// const InvoiceService = require('../../services/payment/invoice.service');
// eslint-disable-next-line no-unused-vars
// const NotificationService = require('../../services/notification/notification.service');
// const ottProviderPaymentGatewayRepository = require('../../repository/ottprovider/ottprovider_payment_gateway.repository');
// eslint-disable-next-line no-unused-vars
// const {
//   clientLocationRepository,
//   // eslint-disable-next-line no-unused-vars
//   invoiceRepository,
//   // eslint-disable-next-line no-unused-vars
//   clientRepository,
//   // eslint-disable-next-line no-unused-vars
//   ottProviderRepository,
//   // eslint-disable-next-line no-unused-vars
//   priceGroupRepository,
// } = require('../../repository');
// const StatisticService = require('../../services/statistics/statistic.service');
// const CacheService = require('../../services/cache/CacheService');
// const AxiosService = require('../../services/shared/axios.service');
// const userRepository = require('../../repository/user/user.repository');
// const { invoiceRepository } = require('../../repository');

const q = queue({ results: [], autostart: true, timeout: 0, concurrency: 1 });

q.on('timeout', function (next, job) {
  logger.warn('task timed out:', job.toString().replace(/\n/g, ''));
  next();
});

// get notified when jobs complete
q.on('success', function (result, job) {
  logger.info('subscription processing task finished processing:', job.toString().replace(/\n/g, ''));
  // logger.info('The result is:', result);
});

// eslint-disable-next-line no-unused-vars
const processSubscriptions = async () => {
  const func = async (cb) => {
    // eslint-disable-next-line no-empty
    try {
      const response = {
        status: false,
        messages: [],
      };
      // ('647c70ece905f463951173ee');
      const subscriptions = await subscriptionRepository.getList({}, [{ path: 'invoice' }, { path: 'returnInvoice' }]);
      const paymentGatewayList = await ottProviderPaymentGatewayRepository.getList();
      const paymentGatewaysGrouped = paymentGatewayList.reduce((result, item) => {
        const key = `${item.providerId.toString()}`;
        if (!result[key]) {
          // eslint-disable-next-line no-param-reassign
          result[key] = item;
        }
        return result;
      }, {});
      const isActives = [];
      const hasExpires = [];
      const groupedSubscriptions = subscriptions.reduce((result, item) => {
        const key = `${item.client.toString()}-${item.location.toString()}`;
        if (!result[key]) {
          // eslint-disable-next-line no-param-reassign
          result[key] = [];
        }
        result[key].push(item);
        return result;
      }, {});
      if (!config.subscription.generate_invoice) {
        logger.info(`invoice generation is not enabled...`);
      }
      let generatedLeftInvoiceCount = 0;
      const countAlreadyGenerated = 0;
      let generatedRecurringInvoiceCount = 0;
      const sererStatistics = { activeLocations: 0, recurrings: [] };
      // eslint-disable-next-line no-restricted-syntax
      for (const groupedSubscriptionKey in groupedSubscriptions) {
        // eslint-disable-next-line no-prototype-builtins
        if (!groupedSubscriptions.hasOwnProperty(groupedSubscriptionKey)) {
          // eslint-disable-next-line no-continue
          continue;
        }
        const locationGroupedSubscriptions = groupedSubscriptions[groupedSubscriptionKey];
        const currentDate = new Date();

        let itemWithHighestCreatedAt = null;
        let itemWithHighestReturnCreatedAt = null;
        let latestSubscriptionGroups = [];
        if (locationGroupedSubscriptions.length) {
          itemWithHighestCreatedAt = locationGroupedSubscriptions.reduce((max, item) => {
            if (!max.invoice) return item;
            return item.invoice?.createdAt?.getTime() > max.invoice?.createdAt?.getTime() ? item : max;
          });
          itemWithHighestReturnCreatedAt = locationGroupedSubscriptions.reduce((max, item) => {
            if (!max.returnInvoice) return item;
            return item.returnInvoice?.createdAt?.getTime() > max.returnInvoice?.createdAt?.getTime() ? item : max;
          });

          if (
            (itemWithHighestCreatedAt.invoice &&
              itemWithHighestReturnCreatedAt.returnInvoice &&
              itemWithHighestReturnCreatedAt?.returnInvoice?.createdAt.getTime() >
                itemWithHighestCreatedAt?.invoice?.createdAt.getTime()) ||
            (itemWithHighestReturnCreatedAt.returnInvoice && !itemWithHighestCreatedAt.invoice)
          ) {
            latestSubscriptionGroups = locationGroupedSubscriptions.filter(
              (r) => r.returnInvoice?.id === itemWithHighestReturnCreatedAt?.returnInvoice?.id
            );
          } else if (
            (itemWithHighestCreatedAt.invoice &&
              itemWithHighestReturnCreatedAt.returnInvoice &&
              itemWithHighestReturnCreatedAt?.returnInvoice?.createdAt.getTime() <=
                itemWithHighestCreatedAt?.invoice?.createdAt.getTime()) ||
            (itemWithHighestCreatedAt.invoice && !itemWithHighestReturnCreatedAt.returnInvoice)
          ) {
            latestSubscriptionGroups = locationGroupedSubscriptions.filter(
              (r) => r.invoice?.id === itemWithHighestCreatedAt?.invoice?.id
            );
          } else {
            latestSubscriptionGroups = locationGroupedSubscriptions;
          }
        }
        const metricSubscription = latestSubscriptionGroups.reduce((max, item) => {
          if (!max) return item;
          return item.endDate.getTime() > max.endDate.getTime() ? item : max;
        });
        const overallLeftInvoiceGenerated = latestSubscriptionGroups.filter((r) => !r.leftInvoiceGenerated).length === 0;
        const overallWithRecurring = latestSubscriptionGroups.filter((r) => r.recurringPayment).length > 0;

        const hasAnyActive = groupedSubscriptions[groupedSubscriptionKey].filter((r) => r.state === 1).length;
        // eslint-disable-next-line no-unused-vars
        const { endDate, leftInvoiceGenerated, recurringPayed } = metricSubscription;
        const isActive = metricSubscription.state === 1 && metricSubscription.isActive; // TODO test is active part

        const diff = endDate.getTime() - currentDate.getTime();
        const leftHours = diff / 1000 / 60 / 60;
        const hasExpired = leftHours <= 0 && isActive;
        const paperlessLeftToExpire =
          leftHours > 0 &&
          leftHours > config.subscription.left_expire_hours_start &&
          leftHours < config.subscription.left_expire_hours;
        let recurringChargeHour = config.subscription.recurring_charge_hour;
        let recurringRetry = config.subscription.recurring_retry;
        if (
          paymentGatewaysGrouped[metricSubscription.provider.toString()] &&
          paymentGatewaysGrouped[metricSubscription.provider.toString()].autopayInterval &&
          paymentGatewaysGrouped[metricSubscription.provider.toString()].autopayInterval > 0 &&
          paymentGatewaysGrouped[metricSubscription.provider.toString()].autopayRetryCount &&
          paymentGatewaysGrouped[metricSubscription.provider.toString()].autopayRetryCount > 0
        ) {
          recurringChargeHour = paymentGatewaysGrouped[metricSubscription.provider.toString()].autopayInterval;
          recurringRetry = paymentGatewaysGrouped[metricSubscription.provider.toString()].autopayRetryCount;
        }
        const recurringLeftToExpire = leftHours < recurringChargeHour;
        // logger.info(
        //   `subscription ${
        //     subscription._id
        //   } hasExpired: ${hasExpired}, isActive: ${isActive}, expiring soon: ${paperlessLeftToExpire} diff: ${
        //     diff / 1000 / 60 / 60
        //   } hours`
        // );
        // recurring part
        if (isActive && leftHours < 24 && overallWithRecurring && !recurringPayed && hasAnyActive) {
          // expires.push({

          // })
          logger.info(`autopayments: ${metricSubscription.client.toString()} ${leftHours}`);
        }
        let lastRecurring = 0;
        if (metricSubscription.recurringDate) {
          lastRecurring = new Date().getTime() - metricSubscription.recurringDate.getTime();
          lastRecurring = lastRecurring / 1000 / 60 / 60;
        }
        const recurringDatePassed =
          !metricSubscription.recurringDate || currentDate.getTime() > metricSubscription.recurringDate.getTime();
        if (
          isActive &&
          ((leftHours < recurringChargeHour * 2 && leftHours > recurringChargeHour) || metricSubscription.recurringDate) &&
          overallWithRecurring &&
          !recurringPayed &&
          metricSubscription.recurringPayCount < recurringRetry &&
          hasAnyActive
        ) {
          const client = metricSubscription.client.toString();
          // eslint-disable-next-line no-await-in-loop
          const clientInfo = await clientRepository.getClientById(client);
          const clientPayments = await clientPaymentMethodRepository.getClientPaymentMethods(client);
          if (!clientInfo?.finance?.forPackages) {
            logger.warn(`autopaymentwarning: client has no forPackages card but is autopayment`);
          } else {
            let currentMethod = null;
            if (clientPayments.length) {
              currentMethod = clientPayments.filter(
                (r) => r._id.toString() === clientInfo?.finance?.forPackages._id.toString()
              )[0];
            }
            if (currentMethod === null) {
              logger.warn(`autopaymentwarning: client has no forPackages that match his cards ${client}`);
            } else {
              let nextRetryHour = 0;
              if (leftHours > recurringChargeHour) nextRetryHour = leftHours - recurringChargeHour;
              if (metricSubscription.recurringDate) {
                nextRetryHour = (metricSubscription.recurringDate.getTime() - currentDate.getTime()) / 1000 / 60 / 60;
              }
              const updateLocation = await clientLocationRepository.getClientLocationById(metricSubscription.location);
              const pushObject = {
                id: clientInfo.id,
                name: clientInfo.personalInfo,
                login: updateLocation.login,
                recurringAttempts: metricSubscription.recurringPayCount,
                lastRecurringTryDate: metricSubscription.recurringDate,
                nextRetryHour,
                expireDate: metricSubscription.recurringPayCount.endDate,
                leftHours,
              };
              sererStatistics.recurrings.push(pushObject);
            }
          }
        }
        if (
          isActive &&
          recurringLeftToExpire &&
          overallWithRecurring &&
          !recurringPayed &&
          metricSubscription.recurringPayCount < recurringRetry &&
          recurringDatePassed &&
          config.subscription.allowCardCharge &&
          hasAnyActive
        ) {
          try {
            const client = metricSubscription.client.toString();
            // eslint-disable-next-line no-await-in-loop
            const clientInfo = await clientRepository.getClientById(client);
            const { provider } = clientInfo; // TODO get provider here
            const paymentGateWays = await ottProviderPaymentGatewayRepository.getOttProviderPaymentGatewayByProviderId(
              provider._id.toString()
            );
            const paymentGateway = paymentGateWays.length ? paymentGateWays[0] : null;

            const clientPayments = await clientPaymentMethodRepository.getClientPaymentMethods(client);
            if (!clientInfo?.finance?.forPackages) {
              logger.warn(`autopaymentwarning: client has no forPackages card but is autopayment`);
            } else {
              let currentMethod = null;
              if (clientPayments.length) {
                currentMethod = clientPayments.filter(
                  (r) => r._id.toString() === clientInfo?.finance?.forPackages._id.toString()
                )[0];
              }
              if (currentMethod === null) {
                logger.warn(`autopaymentwarning: client has no forPackages that match his cards`);
              }
              if (
                paymentGateway.autopay &&
                ((paymentGateway.autopay === 'authorize' && paymentGateway?.authorize?.isValid) ||
                  (paymentGateway.autopay === 'clover' && paymentGateway?.clover?.isValid) ||
                  (paymentGateway.autopay === 'square' && paymentGateway?.square?.isValid)) &&
                currentMethod !== null
              ) {
                // const invoice = await invoiceRepository.create
                // eslint-disable-next-line no-await-in-loop
                const updateLocation = await clientLocationRepository.getClientLocationById(metricSubscription.location);
                if (!updateLocation) {
                  logger.error(`location by id ${metricSubscription.location} not found but subscription exists`);
                } else {
                  // eslint-disable-next-line no-plusplus
                  generatedRecurringInvoiceCount++;
                  // generate invoice
                  const packageInfos = [];
                  // eslint-disable-next-line no-restricted-syntax
                  for (const subscription of latestSubscriptionGroups) {
                    packageInfos.push(subscription.package.toString());
                  }
                  const payload = {
                    locations: [
                      {
                        locationId: updateLocation._id.toString(),
                        packageInfos,
                        packageRemoves: [],
                        recurringPaymentInfos: packageInfos,
                        room: metricSubscription.room,
                        globalAction: 1,
                        month: 1,
                      },
                    ],
                    equipments: [],
                    client,
                  };
                  const paymentGateways = await ottProviderPaymentGatewayRepository.getOttProviderPaymentGatewayByProviderId(
                    provider._id.toString()
                  );
                  let bankFeePercent = 0;
                  let bankFeeFixed = 0;
                  if (paymentGateways.length && paymentGateways[0].cardsFee && paymentGateways[0].cardsFee.percent) {
                    bankFeePercent = paymentGateways[0].cardsFee.percent;
                  }
                  if (paymentGateways.length && paymentGateways[0].cardsFee && paymentGateways[0].cardsFee.fixed) {
                    bankFeeFixed = paymentGateways[0].cardsFee.fixed;
                  }
                  const payload6Month = { ...payload };
                  const payload12Month = { ...payload };
                  // eslint-disable-next-line no-await-in-loop
                  // const user = userRepository.getUserById(up)
                  // eslint-disable-next-line no-await-in-loop
                  const calculatedPayload = await SubscriptionService.calculateSubscription(false, payload, provider);
                  let { price } = calculatedPayload;
                  let { totalPrice } = calculatedPayload;
                  let bankFee = 0;
                  if (bankFeePercent) {
                    bankFee = (price * bankFeePercent) / 100;
                    bankFee += bankFeeFixed;
                  }
                  totalPrice = price + bankFee;
                  calculatedPayload.totalPrice = totalPrice;
                  calculatedPayload.bankFee = bankFee;

                  payload6Month.locations.forEach((item) => {
                    // eslint-disable-next-line no-param-reassign
                    item.month = 6;
                  });
                  // eslint-disable-next-line no-await-in-loop
                  const calculated6Month = await SubscriptionService.calculateSubscription(false, payload6Month, provider);
                  let calculated6MonthTotal = calculated6Month.totalPrice;
                  price = calculated6Month.price;
                  bankFee = 0;
                  if (bankFeePercent) {
                    bankFee = (price * bankFeePercent) / 100;
                    bankFee += bankFeeFixed;
                  }
                  calculated6MonthTotal = price + bankFee;
                  calculated6Month.calculated6MonthTotal = calculated6MonthTotal;
                  calculated6Month.bankFee = bankFee;
                  payload12Month.locations.forEach((item) => {
                    // eslint-disable-next-line no-param-reassign
                    item.month = 12;
                  });
                  // eslint-disable-next-line no-await-in-loop
                  const calculated12Month = await SubscriptionService.calculateSubscription(false, payload12Month, provider);
                  let calculated12MonthTotal = calculated12Month.totalPrice;
                  price = calculated12Month.price;
                  bankFee = 0;
                  if (bankFeePercent) {
                    bankFee = (price * bankFeePercent) / 100;
                    bankFee += bankFeeFixed;
                  }
                  calculated12MonthTotal = price + bankFee;
                  calculated12Month.calculated12MonthTotal = calculated12MonthTotal;
                  calculated12Month.bankFee = bankFee;
                  if (calculatedPayload.refund || calculatedPayload.totalPrice === -1) {
                    // eslint-disable-next-line no-continue
                    logger.info(`no price found for location subscription ${metricSubscription.location.toString()}`);
                    // eslint-disable-next-line no-continue
                    continue;
                    // let a = 1;
                    // const again = await SubscriptionService.calculateSubscription(false, payload, provider);
                    // continue;
                  }
                  // generated info
                  const generateDisplayInfo = {
                    client,
                    clientAddress:
                      clientInfo.addresses && clientInfo.addresses.filter((r) => r.forContactInvoice).length
                        ? clientInfo.addresses.filter((r) => r.forContactInvoice)[0]
                        : null,
                    locationsInfo: {
                      totalTax: calculatedPayload.totalTax,
                      bankFee: calculatedPayload.bankFee,
                      locationTax: calculatedPayload.locationTax,
                      locations: calculatedPayload.locations,
                    },
                    equipmentInfo: {
                      totalTax: calculatedPayload.totalTax,
                      bankFee: calculatedPayload.bankFee,
                      equipmentTax: calculatedPayload.equipmentTax,
                      equipments: calculatedPayload.equipments,
                      equipment: calculatedPayload.equipment,
                    },
                    refund: calculatedPayload.refund,
                    lastPaymentType: calculatedPayload.refund,
                    availablePaymentTypes: calculatedPayload.availablePaymentTypes,
                    calculated6MonthTotal,
                    calculated12MonthTotal,
                    subscriptionEndDate: endDate,
                  };
                  // // TODO send invoice
                  // eslint-disable-next-line no-await-in-loop
                  let newInvoice = await invoiceRepository.createSubscriptionInvoice(
                    1,
                    true,
                    calculatedPayload.totalPrice,
                    payload,
                    calculatedPayload,
                    generateDisplayInfo,
                    provider._id.toString(), // req.user.provider.id,
                    client,
                    updateLocation._id.toString(),
                    {
                      provider,
                    } // req.user
                  );

                  if (currentMethod.paymentMethod === 0) {
                    const _invoicePayResponse = await InvoiceService.payInvoiceWithCreditCard(
                      newInvoice.amount,
                      currentMethod.id,
                      currentMethod,
                      newInvoice,
                      updateLocation._id.toString(),
                      {
                        provider,
                      }
                    );
                    if (!_invoicePayResponse.status) {
                      // eslint-disable-next-line no-unused-vars
                      const payMessage = _invoicePayResponse.messages.toString();
                      // eslint-disable-next-line no-restricted-syntax
                      for (const subscription of locationGroupedSubscriptions) {
                        const nextTimestamp =
                          currentDate.getTime() + (metricSubscription.endDate.getTime() - currentDate.getTime()) / 2;
                        const nextDate = new Date(nextTimestamp);
                        // eslint-disable-next-line no-await-in-loop
                        await subscriptionRepository.updateSubscriptionById(subscription._id.toString(), {
                          recurringDate: nextDate,
                        });
                      }
                    } else {
                      newInvoice = _invoicePayResponse.invoice;

                      // eslint-disable-next-line no-unused-vars
                      const executeStatus = await InvoiceService.executeInvoice(_invoicePayResponse.invoice, {
                        provider,
                      }); // TODO handle exceptions here
                      // await NotificationService.GenerateLocationExpiringNotification(updateLocation);
                      // eslint-disable-next-line no-restricted-syntax
                      for (const subscription of locationGroupedSubscriptions) {
                        // eslint-disable-next-line no-await-in-loop
                        await subscriptionRepository.updateSubscriptionById(subscription._id.toString(), {
                          recurringPayed: true,
                        });
                      }
                    }
                  }

                  // await NotificationService.GenerateLocationExpiringNotification(updateLocation);
                  // eslint-disable-next-line no-restricted-syntax
                  for (const subscription of locationGroupedSubscriptions) {
                    // eslint-disable-next-line no-await-in-loop
                    await subscriptionRepository.updateSubscriptionById(subscription._id.toString(), {
                      recurringPayCount: subscription.recurringPayCount + 1,
                    });
                  }
                }
              } else {
                logger.warn(`no payment methods but is recurring client ${metricSubscription.client.toString()}`);
              }
            }
          } catch (excep) {
            logger.error(`subscriptionprocessorerror:`);
            logger.error(excep);
          }
        }
        if (
          !hasExpired &&
          paperlessLeftToExpire &&
          isActive &&
          config.subscription.generate_invoice &&
          !overallLeftInvoiceGenerated &&
          !overallWithRecurring &&
          hasAnyActive
        ) {
          // const invoice = await invoiceRepository.create
          // eslint-disable-next-line no-await-in-loop
          const updateLocation = await clientLocationRepository.getClientLocationById(metricSubscription.location);
          if (!updateLocation) {
            logger.error(`location by id ${metricSubscription.location} not found but subscription exists`);
          } else if (!config.subscription.generate_invoice) {
            // logger.info(`invoice generation is not enabled...`);
          } else {
            // eslint-disable-next-line no-plusplus
            generatedLeftInvoiceCount++;
            // generate invoice
            const packageInfos = [];
            // eslint-disable-next-line no-restricted-syntax
            for (const subscription of latestSubscriptionGroups) {
              packageInfos.push(subscription.package.toString());
            }
            const payload = {
              locations: [
                {
                  locationId: updateLocation._id.toString(),
                  packageInfos,
                  packageRemoves: [],
                  recurringPaymentInfos: [],
                  room: metricSubscription.room,
                  globalAction: 1,
                  month: 1,
                },
              ],
              equipments: [],
              client: metricSubscription.client.toString(),
            };
            const payload6Month = { ...payload };
            const payload12Month = { ...payload };
            const { client } = payload;
            // eslint-disable-next-line no-await-in-loop
            const clientInfo = await clientRepository.getClientById(client);
            if (!clientInfo.finance || (clientInfo.finance && !clientInfo.finance.paperlessBilling)) {
              const { provider } = clientInfo; // TODO get provider here
              const paymentGateways = await ottProviderPaymentGatewayRepository.getOttProviderPaymentGatewayByProviderId(
                provider._id.toString()
              );
              let bankFeePercent = 0;
              let bankFeeFixed = 0;
              if (paymentGateways.length && paymentGateways[0].cardsFee && paymentGateways[0].cardsFee.percent) {
                bankFeePercent = paymentGateways[0].cardsFee.percent;
              }
              if (paymentGateways.length && paymentGateways[0].cardsFee && paymentGateways[0].cardsFee.fixed) {
                bankFeeFixed = paymentGateways[0].cardsFee.fixed;
              }
              // const user = userRepository.getUserById(up)
              // eslint-disable-next-line no-await-in-loop
              const calculatedPayload = await SubscriptionService.calculateSubscription(false, payload, provider);
              let { price } = calculatedPayload;
              let { totalPrice } = calculatedPayload;
              let bankFee = 0;
              if (bankFeePercent) {
                bankFee = (price * bankFeePercent) / 100;
                bankFee += bankFeeFixed;
              }
              totalPrice = price + bankFee;
              calculatedPayload.totalPrice = totalPrice;
              calculatedPayload.bankFee = bankFee;

              payload6Month.locations.forEach((item) => {
                // eslint-disable-next-line no-param-reassign
                item.month = 6;
              });
              // eslint-disable-next-line no-await-in-loop
              const calculated6Month = await SubscriptionService.calculateSubscription(false, payload6Month, provider);
              price = calculated6Month.price;
              totalPrice = calculated6Month.totalPrice;
              bankFee = 0;
              if (bankFeePercent) {
                bankFee = (price * bankFeePercent) / 100;
                bankFee += bankFeeFixed;
              }
              totalPrice = price + bankFee;
              calculated6Month.totalPrice = totalPrice;
              calculated6Month.bankFee = bankFee;
              const calculated6MonthTotal = calculated6Month.totalPrice;
              payload12Month.locations.forEach((item) => {
                // eslint-disable-next-line no-param-reassign
                item.month = 12;
              });
              // eslint-disable-next-line no-await-in-loop
              const calculated12Month = await SubscriptionService.calculateSubscription(false, payload12Month, provider);
              price = calculated12Month.price;
              totalPrice = calculated12Month.totalPrice;
              bankFee = 0;
              if (bankFeePercent) {
                bankFee = (price * bankFeePercent) / 100;
                bankFee += bankFeeFixed;
              }
              totalPrice = price + bankFee;
              calculated12Month.totalPrice = totalPrice;
              calculated12Month.bankFee = bankFee;
              const calculated12MonthTotal = calculated12Month.totalPrice;
              if (calculatedPayload.refund || calculatedPayload.totalPrice === -1) {
                // eslint-disable-next-line no-continue
                logger.info(`no price found for location subscription ${metricSubscription.location.toString()}`);
                // eslint-disable-next-line no-continue
                continue;
                // let a = 1;
                // const again = await SubscriptionService.calculateSubscription(false, payload, provider);
                // continue;
              }
              // generated info
              const generateDisplayInfo = {
                client,
                clientAddress:
                  clientInfo.addresses && clientInfo.addresses.filter((r) => r.forContactInvoice).length
                    ? clientInfo.addresses.filter((r) => r.forContactInvoice)[0]
                    : null,
                locationsInfo: {
                  totalTax: calculatedPayload.totalTax,
                  bankFee: calculatedPayload.bankFee,
                  locationTax: calculatedPayload.locationTax,
                  locations: calculatedPayload.locations,
                },
                equipmentInfo: {
                  totalTax: calculatedPayload.totalTax,
                  bankFee: calculatedPayload.bankFee,
                  equipmentTax: calculatedPayload.equipmentTax,
                  equipments: calculatedPayload.equipments,
                  equipment: calculatedPayload.equipment,
                },
                refund: calculatedPayload.refund,
                lastPaymentType: calculatedPayload.refund,
                availablePaymentTypes: calculatedPayload.availablePaymentTypes,
                calculated6Month,
                calculated12Month,
                calculated6MonthTotal,
                calculated12MonthTotal,
                subscriptionEndDate: endDate,
              };
              // // TODO send invoice
              // eslint-disable-next-line no-await-in-loop
              await invoiceRepository.createSubscriptionInvoice(
                2,
                false,
                calculatedPayload.totalPrice,
                payload,
                calculatedPayload,
                generateDisplayInfo,
                provider._id.toString(), // req.user.provider.id,
                client,
                updateLocation._id.toString(),
                {
                  provider,
                } // req.user
              );
              // await NotificationService.GenerateLocationExpiringNotification(updateLocation);
              // eslint-disable-next-line no-restricted-syntax
              for (const subscription of locationGroupedSubscriptions) {
                // eslint-disable-next-line no-await-in-loop
                await subscriptionRepository.updateSubscriptionById(subscription._id.toString(), {
                  leftInvoiceGenerated: true,
                });
              }
            } else {
              logger.info(`client ${clientInfo._id.toString()} paperless is disabled.`);
            }
          }
        }
        // eslint-disable-next-line no-plusplus

        if (hasExpired) {
          hasExpires.push(groupedSubscriptionKey);
          if (hasAnyActive) {
            logger.info(`stopping location ${metricSubscription.location.toString()}`);
            // eslint-disable-next-line no-restricted-syntax
            for (const subscription of locationGroupedSubscriptions) {
              // eslint-disable-next-line no-await-in-loop
              await subscriptionRepository.updateSubscriptionById(subscription._id.toString(), {
                state: 0,
              });
            }
            // eslint-disable-next-line no-await-in-loop
            await SubscriptionService.updateSubscriptionStates(metricSubscription.client);
          }
          // stopping
          // if (recurringPayment) {
          //   // TODO  subscribe my month send invoice
          //   // eslint-disable-next-line no-await-in-loop
          //   await subscriptionRepository.updateSubscriptionById(subscription._id.toString(), { state: 0 });
          //
          //   // eslint-disable-next-line no-await-in-loop
          //   await SubscriptionService.updateSubscriptionStates(subscription.client);
          // } else {
          //   // eslint-disable-next-line no-await-in-loop
          //   await subscriptionRepository.updateSubscriptionById(subscription._id.toString(), { state: 0 });
          //
          //   // eslint-disable-next-line no-await-in-loop
          //   await SubscriptionService.updateSubscriptionStates(subscription.client);
          // }
        } else {
          // if (!hasAnyActive) {
          //   logger.info(`enabling location ${metricSubscription.location.toString()}`);
          //   if (locationGroupedSubscriptions.filter((r) => r.state === 0).length) {
          //     // eslint-disable-next-line no-restricted-syntax
          //     for (const subscription of locationGroupedSubscriptions) {
          //       if (subscription.endDate === metricSubscription.endDate) {
          //         // eslint-disable-next-line no-await-in-loop
          //         await subscriptionRepository.updateSubscriptionById(subscription._id.toString(), {
          //           state: 1,
          //         });
          //       }
          //     }
          //     // eslint-disable-next-line no-await-in-loop
          //     await SubscriptionService.updateSubscriptionStates(metricSubscription.client);
          //   }
          // }
          isActives.push(groupedSubscriptionKey);
        }
      }
      const hasExpiresGroupCounts = hasExpires.length;
      const isActivesGroupCounts = isActives.length;
      // const hasExpiresClientGroupCounts = hasExpires.reduce((acc, obj) => {
      //   const { client } = obj;
      //
      //   // Check if the location is already a key in the accumulator object
      //   if (acc[client]) {
      //     // If it exists, increment the count by 1
      //     // eslint-disable-next-line no-plusplus
      //     acc[client]++;
      //   } else {
      //     // If it doesn't exist, initialize the count with 1
      //     acc[client] = 1;
      //   }
      //   return acc;
      // }, {});
      // const isActivesClientGroupCounts = isActives.reduce((acc, obj) => {
      //   const { client } = obj;
      //
      //   // Check if the location is already a key in the accumulator object
      //   if (acc[client]) {
      //     // If it exists, increment the count by 1
      //     // eslint-disable-next-line no-plusplus
      //     acc[client]++;
      //   } else {
      //     // If it doesn't exist, initialize the count with 1
      //     acc[client] = 1;
      //   }
      //   return acc;
      // }, {});
      // const expireArrayGroup = Object.entries(hasExpiresGroupCounts);
      // const activeArrayGroup = Object.entries(isActivesGroupCounts);
      // const expireArrayClientGroup = Object.entries(hasExpiresClientGroupCounts);
      // const activeArrayClientGroup = Object.entries(isActivesClientGroupCounts);
      logger.info(
        `expire clients: ${hasExpiresGroupCounts}, active clients: ${isActivesGroupCounts} generated: ${generatedLeftInvoiceCount}, was generated: ${countAlreadyGenerated}, with recurring (not generated): ${generatedRecurringInvoiceCount}`
      );

      const provider = await ottProviderRepository.getBaseOttProvider();
      if (provider) {
        await StatisticService.processServiceSubscriptionInfo(sererStatistics);
        // broadcast info
        // await BroadcastService.broadcastToProvider(provider._id.toString(), 'statistic-info', sererStatistics);
        // logger.info(`expire clients: ${expireArrayClientGroup.length}, active clients: ${activeArrayClientGroup.length}`);
      }
      cb(null, response);
    } catch (exception) {
      cb(null, { status: false });
      logger.info(`subscriptionprocessorerror: ${exception.message}`);
      logger.error(exception, true);
    }
  };

  if (q.length) {
    logger.warn(`subscription processing task is already running...`);
    return {
      success: true,
      message: `subscription processing task is already running...`,
    };
  }
  q.push(func);
  return {
    success: true,
    message: `subscription processing task started...`,
  };
};

const subscriptionProcessorCronWorker = async () => {
  if (config.hosted.processSubscriptions) {
    logger.info(`cron job: processing subscriptions..`);
    await processSubscriptions();
  }
};

// '0 * * * *'
const subscriptionProcessorCron = async () => {
  const callMinutes = '*/15 * * * *';
  await subscriptionProcessorCronWorker();
  cron.schedule(callMinutes, async () => {
    await subscriptionProcessorCronWorker();
  });
};

module.exports = {
  subscriptionProcessorCron,
};
