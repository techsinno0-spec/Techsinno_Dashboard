const { CosmosClient } = require('@azure/cosmos');

let client = null;
let db = null;
const containers = {};

function getClient() {
  if (!client) {
    const connectionString = process.env.COSMOS_CONNECTION_STRING;
    if (!connectionString) throw new Error('COSMOS_CONNECTION_STRING not configured');
    client = new CosmosClient(connectionString);
    db = client.database(process.env.COSMOS_DB_NAME || 'techsinno-db');
  }
  return db;
}

function getContainer(name) {
  if (!containers[name]) {
    containers[name] = getClient().container(name);
  }
  return containers[name];
}

async function queryItems(containerName, query, parameters = []) {
  const container = getContainer(containerName);
  const { resources } = await container.items.query({ query, parameters }).fetchAll();
  return resources;
}

async function getItem(containerName, id, partitionKey) {
  const container = getContainer(containerName);
  const { resource } = await container.item(id, partitionKey || id).read();
  return resource;
}

async function createItem(containerName, item) {
  const container = getContainer(containerName);
  const { resource } = await container.items.create(item);
  return resource;
}

async function replaceItem(containerName, id, item, partitionKey) {
  const container = getContainer(containerName);
  const { resource } = await container.item(id, partitionKey || id).replace(item);
  return resource;
}

async function deleteItem(containerName, id, partitionKey) {
  const container = getContainer(containerName);
  await container.item(id, partitionKey || id).delete();
}

module.exports = { getContainer, queryItems, getItem, createItem, replaceItem, deleteItem };
