const { CosmosClient } = require('@azure/cosmos');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const CONNECTION_STRING = process.env.COSMOS_CONNECTION_STRING;
const DB_NAME = process.env.COSMOS_DB_NAME || 'techsinno-db';

if (!CONNECTION_STRING) {
  console.error('Set COSMOS_CONNECTION_STRING environment variable first.');
  process.exit(1);
}

async function seed() {
  const client = new CosmosClient(CONNECTION_STRING);
  const { database } = await client.databases.createIfNotExists({ id: DB_NAME });

  const containerDefs = [
    { id: 'users', partitionKey: '/id' },
    { id: 'tasks', partitionKey: '/assignedTo' },
    { id: 'activity', partitionKey: '/userId', defaultTtl: 7776000 },
    { id: 'config', partitionKey: '/id' }
  ];

  for (const def of containerDefs) {
    const opts = { id: def.id, partitionKey: { paths: [def.partitionKey] } };
    if (def.defaultTtl) opts.defaultTtl = def.defaultTtl;
    await database.containers.createIfNotExists(opts);
    console.log(`  Container "${def.id}" ready`);
  }

  const usersContainer = database.container('users');
  const { resources: existing } = await usersContainer.items
    .query({ query: 'SELECT c.id FROM c WHERE c.username = @u', parameters: [{ name: '@u', value: 'frank' }] })
    .fetchAll();

  if (existing.length > 0) {
    console.log('\n  Manager account "frank" already exists. Skipping.\n');
    return;
  }

  const password = process.argv[2] || 'Techsinno2024!';
  const now = new Date().toISOString();

  const manager = {
    id: `usr_${uuidv4()}`,
    username: 'frank',
    displayName: 'Frank Muland',
    email: 'frank@techsinno.com',
    role: 'manager',
    passwordHash: await bcrypt.hash(password, 12),
    mustChangePassword: false,
    active: true,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  };

  await usersContainer.items.create(manager);
  console.log(`\n  Manager account created!`);
  console.log(`  Username: frank`);
  console.log(`  Password: ${password}`);
  console.log(`  ID: ${manager.id}`);
  console.log(`\n  Change the password after first login.\n`);
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
