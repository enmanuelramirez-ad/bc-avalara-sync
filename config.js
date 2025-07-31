require('dotenv').config();

const config = {
  bigcommerce: {
    storeHash: process.env.BC_STORE_HASH,
    accessToken: process.env.BC_ACCESS_TOKEN,
    clientId: process.env.BC_CLIENT_ID,
    clientSecret: process.env.BC_CLIENT_SECRET,
    baseUrl: `https://api.bigcommerce.com/stores/${process.env.BC_STORE_HASH}`,
    headers: {
      'X-Auth-Token': process.env.BC_ACCESS_TOKEN,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  },
  avalara: {
    token: process.env.AVALARA_TOKEN,
    companyId: process.env.AVALARA_COMPANY_ID,
    baseUrl: process.env.AVALARA_BASE_URL || 'https://rest.avatax.com',
    headers: {
      'Authorization': `Basic ${process.env.AVALARA_TOKEN}`,
      'Content-Type': 'application/json'
    }
  },
  sync: {
    fieldName: process.env.AVALARA_SYNC_FIELD_NAME || 'avalara_sync'
  }
};

// Validate required environment variables
const requiredVars = [
  'BC_STORE_HASH',
  'BC_ACCESS_TOKEN',
  'AVALARA_TOKEN',
  'AVALARA_COMPANY_ID'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  console.error('Please copy env.example to .env and fill in the required values.');
  process.exit(1);
}

module.exports = config; 