const { CosmosClient } = require('@azure/cosmos');
const bcrypt = require('bcryptjs');

const CONNECTION_STRING = process.env.COSMOS_CONNECTION_STRING;
const DB_NAME = process.env.COSMOS_DB_NAME || 'techsinno-db';

if (!CONNECTION_STRING) {
  console.error('Set COSMOS_CONNECTION_STRING env var first.');
  process.exit(1);
}

const username = process.argv[2] || 'frank';
const newPassword = process.argv[3] || 'Techsinno2024!';

async function resetPassword() {
  const client = new CosmosClient(CONNECTION_STRING);
  const db = client.database(DB_NAME);
  const container = db.container('users');

  const { resources } = await container.items
    .query({ query: 'SELECT * FROM c WHERE c.username = @u', parameters: [{ name: '@u', value: username }] })
    .fetchAll();

  if (resources.length === 0) {
    console.error(`User "${username}" not found.`);
    process.exit(1);
  }

  const user = resources[0];
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.mustChangePassword = false;
  user.updatedAt = new Date().toISOString();

  await container.item(user.id, user.id).replace(user);

  console.log(`Password reset for "${username}".`);
  console.log(`New password: ${newPassword}`);
}

resetPassword().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
