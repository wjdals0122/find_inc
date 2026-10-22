import {getSession} from './auth-session.js';
import {getDashboardFirestore} from './firestore-client.js';

const PAGE_SIZE = 25;
const departments = {strategy: '전략팀', contents: '콘텐츠팀', operation: '운영팀'};
const firestore = () => import('https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js');

async function client(uid) {
  const [{auth}, db, sdk] = await Promise.all([getSession(), getDashboardFirestore(), firestore()]);
  if (auth.currentUser?.uid !== uid) throw Error('로그인 계정이 바뀌었습니다.');
  return {db, sdk};
}

export function meetingRecord(meeting) {
  const lines = meeting.utterances || [];
  const closing = lines.findLastIndex(line => line.id?.endsWith(':end'));
  const result = lines.findLastIndex(line => line.speaker === 'result');
  const summary = closing < 0 ? '' : lines.slice(closing + 1, result < 0 ? undefined : result)
    .filter(line => line.speaker === 'lead')
    .map(line => line.text)
    .join('\n');
  return {
    meetingId: meeting.id,
    topic: meeting.topic,
    departments: Object.values(departments),
    summary: summary.slice(0, 4000) || '팀장이 남긴 요약이 없습니다.',
    startedAt: new Date(meeting.createdAt),
    endedAt: new Date(meeting.finishedAt || meeting.updatedAt)
  };
}

export async function saveMeeting(uid, meeting) {
  const {db, sdk} = await client(uid);
  const record = meetingRecord(meeting);
  const ref = sdk.doc(db, 'meetings', uid + '_' + record.meetingId);
  let timeout;
  try {
    await Promise.race([
      sdk.setDoc(ref, {...record, uid, savedAt: sdk.serverTimestamp()}),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(Error('Firestore 저장 응답 시간이 초과됐습니다.')), 12000);
      })
    ]);
  } catch (error) {
    // A create-only record may already have been saved by another tab or retry.
    if (error.code !== 'permission-denied') throw error;
    const existing = await sdk.getDocFromServer(ref);
    if (existing.data()?.meetingId !== record.meetingId || existing.data()?.uid !== uid) throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function listMeetings(uid, cursor) {
  const {db, sdk} = await client(uid);
  const snapshot = await sdk.getDocsFromServer(sdk.query(
    sdk.collection(db, 'meetings'),
    sdk.where('uid', '==', uid),
    sdk.orderBy('endedAt', 'desc'),
    ...(cursor ? [sdk.startAfter(cursor)] : []),
    sdk.limit(PAGE_SIZE)
  ));
  return {
    entries: snapshot.docs.map(doc => doc.data()),
    next: snapshot.size === PAGE_SIZE ? snapshot.docs.at(-1) : null
  };
}
