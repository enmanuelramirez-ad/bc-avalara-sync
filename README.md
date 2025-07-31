# BigCommerce to Avalara Product Sync

A comprehensive solution for reconciling and syncing BigCommerce products with Avalara's product catalog. This tool ensures all active BigCommerce products are correctly registered and classified in Avalara by performing a full reconciliation and triggering targeted updates.

## Overview

This solution implements a four-step process to ensure complete synchronization between BigCommerce and Avalara:

1. **Fetch Avalara Items** - Retrieve all registered items from Avalara
2. **Fetch BigCommerce Products** - Get all active products from BigCommerce
3. **Reconcile Products** - Compare both catalogs and identify discrepancies
4. **Update Products** - Trigger sync for products missing from Avalara or with incomplete data

## Features

- **Full Reconciliation**: Compares entire product catalogs to identify gaps
- **Targeted Updates**: Only updates products that need syncing, avoiding unnecessary API calls
- **Comprehensive Logging**: Detailed logs and CSV reports for audit trails
- **Rate Limiting**: Built-in rate limiting to respect API limits
- **Error Handling**: Robust error handling with detailed error reporting
- **Modular Design**: Four independent scripts that can be run separately or together

## Prerequisites

- Node.js 16+ installed
- BigCommerce store with API access
- Avalara account with API credentials
- BigCommerce webhook configured for `store/product/updated`

## Project Structure

```
bc-avalara-sync/
├── scripts/                    # Main sync scripts
│   ├── fetch-avalara-items.js  # Step 1: Fetch Avalara items
│   ├── fetch-bc-products.js    # Step 2: Fetch BigCommerce products
│   ├── reconcile-products.js   # Step 3: Reconcile products
│   └── update-products.js      # Step 4: Update products
├── output/                     # Generated CSV files and reports
├── config.js                   # Configuration and environment setup
├── utils.js                    # Utility functions
├── package.json                # Dependencies and scripts
├── .env.example                # Environment variables template
└── README.md                   # This file
```

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

4. Configure your environment variables in `.env`:
   ```env
   # BigCommerce Configuration
   BC_STORE_HASH=your_store_hash
   BC_ACCESS_TOKEN=your_access_token
   BC_CLIENT_ID=your_client_id
   BC_CLIENT_SECRET=your_client_secret

   # Avalara Configuration
   AVALARA_TOKEN=your_base64_encoded_accountid_licensekey
   AVALARA_COMPANY_ID=your_company_id
   AVALARA_BASE_URL=https://rest.avatax.com

   # Optional: Custom field name for triggering sync
   AVALARA_SYNC_FIELD_NAME=avalara_sync
   ```

   **Note:** Credentials can be found in AWS Parameter Store or Nordpass HN shared folder.

## Usage

### Running Individual Scripts

You can run each script independently:

```bash
# Step 1: Fetch all items from Avalara
npm run fetch-avalara

# Step 2: Fetch all active products from BigCommerce
npm run fetch-bc

# Step 3: Reconcile products and identify discrepancies
npm run reconcile

# Step 4: Update products that need syncing
npm run update
```

### Running Complete Sync

To run the entire process in sequence:

```bash
npm run sync-all
```

### Output Files

All scripts generate output files in the `./output/` directory:

- `avalara-items.csv` - All items from Avalara with itemCode, itemGroup, and category
- `bc-products.csv` - All active products from BigCommerce with id, sku, and name
- `products-to-update.csv` - Products that need syncing with reasons
- `product-sync-log.csv` - Detailed log of update operations (generated during update)

## How It Works

### Step 1: Fetch Avalara Items (`scripts/fetch-avalara-items.js`)

- Retrieves all items from Avalara using the `/api/v2/companies/{companyId}/items` endpoint
- Extracts key fields: `itemCode` (SKU), `itemGroup`, and `category`
- Handles pagination automatically
- Saves results to `avalara-items.csv`

### Step 2: Fetch BigCommerce Products (`scripts/fetch-bc-products.js`)

