const CoinMarketCap = require("coinmarketcap-api");

module.exports = function getCoins(db, admin, limit) {
  const cmc = new CoinMarketCap(process.env.COINMARKETCAP_API_KEY);
  cmc
    .getTickers({ limit })
    .then(({ data }) => {
      data.forEach(ticker => {
        let docRef = db.collection("coins").doc(ticker.symbol);
        docRef.set({
          id: ticker.id,
          fullname: ticker.name,
          sentiment: [
            {
              date: admin.firestore.Timestamp.now(),
              value: 0
            }
          ]
        });
      });
    })
    .catch(console.error);
};
