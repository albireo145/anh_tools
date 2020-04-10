process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

const azure = require('azure');
const fs = require('fs');
const path = require('path');
const stringify = require('csv-stringify');
require('dotenv').config();
const _ = require('lodash');

const retry = function(fn, times = 5, delay = 5000) {
  return new Promise((resolve, reject) => {
    var runAttempt = () => {
      fn()
        .then(resolve)
        .catch(err => {
          times--;
          if (0 === times) {
            reject(err);
          } else {
            setTimeout(runAttempt, delay);
          }
        });
    };
    runAttempt();
  });
};


const map = []
async function main() {
  var top = 100,
    skip = 0,
    nums = 10;

  var today = new Date();
  var mmdd =
    _.padStart(today.getMonth() + 1, 2, '0') +
    _.padStart(today.getDate(), 2, '0');
  var csvFile = fs.createWriteStream(path.resolve(__dirname, `${mmdd}-registrations-full.csv`), {
    // flags: 'a',
    encoding: 'utf-8',
    mode: '0666'
  });

  var myColumns = {
    Tags: 'PPS',
    RegistrationId: 'RegistrationId',
    DeviceToken: 'DeviceToken',
    ETag: 'ETag'
  };

  var stringifier = stringify({ header: true, columns: myColumns });

  stringifier.on('error', function(err) {
    console.error(err.message);
  });
  // stringifier.pipe(process.stdout);
  stringifier.pipe(csvFile);

  var NHService = azure.createNotificationHubService(
    process.env.nhName,
    process.env.nhEndpoint,
    process.env.nhAccount,
    process.env.nhKey
  );

  function listRegistrations({ top, skip }) {
    return retry(
      () =>
        new Promise((resolve, reject) => {
          NHService.listRegistrations({ top, skip }, function(
            error,
            response,
            raw
          ) {
            if (error) {
              reject(error);
            } else {
              console.log({ top, skip, len: response.length, token: raw.headers['x-ms-continuationtoken']})
              resolve({
                response,
                continuationtoken: raw.headers['x-ms-continuationtoken']
              });
            }
          });
        })
    );
  }

  async function getList(top, skip, threadNums, index) {
    return new Promise(async (resolve2, reject2) => {
      var next = {
        top,
        skip
      };
      var marker = ''
      try {
        do {
          try {
            var result = await listRegistrations(next)
            var { response, continuationtoken } = result
            if (response.length === 0) {
              console.log('null next')
              next = null
            } else if (marker === continuationtoken) {
              console.log('null next')
              next = null
            }
            marker = continuationtoken
            if (next) {
              var allMap = response.map(async val => {
                var data = {
                  Tags: val.Tags,
                  RegistrationId: val.RegistrationId,
                  DeviceToken: val.DeviceToken,
                  ETag: val.ETag
                };
                stringifier.write(data);
              });
              next = await Promise.all(allMap).then(list => {
                // next loop
                return { top, skip: next.skip + threadNums * top };
              });
            }
          } catch(e) {
            console.error(e)
            next = null
            reject2()
          }
        } while (next);
        resolve2();
      } catch (e) {
        console.error(e);
        reject2(next);
      }
    });
  }

  var arr = new Array(nums);
  arr.fill(0);
  var promiseMap = arr.map((v, k) => {
    return getList(top, skip + k * top, nums, k);
  });
  try {
    await Promise.all(promiseMap);
    // close csv stream
    stringifier.end();
  } catch (err) {
    console.error(err);
    stringifier.end();
  }
}

main()
module.exports = main;
