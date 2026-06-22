(function (global) {
  const DOC_COLLECTION = "academy";
  const DOC_ID = "main";
  const PHOTOS_DOC_ID = "photos";
  const REMOTE_SUPPRESS_MS = 3000;

  let db = null;
  let unsubscribe = null;
  let onRemoteUpdate = null;
  let suppressRemoteUntil = 0;
  let ready = false;
  let mode = "local";
  let initComplete = false;

  function isConfigured() {
    const c = global.MiManzanaFirebaseConfig;
    return !!(c && c.apiKey && c.projectId);
  }

  function shouldIgnoreRemote() {
    return Date.now() < suppressRemoteUntil;
  }

  function mainRef() {
    return db.collection(DOC_COLLECTION).doc(DOC_ID);
  }

  function photosRef() {
    return db.collection(DOC_COLLECTION).doc(PHOTOS_DOC_ID);
  }

  function pushShared(shared, photos) {
    if (!db) return Promise.resolve();
    suppressRemoteUntil = Date.now() + REMOTE_SUPPRESS_MS;
    const mainPayload = {
      teams: shared.teams,
      lineups: shared.lineups,
      revision: shared.revision || 0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const photosPayload = photos || { blue: {}, orange: {} };
    return Promise.all([
      mainRef().set(mainPayload),
      photosRef().set(photosPayload)
    ]).then(() => {
      suppressRemoteUntil = Date.now() + REMOTE_SUPPRESS_MS;
    }).catch((err) => {
      suppressRemoteUntil = 0;
      console.error("Firebase save failed:", err);
      throw err;
    });
  }

  function fetchRemoteBundle() {
    return Promise.all([mainRef().get(), photosRef().get()]).then(([mainSnap, photosSnap]) => {
      if (!mainSnap.exists) return null;
      const photos = photosSnap.exists ? photosSnap.data() : { blue: {}, orange: {} };
      return { main: mainSnap.data(), photos };
    });
  }

  function deliverRemote(bundle) {
    if (!bundle?.main || !onRemoteUpdate) return;
    onRemoteUpdate(bundle.main, bundle.photos);
  }

  function seedIfEmpty(shared, photos) {
    if (!db) return Promise.resolve(false);
    return mainRef().get().then((snap) => {
      if (snap.exists) return false;
      return pushShared(shared, photos).then(() => true);
    });
  }

  function init(onReady, onUpdate) {
    onRemoteUpdate = onUpdate;
    if (!isConfigured()) {
      ready = true;
      mode = "local";
      onReady({ mode, configured: false });
      return;
    }

    if (!global.firebase?.apps?.length) {
      firebase.initializeApp(global.MiManzanaFirebaseConfig);
    }
    db = firebase.firestore();
    mode = "firebase";
    suppressRemoteUntil = Date.now() + 10000;

    unsubscribe = mainRef().onSnapshot((snap) => {
      if (!snap.exists || !initComplete) return;
      if (shouldIgnoreRemote()) return;
      photosRef().get().then((photosSnap) => {
        const photos = photosSnap.exists ? photosSnap.data() : { blue: {}, orange: {} };
        if (onRemoteUpdate) onRemoteUpdate(snap.data(), photos);
      });
    }, (err) => {
      console.error("Firebase listener error:", err);
      global.MiManzana?.App?.setSyncStatus?.("error");
    });

    const shared = global.MiManzana.Storage.extractSharedForRemote();
    const photos = { blue: {}, orange: {} };
    ["blue", "orange"].forEach((team) => {
      global.MiManzana.Storage.getRoster(team).forEach((player) => {
        if (player.photo) photos[team][player.id] = player.photo;
      });
    });

    seedIfEmpty(shared, photos)
      .then(() => fetchRemoteBundle())
      .then((bundle) => {
        if (bundle) {
          const Storage = global.MiManzana.Storage;
          if (Storage.shouldPreferLocalOverRemote(bundle.main, bundle.photos)) {
            Storage.pushToFirebase();
          } else {
            deliverRemote(bundle);
          }
        }
        initComplete = true;
        suppressRemoteUntil = Date.now() + REMOTE_SUPPRESS_MS;
        ready = true;
        onReady({ mode, configured: true, hasData: !!bundle });
      })
      .catch((err) => {
        console.error("Firebase init failed:", err);
        initComplete = true;
        ready = true;
        mode = "local";
        onReady({ mode: "local", configured: true, error: err });
      });
  }

  function destroy() {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    db = null;
  }

  global.MiManzana = global.MiManzana || {};
  global.MiManzana.FirebaseSync = {
    init, pushShared, isConfigured, isReady: () => ready, getMode: () => mode, shouldIgnoreRemote, destroy
  };
})(window);
