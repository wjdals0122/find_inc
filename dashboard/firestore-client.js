import {getSession} from './auth-session.js';

export async function getDashboardFirestore() {
  const [{auth}, firestore] = await Promise.all([
    getSession(),
    import('https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js')
  ]);
  return firestore.getFirestore(auth.app);
}
