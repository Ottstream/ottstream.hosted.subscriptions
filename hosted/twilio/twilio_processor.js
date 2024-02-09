/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
// schedule to generate invoices
const cron = require('node-cron');
const { repositories } = require('ottstream.dataaccess');
const logger = require('../../utils/logger/logger');
const config = require('../../config/config.js');
const { service } = require('ottstream.service');
const TwilioService = service.smsService;
// eslint-disable-next-line no-unused-vars
const { smsRepository, ottProviderConversationProviderRepository } = repositories;
// const EasyshipService = require('../../services/shiping/merchant/easyship.service');
// const TwilioService = require('../../services/sms/twilio.service');

// const NotificationService = require('../../services/notification/notification.service');

// eslint-disable-next-line no-unused-vars
const processTwilios = async () => {
  // TODO generate notification of comment and send to user
  // eslint-disable-next-line no-empty
  try {
    const checkSmsList = await smsRepository.getList({ deliveryState: { $in: [2, 3] }, deliverySystem: 'twilio' });
    const conversationApis = await ottProviderConversationProviderRepository.getList();
    const conversationApisDict = conversationApis.reduce((obj, item) => {
      // eslint-disable-next-line no-param-reassign
      obj[item.providerId.toString()] = item;
      return obj;
    }, {});
    for (const smsToCheck of checkSmsList) {
      if (smsToCheck.messageId) {
        const provider = smsToCheck.provider.toString();
        if (conversationApisDict[provider]) {
          const { twilio } = conversationApisDict[provider];
          if (twilio && twilio.isValid) {
            const response = await TwilioService.getMessageStatus(smsToCheck.messageId, {
              sId: twilio.sId,
              authToken: twilio.authToken,
            });
            if (response.status) {
              if (response.account.status === 'delivered') {
                await smsRepository.updateSmsById(smsToCheck.id, { deliveryState: 1, deliveryDate: new Date() });
              }
            }
          }
        }
      }
    }

    // for (const otherApi of otherApis) {
    //   const { twilio } = otherApi;
    //   if (twilio && twilio.isValid) {
    //     const latestMessages = await TwilioService.getMessages({
    //       sId: twilio.sId,
    //       authToken: twilio.authToken,
    //     });
    //     if (latestMessages.status) {
    //       const incoming = latestMessages.account.filter((r) => r.direction === 'inbound');
    //       const string outPUt = latestMessages.account.filter(r=>r.speedDate)
    //     }
    //     const a = 1;
    //   }
    // }

    logger.info(`twilio: checking statues of ${checkSmsList.length} messages`);
  } catch (exception) {
    logger.error(exception, true);
  }
};

const twilioProcessorCronWorker = async () => {
  if (config.hosted.processTwilio) {
    logger.info(`cron job: processing twilio..`);
    await processTwilios();
  }
};

const twilioProcessorCron = async () => {
  const callMinutes = '*/1 * * * *';
  await twilioProcessorCronWorker();
  cron.schedule(callMinutes, async () => {
    await twilioProcessorCronWorker();
  });
};

module.exports = {
  twilioProcessorCron,
};
