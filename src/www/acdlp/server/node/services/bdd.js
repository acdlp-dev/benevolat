const mysql = require('mysql2');

// Nom des tables
const tableName = 'users';
const tmpTable = `${tableName}_tmp`;
const oldTable = `${tableName}_old`;

// Créer des pools de connexions pour chaque base
const pools = {
  local: mysql.createPool({
    host: process.env.LOCAL_DB_HOST,
    user: process.env.LOCAL_DB_USER,
    password: process.env.LOCAL_DB_PASSWORD,
    database: process.env.LOCAL_DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  }).promise(),
  remote: mysql.createPool({
    host: process.env.REMOTE_DB_HOST,
    user: process.env.REMOTE_DB_USER,
    password: process.env.REMOTE_DB_PASSWORD,
    database: process.env.REMOTE_DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  }).promise()
};

// Fonction pour choisir un pool (local ou distant)
const getPool = (type = 'remote') => {
  if (!pools[type]) {
    throw new Error(`Invalid database type: ${type}`);
  }
  return pools[type];
};

// Fonction pour exécuter une requête SELECT avec des logs détaillés
const select = async (sql, params, dbType = 'remote') => {
  try {
    console.log(`[SQL Query]: ${sql}`);
    console.log(`[Parameters]: ${JSON.stringify(params)}`);
    console.log(`[dbType]: `, dbType);


    const db = getPool(dbType);
    const [results] = await db.execute(sql, params);

    //console.log('[Query Results]:', results);
    return results;
  } catch (err) {
    console.error(`[SQL Error]: ${err.sqlMessage}`, err);
    throw err;
  }
};

// Fonction pour exécuter une requête INSERT
const insert = async (table, data, dbType = 'remote') => {
  const columns = Object.keys(data);
  const values = Object.values(data);

  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

  console.log('[SQL Query]:', sql);
  console.log('[Values]:', values);

  try {
    const db = getPool(dbType);
    const [result] = await db.execute(sql, values);
    return result;
  } catch (err) {
    console.error(`[SQL Error]: ${err.sqlMessage}`, err);
    throw err;
  }
};

// Fonction pour exécuter une requête UPDATE
const update = async (table, updates, condition, conditionValues, dbType = 'remote') => {
  const setClause = Object.keys(updates)
    .map(key => `${key} = ?`)
    .join(', ');
  const sql = `UPDATE ${table} SET ${setClause} WHERE ${condition}`;

  console.log('[SQL Query]:', sql);
  // Masquer les valeurs sensibles pour les logs
  const logValues = [...Object.entries(updates).map(([key, value]) => {
    if (key === 'stripe_secret_key' || key === 'stripeSecretKey') {
      return '********';
    }
    return value;
  }), ...conditionValues];

  console.log('[Values]:', logValues);

  try {
    const db = getPool(dbType);
    const [result] = await db.execute(sql, [...Object.values(updates), ...conditionValues]);
    return result;
  } catch (err) {
    console.error(`[SQL Error]: ${err.sqlMessage}`, err);
    throw err;
  }
};

// Fonction pour exécuter une requête DELETE
const remove = async (table, condition, dbType = 'remote') => {
  const sql = `DELETE FROM ${table} WHERE ${condition}`;

  console.log('[SQL Query]:', sql);

  try {
    const db = getPool(dbType);
    const [result] = await db.execute(sql, []);
    return result;
  } catch (err) {
    console.error(`[SQL Error]: ${err.sqlMessage}`, err);
    throw err;
  }
};

const maskSensitiveData = (data) => {
  // Si c'est une valeur simple
  if (typeof data === 'string' && (
    data.startsWith('sk_') || // Stripe Secret Key format
    /^(pk|sk|rk)_(test|live)_[0-9a-zA-Z]{24}$/.test(data) // Format général des clés API Stripe
  )) {
    return '********';
  }

  // Si c'est un tableau ou un objet
  if (Array.isArray(data)) {
    return data.map(item => maskSensitiveData(item));
  }

  if (typeof data === 'object' && data !== null) {
    const maskedData = {};
    for (const [key, value] of Object.entries(data)) {
      // Liste des clés sensibles à masquer
      if (key === 'stripe_secret_key' || key === 'stripeSecretKey' ||
        key === 'secretKey' || key === 'password' ||
        key === 'apiKey' || key.includes('secret')) {
        maskedData[key] = '********';
      } else {
        maskedData[key] = maskSensitiveData(value);
      }
    }
    return maskedData;
  }

  return data;
};
// Exécute un bloc de requêtes dans une transaction.
// fn reçoit une connexion liée à un pool donné ; toutes les requêtes faites via
// conn.execute partagent la même transaction. Rollback automatique si fn jette.
const transaction = async (fn, dbType = 'remote') => {
  const conn = await getPool(dbType).getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = {
  select,
  insert,
  update,
  remove,
  transaction,
  // Exécuter une requête SQL libre (pratique pour UPDATE JOIN, etc.)
  query: async (sql, params = [], dbType = 'remote') => {
    console.log('[SQL Raw Query]:', sql);
    console.log('[Params]:', params);
    try {
      const db = getPool(dbType);
      const [results] = await db.execute(sql, params);
      return results;
    } catch (err) {
      console.error(`[SQL Error]: ${err.sqlMessage}`, err);
      throw err;
    }
  }
};
