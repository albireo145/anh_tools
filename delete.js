
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

const azure = require('azure');
const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/lib/sync');
require('dotenv').config();

var NHService = azure.createNotificationHubService(
  process.env.nhName,
  process.env.nhEndpoint,
  process.env.nhAccount,
  process.env.nhKey
);

function deleteRegistration(registrationId, { etag }) {
  return new Promise((resolve, reject) => {
    NHService.deleteRegistration(registrationId, { etag }, function(
      error,
      response,
      raw
    ) {
      if (error) {
        resolve(error.message);
      } else {
        resolve('status: ', response.isSuccessful, 'statusCode: ', reponse.statusCode);
      }
    });
  })
}
async function main() {
  var arg = process.argv[2]
  if (!arg) {
    console.log('please input file path')
    return 
  }
  try {
    const records = parse(fs.readFileSync(arg), {columns: true})
    for(let record of records) {
      console.log(await deleteRegistration(record.RegistrationId, {etag: record.ETag}))
    }
  } catch(e) {
    console.error(e.message)
  }
}

main()