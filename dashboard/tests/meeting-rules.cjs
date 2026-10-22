const assert = require('node:assert/strict');

const host = process.env.FIRESTORE_EMULATOR_HOST;
assert(host, 'Run with firebase emulators:exec --only firestore --project demo-find-inc');
const project = 'demo-find-inc';
const root = `projects/${project}/databases/(default)/documents`;
const base = `http://${host}/v1/${root}`;
const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = uid => {
  const now = Math.floor(Date.now() / 1000);
  return `${encoded({alg: 'none'})}.${encoded({
    aud: project, iss: `https://securetoken.google.com/${project}`, sub: uid,
    user_id: uid, iat: now, exp: now + 3600,
    firebase: {sign_in_provider: 'password', identities: {}}
  })}.`;
};
const string = stringValue => ({stringValue});
const timestamp = ms => ({timestampValue: new Date(ms).toISOString()});
const id = number => `12345678-1234-1234-1234-${String(number).padStart(12, '0')}`;

async function request(path, expect, {uid, method = 'GET', body} = {}) {
  const headers = {'Content-Type': 'application/json'};
  if (uid) headers.Authorization = `Bearer ${token(uid)}`;
  const response = await fetch(base + path, {method, headers, body: JSON.stringify(body)});
  const result = await response.json();
  assert.equal(response.status, expect, `${method} ${path}: ${JSON.stringify(result)}`);
  return result;
}

function create(meetingId, uid, ended, extra = {}) {
  const name = `${root}/meetings/${uid}_${meetingId}`;
  return {
    update: {name, fields: {
      uid: string(uid), meetingId: string(meetingId), topic: string('Test meeting'),
      departments: {arrayValue: {values: [string('전략팀')]}},
      summary: string('Summary'), startedAt: timestamp(ended - 1000),
      endedAt: timestamp(ended), ...extra
    }},
    updateTransforms: [{fieldPath: 'savedAt', setToServerValue: 'REQUEST_TIME'}]
  };
}

const commit = (write, uid, expect) => request(':commit', expect, {
  uid, method: 'POST', body: {writes: [write]}
});
function list(auth, uid, expect, limit = 25) {
  const filter = uid == null ? {} : {where: {fieldFilter: {
    field: {fieldPath: 'uid'}, op: 'EQUAL', value: string(uid)
  }}};
  return request(':runQuery', expect, {uid: auth, method: 'POST', body: {structuredQuery: {
    from: [{collectionId: 'meetings'}], ...filter,
    orderBy: [{field: {fieldPath: 'endedAt'}, direction: 'DESCENDING'}], limit
  }}});
}

(async () => {
  const now = Date.now();
  const first = create(id(1), 'alice', now - 5000);
  await commit(first, 'alice', 200);
  await commit(create(id(2), 'alice', now - 3000), 'alice', 200);
  await commit(create(id(3), 'bob', now - 1000), 'bob', 200);
  const records = await list('alice', 'alice', 200);
  assert.deepEqual(records.map(row => row.document.fields.meetingId.stringValue), [id(2), id(1)]);
  await request(`/meetings/alice_${id(1)}`, 200, {uid: 'alice'});
  await request(`/meetings/alice_${id(1)}`, 403, {uid: 'bob'});
  await request(`/meetings/alice_${id(1)}`, 403);
  await list('bob', 'alice', 403);
  await list('alice', null, 403);
  await list(undefined, 'alice', 403);
  await list('alice', 'alice', 403, 26);
  await commit(first, 'alice', 403);
  await commit({delete: first.update.name}, 'alice', 403);
  await commit(create(id(4), 'alice', now), 'bob', 403);
  await commit(create(id(4), 'alice', now), undefined, 403);
  const wrongKey = create(id(4), 'alice', now);
  wrongKey.update.name = `${root}/meetings/bob_${id(4)}`;
  await commit(wrongKey, 'alice', 403);
  for (const extra of [
    {topic: {integerValue: '10'}}, {summary: string('x'.repeat(4001))},
    {extra: string('unexpected')}, {departments: {arrayValue: {values: [string('other')]}}},
    {endedAt: timestamp(now + 600000)}, {startedAt: timestamp(now + 1000)}
  ]) {
    await commit(create(id(4), 'alice', now, extra), 'alice', 403);
  }
  const missing = create(id(4), 'alice', now);
  delete missing.update.fields.summary;
  await commit(missing, 'alice', 403);
  await commit({update: {name: `${root}/practice/rule-check`, fields: {message: string('test')}}}, 'alice', 403);
  await request('/practice/rule-check', 403, {uid: 'alice'});
  console.log('PASS: owner-only create/get/list, ordering, bounds, immutable records, existing collection deny');
})().catch(error => { console.error(error); process.exitCode = 1; });
