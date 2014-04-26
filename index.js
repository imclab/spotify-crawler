var request = require('promise-request');
var cheerio = require('cheerio');
var money = require('money');
var _ = require('lodash');
var when = require('when');
var async = require('async');
var format = require('string-format');

exports.fetch = fetchAll;

function fetchAll(){
  getLatestCurrencyRates();

  return getCountries()
    .then(handleCountries);
}

function getCountries(){
  var countryList = "https://www.spotify.com/select-your-country/";
  return request(countryList)
    .then(function(body){
      $ = cheerio.load(body);

      var items = $('li.country-item a').toArray();
      console.log('{0} country-items'.format(items.length));

      return items;
    });
}

function handleCountries(items){
  return when.promise(function(resolve, reject){
    async.map(items, handleSingleCountry, function(err, results){
      if(err)
        reject(err);

      resolve(results);
    });
  });
}

function handleSingleCountry(elem, callback){
  var country = {
    link: $(elem).attr('href'),
    title: $(elem).attr('title'),
    originalRel: $(elem).attr('rel')
  };

  country.rel = country.originalRel.split('-')[0];

  // Handle UK edge-case for http://restcountries.eu
  if(country.rel === 'uk')
    country.rel = 'gb';

  var currencyCode = getCountryCurrencyCode(country.rel);
  var spotifyPrice = getSpotifyPrice(country.link).then(formatSpotifyPrice);

  when.all([currencyCode, spotifyPrice])
    .then(function(data){
      country.currency = data[0];

      var spotify = data[1];
      country.originalPrice = spotify.original;
      country.price = spotify.formatted;

      return when.resolve(country);
    })
    .then(convertPriceToUSD)
    .then(function(data){
      callback(null, data);
    })
    .catch(function(error){
      callback(error);
    });
}

function getCountryCurrencyCode(code){
  var url = "http://restcountries.eu/rest/v1/alpha/" + code;

  return request(url, true)
    .then(function(data){
      if(!data.currencies){
        var error = new Error('{0} is missing currency data'.format(code));
        error.res = data;
        throw error;
      }

      if(data.currencies && data.currencies.length)
      // Handle Switzerland
        if(code === "ch")
          return "CHF";

      // Handle Chile
      if(code === "cl")
        return "CLP";

      // Handle all countries using EUR
      var countriesUsingEUR = ["hu", "is", "cz", "lt", "bg"];
      if(_.contains(countriesUsingEUR, code))
        return "EUR";


      // Handle all countries displaying price in USD
      var countriesUsingUSD = ["uy", "py", "cr", "do", "ni", "hn", "sv", "gt", "bo"];
      if(_.contains(countriesUsingUSD, code))
        return "USD";

      return data.currencies[0];
    });
}

function getSpotifyPrice(link){
  var url = "https://www.spotify.com" + link;

  return request(url)
    .then(function(body){
      $ = cheerio.load(body);
      var price = $('#premium-tier .premium-price').text();

      return price;
    });
}

function formatSpotifyPrice(price){
  var formattedPrice = price.match(/([1-9](?:\d*)(?:,\d{2})*(?:\.\d*[1-9])?)/g)[0];
  var formattedPrice = formattedPrice.replace(',', '.');

  var pricing = {
    original: price,
    formatted: formattedPrice
  };

  return pricing;
}

function convertPriceToUSD(country){
  return when.promise(function(resolve, reject){
    if(!country.currency){
      console.log(country);
      reject('Missing currency');
    }
    var converted = money.convert(country.price, {from: country.currency, to: 'USD'});

    if(converted === 'fx error'){
      console.log(country.currency);
      reject('Couldn\'t convert the price for: {0}({1})'.format(country.title, country.currency));
    }

    country.convertedPrice = converted;
    resolve(country);
  });
}

// Get latest currency rates from Open Exchange Rates
function getLatestCurrencyRates(){
  var currencyApi = "http://openexchangerates.org/api/latest.json?app_id=0239e164a3cb415f8fcf72d9a9cc2f2d";
  request(currencyApi, true)
    .then(function(data){

      money.base = data.rates;
      money.rates = data.rates;
    })
    .catch(function(error){
      console.log(error);
    });
}