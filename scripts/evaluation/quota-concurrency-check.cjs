
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require(process.env.PORTFOLIO_AUDIT_PG_MODULE || "pg");
if (process.env.PORTFOLIO_AUDIT_DISPOSABLE !== "1") throw new Error("Use only a fresh disposable PostgreSQL instance; set PORTFOLIO_AUDIT_DISPOSABLE=1");
const options = { host: "127.0.0.1", port: Number(process.argv[2]), user: "postgres", database: "postgres" };
const sql = path.resolve("tests/postgres/quota-postgres.test.sql");
const script = fs.readFileSync(sql, "utf8").replaceAll("\r\n", "\n");
const header = /\\set ON_ERROR_STOP on\n([\s\S]+)\n\\ir ([^\n]+)\n\n/u.exec(script);
assert.ok(header);
const setup = header[1];
const migration = fs.readFileSync(path.resolve(path.dirname(sql), header[2]), "utf8");
const checks = script.slice(header.index + header[0].length).trim().split(/\n\n+/u);
assert.equal(checks.length, 4);
async function connection(run) {
  const client = new Client(options);
  await client.connect();
  try { return await run(client); } finally { await client.end(); }
}
async function main() {
  const version = await connection(async client => {
    await client.query(setup);
    await client.query(migration);
    for (const check of checks) await client.query(check);
    return (await client.query("show server_version")).rows[0].server_version;
  });
  const results = await Promise.all(Array.from({ length: 12 }, () => connection(async client => {
    await client.query("set role service_role");
    return (await client.query("select public.vincent_ai_reserve_quota(100,5,1,0.01) as reserved")).rows[0].reserved;
  })));
  assert.equal(results.filter(Boolean).length, 5);
  assert.equal(results.filter(value => value === false).length, 7);
  const recorded = await connection(client => client.query("select day_requests from public.vincent_ai_quota"));
  assert.equal(recorded.rows[0].day_requests, 5);
  const a = new Client(options), b = new Client(options);
  await Promise.all([a.connect(), b.connect()]);
  try {
    await a.query("truncate public.vincent_ai_quota");
    await a.query("begin");
    assert.equal((await a.query("select public.vincent_ai_reserve_quota(100,5,1,0.01) as reserved")).rows[0].reserved, true);
    let settled = false;
    const pending = b.query("select public.vincent_ai_reserve_quota(100,5,1,0.01) as reserved").then(result => { settled = true; return result; });
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(settled, false, "the second transaction must wait for the lock");
    await a.query("rollback");
    assert.equal((await pending).rows[0].reserved, true);
    const row = (await b.query("select day_requests,reserved_usd from public.vincent_ai_quota")).rows[0];
    assert.equal(row.day_requests, 1);
    assert.equal(Number(row.reserved_usd), 0.01);
  } finally { await Promise.all([a.end(), b.end()]); }
  console.log(`PostgreSQL ${version}. RLS, roles, minute, day and budget tests passed. 12 connections, 5 accepted, 7 rejected, 5 recorded. Rollback releases the lock and reservation.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
