let pending;
export function getSession() {
  return pending ||= (async () => {
    const [appSDK, sdk] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js')
    ]);
    const app = appSDK.initializeApp({
        apiKey: 'AIzaSyB4akcJtiC2W0i94b8VUvX6QCNXJcJe6RQ',
        authDomain: 'find-inc.firebaseapp.com', projectId: 'find-inc',
        appId: '1:613731739866:web:a397b3c917245d81b6dde3'
      });
    const auth = sdk.getAuth(app);
    auth.languageCode = 'ko';
    await auth.authStateReady();
    return {auth, sdk};
  })();
}
