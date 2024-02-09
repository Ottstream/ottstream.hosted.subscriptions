const mongoose = require('mongoose');
const autoIncrement = require('mongoose-auto-increment');
const config = require('./config/config.js');
const logger = require('./utils/logger/logger');
const { middlewareSyncCron } = require('./hosted/middleware_sync/middleware_sync_processor');
const { creditProcessorCron } = require('./hosted/credits/credit_processor');
const { subscriptionProcessorCron } = require('./hosted/subscriptions/subscription_processor');
const { notificationProcessorCron } = require('./hosted/notifications/notification_processor');
const { shippingProcessorCron } = require('./hosted/shipping/shipping_processor');
const { cardProcessorCron } = require('./hosted/payment/cards_processor');
const { authorizeProcessorCron } = require('./hosted/payment/authorize_processor');
const { cloverProcessorCron } = require('./hosted/payment/clover_processor');
const { postalProcessorCron } = require('./hosted/postal/postal_processor');
const { invoiceProcessorCron } = require('./hosted/invoice/invoice_processor');
const { twilioProcessorCron } = require('./hosted/twilio/twilio_processor');
const { checkeeperProcessorCron } = require('./hosted/payment/checkeeper_processor');
const { telegramBotProcessorCron } = require('./hosted/telegram/telegram_bot_processor');

const HostedEventBusProcessor = require('./hosted/event_bus/hosted_evenbus_processor');

const eventBusProcessor = new HostedEventBusProcessor();
eventBusProcessor
  .processSocketStreams()
  .then(() => {})
  .catch(() => {});
// const {
//   basicUserRoles,
//   basicOttProvider,
//   defaultChannelIconSet,
//   defaultIconType,
//   supportedPaymentMethods,
//   supportedPaymentImplementations,
// } = require('./utils/startup');

const connectDB = () => {
  mongoose
    .connect(config.mongoose.url, config.mongoose.options)
    .then(async () => {
      logger.info('Connected to MongoDB');

      // delete all collections
      // await Promise.all(
      //   Object.values(mongoose.connection.collections).map(async (collection) => {
      //     collection.deleteMany();
      //   })
      // );
      autoIncrement.initialize(mongoose.connection);
    })
    .catch((error) => {
      logger.error(error);
      connectDB();
    });
};

connectDB();

// running cron job for invoices
creditProcessorCron().then(() => {});
subscriptionProcessorCron().then(() => {});
notificationProcessorCron().then(() => {});
shippingProcessorCron().then(() => {});
postalProcessorCron().then(() => {});
cardProcessorCron().then(() => {});
authorizeProcessorCron().then(() => {});
cloverProcessorCron().then(() => {});
checkeeperProcessorCron().then(() => {});
invoiceProcessorCron().then(() => {});
twilioProcessorCron().then(() => {});
telegramBotProcessorCron().then(() => {});

if (!config.sync.sync_middleware) {
  logger.warn(`syncing middleware is disabled`);
} else {
  middlewareSyncCron().then(() => {});
}

const exitHandler = () => {};

const unexpectedErrorHandler = (error) => {
  logger.error(error);
  exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
});
