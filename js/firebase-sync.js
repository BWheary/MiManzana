(function (global) {
  const DOC_COLLECTION = "academy";
  const DOC_ID = "main";

  let db = null;
  let unsubscribe = null;
  let onRemoteUpdate = null;
  let ignoreSnapshots = 0;
  let ready = false;
  let mode = "local";

  function isConfigured() {
    const c = global.MiManzanaFirebaseConfig;
    return !!(c && c.apiKey && c.projectId);
  }

  function docRef() {
    return db.collection(DOC_COLLECTION).doc(DOC_ID);
  }

  function pushShared(shared) {
    if (!db) return Promise.resolve();
    ignoreSnapshots++;
    return docRef().set({
      teams: shared.teams,
      lineups: shared.lineups,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch((err) => {
      ignoreSnapshots = Math.max(0, ignoreSnapshots - 1);
      console.error("Firebase save failed:", err);
      throw err;
    });
  }

  function seedIfEmpty(shared) {
    if (!db) return Promise.resolve(false);
    return docRef().get().then((snap) => {
      if (snap.exists) return false;
      return pushShared(shared).then(() => true);
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

    unsubscribe = docRef().onSnapshot((snap) => {
      if (!snap.exists) return;
      if (ignoreSnapshots > 0) {
        ignoreSnapshots--;
        return;
      }
      const data = snap.data();
      if (data && onRemoteUpdate) onRemoteUpdate(data);
    }, (err) => {
      console.error("Firebase listener error:", err);
      global.MiManzana?.App?.setSyncStatus?.("error");
    });

    const shared = global.MiManzana.Storage.extractShared();
    seedIfEmpty(shared)
      .then(() => docRef().get())
      .then((snap) => {
        if (snap.exists && onRemoteUpdate) onRemoteUpdate(snap.data());
        ready = true;
        onReady({ mode, configured: true, hasData: snap.exists });
      })
      .catch((err) => {
        console.error("Firebase init failed:", err);
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
    init, pushShared, isConfigured, isReady: () => ready, getMode: () => mode, destroy
  };
})(window);