- Retrieves all active products from BigCommerce using `/v3/catalog/products`
- Filters for visible products only
- Extracts: `id`, `sku`, and `name`
- Validates SKUs and logs warnings for invalid ones
- Saves results to `bc-products.csv`

### Step 3: Reconcile Products (`scripts/reconcile-products.js`)

- Compares BigCommerce SKUs with Avalara item codes
- Identifies products that:
  - Don't exist in Avalara (`exists_in_avalara = no`)
  - Exist but have missing required data (`is_missing_data = yes`)
- Required data includes: `itemGroup` and `category`
- Generates detailed reconciliation report
- Saves results to `products-to-update.csv`

### Step 4: Update Products (`scripts/update-products.js`)

- Reads products flagged for update
- For each product needing sync:
  - Checks existing custom fields
  - Adds `avalara_sync = 1` custom field (if not already present)
  - Respects BigCommerce's 50 custom field limit
  - Implements rate limiting (100ms between requests)
- Logs all operations with timestamps and error details
- Saves detailed log to `product-sync-log.csv`

## Custom Field Strategy

The solution uses BigCommerce custom fields to trigger the `store/product/updated` webhook:

- **Field Name**: `avalara_sync` (configurable via `AVALARA_SYNC_FIELD_NAME`)
- **Field Value**: `1`
- **Purpose**: Triggers webhook without affecting storefront display
- **Limitation**: BigCommerce allows maximum 50 custom fields per product

## Configuration Options

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BC_STORE_HASH` | BigCommerce store hash | Yes |
| `BC_ACCESS_TOKEN` | BigCommerce API access token | Yes |
| `BC_CLIENT_ID` | BigCommerce client ID | Yes |
| `BC_CLIENT_SECRET` | BigCommerce client secret | Yes |
| `AVALARA_TOKEN` | Base64 encoded accountId:licenseKey | Yes |
| `AVALARA_COMPANY_ID` | Avalara company ID | Yes |
| `AVALARA_SYNC_FIELD_NAME` | Custom field name for sync trigger | No (default: `avalara_sync`) |

### Rate Limiting

- **BigCommerce**: 100ms delay between requests
- **Avalara**: Uses pagination with 100 items per page
- **Custom Fields**: Checks existing fields before adding new ones

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**
   ```
   Error: Missing required environment variables: BC_STORE_HASH, BC_ACCESS_TOKEN
   ```
   Solution: Ensure all required variables are set in `.env`

2. **BigCommerce API Errors**
   ```
   Error: 401 Unauthorized
   ```
   Solution: Verify your BigCommerce access token and store hash

3. **Avalara API Errors**
   ```
   Error: 403 Forbidden
   ```
   Solution: Check your Avalara token and company ID

4. **Custom Field Limit Reached**
   ```
   Error: Maximum custom fields limit reached (50)
   ```
   Solution: Remove unused custom fields from products before running sync

### Manual Verification

After running the sync, verify results:

1. Check `product-sync-log.csv` for successful updates
2. Monitor BigCommerce webhook logs for `store/product/updated` events
3. Wait 24-48 hours for Avalara processing
4. Re-run reconciliation to confirm sync completion

## Best Practices

1. **Run During Off-Peak Hours**: Avoid running during high-traffic periods
2. **Monitor Webhook Logs**: Ensure webhooks are firing correctly
3. **Review Results**: Always review CSV outputs before and after sync
4. **Test First**: Run on a small subset of products in development
5. **Backup Data**: Export current product data before major syncs
6. **Clean Up**: Consider removing custom fields after successful sync

## API Limits

- **BigCommerce**: Rate limits vary by account tier
- **Avalara**: Rate limits vary by account tier  
- **Custom Fields**: 50 maximum per product

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review the generated log files in `./output/`
3. Verify your API credentials and permissions
4. Ensure webhooks are properly configured in BigCommerce

## License

MIT License - see LICENSE file for details. 