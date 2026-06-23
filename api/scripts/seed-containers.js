const { CosmosClient } = require('@azure/cosmos');

const CONNECTION_STRING = process.env.COSMOS_CONNECTION_STRING;
const DB_NAME = process.env.COSMOS_DB_NAME || 'techsinno-db';

if (!CONNECTION_STRING) {
  console.error('Set COSMOS_CONNECTION_STRING environment variable first.');
  process.exit(1);
}

async function createContainers() {
  const client = new CosmosClient(CONNECTION_STRING);
  const { database } = await client.databases.createIfNotExists({ id: DB_NAME });

  const containers = [
    { id: 'users', partitionKey: '/id' },
    { id: 'tasks', partitionKey: '/assignedTo' },
    { id: 'activity', partitionKey: '/userId', defaultTtl: 7776000 },
    { id: 'config', partitionKey: '/id' },
    { id: 'clients', partitionKey: '/id' },
    { id: 'quotes', partitionKey: '/clientId' },
    { id: 'reminders', partitionKey: '/userId' },
    { id: 'templates', partitionKey: '/id' },
    { id: 'campaigns', partitionKey: '/id' },
    { id: 'scheduled_posts', partitionKey: '/id' },
    { id: 'recurring_tasks', partitionKey: '/id' },
    // ── New: Operations modules ──────────────────────────────────────────────
    { id: 'job-cards', partitionKey: '/id' },
    { id: 'projects', partitionKey: '/id' },
  ];

  for (const def of containers) {
    const opts = { id: def.id, partitionKey: { paths: [def.partitionKey] } };
    if (def.defaultTtl) opts.defaultTtl = def.defaultTtl;
    await database.containers.createIfNotExists(opts);
    console.log(`  Container "${def.id}" ready`);
  }

  console.log(`\n  All ${containers.length} containers ready.\n`);
}

createContainers().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
