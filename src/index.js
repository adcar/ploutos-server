const admin = require("firebase-admin");
const Twitter = require("twitter");
const Sentiment = require("sentiment");

const setCoins = require("./setCoins");
const sleep = require("./utils/sleep");

const twiiter = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  bearer_token: process.env.TWITTER_BEARER_TOKEN
});
const sentiment = new Sentiment();

async function getTotalSentiment(symbol, extraParams) {
  let totalSentiment = 0;
  let params = {
    q: "$" + symbol,
    count: 100,
    ...extraParams
  };
  try {
    let tweets = await twiiter.get("search/tweets", params);
    tweets.statuses.forEach(tweet => {
      let score = sentiment.analyze(tweet.text).score;
      score *= tweet.retweet_count + tweet.favorite_count + 1;
      totalSentiment = score;
    });
    return totalSentiment;
  } catch (e) {
    console.log("Couldn't search tweets:", e);
  }
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: "ploutos-e4e7d",
    clientEmail: "codesandbox@ploutos-e4e7d.iam.gserviceaccount.com",
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID
  })
});
let db = admin.firestore();

//Sets the coins. Doesn't need to be run often as that would exhaust the CoinMarketCap API.
// setCoins(db, admin, 300);
const main = () => {
  let requestsMade = 0;
  db.collection("coins")
    .get()
    .then(snapshot => {
      snapshot.forEach(async doc => {
        if (requestsMade < 15) {
          requestsMade++;
          let totalSentiment = await getTotalSentiment(doc.id);
          db.collection("coins")
            .doc(doc.id)
            .update({
              sentiment: [
                ...doc.data().sentiment,
                { date: admin.firestore.Timestamp.now(), value: totalSentiment }
              ]
            });
        } else {
          // Sleep for 15 minutes
          sleep(900000);
        }
      });
    })
    .catch(err => {
      console.log("Error getting documents", err);
    });
};

// Run main everyday
setInterval(main, 86400000);
