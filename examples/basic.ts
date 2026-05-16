/**
 * Run with: `pnpm example`
 * Requires env var ETHITRUST_API_KEY.
 */
import { EthitrustClient, EthitrustApiError } from '../src/index.js';

async function main() {
  const client = new EthitrustClient({
    apiKey: process.env.ETHITRUST_API_KEY!,
    baseUrl: process.env.ETHITRUST_BASE_URL ?? 'https://api.ethitrust.me',
  });

  try {
    // 1. Create an escrow
    const created = await client.orgEscrows.create({
      invitee_email: 'buyer@example.com',
      title: 'Website redesign',
      amount: 5000,
      currency: 'ETB',
      escrow_type: 'onetime',
      who_pays_fees: 'split',
    });
    console.log('Created escrow', created.id, 'status:', created.status);

    // 2. Inspect detail + health
    const detail = await client.orgEscrows.getDetail(created.id);
    console.log('Phase:', detail.current_phase, 'Progress:', detail.progress_percentage);

    const health = await client.orgEscrows.getHealth(created.id);
    console.log('Health:', health);

    // 3. List with pagination iterator
    let count = 0;
    for await (const item of client.orgEscrows.iter({ is_active: true })) {
      count++;
      if (count > 5) break;
      console.log('-', item.escrow_id, item.title, item.status);
    }

    // 4. Org-wide report
    const report = await client.orgEscrows.getReport({
      date_from: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      date_to: new Date(),
    });
    console.log('Report:', report.total_escrows, 'escrows;', `completion_rate=${report.completion_rate}`);

    // 5. Test webhook plumbing
    const test = await client.orgEscrows.testWebhook();
    console.log('Webhook test:', test);
  } catch (err) {
    if (err instanceof EthitrustApiError) {
      console.error(`API error ${err.status} @ ${err.method} ${err.url}:`, err.body);
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}

main();
