const admin = require('firebase-admin');
const Twitter = require('twitter');
const Sentiment = require('sentiment');
const winston = require('winston');

const setCoins = require('./setCoins');
const sleep = require('./utils/sleep');

const twiiter = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  bearer_token: process.env.TWITTER_BEARER_TOKEN,
});
const sentiment = new Sentiment();
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  defaultMeta: {service: 'user-service'},
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log`
    // - Write all logs error (and below) to `error.log`.
    //
    new winston.transports.File({
      filename: 'error.log',
      level: 'error',
      timestamp: true,
    }),
    new winston.transports.File({filename: 'combined.log', timestamp: true}),
  ],
});

async function getAndSetSentiment(doc) {

  try {
    let totalSentiment = await getTotalSentiment(doc.id);
    db.collection('coins')
      .doc(doc.id)
      .update({
        sentiment: [
          ...doc.data().sentiment,
          {date: admin.firestore.Timestamp.now(), value: totalSentiment},
        ],
      });
  } catch (e) {
    logger.log({
      level: 'error',
      message: `Failed to update the database: ${e}`,
    });
  }
}
async function getTotalSentiment(symbol, extraParams) {
  let totalSentiment = 0;
  let params = {
    q: '$' + symbol,
    count: 100,
    ...extraParams,
  };
  try {
    logger.log({level: 'info', message: `Searching twitter for ${params.q}`});
    let tweets = await twiiter.get('search/tweets', params);
    tweets.statuses.forEach(tweet => {
      let score = sentiment.analyze(tweet.text).score;
      score *= tweet.retweet_count + tweet.favorite_count + 1;
      totalSentiment = score;
    });
    return totalSentiment;
  } catch (e) {
    logger.log({level: 'error', message: `Failed to search tweets: ${e}`});
  }
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: 'ploutos-e4e7d',
    clientEmail: 'codesandbox@ploutos-e4e7d.iam.gserviceaccount.com',
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
  }),
});
let db = admin.firestore();

//Sets the coins. Doesn't need to be run often as that would exhaust the CoinMarketCap API.
//setCoins(db, admin, 300);
const main = () => {
  logger.log({level: 'info', message: 'Main called'});
  let requestsMade = 0;
  db.collection('coins')
    .get()
    .then(async snapshot => {
      const {docs} = snapshot;
      logger.log({
        level: 'info',
        message: `Snapshots obtained. Length: ${docs.length}`,
      });
      for (let i = 0; i < docs.length; i++) {
        if (requestsMade < 15) {
          requestsMade++;
          getAndSetSentiment(docs[i]); 
        } else {
          logger.log({
            level: 'info',
            message: 'Sleeping for 15 minutes (900000ms)',
          });
          // Sleep for 15 minutes
          await sleep(900000);
          requestsMade = 1;
          getAndSetSentiment(docs[i]);  
        }
      }
    })
    .catch(e =>
      logger.log({
        level: 'error',
        message: `Could not update the database: ${e}`,
      }),
    );
};

// Run main the first time
main();
// Run main everyday
setInterval(main, 86400000);
